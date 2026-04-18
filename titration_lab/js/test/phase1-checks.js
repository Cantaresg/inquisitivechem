/**
 * phase1-checks.js — console spot-checks for PHEngine (Phase 1 exit criteria).
 *
 * Run in the browser:
 *   import { runChecks } from './test/phase1-checks.js';
 *   runChecks();
 *
 * Or via Node (serve the project first, or bundle):
 *   node --input-type=module < phase1-checks.js
 *
 * Each test verifies pH at 0 %, 50 %, 100 %, and 150 % of the theoretical
 * titre volume against published textbook / NIST values (tolerance ±0.15 pH).
 *
 * Reference values
 * ────────────────
 * All at 25 °C, 0.1 mol dm⁻³ titrant, 25.00 mL analyte unless noted.
 *
 * SA_SB  (NaOH vs HCl):
 *   0 %   → pH 1.00   |  50 % → pH 1.48  |  100 % → pH 7.00  |  150 % → pH 12.30
 *
 * WA_SB  (NaOH vs CH₃COOH, Ka = 1.8×10⁻⁵):
 *   0 %   → pH 2.87   |  50 % → pH 4.74  |  100 % → pH 8.72  |  150 % → pH 12.30
 *
 * SA_WB  (HCl vs NH₃, Kb = 1.8×10⁻⁵):
 *   0 %   → pH 11.13  |  50 % → pH 9.26  |  100 % → pH 5.28  |  150 % → pH 1.70
 *
 * Na2CO3_SA  (HCl vs Na₂CO₃ 0.05 mol dm⁻³, 25.00 mL):
 *   0 mL  → pH ≥ 11.0 (CO₃²⁻ hydrolysis)
 *   6.25 mL (50 % to EP1) → pH ≈ pKa2 = 10.33  (CO₃²⁻/HCO₃⁻ buffer)
 *   12.5 mL (EP1)         → pH ≈ 8.35           (amphoteric HCO₃⁻)
 *   18.75 mL (50 % EP1→EP2) → pH ≈ pKa1 = 6.37  (HCO₃⁻/CO₂ buffer)
 *   25.0 mL (EP2)         → pH ≈ 3.9            (CO₂ saturation)
 */

import { PHEngine }       from '../engine/PHEngine.js';
import { ChemicalDB }     from '../data/ChemicalDB.js';
import { IndicatorDB }    from '../data/IndicatorDB.js';
import { ReactionSystem, UnknownPairError } from '../engine/ReactionSystem.js';

// ── Assertion helper ─────────────────────────────────────────────────────────

let _pass = 0;
let _fail = 0;

/**
 * @param {string} label
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=0.15]
 */
function assert(label, actual, expected, tol = 0.15) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    _pass++;
    console.log(`  ✓  ${label}  →  pH ${actual.toFixed(2)}  (expected ≈ ${expected.toFixed(2)})`);
  } else {
    _fail++;
    console.warn(`  ✗  ${label}  →  pH ${actual.toFixed(2)}  (expected ≈ ${expected.toFixed(2)}, Δ = ${Math.abs(actual - expected).toFixed(3)})`);
  }
}

// ── Chemical stub helpers ─────────────────────────────────────────────────────

const naoh      = ChemicalDB.get('naoh');
const hcl       = ChemicalDB.get('hcl');
const ethanoic  = ChemicalDB.get('ethanoic');
const nh3       = ChemicalDB.get('nh3');
const na2co3    = ChemicalDB.get('na2co3');
const h2so4_dil = ChemicalDB.get('h2so4_dil');

// ── Main check runner ─────────────────────────────────────────────────────────

export function runChecks() {
  _pass = 0;
  _fail = 0;

  const eng = new PHEngine({ temperature: 25 });
  const VOL_A  = 25.0;  // analyte volume (mL)
  const CONC_T = 0.1;   // titrant conc (mol dm⁻³)
  const CONC_A = 0.1;   // analyte conc (mol dm⁻³)
  const TITRE  = 25.0;  // theoretical titre (mL)

  // ── 1. SA_SB — NaOH (burette) vs HCl (flask) ────────────────────────────
  console.group('SA_SB  ·  NaOH vs HCl  (0.1 M, 25.00 mL)');
  assert('0 %   (0.00 mL NaOH)',  eng.compute(naoh, hcl,  0.00, VOL_A, CONC_T, CONC_A),  1.00);
  assert('50 %  (12.50 mL NaOH)', eng.compute(naoh, hcl, 12.50, VOL_A, CONC_T, CONC_A),  1.48);
  assert('100 % (25.00 mL NaOH)', eng.compute(naoh, hcl, 25.00, VOL_A, CONC_T, CONC_A),  7.00);
  assert('150 % (37.50 mL NaOH)', eng.compute(naoh, hcl, 37.50, VOL_A, CONC_T, CONC_A), 12.30);
  console.groupEnd();

  // Also check the reverse: HCl (burette) vs NaOH (flask)
  // At 50 % (12.5 mL HCl into 25 mL NaOH) the base is still in excess → pH ~12.52
  console.group('SA_SB  \u00b7  HCl vs NaOH  (symmetric check)');
  assert('50 %  (12.50 mL HCl) — base excess', eng.compute(hcl, naoh, 12.50, VOL_A, CONC_T, CONC_A), 12.52);
  assert('100 % (25.00 mL HCl) — EP',          eng.compute(hcl, naoh, 25.00, VOL_A, CONC_T, CONC_A),  7.00);
  console.groupEnd();

  // ── 2. WA_SB — NaOH (burette) vs CH₃COOH (flask) ───────────────────────
  console.group('WA_SB  ·  NaOH vs CH₃COOH  (0.1 M, 25.00 mL)');
  assert('0 %   (0.00 mL NaOH)',  eng.compute(naoh, ethanoic,  0.00, VOL_A, CONC_T, CONC_A),  2.87);
  assert('50 %  (12.50 mL NaOH)', eng.compute(naoh, ethanoic, 12.50, VOL_A, CONC_T, CONC_A),  4.74);
  assert('100 % (25.00 mL NaOH)', eng.compute(naoh, ethanoic, 25.00, VOL_A, CONC_T, CONC_A),  8.72);
  assert('150 % (37.50 mL NaOH)', eng.compute(naoh, ethanoic, 37.50, VOL_A, CONC_T, CONC_A), 12.30);
  console.groupEnd();

  // ── 3. SA_WB — HCl (burette) vs NH₃ (flask) ─────────────────────────────
  console.group('SA_WB  ·  HCl vs NH₃  (0.1 M, 25.00 mL)');
  assert('0 %   (0.00 mL HCl)',   eng.compute(hcl, nh3,  0.00, VOL_A, CONC_T, CONC_A), 11.13);
  assert('50 %  (12.50 mL HCl)',  eng.compute(hcl, nh3, 12.50, VOL_A, CONC_T, CONC_A),  9.26);
  assert('100 % (25.00 mL HCl)',  eng.compute(hcl, nh3, 25.00, VOL_A, CONC_T, CONC_A),  5.28);
  assert('150 % (37.50 mL HCl)',  eng.compute(hcl, nh3, 37.50, VOL_A, CONC_T, CONC_A),  1.70);
  console.groupEnd();

  // ── 4. Na₂CO₃_SA — HCl (burette) vs Na₂CO₃ (flask) ────────────────────
  // Na₂CO₃ 0.05 mol dm⁻³, 25 mL → 0.00125 mol CO₃²⁻
  // EP1 at 12.50 mL HCl 0.1 M,  EP2 at 25.00 mL HCl 0.1 M
  console.group('Na2CO3_SA  ·  HCl vs Na₂CO₃  (0.1 M vs 0.05 M, 25.00 mL)');
  assert('0 mL HCl    (CO₃²⁻ only)',           eng.compute(hcl, na2co3,  0.00, VOL_A, CONC_T, 0.05), 11.60, 0.30);
  assert('6.25 mL HCl (50 % to EP1 buffer)',   eng.compute(hcl, na2co3,  6.25, VOL_A, CONC_T, 0.05), 10.33);
  assert('12.5 mL HCl (EP1 — amphoteric)',     eng.compute(hcl, na2co3, 12.50, VOL_A, CONC_T, 0.05),  8.35);
  assert('18.75 mL HCl (50 % EP1→EP2 buffer)', eng.compute(hcl, na2co3, 18.75, VOL_A, CONC_T, 0.05),  6.37);
  assert('25.0 mL HCl (EP2 — CO₂ saturation)', eng.compute(hcl, na2co3, 25.00, VOL_A, CONC_T, 0.05),  3.90);
  console.groupEnd();

  // ── 5. Temperature sensitivity check ────────────────────────────────────
  console.group('Temperature  ·  SA_SB at EP (should shift with Kw)');
  const eng15 = new PHEngine({ temperature: 15 });
  const eng37 = new PHEngine({ temperature: 37 });
  assert('25 °C EP → pH 7.00',   eng.compute(naoh, hcl,  25.0, VOL_A, CONC_T, CONC_A), 7.00, 0.05);
  assert('15 °C EP → pH ~7.17',  eng15.compute(naoh, hcl, 25.0, VOL_A, CONC_T, CONC_A), 7.17, 0.10);
  assert('37 °C EP → pH ~6.81',  eng37.compute(naoh, hcl, 25.0, VOL_A, CONC_T, CONC_A), 6.81, 0.10);
  console.groupEnd();

  // ── 6. ReactionSystem classification checks ──────────────────────────────
  console.group('ReactionSystem.classify()');
  const classChecks = [
    [naoh, hcl,      ReactionSystem.SA_SB,     'NaOH + HCl'],
    [hcl,  naoh,     ReactionSystem.SA_SB,     'HCl + NaOH (reversed)'],
    [naoh, ethanoic, ReactionSystem.WA_SB,     'NaOH + CH₃COOH'],
    [hcl,  nh3,      ReactionSystem.SA_WB,     'HCl + NH₃'],
    [hcl,  na2co3,   ReactionSystem.Na2CO3_SA, 'HCl + Na₂CO₃'],
  ];
  for (const [t, a, expected, label] of classChecks) {
    const got = ReactionSystem.classify(t, a);
    if (got === expected) {
      _pass++;
      console.log(`  ✓  classify(${label}) = ${got}`);
    } else {
      _fail++;
      console.warn(`  ✗  classify(${label}): expected ${expected}, got ${got}`);
    }
  }
  // Check that an unknown pair throws
  try {
    ReactionSystem.classify(nh3, na2co3);
    _fail++;
    console.warn('  ✗  classify(NH₃ + Na₂CO₃) should have thrown UnknownPairError');
  } catch (e) {
    if (e instanceof UnknownPairError) {
      _pass++;
      console.log('  ✓  classify(NH₃ + Na₂CO₃) correctly throws UnknownPairError');
    } else {
      _fail++;
      console.warn('  ✗  classify(NH₃ + Na₂CO₃) threw wrong error type:', e);
    }
  }
  console.groupEnd();

  // ── 7. IndicatorDB.validFor() checks ────────────────────────────────────
  console.group('IndicatorDB.validFor()');
  const indChecks = [
    ['naoh', 'hcl',      ['mo', 'smo', 'pp'], 'NaOH vs HCl → all indicators'],
    ['naoh', 'ethanoic', ['pp'],              'NaOH vs CH₃COOH → phenolphthalein only'],
    ['hcl',  'nh3',      ['mo', 'smo'],       'HCl vs NH₃ → MO / SMO'],
    ['hcl',  'na2co3',   ['mo', 'smo'],       'HCl vs Na₂CO₃ → MO / SMO'],
  ];
  for (const [tid, aid, expectedIds, label] of indChecks) {
    const got = IndicatorDB.validFor(tid, aid).map(i => i.id).sort();
    const exp = [...expectedIds].sort();
    const ok  = JSON.stringify(got) === JSON.stringify(exp);
    if (ok) {
      _pass++;
      console.log(`  ✓  validFor(${label}) = [${got.join(', ')}]`);
    } else {
      _fail++;
      console.warn(`  ✗  validFor(${label}): expected [${exp.join(', ')}], got [${got.join(', ')}]`);
    }
  }
  console.groupEnd();

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  const total = _pass + _fail;
  if (_fail === 0) {
    console.log(`%c✓ All ${total} checks passed — Phase 1 exit criteria met.`, 'color:lime;font-weight:bold');
  } else {
    console.warn(`✗ ${_fail} / ${total} checks failed — review PHEngine formulas above.`);
  }

  return { pass: _pass, fail: _fail };
}
