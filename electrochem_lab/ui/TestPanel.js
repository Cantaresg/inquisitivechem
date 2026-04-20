/**
 * ui/TestPanel.js
 * Builds and manages the test UI inside #test-controls:
 *   • Target selector (Cathode | Anode | Solution)
 *   • Test buttons (Litmus, Glowing Splint, Burning Splint, Smell, Flame Test)
 *   • Result card
 *
 * Builds its own DOM inside the provided container element.
 *
 * @fires onTestResult(TestResult) — after each test button click
 */

import { TestEngine } from '../engine/TestEngine.js';

const TESTS = [
  { id: 'litmus',        label: 'Litmus',        symbol: '🧪' },
  { id: 'glowingSplint', label: 'Glowing Splint', symbol: '✨' },
  { id: 'burningSplint', label: 'Burning Splint', symbol: '🔥' },
  { id: 'smell',         label: 'Smell',          symbol: '👃' },
  { id: 'flameTest',     label: 'Flame Test',     symbol: '🔬' },
];

export class TestPanel {
  /**
   * @param {HTMLElement} container     — #test-controls element
   * @param {Function}    onTestResult  — callback(TestResult)
   */
  constructor(container, onTestResult) {
    this._container    = container;
    this._onTestResult = onTestResult;
    this._target       = 'cathode';
    this._enabled      = false;
    this._result       = null;       // last ElectrolysisResult from engine
    this._electrolyte  = null;       // electrolyte record used in that run

    this._build();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Called by SimController after a valid electrolysis run.
   * @param {import('../engine/ElectrolysisEngine.js').ElectrolysisResult} result
   * @param {object} electrolyte — ELECTROLYTE_DB record
   */
  setResult(result, electrolyte) {
    this._result      = result;
    this._electrolyte = electrolyte;
    this._enabled     = true;
    this._updateEnabled(true);
    this._hideResult();
  }

  /** Called when circuit becomes invalid or no electrolyte is selected. */
  disable() {
    this._enabled     = false;
    this._result      = null;
    this._electrolyte = null;
    this._updateEnabled(false);
    this._hideResult();
  }

  // ── DOM construction ────────────────────────────────────────────────────

  _build() {
    this._container.innerHTML = '';

    // ── Target selector ────────────────────────────────────────────────
    this._targetGroupEl = document.createElement('div');
    this._targetGroupEl.className = 'test-target-group';
    this._targetGroupEl.setAttribute('role', 'group');
    this._targetGroupEl.setAttribute('aria-label', 'Apply test to');

    for (const t of ['cathode', 'anode', 'solution']) {
      const btn = document.createElement('button');
      btn.className     = `target-btn${t === 'cathode' ? ' active' : ''}`;
      btn.dataset.target = t;
      btn.textContent   = t.charAt(0).toUpperCase() + t.slice(1);
      btn.addEventListener('click', () => this._setTarget(t));
      this._targetGroupEl.appendChild(btn);
    }

    // ── Section label ──────────────────────────────────────────────────
    const sectLabel = document.createElement('div');
    sectLabel.className = 'test-section-label';
    sectLabel.textContent = 'TESTS';

    // ── Test buttons ───────────────────────────────────────────────────
    this._buttonsEl = document.createElement('div');
    this._buttonsEl.className = 'test-buttons';

    for (const test of TESTS) {
      const btn = document.createElement('button');
      btn.className    = 'test-btn';
      btn.dataset.test = test.id;
      btn.disabled     = true;
      btn.setAttribute('title', `Apply ${test.label} test`);
      btn.innerHTML = `<span class="test-btn-symbol" aria-hidden="true">${test.symbol}</span><span>${test.label}</span>`;
      btn.addEventListener('click', () => this._runTest(test.id));
      this._buttonsEl.appendChild(btn);
    }

    // ── Result card ────────────────────────────────────────────────────
    this._resultEl = document.createElement('div');
    this._resultEl.className = 'test-result test-result--hidden';
    this._resultEl.setAttribute('role', 'status');
    this._resultEl.setAttribute('aria-live', 'polite');
    this._resultEl.innerHTML = `
      <div class="result-label-row">
        <span class="result-dot" aria-hidden="true"></span>
        <span class="result-label">Result</span>
      </div>
      <p class="result-observation"></p>
    `;

    this._container.appendChild(this._targetGroupEl);
    this._container.appendChild(sectLabel);
    this._container.appendChild(this._buttonsEl);
    this._container.appendChild(this._resultEl);
  }

  // ── Interaction ─────────────────────────────────────────────────────────

  _setTarget(target) {
    this._target = target;
    this._targetGroupEl.querySelectorAll('.target-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.target === target);
    });
    this._hideResult();
  }

  _runTest(testType) {
    if (!this._enabled || !this._result || !this._electrolyte) return;
    const testResult = TestEngine.run(
      testType, this._target, this._result, this._electrolyte
    );
    this._showResult(testResult);
    this._onTestResult(testResult);
  }

  _showResult(testResult) {
    const el  = this._resultEl;
    const obs = el.querySelector('.result-observation');
    el.classList.remove('test-result--hidden', 'test-result--positive',
                        'test-result--negative', 'test-result--na');

    if (!testResult.isApplicable) {
      el.classList.add('test-result--na');
    } else if (testResult.isPositive) {
      el.classList.add('test-result--positive');
    } else {
      el.classList.add('test-result--negative');
    }

    obs.textContent = testResult.observation;
  }

  _hideResult() {
    this._resultEl.classList.add('test-result--hidden');
  }

  _updateEnabled(on) {
    this._buttonsEl.querySelectorAll('.test-btn').forEach(b => {
      b.disabled = !on;
    });
  }
}
