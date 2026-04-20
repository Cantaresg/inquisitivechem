/**
 * engine/NernstCalculator.js
 *
 * Pure static class. All methods are side-effect-free — safe to call from any
 * context including unit tests.
 *
 * Nernst equation:  E = E° − (RT / nF) · ln(Q)
 * At 25 °C:        E = E° − (0.05916 / n) · log₁₀(Q)
 *
 * Conventions used throughout this engine:
 *   • All potentials are REDUCTION potentials (E°red, V vs SHE).
 *   • n = number of electrons transferred per formula unit of the half-reaction.
 *   • Q for cathode cation reduction:
 *       Mⁿ⁺ + ne⁻ → M(s)     Q = 1 / [Mⁿ⁺]         (solid product, unit activity)
 *   • Q for anode anion oxidation (written as its reduction inverse):
 *       Xₙ + ne⁻ → nX⁻       Q = [X⁻]ⁿ             (stoich-corrected — CRITICAL for
 *                                                     Cl⁻/OH⁻ crossover at ~2 mol dm⁻³)
 *   • The overpotential (kinetic correction) for each ion is stored in ION_DB and
 *     added on top of E_nernst before the discharge-order sort.
 */

export class NernstCalculator {
  static R          = 8.314;     // J mol⁻¹ K⁻¹
  static F          = 96_485;    // C mol⁻¹
  static T_DEFAULT  = 298.15;    // K (25 °C)

  // ── General Nernst (any T) ──────────────────────────────────────────────

  /**
   * @param {number} standardPotential  E° (V)
   * @param {number} n                  Electrons transferred per formula unit
   * @param {number} Q                  Reaction quotient (must be > 0)
   * @param {number} [T]                Temperature in K (default 298.15)
   * @returns {number}                  Nernst-corrected potential (V)
   */
  static calculate(standardPotential, n, Q, T = NernstCalculator.T_DEFAULT) {
    if (Q <= 0) return standardPotential;
    const factor = (NernstCalculator.R * T) / (n * NernstCalculator.F);
    return standardPotential - factor * Math.log(Q);
  }

  // ── 25 °C shorthand ──────────────────────────────────────────────────────

  /**
   * Nernst at 25 °C using log₁₀.
   * E = E° − (0.05916 / n) · log₁₀(Q)
   *
   * @param {number} standardPotential  E° (V)
   * @param {number} n                  Electrons transferred
   * @param {number} Q                  Reaction quotient (must be > 0)
   * @returns {number}                  Corrected potential (V)
   */
  static calculateAt25C(standardPotential, n, Q) {
    if (Q <= 0) return standardPotential;
    return standardPotential - (0.05916 / n) * Math.log10(Q);
  }

  // ── Q helpers ────────────────────────────────────────────────────────────

  /**
   * Q for a cation reduction: Mⁿ⁺ + ne⁻ → M(s)
   * The solid product has unit activity, so Q = 1 / [Mⁿ⁺].
   *
   * @param {number} ionConcentration  [Mⁿ⁺] in mol dm⁻³
   * @returns {number}
   */
  static qCation(ionConcentration) {
    return ionConcentration > 0 ? 1 / ionConcentration : 1e-12;
  }

  /**
   * Q for an anion half-reaction (written in reduction direction):
   * Xₙ + ne⁻ → nX⁻      Q = [X⁻]ⁿ
   *
   * Using stoich-corrected Q (concentration raised to the power of electronCount)
   * is critical: it causes E_nernst(Cl⁻) to drop fast enough at high [Cl⁻] that
   * Cl⁻ becomes preferentially oxidised over OH⁻ at concentrations ≥ 2 mol dm⁻³,
   * reproducing the O-Level rule without special-casing it.
   *
   * For the common case where the anion stoich coefficient equals n, this simplifies
   * the Nernst to:  E = E° − 0.05916 · log₁₀([X⁻])
   * i.e. a correction of 59.16 mV per decade of concentration.
   *
   * @param {number} ionConcentration  [X⁻] in mol dm⁻³
   * @param {number} n                 electronCount from ION_DB
   * @returns {number}
   */
  static qAnion(ionConcentration, n) {
    const c = ionConcentration > 0 ? ionConcentration : 1e-12;
    return Math.pow(c, n);
  }

  /**
   * Q for OH⁻ / H⁺ implicit ions derived from pH.
   * At 25 °C: [H⁺] = 10^(-pH), [OH⁻] = 10^(-(14 − pH))
   *
   * @param {number} pH
   * @returns {{ hConc: number, ohConc: number }}
   */
  static concentrationsFromPH(pH) {
    return {
      hConc:  Math.pow(10, -pH),
      ohConc: Math.pow(10, -(14 - pH)),
    };
  }

  // ── EMF helpers ──────────────────────────────────────────────────────────

  /**
   * Cell EMF = E_cathode − E_anode (always positive by convention here).
   * @param {number} E_cathode  Reduction potential of the cathode half-cell
   * @param {number} E_anode    Reduction potential of the anode half-cell
   * @returns {number}          EMF in volts (≥ 0)
   */
  static cellEMF(E_cathode, E_anode) {
    return E_cathode - E_anode;
  }
}
