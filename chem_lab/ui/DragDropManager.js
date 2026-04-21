/**
 * ui/DragDropManager.js
 * Pointer-Events-based drag-and-drop for the chemistry lab.
 *
 * BUG-09: SVG hit-test — walks up the DOM to find the registered drop zone,
 *         avoiding issues where elementsFromPoint returns inner SVG nodes.
 * BUG-10: ghost div is ALWAYS removed on pointerup, even with no valid drop target.
 * BUG-11: self-drop guard — zones whose data-vessel-id matches the drag source are skipped.
 * TRAP-02: pointer events ONLY — no touchstart/touchmove/touchend to prevent double-firing.
 *
 * Keyboard fallback:
 *   Space / Enter on a focused draggable → enters "pick mode",
 *   Space / Enter on a focused vessel card → executes the drop,
 *   Escape from anywhere → cancels pick mode.
 */

/** Minimum pointer movement (px) before a drag ghost is shown. */
const DRAG_THRESHOLD = 5;

export class DragDropManager {
  constructor() {
    /**
     * Active drag state. null when no drag in progress.
     * @type {{
     *   type: string,
     *   id: string,
     *   label: string,
     *   ghostEl: HTMLElement,
     *   originEl: HTMLElement,
     *   sourceVesselId: string|null,
     * }|null}
     */
    this._activeDrag = null;

    /**
     * Metadata for registered draggable elements.
     * @type {WeakMap<HTMLElement, {type:string, id:string, label:string, sourceVesselId:string|null}>}
     */
    this._draggables = new WeakMap();

    /**
     * Set of elements registered as drop zones.
     * @type {Set<HTMLElement>}
     */
    this._dropZones = new Set();

    /**
     * Keyboard pick-mode state — set when user Space/Enters a draggable.
     * @type {{type:string, id:string, label:string, sourceVesselId:string|null, originEl:HTMLElement}|null}
     */
    this._pickMode = null;

    // Bound handlers for add/remove
    this._onMove = this._handlePointerMove.bind(this);
    this._onUp   = this._handlePointerUp.bind(this);

    this._ariaLive = this._createAriaLive();
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  /**
   * Make an element draggable.
   * @param {HTMLElement} el
   * @param {{ type: string, id: string, label: string }} meta
   * @param {{ vesselId?: string }} [opts]  vesselId → self-drop guard source
   */
  registerDraggable(el, meta, opts = {}) {
    const data = { ...meta, sourceVesselId: opts.vesselId ?? null };
    this._draggables.set(el, data);

    el.setAttribute('tabindex', el.getAttribute('tabindex') ?? '0');
    el.setAttribute('role', el.getAttribute('role') ?? 'button');
    el.setAttribute('aria-label', `Drag ${meta.label}`);

    // TRAP-02: pointer events only
    el.addEventListener('pointerdown', (e) => this._handlePointerDown(e, el, data));
    el.addEventListener('keydown',     (e) => this._handleDraggableKeyDown(e, el, data));
  }

  /**
   * Update the display label of an already-registered draggable.
   * Used when a vessel is renamed after construction (e.g. unknown mode).
   * @param {HTMLElement} el
   * @param {string} newLabel
   */
  updateDraggableLabel(el, newLabel) {
    const data = this._draggables.get(el);
    if (!data) return;
    data.label = newLabel;
    el.setAttribute('aria-label', `Drag ${newLabel}`);
  }

  /**
   * Register a DOM element as a valid drop zone.
   * @param {HTMLElement} el  — should have data-vessel-id if it represents a vessel
   */
  registerDropZone(el) {
    this._dropZones.add(el);
  }

  /**
   * Remove a drop zone (call when the vessel is removed from the bench).
   * @param {HTMLElement} el
   */
  unregisterDropZone(el) {
    this._dropZones.delete(el);
  }

  // ─── Pointer handlers ─────────────────────────────────────────────────────

  /** @private */
  _handlePointerDown(e, el, data) {
    // Primary button only (left-click or single touch)
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    // Ghost is created lazily once the pointer moves past DRAG_THRESHOLD.
    // This prevents a ghost flicker when the user simply clicks a draggable
    // (e.g. clicking a vessel with a lab tool selected).
    this._activeDrag = {
      type:           data.type,
      id:             data.id,
      label:          data.label,
      ghostEl:        null,           // populated on first move past threshold
      originEl:       el,
      sourceVesselId: data.sourceVesselId,
      _startX:        e.clientX,
      _startY:        e.clientY,
      _hoveredZone:   null,
    };

    // Capture pointer so pointermove fires even if pointer leaves the element
    el.setPointerCapture(e.pointerId);

    document.addEventListener('pointermove', this._onMove);
    document.addEventListener('pointerup',   this._onUp);
  }

  /** @private */
  _handlePointerMove(e) {
    if (!this._activeDrag) return;

    // Lazily materialise the ghost once movement exceeds the threshold.
    if (!this._activeDrag.ghostEl) {
      const dx = e.clientX - this._activeDrag._startX;
      const dy = e.clientY - this._activeDrag._startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      const ghost = this._buildGhost(this._activeDrag.label);
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top  = `${e.clientY}px`;
      document.body.appendChild(ghost);
      this._activeDrag.ghostEl = ghost;
    }

    this._activeDrag.ghostEl.style.left = `${e.clientX}px`;
    this._activeDrag.ghostEl.style.top  = `${e.clientY}px`;

    // Update drag-over highlight — uses bounding-rect so clip-path areas work.
    // Only highlights vessel cards (vesselOnly=true), not the bench background.
    const zone = this._findDropZoneByRect(
      e.clientX, e.clientY, this._activeDrag.sourceVesselId, true,
    );
    if (this._activeDrag._hoveredZone !== zone) {
      if (this._activeDrag._hoveredZone) {
        this._activeDrag._hoveredZone.classList.remove('drag-over');
      }
      if (zone) zone.classList.add('drag-over');
      this._activeDrag._hoveredZone = zone ?? null;
    }
  }

  /** @private */
  _handlePointerUp(e) {
    if (!this._activeDrag) return;

    // BUG-10: unconditionally remove ghost before any other processing
    if (this._activeDrag.ghostEl) this._activeDrag.ghostEl.remove();

    // Clean up drag-over highlight from the last hovered zone
    if (this._activeDrag._hoveredZone) {
      this._activeDrag._hoveredZone.classList.remove('drag-over');
    }

    document.removeEventListener('pointermove', this._onMove);
    document.removeEventListener('pointerup',   this._onUp);

    const drag = this._activeDrag;
    const wasDragged = drag.ghostEl !== null; // ghost never created → just a click
    this._activeDrag = null;

    // If pointer never moved past threshold, treat as a plain click — no drop event.
    if (!wasDragged) return;

    // Hit-test — walk up from each element at the pointer position (BUG-09)
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    // Primary: element hit-test. Fallback: bounding-rect for clip-path regions.
    const target = this._findDropZone(elements, drag.sourceVesselId)
      ?? this._findDropZoneByRect(e.clientX, e.clientY, drag.sourceVesselId, false);

    if (target) {
      target.dispatchEvent(new CustomEvent('chemlab:drop', {
        bubbles: true,
        detail: { type: drag.type, id: drag.id, label: drag.label },
      }));
    }
  }

  // ─── Keyboard fallback ────────────────────────────────────────────────────

  /** @private */
  _handleDraggableKeyDown(e, el, data) {
    if (e.key === 'Escape') {
      this._cancelPickMode();
      return;
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();

    if (this._pickMode) {
      if (this._pickMode.id === data.id) {
        // Press same item again → cancel
        this._cancelPickMode();
      }
      // Pressing a different draggable replaces pick mode
      this._cancelPickMode();
    }

    // Activate pick mode
    this._pickMode = { ...data, originEl: el };
    el.setAttribute('aria-pressed', 'true');
    el.classList.add('picked');
    this._announce(`Picked up ${data.label}. Tab to a vessel and press Space or Enter to drop. Press Escape to cancel.`);
  }

  /**
   * Called by VesselUI (or BenchUI keyboard handler) when a vessel card receives
   * Space/Enter while pick mode is active.
   * @param {HTMLElement} vesselEl  — .vessel-card element
   * @returns {boolean}  true if a drop was fired
   */
  handleDropKeyboard(vesselEl) {
    if (!this._pickMode) return false;

    const drag = this._pickMode;

    // BUG-11: self-drop guard
    if (drag.sourceVesselId && vesselEl.dataset.vesselId === drag.sourceVesselId) {
      this._announce('Cannot drop a vessel onto itself.');
      return false;
    }

    this._cancelPickMode();

    vesselEl.dispatchEvent(new CustomEvent('chemlab:drop', {
      bubbles: true,
      detail: { type: drag.type, id: drag.id, label: drag.label },
    }));
    return true;
  }

  /** Returns true if pick mode is currently active. */
  get isPickMode() {
    return this._pickMode !== null;
  }

  /** @private */
  _cancelPickMode() {
    if (!this._pickMode) return;
    if (this._pickMode.originEl) {
      this._pickMode.originEl.removeAttribute('aria-pressed');
      this._pickMode.originEl.classList.remove('picked');
    }
    this._pickMode = null;
    this._announce('Cancelled.');
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  /**
   * Walk elements from hit-test to find the topmost registered drop zone.
   * Walking ancestors handles the SVG inner-node problem (BUG-09).
   * Self-drop guard: skips the source zone and continues (BUG-11).
   * @private
   */
  _findDropZone(elements, sourceVesselId) {
    for (const el of elements) {
      let node = el;
      while (node && node !== document.documentElement) {
        if (this._dropZones.has(node)) {
          // BUG-11: self-drop guard — skip source, keep looking at next element
          if (sourceVesselId && node.dataset?.vesselId === sourceVesselId) {
            break;  // stop traversing ancestors; outer loop tries next element
          }
          return node;
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  /**
   * Fallback drop-zone finder using bounding-rect intersection.
   * Handles elements where clip-path excludes hit-testing (e.g. conical flask).
   * Prefers the smallest (most specific) matching zone.
   * @param {number} x
   * @param {number} y
   * @param {string|null} sourceVesselId
   * @param {boolean} vesselOnly  When true, only vessel cards are returned.
   * @private
   */
  _findDropZoneByRect(x, y, sourceVesselId, vesselOnly) {
    let best    = null;
    let bestArea = Infinity;
    for (const zone of this._dropZones) {
      if (sourceVesselId && zone.dataset?.vesselId === sourceVesselId) continue;
      if (vesselOnly && !zone.dataset?.vesselId) continue;
      const rect = zone.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const area = rect.width * rect.height;
        if (area < bestArea) {
          bestArea = area;
          best = zone;
        }
      }
    }
    return best;
  }

  /** @private */
  _buildGhost(label) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = label;
    return ghost;
  }

  /** @private */
  _createAriaLive() {
    const el = document.createElement('div');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    el.className = 'sr-only';
    document.body.appendChild(el);
    return el;
  }

  /** @private */
  _announce(text) {
    // Brief timeout so screen readers catch the update
    this._ariaLive.textContent = '';
    setTimeout(() => { this._ariaLive.textContent = text; }, 50);
  }
}
