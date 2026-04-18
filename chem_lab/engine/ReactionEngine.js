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
  DISPLACEMENT_RULES,
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
    solidRemoved:    null,
    solidDeposited:  null,   // { id, amount, color } — metal deposited by displacement
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
    sol.volumeL += 0.001;   // 1 cm³ per addition
    if (Array.isArray(addedReagent.solids)) {
      for (const s of addedReagent.solids) {
        sol.addSolid(s.id, s.amount, s.color ?? null, s.passivated ?? false);
      }
    }
    // Propagate heat state from vessel (needed for gas/decomposition rules)
    sol.isHot = vessel.isHot;
    // Neutralise H⁺/OH⁻ on the working copy so sweeps see clean ion state
    sol._neutraliseAcidBase();

    // ── Step 2: full sweep — collect ALL events (BUG-01) ───────────────────
    const events = [];

    // Soluble solid spontaneous dissolution (no acid needed, e.g. Na₂CO₃ in water)
    const solubleEvents = ReactionEngine._checkSolubleSolids(sol);
    events.push(...solubleEvents);

    // Solid oxide/hydroxide + acid → salt + water (no gas produced).
    const dissolutionEvents = ReactionEngine._checkDissolution(sol);
    events.push(...dissolutionEvents);

    // Gas-producing solid reactions (metal + acid, carbonate + acid, etc.)
    // Collect first so we can apply their ion output to the clone before precipitation.
    // ─── Displacement collected BEFORE gas — two reasons:
    //  1. ca_s must still be in the clone when _checkDisplacement runs (the ca_water
    //     gas rule will remove it once gas ionChanges are applied to the clone).
    //  2. Displacement is pushed to the events array FIRST so that, when BenchUI calls
    //     _applyEvents sequentially, the gas event's Ca²⁺ value (absolute, pre-existing+δ)
    //     is written AFTER displacement's Ca²⁺ = 0.001 and correctly overrides it.
    //     This gives the full three-tier Ca cascade in one addition:
    //       Ca → displaces Fe(s)  AND  Ca + H₂O → OH⁻ → Fe(OH)₂ ppt.
    const displacementEvents = ReactionEngine._checkDisplacement(sol);
    events.push(...displacementEvents);

    const preGasEvents = ReactionEngine._checkGasRules(sol, addedReagent, []);
    events.push(...preGasEvents);

    // ─── Apply dissolution + gas ionChanges to the clone so that precipitation
    //     sees the cations released by solid reactions in this same sweep. ────
    // This is read-only application on the clone (not the live vessel) — BUG-02 is safe
    // because we never touch vessel.solution here.
    ReactionEngine._applyIonChangesToClone(sol, [...solubleEvents, ...dissolutionEvents, ...preGasEvents]);

    // Ionic precipitation — now sees released cations (e.g. Cu²⁺ from CuCO₃ + H₂SO₄)
    // AND OH⁻ produced by water-reactive metals (e.g. Ca + H₂O → Ca²⁺ + 2OH⁻).
    // BUG-01: never stops on first match.
    const precipEvents = ReactionEngine._checkPrecipitation(sol);
    events.push(...precipEvents);

    // Apply ppt ionChanges AND displacement ionChanges together.
    // Displacement applied here (not before precipitation) so OH⁻ from Ca water reaction
    // can precipitate the same cation that Ca also directly displaces in the same sweep.
    // applyPpts:false preserves the two-stage complexation behaviour.
    ReactionEngine._applyIonChangesToClone(sol, [...precipEvents, ...displacementEvents], { applyPpts: false });
    // Acid-base neutralisation — runs AFTER solid reactions so H⁺ consumed by
    // dissolving solids is accounted for before OH⁻ is spent on neutralisation.
    const solidEvents = events.filter(ev =>
      ev.type === 'gas' || ev.type === 'dissolution');
    events.push(...ReactionEngine._checkNeutralisation(vessel.solution, addedReagent, solidEvents));

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
   * Lightweight "apply" pass on the working clone only.
   * Propagates ionChanges and solidRemoved from dissolution/gas events so that
   * subsequent sweeps (precipitation, complexation) see the post-reaction ion state.
   * Does NOT touch the live vessel (BUG-02 safe).
   *
   * @param {import('./Solution.js').Solution} sol
   * @param {ReactionEvent[]} events
   * @param {{ applyPpts?: boolean }} [opts]  set applyPpts:false to skip pptAdded (used after
   *   precipitation so complexation two-stage logic still sees ppts as "just formed").
   * @private
   */
  static _applyIonChangesToClone(sol, events, { applyPpts = true } = {}) {
    for (const ev of events) {
      for (const [sym, val] of Object.entries(ev.ionChanges ?? {})) {
        if (val === null) {
          delete sol.ions[sym];
        } else {
          sol.ions[sym] = val;
        }
      }
      if (ev.solidRemoved) {
        sol.solids = sol.solids.filter(s => s.id !== ev.solidRemoved);
      }
      if (applyPpts && ev.pptAdded) {
        if (!sol.ppts.some(p => p.id === ev.pptAdded.id)) {
          sol.ppts.push({ ...ev.pptAdded });
        }
      }
    }
  }
  /**
   * Neutralisation: H⁺ + OH⁻ → H₂O
   * Computes ion delta from the ORIGINAL solution + added reagent (without mutating).
   * Returns at most one event. Empty observation so BenchUI skips log entry.
   */
  static _checkNeutralisation(originalSol, addedReagent, solidEvents = []) {
    // Compute what the merged H⁺ and OH⁻ would be, AFTER subtracting H⁺ consumed
    // by solid/gas/dissolution reactions in this same sweep.
    // This prevents excess-acid from "stealing" the OH⁻ that should precipitate cations.
    const addedIons  = addedReagent.ions ?? {};
    let h  = (originalSol.ions['H+']  ?? 0) + (addedIons['H+']  ?? 0);
    const oh = (originalSol.ions['OH-'] ?? 0) + (addedIons['OH-'] ?? 0);

    // Subtract H⁺ consumed by solid reactions (gas + dissolution events)
    for (const ev of solidEvents) {
      if (ev.ionChanges?.['H+'] === null) {
        // H⁺ fully consumed by solid reaction
        h = 0;
        break;
      } else if (typeof ev.ionChanges?.['H+'] === 'number') {
        // H⁺ partially consumed: ionChanges['H+'] is the REMAINING amount
        h = ev.ionChanges['H+'];
        break;
      }
    }

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
      const solid = sol.solids.find(s => s.id === solidId);
      const ionChanges = {};
      for (const [sym, stoich] of Object.entries(spec.ions)) {
        // Absolute: pre-existing ion amount + newly dissolved
        ionChanges[sym] = (sol.ions[sym] ?? 0) + (solid?.amount ?? 0.001) * stoich;
      }
      events.push(baseEvent('dissolution', {
        animId:      'anim_solid_dissolve',
        observation: OBSERVATIONS[spec.observationKey] ?? '',
        equation:    spec.equation,
        ionChanges,
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
        const caoSolid = sol.solids.find(s => s.id === 'cao_s');
        const caoMol = caoSolid?.amount ?? 0.001;
        events.push(baseEvent('dissolution', {
          animId:      'anim_solid_dissolve',
          observation: OBSERVATIONS[rule.observationMap['cao_s']] ?? '',
          equation:    rule.equation,
          ionChanges:  { [product.ion]: (sol.ions['Ca2+'] ?? 0) + caoMol, 'OH-': (sol.ions['OH-'] ?? 0) + 2 * caoMol },
          solidRemoved: 'cao_s',
        }));
        continue;
      }

      // Amphoteric oxide + alkali dissolution (uses alkaliProductMap instead of SOLID_ION_PRODUCTS)
      if (rule.alkaliProductMap) {
        const req = rule.requires;
        if (req.ions?.length && !req.ions.every(ion => (sol.ions[ion] ?? 0) > 0)) continue;
        const matchedSolid = sol.solids.find(s => req.anySolid?.includes(s.id));
        if (!matchedSolid) continue;
        const solidId = matchedSolid.id;
        const product = rule.alkaliProductMap[solidId];
        if (!product) continue;
        const ionChanges = {
          [product.ion]: (sol.ions[product.ion] ?? 0) + matchedSolid.amount * product.stoich,
        };
        if (typeof product.ohConsumption === 'number') {
          const ohPresent = sol.ions['OH-'] ?? 0;
          const ohRemaining = ohPresent - matchedSolid.amount * product.ohConsumption;
          ionChanges['OH-'] = ohRemaining <= 1e-9 ? null : ohRemaining;
        }
        events.push(baseEvent('dissolution', {
          animId:      'anim_solid_dissolve',
          observation: OBSERVATIONS[rule.observationMap?.[solidId]] ?? '',
          equation:    product.equation,
          ionChanges,
          solidRemoved: solidId,
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
      // Absolute: pre-existing ion amount + newly produced
      const ionChanges = { [product.ion]: (sol.ions[product.ion] ?? 0) + matchedSolid.amount * product.stoich };
      // Consume H⁺ stoichiometrically
      if (typeof product.hConsumption === 'number') {
        const hPresent = sol.ions['H+'] ?? 0;
        const hConsumed = matchedSolid.amount * product.hConsumption;
        const hRemaining = hPresent - hConsumed;
        ionChanges['H+'] = hRemaining <= 1e-9 ? null : hRemaining;
      }
      events.push(baseEvent('dissolution', {
        animId:      'anim_solid_dissolve',
        observation: OBSERVATIONS[rule.observationMap?.[solidId]] ?? '',
        equation:    product.equation,
        ionChanges,
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
  static _checkGasRules(sol, addedReagent, precipEvents = []) {
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

      // notIons: rule does not fire if any of these ions are present
      // e.g. ca_water skips when H⁺ is present (h2_metal_acid handles that case)
      if (req.notIons?.length) {
        if (req.notIons.some(ion => (sol.ions[ion] ?? 0) > 0)) continue;
      }

      // Match solid OR ppt.
      // anySolid entries whose id ends in '_s' also match ppts whose id = solidId.slice(0,-2).
      // This lets Ag₂CO₃ and PbCO₃ ppts react with acid without needing to be solid reagents.
      let matchedSolid = null;
      let matchedPpt   = null;
      if (req.anySolid?.length) {
        matchedSolid = sol.solids.find(s => req.anySolid.includes(s.id));
        if (!matchedSolid) {
          // Check if a ppt matches any listed solid (pptId === solidId without '_s' suffix).
          // Skip ppts that have a dedicated complexation + acid rule — let complexation handle
          // them exclusively to avoid double-firing CO₂ and double-producing the cation.
          matchedPpt = sol.ppts.find(p =>
            req.anySolid.some(sid => sid.endsWith('_s') && sid.slice(0, -2) === p.id) &&
            !COMPLEXATION_RULES.some(cr => cr.requires?.ppt === p.id && cr.requires?.ions?.includes('H+')));
        }
        if (!matchedSolid && !matchedPpt) continue;
      }

      // Heat gate (TRAP-06)
      if (req.isHot && !sol.isHot) continue;

      // The solid id used for product lookups and block checks
      const solidId = matchedSolid?.id ?? (matchedPpt ? matchedPpt.id + '_s' : null);

      // blockedByAnions: if a blocking anion is present in solution when the carbonate
      // solid/ppt would dissolve, the released cation immediately coats the surface.
      // First contact (coating ppt not yet in sol.ppts): brief gas burst + pptAdded.
      // Subsequent contacts (coating already in sol.ppts): fully blocked.
      if (rule.blockedByAnions && solidId) {
        const blockAnions = rule.blockedByAnions[solidId] ?? [];
        const matchedAnion = blockAnions.find(anion => (sol.ions[anion] ?? 0) > 0);
        if (matchedAnion) {
          // Use a marker ion to track coat state (avoids adding a visible ppt to the vessel)
          const coatIon = rule.coatMarkerIons?.[solidId];
          const coatAlreadyPresent = coatIon ? (sol.ions[coatIon] ?? 0) > 0 : false;

          if (!coatAlreadyPresent) {
            // First contact: brief effervescence, then coat seals surface
            const obsKey = rule.blockedFirstContactObs?.[solidId] ?? 'obs_co2_solid_carbonate';
            events.push(baseEvent('gas', {
              animId:       'anim_bubbles',
              observation:  OBSERVATIONS[obsKey] ?? '',
              equation:     SOLID_ION_PRODUCTS[solidId]?.equation ?? rule.equation,
              ionChanges:   coatIon ? { [coatIon]: 1 } : {},  // marker only, no cation released
              gasAdded:     { id: rule.gas, pressure: 0.20 },  // brief, low pressure
              solidRemoved: null,   // solid stays — it is now coated
            }));
          } else {
            // Subsequent contacts: coat present, no reaction
            const obsKey = rule.blockedObservationMap?.[solidId] ?? 'obs_caso4_passivation';
            events.push(baseEvent('passivation', {
              observation: OBSERVATIONS[obsKey] ?? '',
              equation:    '',
              ionChanges:  {},
            }));
          }
          continue;
        }
      }

      // Pick observation and animId: per-solid overrides take priority
      const obsKey   = (solidId && rule.observationMap?.[solidId])  ?? rule.observationKey;
      const animId   = (solidId && rule.animIdMap?.[solidId])       ?? 'anim_bubbles';

      // Build ionChanges for solid-consuming reactions
      const ionChanges  = {};
      let   solidRemoved = null;
      let   pptRemoved   = null;

      if (solidId) {
        if (rule.producesIons) {
          // Rule specifies its own product ions directly (e.g. ca_water → Ca²⁺ + 2OH⁻).
          // stoich coefficients are per mole of solid consumed.
          const amount = matchedSolid?.amount ?? 0.001;
          for (const [sym, stoich] of Object.entries(rule.producesIons)) {
            ionChanges[sym] = (sol.ions[sym] ?? 0) + amount * stoich;
          }
        } else {
          const product = SOLID_ION_PRODUCTS[solidId];
          if (product) {
            const amount = matchedSolid?.amount ?? 0.001; // ppts use a fixed portion
            // Absolute: pre-existing ion amount + newly produced (keeps SET semantics correct)
            ionChanges[product.ion] = (sol.ions[product.ion] ?? 0) + amount * product.stoich;
            if (typeof product.hConsumption === 'number') {
              const hPresent   = sol.ions['H+'] ?? 0;
              const hConsumed  = amount * product.hConsumption;
              const hRemaining = hPresent - hConsumed;
              ionChanges['H+'] = hRemaining <= 1e-9 ? null : hRemaining;
            }
          }
        }
        if (matchedSolid) solidRemoved = solidId;
        if (matchedPpt)   pptRemoved   = matchedPpt.id;
      }

      events.push(baseEvent('gas', {
        animId,
        observation: OBSERVATIONS[obsKey] ?? '',
        equation:    (!rule.overrideEquation && solidId && SOLID_ION_PRODUCTS[solidId]?.equation)
                       ? SOLID_ION_PRODUCTS[solidId].equation
                       : rule.equation,
        ionChanges,
        gasAdded:    { id: rule.gas, pressure: rule.pressure },
        solidRemoved,
        pptRemoved,
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
          // Remove the precipitating cation from solution so the colour updates
          // and subsequent sweeps/additions see the correct ionic state.
          // The anion is left in solution (typically in excess — e.g. excess NaOH).
          ionChanges:  { [cation]: null },
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
      // Track which one matched first — used for anyOfTransform resolution below.
      let matchedAnyOf = null;
      if (req.anyOf?.length) {
        matchedAnyOf = req.anyOf.find(ion => (sol.ions[ion] ?? 0) > 0) ?? null;
        if (matchedAnyOf === null) continue;
      }

      // notIons: ALL listed ions must be absent (used for pH-conditional rules)
      if (req.notIons?.length) {
        if (req.notIons.some(ion => (sol.ions[ion] ?? 0) > 0)) continue;
      }

      // Resolve per-reductant overrides (anyOfTransform).
      // Merged on top of the base ionTransform / producesIon / equation.
      const extra = (rule.anyOfTransform && matchedAnyOf)
        ? (rule.anyOfTransform[matchedAnyOf] ?? {})
        : {};
      const mergedTransform  = { ...(rule.ionTransform  ?? {}), ...(extra.ionTransform  ?? {}) };
      const mergedProducesIon = { ...(rule.producesIon ?? {}), ...(extra.producesIon ?? {}) };
      const equation = extra.equation ?? rule.equation;

      // Build ionChanges from merged ionTransform map
      const ionChanges = {};
      for (const [sym, target] of Object.entries(mergedTransform)) {
        if ((sol.ions[sym] ?? 0) > 0) {
          ionChanges[sym] = null;  // consumed
          if (typeof target === 'string') {
            ionChanges[target] = (sol.ions[target] ?? 0) + (sol.ions[sym] ?? 0.05);
          }
        }
      }
      // Ions produced by the redox reaction (e.g. Mn²⁺ from MnO₄⁻ reduction)
      for (const [sym, val] of Object.entries(mergedProducesIon)) {
        ionChanges[sym] = (ionChanges[sym] ?? 0) + val;
      }

      events.push(baseEvent('redox', {
        animId:      rule.animId ?? 'anim_color_fade',
        observation: OBSERVATIONS[rule.observationKey] ?? '',
        equation,
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

      // Build ionChanges: absolute values (pre-existing + delta) so SET semantics stay correct.
      // Also consume H⁺ stoichiometrically when carbonate ppts dissolve in acid (hConsumption).
      const ionChanges = {};
      for (const [sym, val] of Object.entries(rule.producesIon ?? {})) {
        ionChanges[sym] = (sol.ions[sym] ?? 0) + val;
      }
      if (rule.hConsumption) {
        const hPresent   = sol.ions['H+'] ?? 0;
        const hConsumed  = 0.001 * rule.hConsumption;  // token mol per ppt portion
        const hRemaining = hPresent - hConsumed;
        ionChanges['H+'] = hRemaining <= 1e-9 ? null : hRemaining;
      }

      events.push(baseEvent('complexation', {
        animId:      'anim_color_fade',
        observation: OBSERVATIONS[rule.observationKey] ?? '',
        equation:    rule.equation,
        ionChanges,
        pptRemoved:  rule.removesPpt ?? null,
        gasAdded:    rule.gasAdded   ?? null,
        colorChange: rule.colorChange ? { from: null, to: rule.colorChange.to } : null,
      }));
    }
    return events;
  }

  /**
   * Displacement reactions.
   * A more-reactive metal solid reduces a metal cation in solution.
   * Fires without heat; covers all entries in DISPLACEMENT_RULES.
   *
   * @param {import('./Solution.js').Solution} sol  working clone
   */
  static _checkDisplacement(sol) {
    const events = [];
    for (const rule of DISPLACEMENT_RULES) {
      const req = rule.requires;
      // Solid must be present
      if (!sol.solids.some(s => s.id === req.solid)) continue;
      // Displaced cation must be present
      if ((sol.ions[req.ion] ?? 0) <= 0) continue;

      // Al₂O₃ passivation: Al does not displace metals from solution under normal conditions.
      // The oxide layer must be removed by a strongly acidic or alkaline medium first.
      // At school level: Al only displaces when the solution is acidic (H⁺ present) or hot.
      if (req.solid === 'al_s') {
        const hConc = sol.volumeL > 0
          ? (sol.ions['H+'] ?? 0) / sol.volumeL
          : (sol.ions['H+'] ?? 0) / 1e-6;
        if (hConc < 0.3 && !sol.isHot) continue;
      }

      events.push(baseEvent('displacement', {
        animId:         'anim_solid_dissolve',
        observation:    OBSERVATIONS[rule.observationKey] ?? '',
        equation:       rule.equation,
        ionChanges:     { ...rule.ionChanges },
        solidRemoved:   rule.solidRemoved,
        solidDeposited: rule.depositedSolid ?? null,
        colorChange:    rule.colorChange ? { from: null, to: rule.colorChange.to } : null,
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
 * @property {'precipitation'|'gas'|'redox'|'complexation'|'neutralisation'|'dissolution'|'displacement'|'no_reaction'} type
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
