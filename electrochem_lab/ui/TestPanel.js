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
  constructor(container, onTestResult, onExportTrace = null, onReactionModeChange = null) {
    this._container    = container;
    this._onTestResult = onTestResult;
    this._onExportTrace = onExportTrace;
    this._onReactionModeChange = onReactionModeChange;
    this._target       = 'cathode';
    this._enabled      = false;
    this._result       = null;       // last ElectrolysisResult from engine
    this._electrolyte  = null;       // electrolyte record used in that run
    this._phaseDebug   = null;
    this._debugOpen    = true;

    this._build();
    this.clearPhaseDebug();
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

  /** Render the live phase-one kinetics/debug snapshot. */
  setPhaseDebug(snapshot) {
    this._phaseDebug = snapshot;
    this._renderPhaseDebug();
  }

  /** Reset the debug monitor to its idle state. */
  clearPhaseDebug() {
    this.setPhaseDebug({
      status: 'idle',
      health: 'idle',
      note: 'No active run',
      warnings: [],
      historyPoints: [],
    });
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

    this._debugEl = document.createElement('section');
    this._debugEl.className = 'phase-debug';

    this._debugToggleEl = document.createElement('button');
    this._debugToggleEl.type = 'button';
    this._debugToggleEl.className = 'phase-debug-toggle';
    this._debugToggleEl.setAttribute('aria-expanded', 'true');
    this._debugToggleEl.innerHTML = `
      <span class="phase-debug-title">PHASE 1 MONITOR</span>
      <span class="phase-debug-toggle-symbol" aria-hidden="true">▾</span>
    `;
    this._debugToggleEl.addEventListener('click', () => this._toggleDebugOpen());

    this._debugBodyEl = document.createElement('div');
    this._debugBodyEl.className = 'phase-debug-body';

    this._debugStatusEl = document.createElement('div');
    this._debugStatusEl.className = 'phase-debug-status';

    this._debugMetricsEl = document.createElement('div');
    this._debugMetricsEl.className = 'phase-debug-metrics';

    this._debugWarningsEl = document.createElement('div');
    this._debugWarningsEl.className = 'phase-debug-warnings phase-debug-warnings--hidden';

    this._debugChartsEl = document.createElement('div');
    this._debugChartsEl.className = 'phase-debug-charts';

    this._debugModeEl = document.createElement('div');
    this._debugModeEl.className = 'phase-debug-mode';
    this._buildReactionModeControls();

    this._debugActionsEl = document.createElement('div');
    this._debugActionsEl.className = 'phase-debug-actions';

    this._debugExportBtn = document.createElement('button');
    this._debugExportBtn.type = 'button';
    this._debugExportBtn.className = 'phase-debug-export';
    this._debugExportBtn.textContent = 'Export Trace CSV';
    this._debugExportBtn.disabled = true;
    this._debugExportBtn.addEventListener('click', () => this._exportTrace());

    this._debugActionsEl.appendChild(this._debugExportBtn);

    this._debugBodyEl.appendChild(this._debugStatusEl);
    this._debugBodyEl.appendChild(this._debugMetricsEl);
    this._debugBodyEl.appendChild(this._debugChartsEl);
    this._debugBodyEl.appendChild(this._debugModeEl);
    this._debugBodyEl.appendChild(this._debugWarningsEl);
    this._debugBodyEl.appendChild(this._debugActionsEl);
    this._debugEl.appendChild(this._debugToggleEl);
    this._debugEl.appendChild(this._debugBodyEl);

    this._container.appendChild(this._targetGroupEl);
    this._container.appendChild(sectLabel);
    this._container.appendChild(this._buttonsEl);
    this._container.appendChild(this._resultEl);
    this._container.appendChild(this._debugEl);
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

  _toggleDebugOpen() {
    this._debugOpen = !this._debugOpen;
    this._debugToggleEl.setAttribute('aria-expanded', String(this._debugOpen));
    this._debugBodyEl.classList.toggle('phase-debug-body--hidden', !this._debugOpen);
    this._debugToggleEl.querySelector('.phase-debug-toggle-symbol').textContent = this._debugOpen ? '▾' : '▸';
  }

  _renderPhaseDebug() {
    const snapshot = this._phaseDebug ?? { status: 'idle', health: 'idle', warnings: [] };
    const healthClass = `phase-debug-status--${snapshot.health ?? 'idle'}`;
    const statusLabel = snapshot.status === 'running' ? 'Running' : 'Idle';
    const note = snapshot.note ? `<span class="phase-debug-note">${snapshot.note}</span>` : '';

    this._debugStatusEl.className = `phase-debug-status ${healthClass}`;
    this._debugStatusEl.innerHTML = `
      <span class="phase-debug-pill">${statusLabel}</span>
      ${note}
    `;

    if (snapshot.status !== 'running') {
      this._debugMetricsEl.innerHTML = `
        <div class="phase-debug-empty">Start a valid run to inspect elapsed time, current, deposition progress, and concentration drift.</div>
      `;
      this._debugChartsEl.innerHTML = '';
      this._debugExportBtn.disabled = true;
      this._debugWarningsEl.classList.add('phase-debug-warnings--hidden');
      this._debugWarningsEl.innerHTML = '';
      return;
    }

    const metrics = [
      ['Elapsed', formatSeconds(snapshot.elapsedS)],
      ['Current', formatCurrent(snapshot.currentA)],
      ['Deposit', formatPercent(snapshot.depositProgress)],
      ['Cathode ion', formatConcentration(snapshot.cathodeConc, snapshot.cathodeIonId)],
      ['Anode ion', formatConcentration(snapshot.anodeConc, snapshot.anodeIonId)],
      ['Anode dissolve', formatPercent(snapshot.anodeDissolutionProgress)],
      ['Cathode depletion', formatPercent(snapshot.cathodeDepletion)],
      ['Aqueous tint', formatPercent(snapshot.aqueousTintProgress)],
      ['Particles', String(snapshot.particleCount ?? 0)],
      ['Products', `${snapshot.anodeProductId ?? 'none'} / ${snapshot.cathodeProductId ?? 'none'}`],
    ];

    this._debugMetricsEl.innerHTML = metrics.map(([label, value]) => `
      <div class="phase-debug-metric">
        <span class="phase-debug-metric-label">${label}</span>
        <span class="phase-debug-metric-value">${value}</span>
      </div>
    `).join('');

    this._debugChartsEl.innerHTML = this._renderCharts(snapshot);
    this._debugExportBtn.disabled = !(snapshot.historyPoints?.length > 1);

    const warnings = snapshot.warnings ?? [];
    if (warnings.length === 0) {
      this._debugWarningsEl.classList.remove('phase-debug-warnings--hidden');
      this._debugWarningsEl.innerHTML = '<span class="phase-debug-ok">No warnings</span>';
      return;
    }

    this._debugWarningsEl.classList.remove('phase-debug-warnings--hidden');
    this._debugWarningsEl.innerHTML = warnings.map(w => `<div class="phase-debug-warning">${w}</div>`).join('');
  }

  _renderCharts(snapshot) {
    const history = snapshot.historyPoints ?? [];
    if (history.length < 2) {
      return '<div class="phase-debug-empty">Trend charts appear after a few snapshots.</div>';
    }

    return [
      renderChartCard('Deposit Growth', '0 → 100%', history, point => point.depositProgress, 0, 1, '#4df0b0'),
      renderChartCard('Anode Dissolution', '0 → 100%', history, point => point.anodeDissolutionProgress, 0, 1, '#ffb26b'),
      renderChartCard('Cathode Ion', snapshot.cathodeIonId ?? 'mol dm⁻³', history, point => point.cathodeConc, 0, maxValue(history, point => point.cathodeConc), '#7dc8ff'),
      renderChartCard('Solution Tint', '0 → 100%', history, point => point.aqueousTintProgress, 0, 1, '#ffc457'),
    ].join('');
  }

  _exportTrace() {
    if (!this._onExportTrace) return;
    const ok = this._onExportTrace();
    if (!ok) return;

    this._debugWarningsEl.classList.remove('phase-debug-warnings--hidden');
    this._debugWarningsEl.innerHTML = '<span class="phase-debug-ok">Trace exported.</span>';
  }

  _buildReactionModeControls() {
    this._debugModeEl.innerHTML = `
      <div class="phase-debug-handle-head">
        <span class="phase-debug-title">Reaction Mode</span>
        <span class="phase-debug-mode-note">V2 active</span>
      </div>
      <div class="phase-debug-mode-buttons" role="group" aria-label="Reaction persistence mode">
        <button type="button" class="phase-debug-mode-btn" data-mode="v1">V1 Current</button>
        <button type="button" class="phase-debug-mode-btn active" data-mode="v2">V2 Follow</button>
        <button type="button" class="phase-debug-mode-btn" data-mode="v3">V3 Lock</button>
      </div>
      <div class="phase-debug-empty">V1 restarts growth on topology changes. V2 preserves growth and follows electrode movement. V3 locks electrode positions once a valid reaction is running.</div>
    `;

    this._debugModeEl.querySelectorAll('.phase-debug-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this._setReactionModeButtons(mode);
        this._onReactionModeChange?.(mode);
      });
    });
  }

  _setReactionModeButtons(mode) {
    this._debugModeEl.querySelectorAll('.phase-debug-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} s`;
}

function formatCurrent(value) {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 1000).toFixed(0)} mA`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatConcentration(value, ionId) {
  if (!Number.isFinite(value)) return '—';
  const label = ionId ? `${ionId} ` : '';
  return `${label}${value.toFixed(3)} mol dm⁻³`;
}

function renderChartCard(title, subtitle, points, pickY, minY, maxY, colour) {
  return `
    <div class="phase-debug-chart-card">
      <div class="phase-debug-chart-head">
        <span class="phase-debug-chart-title">${title}</span>
        <span class="phase-debug-chart-subtitle">${subtitle}</span>
      </div>
      ${renderSparkline(points, pickY, minY, maxY, colour)}
    </div>
  `;
}

function renderSparkline(points, pickY, minY, maxY, colour) {
  const width = 220;
  const height = 56;
  const safeMaxY = Math.max(maxY, minY + 1e-9);
  const coords = points.map((point, index) => {
    const x = (index / Math.max(1, points.length - 1)) * width;
    const rawY = pickY(point);
    const normal = (rawY - minY) / (safeMaxY - minY);
    const y = height - clamp(normal, 0, 1) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `
    <svg class="phase-debug-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="${height - 1}" x2="${width}" y2="${height - 1}" class="phase-debug-chart-axis"></line>
      <polyline points="${coords}" fill="none" stroke="${colour}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function maxValue(points, pickY) {
  const values = points.map(pickY).filter(Number.isFinite);
  return values.length > 0 ? Math.max(...values, 1e-6) : 1;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
