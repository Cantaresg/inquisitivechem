/**
 * js/main.js
 * Phase 4–6 entry point.
 *
 * Responsibilities:
 *   • Render left-panel electrode cards and battery static card.
 *   • Handle drag-from-panel → drop-on-canvas to spawn ElectrodeNodes.
 *   • Instantiate ElectrolytePanel, TestPanel, ObsPanel, AnimationLayer.
 *   • Instantiate SimController (owns topology listener + engine).
 *   • Phase 6: Instantiate ECCellCanvas, ECCellPanel, ECCellController.
 *   • Level toggle propagates to ElectrolytePanel + SimController.
 *   • Toast system (showToast exported for use by SimController).
 */

import { CircuitCanvas }       from '../circuit/CircuitCanvas.js';
import { ECCellCanvas }        from '../circuit/ECCellCanvas.js';
import { getElectrodesForLevel } from '../data/electrodes.js';
import { ElectrolytePanel }    from '../ui/ElectrolytePanel.js';
import { ECCellPanel }         from '../ui/ECCellPanel.js';
import { TestPanel }           from '../ui/TestPanel.js';
import { ObsPanel }            from '../ui/ObsPanel.js';
import { AnimationLayer }      from '../ui/AnimationLayer.js';
import { SimController }       from '../controller/SimController.js';
import { ECCellController }    from '../controller/ECCellController.js';

// ── Debug: surface any JS error visibly on the page ──────────────────────
window.addEventListener('error', ev => {
  const bar = document.getElementById('circuit-status') ?? document.body;
  bar.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);'
    + 'background:#700;color:#fff;padding:8px 16px;border-radius:6px;z-index:9999;'
    + 'font:12px monospace;max-width:90vw;white-space:pre-wrap;pointer-events:none;';
  bar.textContent = `JS ERROR: ${ev.message}\n${ev.filename}:${ev.lineno}`;
});
window.addEventListener('unhandledrejection', ev => {
  const bar = document.getElementById('circuit-status') ?? document.body;
  bar.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);'
    + 'background:#700;color:#fff;padding:8px 16px;border-radius:6px;z-index:9999;'
    + 'font:12px monospace;max-width:90vw;white-space:pre-wrap;pointer-events:none;';
  bar.textContent = `UNHANDLED REJECTION: ${ev.reason}`;
});

// ── DOM refs ──────────────────────────────────────────────────────────────
const svg              = document.getElementById('circuit-svg');
const circuitWrap      = document.getElementById('circuit-wrap');
const compGroupEl      = document.getElementById('comp-electrode-group');
const levelBtns        = document.querySelectorAll('.level-btn');
const toastContainer   = document.getElementById('toast-container');
const statusBar        = document.getElementById('circuit-status');

// Electrolyte panel
const electrolyteCards = document.getElementById('electrolyte-cards');
const concSlider       = document.getElementById('conc-slider');
const concValue        = document.getElementById('conc-value');

// Test panel
const testControlsEl   = document.getElementById('test-controls');

// Obs panel
const obsTabsEl        = document.getElementById('obs-tabs');
const obsObsEl         = document.getElementById('obs-observations');
const obsEqEl          = document.getElementById('obs-equations');
const exportCsvBtn     = document.getElementById('export-csv');
const exportDocxBtn    = document.getElementById('export-docx');
const obsToggleBtn     = document.getElementById('obs-toggle');
const obsPanelEl       = document.getElementById('obs-panel');

// EC Cell mode DOM refs
const eccellModeBtn    = document.getElementById('eccell-mode-btn');
const eccellPanelEl    = document.getElementById('eccell-panel-container');

// ── State ─────────────────────────────────────────────────────────────────
let currentLevel = 'O_LEVEL';
let simMode      = 'electrolysis';  // 'electrolysis' | 'eccell'
let canvas;           // CircuitCanvas
let ecCellCanvas;     // ECCellCanvas
let electrolytePanel;
let ecCellPanel;      // ECCellPanel
let ecCellController; // ECCellController
let simController;

/** Info for the electrode card currently being dragged from the left panel. */
let _pendingSpawn = null;  // { electrodeData } | null
let _ghost        = null;  // HTMLElement | null

// ── Initialise ─────────────────────────────────────────────────────────────
// ES modules are deferred — DOM is fully parsed before this code runs,
// so no DOMContentLoaded wrapper is needed.

// Step tracker — shows a visible status chip in the top-right corner
const _dbg = document.createElement('div');
_dbg.style.cssText = 'position:fixed;top:60px;right:12px;z-index:9999;'
  + 'background:#111;color:#4df0b0;font:11px monospace;padding:6px 10px;'
  + 'border-radius:6px;border:1px solid #4df0b0;max-width:50vw;white-space:pre;'
  + 'pointer-events:none;line-height:1.6;';
document.body.appendChild(_dbg);
function _step(n, label) { _dbg.textContent = `init step ${n}: ${label}`; }
function _done() {
  _dbg.remove();
  if (window._loadDiag) window._loadDiag.remove();
}

try {
  _step(1, 'CircuitCanvas');
  canvas = new CircuitCanvas(svg);

  // ─ EC Cell mode canvas (A-Level only, hidden until mode switch)
  _step(2, 'ECCellCanvas');
  ecCellCanvas = new ECCellCanvas(svg);

  _step(3, 'AnimationLayer');
  const animLayer = new AnimationLayer(circuitWrap);

  _step(4, 'ElectrolytePanel');
  electrolytePanel = new ElectrolytePanel({
    cardsContainer:        electrolyteCards,
    slider:                concSlider,
    sliderValueEl:         concValue,
    onSelect:              record => simController?.setElectrolyte(record),
    onConcentrationChange: record => simController?.setElectrolyte(record),
  });

  // EC Cell panel (shown when switching to EC Cell mode in A-Level)
  _step(5, 'ECCellPanel');
  if (eccellPanelEl) {
    ecCellPanel = new ECCellPanel({
      container:     eccellPanelEl,
      onLeftChange:  hc => ecCellController?.setLeftHalfCell(hc),
      onRightChange: hc => ecCellController?.setRightHalfCell(hc),
    });
    ecCellPanel.setVisible(false);   // hidden initially
  }

  _step(6, 'TestPanel');
  const testPanel = new TestPanel(
    testControlsEl,
    testResult => simController?.onTestResult(testResult),
  );

  _step(7, 'ObsPanel');
  const obsPanel = new ObsPanel({
    tabsEl:    obsTabsEl,
    obsEl:     obsObsEl,
    eqEl:      obsEqEl,
    csvBtn:    exportCsvBtn,
    docxBtn:   exportDocxBtn,
    toggleBtn: obsToggleBtn,
    panelEl:   obsPanelEl,
    config:    { level: currentLevel },
  });

  _step(8, 'ECCellController');
  ecCellController = new ECCellController({
    voltmeter:   ecCellCanvas.voltmeter,
    ecCellCanvas,
    obsPanel,
    config:      { level: 'A_LEVEL' },  // EC Cell is always A-Level
    setStatus,
    showToast,
  });

  _step(9, 'SimController');
  simController = new SimController({
    canvas,
    svg,
    testPanel,
    obsPanel,
    animLayer,
    setStatus,
    showToast,
    ecCellController,
  });

  _step(10, 'renderComponentPanel');
  renderComponentPanel(currentLevel);
  _step(11, 'bindLevelToggle');
  bindLevelToggle();
  _step(12, 'bindECCellModeBtn');
  bindECCellModeBtn();
  _done();
} catch (err) {
  _dbg.style.color = '#ff6b6b';
  _dbg.style.borderColor = '#ff6b6b';
  _dbg.textContent += `\nERROR: ${err.message}`;
  console.error('Electrochemistry init failed:', err);
}

// ── Level toggle ──────────────────────────────────────────────────────────
function bindLevelToggle() {
  for (const btn of levelBtns) {
    btn.addEventListener('click', () => {
      currentLevel = btn.dataset.level;
      levelBtns.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });
      renderComponentPanel(currentLevel);
      electrolytePanel?.renderForLevel(currentLevel);
      simController?.setLevel(currentLevel);

      // Update EC Cell canvas level (salt bridge visibility)
      ecCellCanvas?.setLevel(currentLevel);
    });
  }
}

// ── EC Cell mode toggle ──────────────────────────────────────────────
function bindECCellModeBtn() {
  if (!eccellModeBtn) return;
  eccellModeBtn.style.display = '';   // always visible
  eccellModeBtn.addEventListener('click', () => {
    _setSimMode(simMode === 'eccell' ? 'electrolysis' : 'eccell');
  });
}

function _setSimMode(mode) {
  simMode = mode;
  const isECCell = mode === 'eccell';

  // Swap canvas layers: hide/show CircuitCanvas layers
  for (const id of ['beaker-layer', 'wires-layer', 'components-layer']) {
    const el = svg.getElementById?.(id) ?? svg.querySelector(`#${id}`);
    if (el) el.style.display = isECCell ? 'none' : '';
  }
  // Battery node is in #components-layer (already hidden above), but we also
  // hide battery's own group if it was moved
  if (isECCell) ecCellCanvas.show(); else ecCellCanvas.hide();

  // Swap bottom panel content
  const elysisPanel  = document.getElementById('electrolysis-panel-wrap');
  const eccellWrap   = document.getElementById('eccell-panel-wrap');
  if (elysisPanel) elysisPanel.hidden  = isECCell;
  if (eccellWrap)  eccellWrap.hidden   = !isECCell;
  ecCellPanel?.setVisible(isECCell);

  // Update toggle button label
  if (eccellModeBtn) {
    eccellModeBtn.textContent = isECCell ? 'Electrolysis Mode' : 'EC Cell Mode';
    eccellModeBtn.classList.toggle('active', isECCell);
  }

  simController?.setMode(mode);
}

// ── Component panel rendering ─────────────────────────────────────────────
function renderComponentPanel(level) {
  compGroupEl.innerHTML = '';
  const electrodes = getElectrodesForLevel(level);

  for (const elec of electrodes) {
    const card = document.createElement('div');
    card.className     = 'comp-card';
    card.dataset.elecId = elec.id;
    card.setAttribute('role',      'button');
    card.setAttribute('tabindex',  '0');
    card.setAttribute('title',     elec.description);
    card.setAttribute('aria-label', `Add ${elec.name} electrode`);

    card.innerHTML = `
      <span class="comp-symbol" style="color:${elec.colour}">${elec.symbol}</span>
      <span class="comp-name">${elec.name}</span>
      <span class="comp-badge ${elec.isInert ? 'badge-inert' : 'badge-reactive'}">
        ${elec.isInert ? 'Inert' : 'Reactive'}
      </span>
    `;

    card.addEventListener('pointerdown', (e) => startPanelDrag(e, elec));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') spawnAtCenter(elec);
    });

    compGroupEl.appendChild(card);
  }
}

// ── Panel → canvas drag ───────────────────────────────────────────────────
function startPanelDrag(e, electrodeData) {
  e.preventDefault();
  _pendingSpawn = { electrodeData };

  // Ghost follows cursor
  _ghost = document.createElement('div');
  _ghost.className   = 'drag-ghost';
  _ghost.textContent = electrodeData.symbol;
  _ghost.style.left  = `${e.clientX - 16}px`;
  _ghost.style.top   = `${e.clientY - 16}px`;
  document.body.appendChild(_ghost);

  // Show drop hint on canvas
  document.getElementById('drop-hint')?.removeAttribute('hidden');

  window.addEventListener('pointermove', _onGhostMove);
  window.addEventListener('pointerup',   _onGhostUp);
}

function _onGhostMove(e) {
  if (!_ghost) return;
  _ghost.style.left = `${e.clientX - 16}px`;
  _ghost.style.top  = `${e.clientY - 16}px`;
}

function _onGhostUp(e) {
  window.removeEventListener('pointermove', _onGhostMove);
  window.removeEventListener('pointerup',   _onGhostUp);
  document.getElementById('drop-hint')?.setAttribute('hidden', '');

  if (_ghost) { _ghost.remove(); _ghost = null; }

  if (!_pendingSpawn) return;
  const { electrodeData } = _pendingSpawn;
  _pendingSpawn = null;

  // Check drop landed on the SVG canvas area
  const svgRect = svg.getBoundingClientRect();
  if (
    e.clientX >= svgRect.left && e.clientX <= svgRect.right &&
    e.clientY >= svgRect.top  && e.clientY <= svgRect.bottom
  ) {
    const svgX = e.clientX - svgRect.left;
    const svgY = e.clientY - svgRect.top;
    canvas.spawnComponent(electrodeData, svgX, svgY);
  }
}

/** Keyboard fallback: place at centre of beaker area. */
function spawnAtCenter(electrodeData) {
  const svgRect = svg.getBoundingClientRect();
  canvas.spawnComponent(electrodeData, svgRect.width / 2, svgRect.height / 2);
}

// ── Toast system ──────────────────────────────────────────────────────────
export function showToast(msg, duration = 3500) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className   = 'toast';
  toast.textContent = msg;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

// ── Circuit status bar ────────────────────────────────────────────────────
function setStatus(msg, cls) {
  if (!statusBar) return;
  statusBar.textContent = msg;
  statusBar.className   = `circuit-status ${cls}`;
}
