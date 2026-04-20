/**
 * engine/ECCellEngine.js
 *
 * Electrochemical (galvanic) cell engine — A-Level only.
 *
 * A galvanic cell spontaneously converts chemical energy to electrical energy.
 * Each half-cell is a metal electrode dipping into a solution of its own ions.
 * The half-cell with the higher reduction potential is the cathode (+ve terminal);
 * the lower one is the anode (−ve terminal, oxidised spontaneously).
 *
 * Public API:
 *   ECCellEngine.run(halfCellA, halfCellB, config) → ECCellResult
 *
 * HalfCell (plain object):
 *   { electrodeId: string,   — ELECTRODE_DB key
 *     ionId:       string,   — ION_DB key  (e.g. 'Cu2+', 'Zn2+')
 *     concentration: number  — mol dm⁻³ (live value from slider)
 *   }
 *
 * ECCellResult:
 *   .cathodeCell      — HalfCell record (higher E, +ve terminal)
 *   .anodeCell        — HalfCell record (lower E, −ve terminal)
 *   .cathodeE         — Nernst-corrected E of cathode (V)
 *   .anodeE           — Nernst-corrected E of anode (V)
 *   .EMF              — cell EMF = cathodeE − anodeE (V, always ≥ 0)
 *   .electronFlow     — 'anode electrode name → cathode electrode name'
 *   .conventionalFlow — 'cathode electrode name → anode electrode name' (external circuit)
 *   .getEquations(config) → { anode: string, cathode: string, overall: string }
 */

import { NernstCalculator }       from './NernstCalculator.js';
import { ION_DB }                 from '../data/ions.js';
import { ELECTRODE_DB }           from '../data/electrodes.js';
import { PRODUCT_EQUATIONS }      from '../data/products.js';

// ─── ECCellResult ──────────────────────────────────────────────────────────

export class ECCellResult {
  /**
   * @param {object} opts
   * @param {object} opts.cathodeCell
   * @param {object} opts.anodeCell
   * @param {number} opts.cathodeE
   * @param {number} opts.anodeE
   * @param {import('./CurriculumConfig.js').CurriculumConfig} opts.config
   */
  constructor({ cathodeCell, anodeCell, cathodeE, anodeE, config }) {
    this.cathodeCell = cathodeCell;
    this.anodeCell   = anodeCell;
    this.cathodeE    = cathodeE;
    this.anodeE      = anodeE;
    this.EMF         = NernstCalculator.cellEMF(cathodeE, anodeE);
    this.config      = config;

    const catElectrode = ELECTRODE_DB[cathodeCell.electrodeId];
    const anoElectrode = ELECTRODE_DB[anodeCell.electrodeId];
    this.electronFlow     = `${anoElectrode.name} → ${catElectrode.name}`;
    this.conventionalFlow = `${catElectrode.name} → ${anoElectrode.name}`;
  }

  /**
   * Half-equations for the obs panel equations tab.
   * @param {import('./CurriculumConfig.js').CurriculumConfig} [config]
   * @returns {{ anode: string, cathode: string, overall: string }}
   */
  getEquations(config = this.config) {
    const catIon = ION_DB[this.cathodeCell.ionId];
    const anoIon = ION_DB[this.anodeCell.ionId];

    if (config.showHalfEquations) {
      const catHalf = catIon?.halfReactionReduction ?? '—';
      const anoHalf = anoIon?.halfReactionOxidation ?? '—';
      // Overall equation: combine the two half-equations (electron-balanced).
      // We display the string without simplification — the UI can note that
      // electrons must balance if the student wants to combine them.
      const overall = `${anoHalf}  |  ${catHalf}`;
      return { cathode: catHalf, anode: anoHalf, overall };
    } else {
      const catWord = catIon?.wordEquationReduction ?? '—';
      const anoWord = anoIon?.wordEquationOxidation ?? '—';
      return { cathode: catWord, anode: anoWord, overall: `${anoWord}; ${catWord}` };
    }
  }

  /**
   * Formatted EMF string, with Nernst correction note if applicable.
   * @param {import('./CurriculumConfig.js').CurriculumConfig} [config]
   * @returns {string}
   */
  getEMFDisplay(config = this.config) {
    const emfStr = this.EMF.toFixed(3);
    if (config.showNernstCorrection) {
      const catE = this.cathodeE.toFixed(3);
      const anoE = this.anodeE.toFixed(3);
      return `E_cell = ${catE} − (${anoE}) = ${emfStr} V`;
    }
    return `E_cell = ${emfStr} V`;
  }

  /**
   * Discharge summary suitable for the obs log.
   * @returns {string[]}
   */
  getObservations() {
    const catEl = ELECTRODE_DB[this.cathodeCell.electrodeId];
    const anoEl = ELECTRODE_DB[this.anodeCell.electrodeId];
    const catIon = ION_DB[this.cathodeCell.ionId];
    const anoIon = ION_DB[this.anodeCell.ionId];
    return [
      `Positive terminal (cathode): ${catEl.name} electrode — ${catIon?.wordEquationReduction ?? ''}`,
      `Negative terminal (anode):   ${anoEl.name} electrode — ${anoIon?.wordEquationOxidation ?? ''}`,
      `Electron flow: from ${this.electronFlow} through the external circuit.`,
      `Cell EMF: ${this.EMF.toFixed(3)} V`,
    ];
  }
}

// ─── ECCellEngine ─────────────────────────────────────────────────────────

export class ECCellEngine {
  /**
   * Compute the galvanic cell from two half-cells.
   *
   * Each half-cell is { electrodeId, ionId, concentration }.
   * The engine looks up E° from ELECTRODE_DB, applies Nernst, and assigns
   * cathode/anode based on which half-cell has the higher corrected E.
   *
   * @param {{ electrodeId: string, ionId: string, concentration: number }} halfCellA
   * @param {{ electrodeId: string, ionId: string, concentration: number }} halfCellB
   * @param {import('./CurriculumConfig.js').CurriculumConfig} config
   * @returns {ECCellResult}
   */
  static run(halfCellA, halfCellB, config) {
    const E_A = this._halfCellPotential(halfCellA, config.temperature);
    const E_B = this._halfCellPotential(halfCellB, config.temperature);

    // The half-cell with higher E is the cathode (spontaneously reduced).
    const [cathodeCell, anodeCell, cathodeE, anodeE] = E_A >= E_B
      ? [halfCellA, halfCellB, E_A, E_B]
      : [halfCellB, halfCellA, E_B, E_A];

    return new ECCellResult({ cathodeCell, anodeCell, cathodeE, anodeE, config });
  }

  /**
   * Compute the Nernst-corrected reduction potential for a half-cell.
   * Half-cell reaction: Mⁿ⁺(aq) + ne⁻ → M(s)
   * Q = 1 / [Mⁿ⁺]
   *
   * @param {{ electrodeId: string, ionId: string, concentration: number }} halfCell
   * @param {number} T  Temperature in K
   * @returns {number}  Corrected E (V)
   */
  static _halfCellPotential({ electrodeId, ionId, concentration }, T) {
    const electrode = ELECTRODE_DB[electrodeId];
    const ionData   = ION_DB[ionId];

    if (!electrode || !ionData) {
      throw new Error(`ECCellEngine: unknown electrodeId "${electrodeId}" or ionId "${ionId}"`);
    }
    if (electrode.standardPotential == null) {
      throw new Error(`ECCellEngine: electrode "${electrodeId}" has no standard potential (inert electrode cannot form a half-cell).`);
    }

    const conc = Math.max(concentration, 1e-9);   // guard against zero
    const Q    = NernstCalculator.qCation(conc);

    if (T === 298.15) {
      return NernstCalculator.calculateAt25C(electrode.standardPotential, ionData.electronCount, Q);
    }
    return NernstCalculator.calculate(electrode.standardPotential, ionData.electronCount, Q, T);
  }
}
