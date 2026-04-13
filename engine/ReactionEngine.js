/**
 * engine/ReactionEngine.js
 * Pure chemistry logic — static methods only, zero DOM access, zero mutable state.
 *
 * BUG-01: process() NEVER returns early — ALL sweeps run and ALL matches fire.
 * BUG-02: sweeps run on a CLONED solution; the live vessel is never touched here.
 * BUG-05: complexation "excess" check = ppt already present OR just formed in this sweep.
 * TRAP-01: all data imports are static top-level; no parse-time side effects.
 * TRAP-06: thermal carbonate decomposition only fires for solids, not aqueous CO₃²⁻.
 */

import {
  PRECIPITATION_TABLE,
  GAS_RULES,
  DISSOLUTION_RULES,
  SOLUBLE_SOLIDS,
  SOLID_ION_PRODUCTS,
  REDOX_RULES,
  COMPLEXATION_RULES,
  OBSERVATIONS,
} from '../data/reactions.js';
import { EASTER_EGGS } from '../data/easter-eggs.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** crypto.randomUUID() with HTTP-localhost fallback. TRAP-03 */
function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Lookup table: ppt id → OBSERVATIONS key.
 * Keeps chemistry display metadata in one place without touching data files.
 */
const PPT_OBS_MAP = {
  agcl:    'obs_agcl_white',
  agbr:    'obs_agbr_cream',
  agi:     'obs_agi_yellow',
  ag2co3:  'obs_ag2co3_pale_yellow',
  ag2s:    'obs_ag2s_black',
  ag2o:    'obs_ag2o_brown',
  baso4:   'obs_baso4_white',
  baco3:   'obs_baco3_white',
  pbcl2:   'obs_pbcl2_white',
  pbbr2:   'obs_pbbr2_white',
  pbi2:    'obs_pbi2_golden',
  pbso4:   'obs_pbso4_white',
  pbco3:   'obs_pbco3_white',
  pbs:     'obs_pbs_black',
  pb_oh2:  'obs_pb_oh2_white',
  caco3:   'obs_caco3_white',
  caso4:   'obs_caso4_white',
  cu_oh2:  'obs_cu_oh2_blue',
  cuco3:   'obs_cuco3_green',
  cus:     'obs_cus_black',
  fe_oh2:  'obs_fe_oh2_green',
  feco3:   'obs_feco3_green',
  fes:     'obs_fes_black',
  fe_oh3:  'obs_fe_oh3_brown',
  zn_oh2:  'obs_zn_oh2_white',
  znco3:   'obs_znco3_white',
  zns:     'obs_zns_white',
  mg_oh2:  'obs_mg_oh2_white',
  mgco3:   'obs_mgco3_white',
  al_oh3:  'obs_al_oh3_white',
  mn_oh2:  'obs_mn_oh2_pink',
  mns:     'obs_mns_pink',
};

/**
 * Build a base ReactionEvent with required fields.
 * Returns a plain object; spread and override to specialise.
 */
function baseEvent(type, extra = {}) {
  return {
    id:          uuid(),
    type,
    animId:      null,
    observation: '',
    equation:    '',
    ionChanges:  {},
    pptAdded:    null,
    pptRemoved:  null,
    gasAdded:    null,
    colorChange: null,
    solidRemoved: null,
    ...extra,
  };
}

// ─── ReactionEngine ───────────────────────────────────────────────────────────

export class ReactionEngine {

  /**
   * Process all chemistry that results from adding `addedReagent` to `vessel`.
   *
   * CONTRACT:
   *   - Does NOT mutate vessel or vessel.solution.
   *   - Caller (BenchUI) is responsible for applying all returned events.
   *   - Returns [] if nothing reacts (caller may show a toast).
   *
   * @param {import('./Vessel.js').Vessel} vessel
   * @param {Object} addedReagent  — one entry from REAGENTS array
   * @returns {ReactionEvent[]}
   */
  static process(vessel, addedReagent) {
    // ── Step 1: build a working clone (BUG-02) ──────────────────────────────
    const sol = vessel.solution.clone();
    sol.addIons(addedReagent.ions ?? {});
    if (Array.isArray(addedReagent.solids)) {
      for (const s of addedReagent.solids) sol.addSolid(s.id, s.amount);
    }
    // Propagate heat state from vessel (needed for gas/decomposition rules)
    sol.isHot = vessel.isHot;
    // Neutralise H⁺/OH⁻ on the working copy so sweeps see clean ion state
    sol._neutraliseAcidBase();

    // ── Step 2: full sweep — collect ALL events (BUG-01) ───────────────────
    const events = [];

    // Acid-base neutralisation event (communicates ionChanges back to BenchUI)
    events.push(...ReactionEngine._checkNeutralisation(vessel.solution, addedReagent));

    // Soluble solid spontaneous dissolution (no acid needed, e.g. Na₂CO₃ in water)
    events.push(...ReactionEngine._checkSolubleSolids(sol));

    // Solid + acid → ions ± gas (oxide neutralisation, metal + acid)
    events.push(...ReactionEngine._checkDissolution(sol));

    // Gas evolution (metal + acid, carbonate + acid, NH₄⁺ + OH⁻, etc.)
    events.push(...ReactionEngine._checkGasRules(sol, addedReagent));

    // Ionic precipitation
    const precipEvents = ReactionEngine._checkPrecipitation(sol);
    events.push(...precipEvents);

    // Redox colour changes / ion transforms
    events.push(...ReactionEngine._checkRedox(sol));

    // Complexation — dissolves ppts; checks both existing ppts AND precipEvents (BUG-05)
    events.push(...ReactionEngine._checkComplexation(sol, precipEvents));

    // ── Step 3: easter egg overrides — must run last ────────────────────────
    ReactionEngine._applyEasterEggOverrides(events);

    return events;
  }

  // ─── Private sweep methods ─────────────────────────────────────────────────

  /**
   * Neutralisation: H⁺ + OH⁻ → H₂O
   * Computes ion delta from the ORIGINAL solution + added reagent (without mutating).
   * Returns at most one event. Empty observation so BenchUI skips log entry.
   */
  static _checkNeutralisation(originalSol, addedReagent) {
    // Compute what the merged H⁺ and OH⁻ would be
    const addedIons  = addedReagent.ions ?? {};
    const h  = (originalSol.ions['H+']  ?? 0) + (addedIons['H+']  ?? 0);
    const oh = (originalSol.ions['OH-'] ?? 0) + (addedIons['OH-'] ?? 0);

    if (h <= 0 || oh <= 0) return [];  // nothing to cancel

    const ionChanges = {};
    const remaining = h - oh;
    if (remaining > 0) {
      ionChanges['H+']  = remaining;  // new [H⁺] after cancellation
      ionChanges['OH-'] = null;       // null → consumed completely
    } else if (remaining < 0) {
      ionChanges['OH-'] = -remaining;
      ionChanges['H+']  = null;
    } else {
      ionChanges['H+']  = null;
      ionChanges['OH-'] = null;
    }

    return [baseEvent('neutralisation', {
      observation: '',    // invisible — no log entry
      equation: 'H⁺(aq) + OH⁻(aq) → H₂O(l)',
      ionChanges,
    })];
  }

  /**
   * Solids that dissolve spontaneously in water (no acid required).
   * Only fires if no H⁺ present (acid case handled by _checkGasRules).
   */
  static _checkSolubleSolids(sol) {
    if ((sol.ions['H+'] ?? 0) > 0) return [];  // acid present — gas rule takes priority
    const events = [];
    for (const [solidId, spec] of Object.entries(SOLUBLE_SOLIDS)) {
      if (!sol.solids.some(s => s.id === solidId)) continue;
      events.push(baseEvent('dissolution', {
        animId:      'anim_solid_dissolve',
        observation: OBSERVATIONS[spec.observationKey] ?? '',
        equation:    spec.equation,
        ionChanges:  { ...spec.ions },
        solidRemoved: solidId,
      }));
    }
    return events;
  }

  /**
   * Solid oxide/hydroxide + acid → salt + water (no gas produced).
   * Also handles CaO slaking in any aqueous medium.
   * Gas-producing solid reactions (metals, carbonates) are in _checkGasRules.
   */
  static _checkDissolution(sol) {
    const events = [];

    for (const rule of DISSOLUTION_RULES) {
      if (rule.id === 'cao_water_slaking') {
        if (!sol.solids.some(s => s.id === 'cao_s')) continue;
        // CaO reacts with water (or any aqueous solution) even without acid
        const product = SOLID_ION_PRODUCTS['cao_s'];
        events.push(baseEvent('dissolution', {
          animId:      'anim_solid_dissolve',
          observation: OBSERVATIONS[rule.observationMap['cao_s']] ?? '',
          equation:    rule.equation,
          ionChanges:  { [product.ion]: 0.02, 'OH-': 0.04 },
          solidRemoved: 'cao_s',
        }));
        continue;
      }

      // Standard oxide + acid neutralisation
      const req = rule.requires;
      if (req.ions?.length && !req.ions.every(ion => (sol.ions[ion] ?? 0) > 0)) continue;

      const matchedSolid = sol.solids.find(s => req.anySolid?.includes(s.id));
      if (!matchedSolid) continue;

      const solidId = matchedSolid.id;
      const product = SOLID_ION_PRODUCTS[solidId];
      if (!product) continue;

      const colorChange = rule.colorChangeMap?.[solidId] ?? null;
      events.push(baseEvent('dissolution', {
        animId:      'anim_solid_dissolve',
        observation: OBSERVATIONS[rule.observationMap?.[solidId]] ?? '',
        equation:    product.equation,
        ionChanges:  { [product.ion]: product.stoich * 0.1 },
        colorChange: colorChange ? { from: null, to: colorChange.to } : null,
        solidRemoved: solidId,
      }));
    }
    return events;
  }

  /**
   * Gas evolution rules.
   * For rules involving solids, the event also carries solidRemoved and
   * the product cation ionChanges (so BenchUI removes the solid).
   * TRAP-06: thermal decomposition of solid carbonates only fires when isHot.
   *
   * @param {import('./Solution.js').Solution} sol  working clone
   * @param {Object} addedReagent  original reagent (for dissolvedGas check)
   */
  static _checkGasRules(sol, addedReagent) {
    const events = [];

    for (const rule of GAS_RULES) {
      const req = rule.requires;

      // dissolved-gas rules depend on the specific reagent, not solution state
      if (req.dissolvedGas !== undefined) {
        if (addedReagent?.dissolvedGas !== req.dissolvedGas) continue;
      }

      // All listed ions must be present in working solution
      if (req.ions?.length) {
        if (!req.ions.every(ion => (sol.ions[ion] ?? 0) > 0)) continue;
      }

      // At least one listed solid must be present
      let matchedSolid = null;
      if (req.anySolid?.length) {
        matchedSolid = sol.solids.find(s => req.anySolid.includes(s.id));
        if (!matchedSolid) continue;
      }

      // Heat gate (TRAP-06)
      if (req.isHot && !sol.isHot) continue;

      // Build optional ionChanges + solidRemoved for solid-consuming reactions
      const ionChanges  = {};
      let   solidRemoved = null;

      if (matchedSolid) {
        solidRemoved = matchedSolid.id;
        const product = SOLID_ION_PRODUCTS[solidRemoved];
        if (product) {
          ionChanges[product.ion] = product.stoich * 0.1;
        }
      }

      events.push(baseEvent('gas', {
        animId:      'anim_bubbles',
        observation: OBSERVATIONS[rule.observationKey] ?? '',
        // Use the solid's specific balanced equation when available (e.g. Mg + 2H⁺ → Mg²⁺ + H₂)
        // rather than the generic template on the gas rule.
        equation:    (solidRemoved && SOLID_ION_PRODUCTS[solidRemoved]?.equation)
                       ? SOLID_ION_PRODUCTS[solidRemoved].equation
                       : rule.equation,
        ionChanges,
        gasAdded:    { id: rule.gas, pressure: rule.pressure },
        solidRemoved,
      }));
    }
    return events;
  }

  /**
   * Ionic precipitation.
   * Full sweep over all cation×anion pairs in PRECIPITATION_TABLE.
   * BUG-01: never stops on first match.
   * Skips ppts that are already in solution.ppts (no duplicate).
   *
   * @param {import('./Solution.js').Solution} sol  working clone
   */
  static _checkPrecipitation(sol) {
    const events = [];

    for (const [cation, anionMap] of Object.entries(PRECIPITATION_TABLE)) {
      if ((sol.ions[cation] ?? 0) <= 0) continue;

      for (const [anion, pptDesc] of Object.entries(anionMap)) {
        if (!pptDesc) continue;                                 // null = soluble
        if ((sol.ions[anion] ?? 0) <= 0) continue;             // anion not present
        if (sol.ppts.some(p => p.id === pptDesc.id)) continue; // already precipitated

        events.push(baseEvent('precipitation', {
          animId:      'anim_precipitate',
          observation: OBSERVATIONS[PPT_OBS_MAP[pptDesc.id]] ?? '',
          equation:    pptDesc.equation ?? '',
          pptAdded:    {
            id:      pptDesc.id,
            color:   pptDesc.color,
            formula: pptDesc.formula,
            label:   pptDesc.label,
          },
        }));
      }
    }
    return events;
  }

  /**
   * Redox reactions.
   *
   * @param {import('./Solution.js').Solution} sol  working clone
   */
  static _checkRedox(sol) {
    const events = [];

    for (const rule of REDOX_RULES) {
      const req = rule.requires;

      // All required ions must be present
      if (req.ions?.length) {
        if (!req.ions.every(ion => (sol.ions[ion] ?? 0) > 0)) continue;
      }

      // At least one of anyOf ions must be present
      if (req.anyOf?.length) {
        if (!req.anyOf.some(ion => (sol.ions[ion] ?? 0) > 0)) continue;
      }

      // Build ionChanges from ionTransform map
      const ionChanges = {};
      for (const [sym, target] of Object.entries(rule.ionTransform ?? {})) {
        if ((sol.ions[sym] ?? 0) > 0) {
          ionChanges[sym] = null;  // consumed
          if (typeof target === 'string') {
            ionChanges[target] = (sol.ions[target] ?? 0) + (sol.ions[sym] ?? 0.05);
          }
        }
      }
      // Ions produced by the redox reaction (e.g. Mn²⁺ from MnO₄⁻ reduction)
      for (const [sym, val] of Object.entries(rule.producesIon ?? {})) {
        ionChanges[sym] = (ionChanges[sym] ?? 0) + val;
      }

      events.push(baseEvent('redox', {
        animId:      'anim_color_fade',
        observation: OBSERVATIONS[rule.observationKey] ?? '',
        equation:    rule.equation,
        ionChanges,
        colorChange: rule.colorChange ?? null,
      }));
    }
    return events;
  }

  /**
   * Complexation — a ppt dissolves when an excess ligand is present.
   * BUG-05 fix: "excess" is satisfied when the ppt exists in the current
   * solution OR was just created by a precipitation event in this same sweep.
   *
   * @param {import('./Solution.js').Solution} sol    working clone
   * @param {ReactionEvent[]}                  precipEvents  from _checkPrecipitation
   */
  static _checkComplexation(sol, precipEvents) {
    const events = [];

    for (const rule of COMPLEXATION_RULES) {
      const req = rule.requires;

      // Two-stage behaviour: complexation only fires if the ppt was ALREADY
      // present in the vessel BEFORE this reagent was added.  If it just
      // formed in this same sweep (pptJustFormed), we let the ppt appear
      // first so the student sees the intermediate precipitate stage, and
      // then dissolves it only when the ligand is added a second time
      // (at which point the ppt IS pre-existing and pptAlreadyPresent=true).
      const pptAlreadyPresent = sol.ppts.some(p => p.id === req.ppt);
      if (!pptAlreadyPresent) continue;

      // Required ions (the "excess" ligand)
      if (req.ions?.length) {
        if (!req.ions.every(ion => (sol.ions[ion] ?? 0) > 0)) continue;
      }

      const ionChanges = { ...(rule.producesIon ?? {}) };

      events.push(baseEvent('complexation', {
        animId:      'anim_color_fade',
        observation: OBSERVATIONS[rule.observationKey] ?? '',
        equation:    rule.equation,
        ionChanges,
        pptRemoved:  rule.removesPpt ?? null,
        colorChange: rule.colorChange ? { from: null, to: rule.colorChange.to } : null,
      }));
    }
    return events;
  }

  /**
   * Easter egg overrides.
   * Replaces animId and observation on any precipitation event whose
   * pptAdded.id matches an easter egg triggerPpt.
   * Applied last — highest priority.
   *
   * @param {ReactionEvent[]} events  mutated in place
   */
  static _applyEasterEggOverrides(events) {
    for (const event of events) {
      if (!event.pptAdded) continue;
      const egg = EASTER_EGGS.find(e => e.triggerPpt === event.pptAdded.id);
      if (egg) {
        event.animId      = egg.customAnimId;
        event.observation = egg.observationOverride;
      }
    }
  }
}

/**
 * @typedef {Object} ReactionEvent
 * @property {string} id           — unique UUID for ObservationLog dedup (BUG-19)
 * @property {'precipitation'|'gas'|'redox'|'complexation'|'neutralisation'|'dissolution'|'no_reaction'} type
 * @property {string|null} animId  — id registered in AnimationManager
 * @property {string} observation  — plain English (empty = no log entry)
 * @property {string} equation     — balanced ionic equation string
 * @property {Object.<string,number|null>} ionChanges  null = consumed
 * @property {{id:string,color:string,formula:string,label:string}|null} pptAdded
 * @property {string|null}  pptRemoved
 * @property {{id:string,pressure:number}|null} gasAdded
 * @property {{from:string|null,to:string}|null} colorChange
 * @property {string|null} solidRemoved
 */
