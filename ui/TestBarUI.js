/**
 * ui/TestBarUI.js
 * Renders draggable confirmatory test tools in the top test bar strip.
 *
 * Each tool card:
 *   - Displays the tool's icon (SVG file) or a placeholder emoji if not found.
 *   - Is registered as a draggable with type 'test'.
 *   - When dropped onto a vessel: calls GasTestEngine.runTest() and plays the
 *     resulting animation.
 *
 * BUG-15: flame test animation shows ONLY the colour — no element name is
 *         passed to the animation. The observation text names nothing; only the
 *         colour is shown visually.
 * BUG-16: negative result always plays the negativeAnimId.
 * BUG-17: if AnimationManager reports a test lock on the target vessel, the
 *         drop is silently ignored.
 */

import { CONFIRMATORY_TESTS } from '../data/tests.js';
import { GasTestEngine }      from '../engine/GasTestEngine.js';

/** Fallback emoji icons when the .svg asset is not available. */
const FALLBACK_ICONS = {
  'test_burning_splint':       '🔥',
  'test_glowing_splint':       '✨',
  'test_limewater':            '🥛',
  'test_damp_red_litmus':      '📄',
  'test_damp_blue_litmus':     '📃',
  'test_flame':                '🔦',
  'test_ph_paper':             '📏',
};

export class TestBarUI {
  /**
   * @param {HTMLElement}  testBarEl      — #test-bar element
   * @param {import('./AnimationManager.js').AnimationManager} animManager
   * @param {import('./ObservationLog.js').ObservationLog}     obsLog
   * @param {import('./DragDropManager.js').DragDropManager}   dragDropManager
   * @param {function(string, 'info'|'error'): void}           showToast
   * @param {function(): Map<string, {vessel, vesselUI}>}      getVesselMap
   *   Returns a map of vesselId → {vessel, vesselUI} so TestBarUI can resolve
   *   the vessel from a drop event.
   */
  constructor(testBarEl, animManager, obsLog, dragDropManager, showToast, getVesselMap) {
    this._testBarEl   = testBarEl;
    this._animManager = animManager;
    this._obsLog      = obsLog;
    this._dm          = dragDropManager;
    this._showToast   = showToast;
    this._getVesselMap = getVesselMap;

    this._build();
    this._bindDropHandler();
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  /** @private */
  _build() {
    for (const test of CONFIRMATORY_TESTS) {
      const card = this._buildToolCard(test);
      this._testBarEl.appendChild(card);
    }
  }

  /**
   * Build one test tool card.
   * @private
   */
  _buildToolCard(test) {
    const card = document.createElement('div');
    card.className = 'test-tool';
    card.setAttribute('role',     'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-test-id', test.id);
    card.setAttribute('aria-label', `${test.label} — drag to a vessel`);

    // Icon: try <img> with the icon file, fall back to emoji span
    const iconPath = `ui/icons/${test.icon ?? ''}`;
    const iconEl = this._buildIcon(test.id, iconPath);

    const labelEl = document.createElement('div');
    labelEl.className = 'test-tool-label';
    labelEl.textContent = test.label;

    card.append(iconEl, labelEl);

    // Register with DragDropManager as a 'test' draggable
    this._dm.registerDraggable(card, {
      type:  'test',
      id:    test.id,
      label: test.label,
    });

    return card;
  }

  /**
   * Build the icon element: <img> if a path is given, otherwise an emoji placeholder.
   * @private
   */
  _buildIcon(testId, srcPath) {
    if (srcPath && srcPath.endsWith('.svg')) {
      const img = document.createElement('img');
      img.className = 'test-tool-icon';
      img.src = srcPath;
      img.alt = '';  // decorative; label provides the accessible name
      img.setAttribute('aria-hidden', 'true');
      // On load failure, replace with the emoji placeholder
      img.addEventListener('error', () => {
        const ph = this._buildPlaceholder(testId);
        img.replaceWith(ph);
      }, { once: true });
      return img;
    }
    return this._buildPlaceholder(testId);
  }

  /**
   * Build an emoji placeholder div.
   * @private
   */
  _buildPlaceholder(testId) {
    const ph = document.createElement('div');
    ph.className = 'test-tool-icon-placeholder';
    ph.setAttribute('aria-hidden', 'true');
    ph.textContent = FALLBACK_ICONS[testId] ?? '🧪';
    return ph;
  }

  // ─── Drop handling ────────────────────────────────────────────────────────

  /**
   * Listen for chemlab:drop events whose detail.type === 'test' on any vessel.
   * DragDropManager fires the event on the vessel card element.
   * @private
   */
  _bindDropHandler() {
    // Use document-level delegation: we listen for chemlab:drop events where
    // the target is a vessel card and detail.type === 'test'.
    document.addEventListener('chemlab:drop', (e) => {
      const detail = e.detail;
      if (!detail || detail.type !== 'test') return;

      const vesselCard = e.target.closest('[data-vessel-id]');
      if (!vesselCard) return;

      this._handleTestDrop(vesselCard.dataset.vesselId, detail.id, vesselCard);
    });
  }

  /**
   * Execute a confirmatory test on the named vessel.
   * BUG-17: silently ignored if the vessel has an active test animation.
   * BUG-16: negative animId always played when test is negative.
   * BUG-15: flame colour passed as CSS string — animation manager renders
   *         colour only; no element name is included.
   * @private
   */
  _handleTestDrop(vesselId, testId, vesselEl) {
    // BUG-17: test lock guard
    if (this._animManager.isTestLocked(vesselId)) return;

    const vesselMap = this._getVesselMap();
    const entry = vesselMap.get(vesselId);
    if (!entry) return;

    const { vessel } = entry;

    let result;
    try {
      result = GasTestEngine.runTest(vessel, testId);
    } catch (err) {
      this._showToast(`Test error: ${err.message}`, 'error');
      return;
    }

    const { animId, observation, flameColour, phColour, co2Pressure } = result;

    // Play animation with colour parameters (BUG-15)
    this._animManager.play(animId, vesselEl, { flameColour, phColour, co2Pressure });

    // Log the test result
    const testDef = CONFIRMATORY_TESTS.find(t => t.id === testId);
    this._obsLog.append({
      id:          _uuid(),
      type:        'test',
      observation: observation,
      equation:    '',
      timestamp:   new Date(),
      label:       testDef?.label ?? testId,
    });
  }
}

// ─── Private utilities ────────────────────────────────────────────────────────

/** crypto.randomUUID() with HTTP-localhost fallback (TRAP-03). */
function _uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
