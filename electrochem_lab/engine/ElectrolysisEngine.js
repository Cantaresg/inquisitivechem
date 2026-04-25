/**
 * engine/ElectrolysisEngine.js
 *
 * Core electrolysis logic. Works with plain data records from the data/ layer —
 * no class instances needed from the caller.
 *
 * Public API:
 *   ElectrolysisEngine.run(electrolyteRecord, anodeRecord, cathodeRecord, config)
 *     → ElectrolysisResult
 *
 * ElectrolysisResult:
 *   .cathodeProduct        — PRODUCT_DB record
 *   .cathodeWinnerIonId    — ION_DB key that won the cathode selection
 *   .cathodeE              — effective Nernst-corrected E used (V)
 *   .anodeProduct          — PRODUCT_DB record
 *   .anodeWinnerIonId      — ION_DB key that won anode selection (null if reactive electrode)
 *   .anodeE                — effective E used (V, null if reactive)
 *   .isReactiveAnode       — true when reactive electrode dissolved
 *   .config                — CurriculumConfig
 *   .getObservations()     → string[]  (plain-English, O-Level language)
 *   .getEquations(config)  → { cathode: string, anode: string }
 *                            (half-equations at A-Level, word equations at O-Level)
 */

import { NernstCalculator }       from './NernstCalculator.js';
import { ION_DB }                 from '../data/ions.js';
import {
  PRODUCT_DB,
  CATHODE_PRODUCT_BY_ION,
  ANODE_PRODUCT_BY_ION,
  ANODE_DISSOLVE_BY_ELECTRODE,
  PRODUCT_EQUATIONS,
}                                 from '../data/products.js';

// ─── ElectrolysisResult ────────────────────────────────────────────────────

export class ElectrolysisResult {
  /**
   * @param {object} opts
   * @param {object}      opts.cathodeProduct
   * @param {string}      opts.cathodeWinnerIonId
   * @param {number}      opts.cathodeE
   * @param {object}      opts.anodeProduct
   * @param {string|null} opts.anodeWinnerIonId
   * @param {number|null} opts.anodeE
   * @param {boolean}     opts.isReactiveAnode
   * @param {boolean}     [opts.isMolten]
   * @param {import('./CurriculumConfig.js').CurriculumConfig} opts.config
   */
  constructor({
    cathodeProduct,
    cathodeWinnerIonId,
    cathodeE,
    anodeProduct,
    anodeWinnerIonId,
    anodeE,
    isReactiveAnode,
    isMolten = false,
    config,
  }) {
    this.cathodeProduct       = cathodeProduct;
    this.cathodeWinnerIonId   = cathodeWinnerIonId;
    this.cathodeE             = cathodeE;
    this.anodeProduct         = anodeProduct;
    this.anodeWinnerIonId     = anodeWinnerIonId;
    this.anodeE               = anodeE;
    this.isReactiveAnode      = isReactiveAnode;
    this.isMolten             = isMolten;
    this.config               = config;
  }

  /**
   * Plain-English observation strings for the obs log.
   * Always uses O-Level language regardless of config (the equations tab shows
   * the A-Level ionic form).
   * @returns {string[]}
   */
  getObservations() {
    const obs = [];
    obs.push(`Cathode: ${this.cathodeProduct.observation}`);
    obs.push(`Anode:   ${this.anodeProduct.observation}`);
    return obs;
  }

  /**
   * Half-equations or word equations, keyed by electrode.
   * @param {import('./CurriculumConfig.js').CurriculumConfig} [config]
   * @returns {{ cathode: string, anode: string }}
   */
  getEquations(config = this.config) {
    if (config.showHalfEquations) {
      // A-Level: full ionic half-equations
      const catEq = PRODUCT_EQUATIONS[this.cathodeProduct.id];
      const anoEq = PRODUCT_EQUATIONS[this.anodeProduct.id];
      return {
        cathode: catEq ? catEq.reduction : '—',
        anode:   anoEq ? anoEq.oxidation : '—',
      };
    } else {
      // O-Level: word equations from ION_DB
      const catIon = ION_DB[this.cathodeWinnerIonId];
      let catWord = catIon?.wordEquationReduction ?? this.cathodeProduct.observation;
      if (this.isMolten && this.cathodeWinnerIonId === 'Na+') {
        catWord = 'sodium ions are reduced to sodium (liquid metal)';
      }

      let anoWord;
      if (this.isReactiveAnode) {
        // Reactive electrode dissolution — word equation from ion record
        const anoIon = ION_DB[this.anodeWinnerIonId];
        anoWord = anoIon?.wordEquationOxidation ?? this.anodeProduct.observation;
      } else {
        const anoIon = ION_DB[this.anodeWinnerIonId];
        anoWord = anoIon?.wordEquationOxidation ?? this.anodeProduct.observation;
      }
      return {
        cathode: catWord,
        anode:   anoWord,
      };
    }
  }
}

// ─── ElectrolysisEngine ───────────────────────────────────────────────────

export class ElectrolysisEngine {
  /**
   * Run the electrolysis simulation.
   *
   * @param {object} electrolyte  Record from ELECTROLYTE_DB (with live concentration)
   * @param {object} anode        Record from ELECTRODE_DB
   * @param {object} cathode      Record from ELECTRODE_DB
   * @param {import('./CurriculumConfig.js').CurriculumConfig} config
   * @returns {ElectrolysisResult}
   */
  static run(electrolyte, anode, cathode, config) {
    const { hConc, ohConc } = NernstCalculator.concentrationsFromPH(electrolyte.pH);

    const { productId: catProdId, winnerIonId: catIonId, effectiveE: catE }
      = this._selectCathodeProduct(electrolyte, cathode, hConc, config);

    const { productId: anoProdId, winnerIonId: anoIonId, effectiveE: anoE, isReactive }
      = this._selectAnodeProduct(electrolyte, anode, ohConc, config);

    return new ElectrolysisResult({
      cathodeProduct:     PRODUCT_DB[catProdId],
      cathodeWinnerIonId: catIonId,
      cathodeE:           catE,
      anodeProduct:       PRODUCT_DB[anoProdId],
      anodeWinnerIonId:   anoIonId,
      anodeE:             anoE,
      isReactiveAnode:    isReactive,
      isMolten:           Boolean(electrolyte?.isMolten),
      config,
    });
  }

  // ── Cathode selection (reduction) ───────────────────────────────────────

  /**
   * Builds the candidate list for cathode ion discharge.
   * Winner = candidate with the HIGHEST effective reduction potential.
   * (Higher E_red → more thermodynamically favourable to reduce.)
   */
  static _selectCathodeProduct(electrolyte, cathode, hConc, config) {
    const candidates = [];

    // 1. Electrolyte cations
    for (const { ionId, stoichFactor } of electrolyte.cations) {
      const ionData = ION_DB[ionId];
      if (!ionData) continue;
      const conc = stoichFactor * electrolyte.concentration;
      const Q    = NernstCalculator.qCation(conc);
      const E    = NernstCalculator.calculateAt25C(
        ionData.standardPotential,
        ionData.electronCount,
        Q,
      );
      candidates.push({ ionId, effectiveE: E + (ionData.overpotential ?? 0) });
    }

    // 2. H⁺ is only implicitly present in aqueous electrolytes.
    if (!electrolyte.isMolten) {
      const hData = ION_DB['H+'];
      const Q     = NernstCalculator.qCation(hConc);
      const E     = NernstCalculator.calculateAt25C(
        hData.standardPotential,
        hData.electronCount,
        Q,
      );
      candidates.push({ ionId: 'H+', effectiveE: E });
    }

    // 3. Winner: highest effective E
    candidates.sort((a, b) => b.effectiveE - a.effectiveE);
    const winner = candidates[0];

    let productId = CATHODE_PRODUCT_BY_ION[winner.ionId] ?? 'h2_gas';
    if (electrolyte.isMolten) {
      const MOLTEN_MAP = { 'Na+': 'na_liquid', 'Pb2+': 'pb_liquid', 'Zn2+': 'zn_liquid' };
      productId = MOLTEN_MAP[winner.ionId] ?? productId;
    }

    return {
      productId,
      winnerIonId: winner.ionId,
      effectiveE: winner.effectiveE,
    };
  }

  // ── Anode selection (oxidation) ─────────────────────────────────────────

  /**
   * Builds the candidate list for anode ion discharge.
   * If the anode is reactive (non-inert), it dissolves unconditionally.
   * Otherwise, winner = candidate with the LOWEST effective E_red
   *   → most thermodynamically favourable to oxidise.
   */
  static _selectAnodeProduct(electrolyte, anode, ohConc, config) {
    // Rule 1: Reactive anode always dissolves — overrides all ion selection.
    if (!anode.isInert) {
      const productId = ANODE_DISSOLVE_BY_ELECTRODE[anode.id];
      // The "ionId" produced is the ion that enters solution (e.g. Cu2+)
      return {
        productId:   productId ?? 'cu_dissolve',
        winnerIonId: anode.oxidationProductId,
        effectiveE:  null,
        isReactive:  true,
      };
    }

    const candidates = [];

    // 1. Electrolyte anions
    for (const { ionId, stoichFactor } of electrolyte.anions) {
      const ionData = ION_DB[ionId];
      if (!ionData) continue;
      const conc = stoichFactor * electrolyte.concentration;
      // Stoich-corrected Q: Q = [X⁻]^n  (critical for Cl⁻/OH⁻ crossover)
      const Q    = NernstCalculator.qAnion(conc, ionData.electronCount);
      const E    = NernstCalculator.calculateAt25C(
        ionData.standardPotential,
        ionData.electronCount,
        Q,
      );
      candidates.push({ ionId, effectiveE: E + (ionData.overpotential ?? 0) });
    }

    // 2. OH⁻ is only implicitly present in aqueous electrolytes.
    if (!electrolyte.isMolten) {
      const ohData = ION_DB['OH-'];
      const Q      = NernstCalculator.qAnion(ohConc, ohData.electronCount);
      const E      = NernstCalculator.calculateAt25C(
        ohData.standardPotential,
        ohData.electronCount,
        Q,
      );
      candidates.push({ ionId: 'OH-', effectiveE: E + ohData.overpotential });
    }

    // 3. Winner: lowest effective E_red = most easily oxidised
    candidates.sort((a, b) => a.effectiveE - b.effectiveE);
    const winner = candidates[0];

    return {
      productId:   ANODE_PRODUCT_BY_ION[winner.ionId] ?? 'o2_gas',
      winnerIonId: winner.ionId,
      effectiveE:  winner.effectiveE,
      isReactive:  false,
    };
  }
}
