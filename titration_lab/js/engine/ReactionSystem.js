/**
 * ReactionSystem — classifies acid/base pairs and computes equivalence-point pH.
 *
 * Four supported reaction types:
 *   SA_SB      Strong acid + strong base        (e.g. HCl / NaOH)
 *   WA_SB      Weak acid   + strong base        (e.g. CH₃COOH / NaOH)
 *   SA_WB      Strong acid + weak base          (e.g. HCl / NH₃)
 *   Na2CO3_SA  Sodium carbonate + strong acid   (two equivalence points)
 */

// ── ID sets by role ───────────────────────────────────────────────────────────

const SA  = new Set(['hcl', 'h2so4_dil']);   // strong acids
const SB  = new Set(['naoh']);               // strong bases
const WA  = new Set(['ethanoic']);           // weak acids
const WB  = new Set(['nh3']);               // weak bases
const CB  = new Set(['na2co3']);            // carbonate base

// ── Error ─────────────────────────────────────────────────────────────────────

export class UnknownPairError extends Error {
  /**
   * @param {string} titrantId
   * @param {string} analyteId
   */
  constructor(titrantId, analyteId) {
    super(`No pH model for titrant="${titrantId}" + analyte="${analyteId}"`);
    this.name = 'UnknownPairError';
    this.titrantId = titrantId;
    this.analyteId = analyteId;
  }
}

// ── ReactionSystem class ──────────────────────────────────────────────────────

export class ReactionSystem {
  // Enum-like string constants — use these instead of bare strings.
  static SA_SB     = 'SA_SB';
  static WA_SB     = 'WA_SB';
  static SA_WB     = 'SA_WB';
  static Na2CO3_SA = 'Na2CO3_SA';

  /**
   * Classify a titrant + analyte pair into one of the four reaction types.
   * Either chemical can be in the burette or the flask — routing is symmetric.
   *
   * @param {{ id: string }} titrant  Chemical object (needs `.id`)
   * @param {{ id: string }} analyte  Chemical object (needs `.id`)
   * @returns {string} One of the ReactionSystem static constants.
   * @throws {UnknownPairError} If no model exists for this combination.
   */
  static classify(titrant, analyte) {
    const t = titrant.id;
    const a = analyte.id;

    // Strong acid ↔ strong base (symmetric)
    if ((SA.has(t) && SB.has(a)) || (SB.has(t) && SA.has(a)))
      return ReactionSystem.SA_SB;

    // Weak acid + strong base (symmetric — either can be titrant)
    if ((WA.has(t) && SB.has(a)) || (SB.has(t) && WA.has(a)))
      return ReactionSystem.WA_SB;

    // Strong acid + weak base (symmetric)
    if ((SA.has(t) && WB.has(a)) || (WB.has(t) && SA.has(a)))
      return ReactionSystem.SA_WB;

    // Carbonate + strong acid (symmetric)
    if ((CB.has(t) && SA.has(a)) || (SA.has(t) && CB.has(a)))
      return ReactionSystem.Na2CO3_SA;

    throw new UnknownPairError(t, a);
  }

  /**
   * Expected pH at the *first* equivalence point.
   *
   * For `Na2CO3_SA`, returns the EP1 pH (CO₃²⁻ → HCO₃⁻, ~8.3).
   * EP2 for that system is always ~3.9 (CO₂ saturation) and is not variable.
   *
   * For `SA_SB`, the result depends on temperature because pKw changes:
   *   neutral pH = pKw / 2  (= 7.00 at 25 °C, but e.g. 6.81 at 37 °C)
   *
   * @param {string} system        One of the ReactionSystem constants.
   * @param {Object} opts
   * @param {number} [opts.Ka]     Acid Ka (required for WA_SB)
   * @param {number} [opts.Kb]     Base Kb (required for SA_WB)
   * @param {number} opts.concAtEq Approximate concentration (mol dm⁻³) of the
   *                               conjugate species at the equivalence point.
   *                               Pass 0 to get a temperature-only estimate.
   * @param {number} [opts.Kw=1e-14]
   * @returns {number} pH at the equivalence point (unclamped).
   */
  static equivalencePointPH(system, { Ka, Kb, concAtEq, Kw = 1e-14 }) {
    const pKw = -Math.log10(Kw);

    switch (system) {
      case ReactionSystem.SA_SB:
        // Pure water at the EP; pH = pKw / 2
        return pKw / 2;

      case ReactionSystem.WA_SB: {
        // A⁻ hydrolysis: [OH⁻] = sqrt(Kw / Ka × c_A⁻)
        if (!Ka) throw new Error('equivalencePointPH(WA_SB) requires opts.Ka');
        const c = Math.max(concAtEq, 1e-6);
        const OH = Math.sqrt((Kw / Ka) * c);
        return pKw + Math.log10(OH);
      }

      case ReactionSystem.SA_WB: {
        // BH⁺ hydrolysis: [H⁺] = sqrt((Kw / Kb) × c_BH⁺)
        if (!Kb) throw new Error('equivalencePointPH(SA_WB) requires opts.Kb');
        const c = Math.max(concAtEq, 1e-6);
        const H = Math.sqrt((Kw / Kb) * c);
        return -Math.log10(H);
      }

      case ReactionSystem.Na2CO3_SA:
        // EP1: CO₃²⁻ → HCO₃⁻; HCO₃⁻ is amphoteric → pH ≈ (pKa1 + pKa2) / 2 ≈ 8.35
        // This is independent of concentration to a good approximation.
        return 8.35;

      default:
        return pKw / 2;
    }
  }

  /**
   * Whether this system produces a *second* equivalence point on the pH curve.
   * Currently true only for Na₂CO₃ + strong acid.
   *
   * @param {string} system
   * @returns {boolean}
   */
  static hasSecondEquivalencePoint(system) {
    return system === ReactionSystem.Na2CO3_SA;
  }
}
