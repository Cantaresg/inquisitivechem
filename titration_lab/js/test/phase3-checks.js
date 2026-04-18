/**
 * phase3-checks.js — console tests for Stage system + StageController.
 *
 * Phase 3 exit criteria (spec §7):
 *   • stageCtrl.advance() cycles correctly through all stages in each mode.
 *   • validate() returns meaningful errors before conditions are met.
 *   • validate() passes after programmatic setup.
 *   • Two concordant accurate runs recorded; ResultsStage.results correct.
 *
 * Run from titration_lab/:
 *   node --input-type=module <<'EOF'
 *   import { runChecks } from './js/test/phase3-checks.js';
 *   runChecks();
 *   EOF
 *
 * Or in a browser devtools console (served via http):
 *   import('./js/test/phase3-checks.js').then(m => m.runChecks())
 */

import { EventBus }        from '../EventBus.js';
import { PHEngine }         from '../engine/PHEngine.js';
import { BuretteSimulator } from '../simulation/BuretteSimulator.js';
import { FlaskSimulator }   from '../simulation/FlaskSimulator.js';
import { StageController }  from '../StageController.js';
import { SetupStage }       from '../stages/SetupStage.js';
import { StandardStage }    from '../stages/StandardStage.js';
import { PipetteStage }     from '../stages/PipetteStage.js';
import { BuretteStage }     from '../stages/BuretteStage.js';
import { TitrateStage }     from '../stages/TitrateStage.js';
import { ResultsStage }     from '../stages/ResultsStage.js';

// ── Assert helpers ────────────────────────────────────────────────────────────

let _pass = 0, _fail = 0;

function assert(label, actual, expected, tol = 0.05) {
  const ok = typeof actual === 'number'
    ? Math.abs(actual - expected) <= tol
    : actual === expected;
  if (ok) {
    _pass++;
    console.log(`  ✓  ${label}  →  ${actual?.toFixed ? actual.toFixed(3) : actual}`);
  } else {
    _fail++;
    console.warn(
      `  ✗  ${label}  →  ${actual?.toFixed ? actual.toFixed(3) : actual}` +
      `  (expected ${expected})`,
    );
  }
}

function assertOk(label, result) {
  if (result.ok) {
    _pass++;
    console.log(`  ✓  ${label}  →  ok`);
  } else {
    _fail++;
    console.warn(`  ✗  ${label}  →  FAILED: "${result.reason}"`);
  }
}

function assertFail(label, result) {
  if (!result.ok) {
    _pass++;
    console.log(`  ✓  ${label}  →  correctly blocked: "${result.reason}"`);
  } else {
    _fail++;
    console.warn(`  ✗  ${label}  →  expected failure but got ok`);
  }
}

// ── Shared factory ────────────────────────────────────────────────────────────

/**
 * Build a fresh set of simulators and labState for one test run.
 * @param {string} mode  'practice' | 'guided' | 'openLab'
 * @param {number} [flaskVolMl=10]  Analyte volume — 10 mL fits 3 runs in burette
 */
function makeEnv(mode, flaskVolMl = 10) {
  const bus      = new EventBus();
  const phEngine = new PHEngine({ temperature: 25 });
  const burette  = new BuretteSimulator(bus);
  const flask    = new FlaskSimulator(bus, phEngine, flaskVolMl);
  const labState = {
    mode,
    level:       'o_level',
    titrant:     null,
    analyte:     null,
    indicator:   null,
    titrantConc: 0.1,
    analyteConc: 0.1,
    runs:        [],
  };
  const deps = { bus, labState, burette, flask };
  return { bus, phEngine, burette, flask, labState, deps };
}

/**
 * Build the stage array for a given mode (mirrors what TitrationLab will do).
 */
function buildStages(mode, deps) {
  const setup    = new SetupStage(deps);
  const standard = new StandardStage(deps);
  const pipette  = new PipetteStage(deps);
  const burette  = new BuretteStage(deps);
  const titrate  = new TitrateStage(deps);
  const results  = new ResultsStage(deps);

  switch (mode) {
    case 'guided':   return [standard, pipette, burette, titrate, results];
    case 'practice': return [setup,    pipette, burette, titrate, results];
    case 'openLab':  return [setup,    pipette, burette, titrate, results];
    default: throw new Error(`Unknown mode: ${mode}`);
  }
}

/**
 * Drive a TitrateStage to endpoint synchronously using _onTick().
 * Periodically swirls when a false endpoint is active so the colour change
 * is properly confirmed (mirrors what a real student would do).
 * Returns the volume added in mL.
 */
function simulateToEndpoint(titrateStage, dropSizeMl = 0.40, maxTicks = 500) {
  let ticks = 0;
  while (!titrateStage._flask.isAtEndpoint && ticks < maxTicks) {
    titrateStage._onTick(dropSizeMl);
    // Swirl to confirm endpoint when provisional colour change is active
    if (titrateStage._flask.falseEndpointActive) {
      titrateStage.swirl();
    }
    ticks++;
  }
  titrateStage.stopDropping();
  return titrateStage._burette.volumeAdded;
}

// ── Test suites ───────────────────────────────────────────────────────────────

function testPracticeMode() {
  console.log('\n── Practice mode ────────────────────────────────────────────');
  const { bus, deps, labState } = makeEnv('practice');
  const stages = buildStages('practice', deps);
  const ctrl   = new StageController(stages, bus);

  // ── SetupStage ──────────────────────────────────────────────────────────
  assert('start on setup',   ctrl.currentId, 'setup');
  assertFail('validate fails before selections', ctrl.current.validate());

  const setup = ctrl.current;
  setup.setTitrant('naoh', 0.1);
  setup.setAnalyte('hcl', 0.1);
  setup.setIndicator('mo');

  assertOk('validate passes after selections', ctrl.current.validate());
  assertOk('advance to pipette', ctrl.advance());
  assert('now on pipette', ctrl.currentId, 'pipette');

  // ── PipetteStage ────────────────────────────────────────────────────────
  assertFail('validate fails before pipette', ctrl.current.validate());
  const pipStage = ctrl.current;
  pipStage.pipette();
  assertFail('validate fails before indicator', ctrl.current.validate());
  pipStage.addIndicator();
  assertOk('validate passes after pipette+indicator', ctrl.current.validate());
  assertOk('advance to burette', ctrl.advance());
  assert('now on burette', ctrl.currentId, 'burette');

  // ── BuretteStage ────────────────────────────────────────────────────────
  assertFail('validate fails before fill', ctrl.current.validate());
  const burStage = ctrl.current;
  burStage.fill();
  // May have bubble — always call expelBubble (no-op if no bubble)
  burStage.expelBubble();
  burStage.removeFunnel();
  assertFail('validate fails before recording initial', ctrl.current.validate());
  burStage.recordInitial();
  assertOk('validate passes after all burette steps', ctrl.current.validate());
  assertOk('advance to titrate', ctrl.advance());
  assert('now on titrate', ctrl.currentId, 'titrate');

  // ── TitrateStage — 1 rough + 2 accurate runs ────────────────────────────
  const titStage = ctrl.current;
  assertFail('validate fails: no runs yet', ctrl.current.validate());

  // Run 1 — rough
  simulateToEndpoint(titStage);
  titStage.swirl();
  const run1 = titStage.recordResult(true);   // isRough = true
  assert('run 1 titre > 0', run1.titre > 0, true);
  assert('run 1 is rough', run1.isRough, true);
  assertFail('validate fails: only rough run', ctrl.current.validate());

  // Run 2 — accurate
  titStage.newRun();
  simulateToEndpoint(titStage);
  titStage.swirl();
  const run2 = titStage.recordResult(false);
  assert('run 2 titre > 0', run2.titre > 0, true);
  assertFail('validate fails: only 1 accurate run', ctrl.current.validate());

  // Run 3 — accurate (concordant with run 2)
  titStage.newRun();
  simulateToEndpoint(titStage);
  titStage.swirl();
  const run3 = titStage.recordResult(false);
  const spread = Math.abs(run3.titre - run2.titre);
  assert('runs 2+3 concordant (spread ≤ 0.10)', spread <= 0.10, true);
  assertOk('validate passes: 2 concordant accurate runs', ctrl.current.validate());
  assertOk('advance to results', ctrl.advance());
  assert('now on results', ctrl.currentId, 'results');

  // ── ResultsStage ────────────────────────────────────────────────────────
  const resSt  = ctrl.current;
  const res    = resSt.results;
  assert('results: 3 total runs', res.runs.length, 3);
  assert('results: 2 concordant runs', res.concordant.length, 2);
  assert('mean titre ≈ run 2 titre', res.meanTitre, run2.titre, 0.01);
  assertOk('results validate passes', ctrl.current.validate());
  // Already on last stage — advance returns ok
  assertOk('advance on last stage returns ok', ctrl.advance());
}

function testGuidedMode() {
  console.log('\n── Guided mode ──────────────────────────────────────────────');
  const { bus, deps, labState } = makeEnv('guided');

  // Guided mode: config is pre-loaded (no SetupStage).
  // Simulate what TitrationLab would inject via SessionConfig:
  labState.titrant     = { id: 'naoh', type: 'base', strong: true,  name: 'Sodium hydroxide' };
  labState.analyte     = { id: 'hcl',  type: 'acid', strong: true,  name: 'Hydrochloric acid' };
  labState.indicator   = { id: 'pp',   pKin: 9.1, acidCol: 'rgba(180,200,255,0.12)', alkCol: '#e060c0' };
  labState.titrantConc = 0.1;
  labState.analyteConc = 0.1;

  const stages = buildStages('guided', deps);
  const ctrl   = new StageController(stages, bus);

  // ── StandardStage ───────────────────────────────────────────────────────
  // In guided mode, the analyte is Na₂CO₃ standard — but here we reuse hcl
  // for simplicity. The StandardStage just validates mass > 0.
  assert('start on standard', ctrl.currentId, 'standard');
  assertFail('validate fails: no mass', ctrl.current.validate());
  ctrl.current.setMass(1.32);  // 1.32 g Na₂CO₃ in 250 mL → 0.05 M
  assertOk('validate passes after mass entry', ctrl.current.validate());
  assertOk('advance to pipette', ctrl.advance());
  assert('now on pipette', ctrl.currentId, 'pipette');

  // ── Remaining stages — abbreviated (same as practice) ───────────────────
  ctrl.current.pipette();
  ctrl.current.addIndicator();
  assertOk('advance to burette', ctrl.advance());
  ctrl.current.fill();
  ctrl.current.expelBubble();
  ctrl.current.removeFunnel();
  ctrl.current.recordInitial();
  assertOk('advance to titrate', ctrl.advance());

  const titStage = ctrl.current;
  simulateToEndpoint(titStage);
  titStage.swirl();
  titStage.recordResult(true);

  titStage.newRun();
  simulateToEndpoint(titStage);
  titStage.swirl();
  titStage.recordResult(false);

  titStage.newRun();
  simulateToEndpoint(titStage);
  titStage.swirl();
  titStage.recordResult(false);

  assertOk('titrate validates (guided)', ctrl.current.validate());
  assertOk('advance to results (guided)', ctrl.advance());
  assert('now on results (guided)', ctrl.currentId, 'results');
  assertOk('results validate (guided)', ctrl.current.validate());
}

function testBackNavigation() {
  console.log('\n── Back navigation ──────────────────────────────────────────');
  const { bus, deps } = makeEnv('practice');
  const stages = buildStages('practice', deps);
  const ctrl   = new StageController(stages, bus);

  assertFail('back on first stage blocked', ctrl.back());

  // Advance once (setup → pipette requires valid setup)
  const setup = ctrl.current;
  setup.setTitrant('naoh', 0.1);
  setup.setAnalyte('hcl', 0.1);
  setup.setIndicator('mo');
  ctrl.advance();
  assert('on pipette after advance', ctrl.currentId, 'pipette');
  assertOk('back to setup works', ctrl.back());
  assert('back to setup', ctrl.currentId, 'setup');
}

function testLockAndJump() {
  console.log('\n── isLocked / jumpTo ────────────────────────────────────────');
  const { bus, deps } = makeEnv('practice');
  const stages = buildStages('practice', deps);
  const ctrl   = new StageController(stages, bus);

  assert('pipette is locked from setup', ctrl.isLocked('pipette'), true);
  assertFail('jumpTo locked stage blocked', ctrl.jumpTo('results'));
  assert('setup not locked', ctrl.isLocked('setup'), false);
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runChecks() {
  _pass = 0; _fail = 0;
  console.log('═══ Phase 3 checks ══════════════════════════════════════════');

  try {
    testPracticeMode();
  } catch (e) {
    console.error('[EXCEPTION in practice mode]', e);
    _fail++;
  }

  try {
    await testGuidedMode();
  } catch (e) {
    console.error('[EXCEPTION in guided mode]', e);
    _fail++;
  }

  try {
    testBackNavigation();
  } catch (e) {
    console.error('[EXCEPTION in back navigation]', e);
    _fail++;
  }

  try {
    testLockAndJump();
  } catch (e) {
    console.error('[EXCEPTION in lock/jump]', e);
    _fail++;
  }

  console.log(`\n═══ Results: ${_pass} passed, ${_fail} failed ════════════════════`);
  return { pass: _pass, fail: _fail };
}
