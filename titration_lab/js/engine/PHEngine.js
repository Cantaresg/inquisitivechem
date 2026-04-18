/**
 * PHEngine — temperature-aware pH calculator.
 *
 * Usage
 * ─────
 *   const engine = new PHEngine({ temperature: 25 });
 *   const pH = engine.compute(titrant, analyte, 12.5, 25.0, 0.1, 0.1);
 *
 * Temperature handling (§8.7)
 * ──────────────────────────
 * Kw depends on temperature.  We use the Harned & Ehlers (1933) empirical fit:
 *
 *   pKw(T) = 4470.99 / T − 6.0875 + 0.01706 × T      (T in Kelvin)
 *
 * This is accurate to ±0.01 pKw units over 0–60 °C, and consistent with
 * published values: pKw(15°C) ≈ 14.35, pKw(25°C) = 14.00, pKw(37°C) ≈ 13.62.
 *
 * Note: The spec cites exp(−6908/T + 22.6) as a van't Hoff approximation.
 * That formula is dimensionally incorrect (it evaluates to ~0.57 at 25 °C,
 * not 1×10⁻¹⁴).  The Harned & Ehlers fit is used instead.
 *
 * Numerical stability (§8.1)
 * ──────────────────────────
 * Within 0.01 % of the equivalence point, Henderson-Hasselbalch and simple
 * square-root approximations diverge.  Epsilon guards route these edge cases
 * to the EP hydrolysis formula.
 *
 * Output is clamped to [0, 14] to prevent nonsensical values at very high
 * or very low concentrations.
 */

import { ReactionSystem } from './ReactionSystem.js';

// Small number below which mole amounts are treated as zero
const MOL_EPS = 1e-12;

export class PHEngine {
  /** @type {number} Temperature in °C */
  #temperature;

  /** @type {number} Kw at current temperature */
  #Kw;

  /** @type {number} pKw = −log₁₀(Kw) */
  #pKw;

  /**
   * @param {Object} [opts]
   * @param {number} [opts.temperature=25]  Initial temperature in °C
   * @param {number} [opts.Kw]              Override Kw directly (ignores temperature)
   */
  constructor({ temperature = 25, Kw } = {}) {
    if (Kw !== undefined) {
      this.#Kw = Kw;
      this.#pKw = -Math.log10(Kw);
      this.#temperature = temperature;
    } else {
      this.#temperature = temperature;
      this.#recalcKw();
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get temperature() { return this.#temperature; }
  get Kw()          { return this.#Kw; }

  /**
   * Set temperature and recalculate Kw via Harned & Ehlers fit.
   * Clamps to 5–40 °C (outside this range the empirical fit drifts, §8.7).
   * @param {number} celsius
   */
  setTemperature(celsius) {
    this.#temperature = Math.max(5, Math.min(40, celsius));
    this.#recalcKw();
  }

  /**
   * Override Kw directly (e.g. for IB students entering a non-standard value).
   * @param {number} value
   */
  setKw(value) {
    if (value <= 0 || value >= 1) throw new RangeError('Kw must be in (0, 1)');
    this.#Kw = value;
    this.#pKw = -Math.log10(value);
  }

  /**
   * Compute pH for any supported titrant+analyte pair.
   *
   * @param {{ id: string, type: string, Ka?: number, Kb?: number }} titrant
   * @param {{ id: string, type: string, Ka?: number, Kb?: number }} analyte
   * @param {number} volTitrant_mL  Volume of titrant dispensed so far (mL)
   * @param {number} volAnalyte_mL  Volume of analyte in the flask (mL)
   * @param {number} concTitrant    Concentration of titrant (mol dm⁻³)
   * @param {number} concAnalyte    Concentration of analyte (mol dm⁻³)
   * @returns {number} pH clamped to [0, 14]
   */
  compute(titrant, analyte, volTitrant_mL, volAnalyte_mL, concTitrant, concAnalyte) {
    const vT  = volTitrant_mL / 1000;   // dm³
    const vA  = volAnalyte_mL / 1000;   // dm³
    const vol = vT + vA;                // total volume dm³
    const nT  = concTitrant * vT;       // moles of titrant
    const nA  = concAnalyte * vA;       // moles of analyte

    const system = ReactionSystem.classify(titrant, analyte);
    let pH;

    switch (system) {
      case ReactionSystem.SA_SB: {
        // Route so nAcid / nBase are always meaningful
        const [nAcid, nBase] = titrant.type === 'acid'
          ? [nT, nA]
          : [nA, nT];
        pH = this.#pH_SA_SB(nAcid, nBase, vol);
        break;
      }

      case ReactionSystem.WA_SB: {
        // Weak acid may be in either vessel
        const [nWA, nSB, Ka] = titrant.type === 'acid'
          ? [nT, nA, titrant.Ka]
          : [nA, nT, analyte.Ka];
        if (!Ka) throw new Error(`PHEngine: analyte/titrant has no Ka for WA_SB system`);
        pH = this.#pH_WA_SB(nWA, nSB, vol, Ka);
        break;
      }

      case ReactionSystem.SA_WB: {
        // Weak base may be in either vessel
        const [nWB, nSA, Kb] = titrant.type === 'base'
          ? [nT, nA, titrant.Kb]
          : [nA, nT, analyte.Kb];
        if (!Kb) throw new Error(`PHEngine: analyte/titrant has no Kb for SA_WB system`);
        pH = this.#pH_SA_WB(nWB, nSA, vol, Kb);
        break;
      }

      case ReactionSystem.Na2CO3_SA: {
        const [nCO3, nSA] = titrant.id === 'na2co3'
          ? [nT, nA]
          : [nA, nT];
        pH = this.#pH_Na2CO3_SA(nCO3, nSA, vol);
        break;
      }

      default:
        pH = this.#pKw / 2;
    }

    return Math.max(0, Math.min(14, pH));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Recalculate Kw and pKw from #temperature using Harned & Ehlers fit. */
  #recalcKw() {
    const T  = this.#temperature + 273.15;
    this.#pKw = 4470.99 / T - 6.0875 + 0.01706 * T;
    this.#Kw  = Math.pow(10, -this.#pKw);
  }

  /**
   * Strong acid + strong base.
   * @param {number} nAcid  mol
   * @param {number} nBase  mol
   * @param {number} vol    dm³
   */
  #pH_SA_SB(nAcid, nBase, vol) {
    const excess = nAcid - nBase;

    if (Math.abs(excess) < MOL_EPS) return this.#pKw / 2;  // exact EP

    if (excess > 0) {
      // Excess acid
      return -Math.log10(excess / vol);
    }
    // Excess base
    return this.#pKw + Math.log10(-excess / vol);
  }

  /**
   * Weak acid (HA) + strong base (NaOH / KOH).
   *
   * Regions:
   *   nBase = 0           → pure weak acid: [H⁺] = √(Ka × c)
   *   0 < nBase < nAcid   → buffer (Henderson-Hasselbalch), with EP fallback
   *                          within 0.01 % of the EP
   *   nBase ≈ nAcid        → EP: A⁻ hydrolysis [OH⁻] = √(Kw/Ka × c_A)
   *   nBase > nAcid        → excess strong base
   *
   * @param {number} nWA  mol of weak acid initially present
   * @param {number} nSB  mol of strong base added
   * @param {number} vol  dm³
   * @param {number} Ka
   */
  #pH_WA_SB(nWA, nSB, vol, Ka) {
    // Pure weak acid (no base added yet)
    if (nSB <= MOL_EPS) {
      const H = Math.sqrt(Ka * nWA / vol);
      return -Math.log10(H);
    }

    const excess = nSB - nWA;

    // Past (or at) equivalence point
    if (excess >= -MOL_EPS) {
      if (excess > MOL_EPS) {
        // Excess strong base
        return this.#pKw + Math.log10(excess / vol);
      }
      // At EP: A⁻ hydrolysis
      const c_A = nWA / vol;
      const OH  = Math.sqrt((this.#Kw / Ka) * c_A);
      return this.#pKw + Math.log10(OH);
    }

    // Buffer region — Henderson-Hasselbalch
    const nSalt     = nSB;           // moles of A⁻ produced
    const nAcidLeft = nWA - nSB;     // moles of HA remaining

    // Epsilon guard: within 0.01 % of EP, H-H diverges → use EP hydrolysis formula
    if (nAcidLeft < nWA * 1e-4) {
      const c_A = nWA / vol;
      const OH  = Math.sqrt((this.#Kw / Ka) * c_A);
      return this.#pKw + Math.log10(OH);
    }

    return -Math.log10(Ka) + Math.log10(nSalt / nAcidLeft);
  }

  /**
   * Strong acid (HCl / H₂SO₄) + weak base (NH₃).
   *
   * Regions:
   *   nSA = 0             → pure weak base: [OH⁻] = √(Kb × c)
   *   0 < nSA < nWB       → buffer (pKa of conjugate acid form of H-H)
   *   nSA ≈ nWB            → EP: BH⁺ hydrolysis [H⁺] = √((Kw/Kb) × c_BH⁺)
   *   nSA > nWB            → excess strong acid
   *
   * @param {number} nWB  mol of weak base initially present
   * @param {number} nSA  mol of strong acid added
   * @param {number} vol  dm³
   * @param {number} Kb
   */
  #pH_SA_WB(nWB, nSA, vol, Kb) {
    // Pure weak base
    if (nSA <= MOL_EPS) {
      const OH = Math.sqrt(Kb * nWB / vol);
      return this.#pKw + Math.log10(OH);
    }

    const excess = nSA - nWB;

    // Past (or at) equivalence point
    if (excess >= -MOL_EPS) {
      if (excess > MOL_EPS) {
        // Excess strong acid
        return -Math.log10(excess / vol);
      }
      // At EP: BH⁺ hydrolysis
      const Ka_conj = this.#Kw / Kb;
      const c_BH   = nWB / vol;
      const H      = Math.sqrt(Ka_conj * c_BH);
      return -Math.log10(H);
    }

    // Buffer region (Henderson-Hasselbalch for the conjugate acid BH⁺)
    const nSalt    = nSA;           // moles of BH⁺ formed
    const nBaseLeft = nWB - nSA;   // moles of B remaining

    // Epsilon guard near EP
    if (nBaseLeft < nWB * 1e-4) {
      const Ka_conj = this.#Kw / Kb;
      const c_BH   = nWB / vol;
      const H      = Math.sqrt(Ka_conj * c_BH);
      return -Math.log10(H);
    }

    const pKa_conj = -Math.log10(this.#Kw / Kb);
    return pKa_conj + Math.log10(nBaseLeft / nSalt);
  }

  /**
   * Na₂CO₃ + strong acid — two-equivalence-point system (§8.2).
   *
   * Stage 1 (0 → EP1): CO₃²⁻ + H⁺ → HCO₃⁻  (EP1 at nSA = nCO3)
   * Stage 2 (EP1 → EP2): HCO₃⁻ + H⁺ → H₂CO₃ → CO₂  (EP2 at nSA = 2×nCO3)
   *
   * @param {number} nCO3  mol of CO₃²⁻ initially present
   * @param {number} nSA   mol of strong acid added
   * @param {number} vol   dm³
   */
  #pH_Na2CO3_SA(nCO3, nSA, vol) {
    const Ka1 = 4.3e-7;    // H₂CO₃ → HCO₃⁻
    const Ka2 = 4.7e-11;   // HCO₃⁻ → CO₃²⁻

    const EP1 = nCO3;        // moles at first EP
    const EP2 = 2 * nCO3;   // moles at second EP

    // Before any acid added — CO₃²⁻ hydrolysis
    if (nSA <= MOL_EPS) {
      const c   = nCO3 / vol;
      const OH  = Math.sqrt((this.#Kw / Ka2) * c);
      const pH  = this.#pKw + Math.log10(OH);
      return Math.min(14, pH);
    }

    // Stage 1: CO₃²⁻ / HCO₃⁻ buffer  (0 < nSA < EP1)
    if (nSA < EP1 - MOL_EPS) {
      const nHCO3  = nSA;          // acid converts CO3 → HCO3
      const nCO3r  = nCO3 - nSA;  // remaining CO3²⁻
      // Epsilon guard at very near EP1
      if (nCO3r < nCO3 * 1e-4) return 8.35; // amphoteric HCO3⁻ midpoint
      return -Math.log10(Ka2) + Math.log10(nCO3r / nHCO3);
    }

    // At EP1 — pure HCO₃⁻ (amphoteric): pH ≈ (pKa1 + pKa2) / 2
    if (Math.abs(nSA - EP1) < MOL_EPS) {
      return (-Math.log10(Ka1) + -Math.log10(Ka2)) / 2;
    }

    // Stage 2: HCO₃⁻ / H₂CO₃ buffer  (EP1 < nSA < EP2)
    if (nSA < EP2 - MOL_EPS) {
      const nH2CO3 = nSA - EP1;         // acid so far past EP1
      const nHCO3r = EP1 - (nSA - EP1); // remaining HCO₃⁻
      if (nHCO3r <= MOL_EPS) return 3.9; // near EP2 → CO₂ saturation
      return -Math.log10(Ka1) + Math.log10(nHCO3r / nH2CO3);
    }

    // At or past EP2 — CO₂ saturated / excess strong acid
    if (Math.abs(nSA - EP2) < MOL_EPS) return 3.9; // CO₂ saturation pH

    const excessAcid = nSA - EP2;
    if (excessAcid > MOL_EPS) return -Math.log10(excessAcid / vol);

    return 3.9;
  }
}
