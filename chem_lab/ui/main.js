/**
 * ui/main.js
 * Entry-point for the virtual chemistry lab (Phase 1, offline).
 *
 * Instantiates all classes in dependency order and wires the chemlab:drop
 * CustomEvent listeners.  Contains no business logic — all chemistry and
 * rendering logic lives in engine/ and ui/ respectively.
 *
 * Dependency order (bottom-up):
 *   1. DragDropManager  — no deps
 *   2. AnimationManager — no deps
 *   3. ObservationLog   — DOM refs only
 *   4. BenchUI          — DragDropManager + AnimationManager + ObservationLog
 *   5. ChemStoreUI      — DragDropManager
 *   6. TestBarUI        — AnimationManager + ObservationLog + DragDropManager + BenchUI
 */

import { AnimationManager } from './AnimationManager.js';
import { DragDropManager }  from './DragDropManager.js';
import { ObservationLog }   from './ObservationLog.js';
import { BenchUI }          from './BenchUI.js';
import { ChemStoreUI }      from './ChemStoreUI.js';
import { TestBarUI }        from './TestBarUI.js';
import { UnknownModeUI }    from './UnknownModeUI.js';
import { StudentSession }   from './StudentSession.js';

// ─── Toast helper ────────────────────────────────────────────────────────────

const _toastContainer = document.getElementById('toast-container');

/**
 * Display a transient notification toast.
 * Text is set via textContent to prevent XSS (TRAP-10).
 *
 * @param {string}           message
 * @param {'info'|'error'}   [kind='info']
 */
function showToast(message, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;                     // TRAP-10 — never innerHTML
  _toastContainer.appendChild(el);

  // CSS animation is toastIn (0.18 s) + toastOut (0.28 s) starting at 2.72 s
  // → total lifetime ≈ 3 s.  Remove element once it has faded out.
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 3200);
}

// ─── 1. DragDropManager ──────────────────────────────────────────────────────

const dragDropManager = new DragDropManager();

// ─── 2. AnimationManager ─────────────────────────────────────────────────────

const animManager = new AnimationManager();

// ─── 3. ObservationLog ───────────────────────────────────────────────────────

const obsLog = new ObservationLog(
  document.getElementById('obs-panel'),
  document.getElementById('obs-list'),
  document.getElementById('obs-equations'),
  document.getElementById('obs-export-btn'),
  document.querySelector('.obs-tab[data-tab="observations"]'),
  document.querySelector('.obs-tab[data-tab="equations"]'),
  document.getElementById('obs-panel-header'),
);

// ─── 4. BenchUI ──────────────────────────────────────────────────────────────

export const benchUI = new BenchUI(
  document.getElementById('bench-area'),
  animManager,
  obsLog,
  dragDropManager,
  showToast,
);

// ─── 5. ChemStoreUI ──────────────────────────────────────────────────────────

const chemStore = new ChemStoreUI(
  document.getElementById('chem-store-tree'),
  dragDropManager,
);

// ─── 6. TestBarUI ────────────────────────────────────────────────────────────

const testBar = new TestBarUI(
  document.getElementById('test-bar'),
  animManager,
  obsLog,
  dragDropManager,
  showToast,
  () => benchUI.getVesselMap(),
);

// ─── 7. Lab Tools panel ──────────────────────────────────────────────────────

benchUI.setToolButtons(document.querySelectorAll('.tool-btn'));

// ─── 8. Unknown Mode ─────────────────────────────────────────────────────────

new UnknownModeUI(benchUI, showToast, dragDropManager);

// ─── 9. Student session ──────────────────────────────────────────────────────

new StudentSession(chemStore, testBar, showToast);

// ─── 9. Gas pressure decay loop ─────────────────────────────────────────────
// Drives tickGasPressure so dissolved gases slowly dissipate over ~27 s.

let _lastRafTime = null;
function _rafTick(timestamp) {
  if (_lastRafTime !== null) {
    // Cap delta at 100 ms to avoid large jumps after tab switch / sleep.
    const delta = Math.min((timestamp - _lastRafTime) / 1000, 0.1);
    benchUI.tick(delta);
  }
  _lastRafTime = timestamp;
  requestAnimationFrame(_rafTick);
}
requestAnimationFrame(_rafTick);

