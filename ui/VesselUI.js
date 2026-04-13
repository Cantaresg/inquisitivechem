/**
 * ui/VesselUI.js
 * DOM component for a single vessel.
 *
 * BUG-18: render() always reads directly from vessel.solution — no internal
 *         snapshot is cached. Every render() call reflects the live state.
 *
 * Structure:
 *   .vessel-container  ← outer wrapper: drop zone, click target  (this.el)
 *     .vessel-caption  ← vessel name above the flask; drag handle for pouring
 *     .vessel-card     ← visual flask shape & animation target   (this.cardEl)
 *       .vessel-liquid
 *       .vessel-solids
 *       .vessel-ppt
 *       .vessel-bubble
 *
 * Heat / Cool / Wash are now applied via the global Lab Tools panel (BenchUI).
 * The vessel itself has no buttons.
 */

export class VesselUI {
  /**
   * @param {import('../engine/Vessel.js').Vessel} vessel
   * @param {import('./DragDropManager.js').DragDropManager} dragDropManager
   */
  constructor(vessel, dragDropManager) {
    /** @type {import('../engine/Vessel.js').Vessel} */
    this.vessel = vessel;
    this._dm = dragDropManager;

    /** Outer container — drop zone, event source. @type {HTMLElement} */
    this.el = null;
    /** Inner card — visual flask shape, animation target. @type {HTMLElement} */
    this.cardEl = null;

    this._build();
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  /** @private */
  _build() {
    // ── Outer container (drop zone, tool-click target) ─────────────────────
    const container = document.createElement('div');
    container.className = 'vessel-container';
    container.dataset.vesselId = this.vessel.id;
    container.setAttribute('role',       'region');
    container.setAttribute('tabindex',   '0');
    container.setAttribute('aria-label', this.vessel.name);

    // ── Caption (vessel name above the flask; drag handle for pouring) ─────
    const caption = document.createElement('div');
    caption.className = 'vessel-caption';
    caption.textContent = this.vessel.name;
    caption.setAttribute('title', 'Drag to pour contents into another vessel');
    // Register CAPTION as draggable — drag handle for vessel-to-vessel pouring.
    this._dm.registerDraggable(caption, {
      type:  'vessel',
      id:    this.vessel.id,
      label: this.vessel.name,
    }, { vesselId: this.vessel.id });

    // ── Inner card (visual flask shape, animation target) ─────────────────
    const card = document.createElement('div');
    card.className = 'vessel-card';
    card.dataset.type     = this.vessel.type;
    card.dataset.vesselId = this.vessel.id;  // for AnimationManager testLock

    // ── Liquid layer ──────────────────────────────────────────────────────
    const liquid = document.createElement('div');
    liquid.className = 'vessel-liquid';

    // ── Precipitate layer ─────────────────────────────────────────────────
    const pptLayer = document.createElement('div');
    pptLayer.className = 'vessel-ppt';

    // ── Bubble layer anchor ───────────────────────────────────────────────
    const bubbleLayer = document.createElement('div');
    bubbleLayer.className = 'vessel-bubble';

    // ── Solid chunks layer ────────────────────────────────────────────────
    const solidsLayer = document.createElement('div');
    solidsLayer.className = 'vessel-solids';

    card.append(liquid, solidsLayer, pptLayer, bubbleLayer);
    container.append(caption, card);

    // Register container as drop zone (no clip-path → full bounding rect).
    this._dm.registerDropZone(container);

    // Keyboard drop support (pick-mode fallback)
    container.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        if (this._dm.isPickMode) {
          e.preventDefault();
          this._dm.handleDropKeyboard(container);
        }
      }
    });

    this.el     = container;
    this.cardEl = card;
  }

  // ─── Render (BUG-18) ─────────────────────────────────────────────────────

  /**
   * Rebuild all visual layers from the live vessel.solution.
   * Safe to call repeatedly. No internal snapshot — always reads live state.
   */
  render() {
    const sol = this.vessel.solution;
    this._updateCaption();
    this._updateLiquid(sol);
    this._updateSolids(sol);
    this._updatePptLayer(sol);
    this._updateHeatGlow();
  }

  // ─── Private render sub-methods ───────────────────────────────────────────

  /** @private */
  _updateCaption() {
    const caption = this.el.querySelector('.vessel-caption');
    if (caption) caption.textContent = this.vessel.name;
    this.el.setAttribute('aria-label', this.vessel.name);
  }

  /** @private */
  _updateLiquid(sol) {
    const liquid = this.cardEl.querySelector('.vessel-liquid');
    if (!liquid) return;
    // Hide the liquid layer when the vessel contains only undissolved solids.
    const hasLiquid = Object.keys(sol.ions).length > 0 || sol._colorOverride !== null;
    if (hasLiquid) {
      liquid.style.background = sol.color;
      liquid.style.height = '';
    } else {
      liquid.style.height = '0';
    }
  }

  /** Render undissolved solid chunks as coloured chips at the base. @private */
  _updateSolids(sol) {
    const layer = this.cardEl.querySelector('.vessel-solids');
    if (!layer) return;
    layer.textContent = '';
    const present = sol.solids.filter(s => s.amount > 0);
    if (present.length > 0) {
      layer.style.height = `${Math.min(present.length * 14 + 8, 55)}px`;
      for (const solid of present) {
        const chip = document.createElement('div');
        chip.className = 'vessel-solid-chip';
        chip.style.background = solid.color ?? 'rgba(190,190,190,0.85)';
        chip.title = solid.id;
        layer.appendChild(chip);
      }
    } else {
      layer.style.height = '0';
    }
  }

  /** @private */
  _updatePptLayer(sol) {
    const layer = this.cardEl.querySelector('.vessel-ppt');
    if (!layer) return;
    layer.textContent = '';

    if (sol.ppts.length > 0) {
      // Scale height with ppt count; each ppt contributes ~14 px
      layer.style.height = `${Math.min(sol.ppts.length * 14 + 8, 50)}px`;
      for (const ppt of sol.ppts) {
        const chip = document.createElement('div');
        chip.className = 'vessel-ppt-chip';
        chip.style.background = ppt.color ?? 'rgba(200,200,200,0.85)';
        chip.title = ppt.label ?? ppt.formula ?? ppt.id;
        layer.appendChild(chip);
      }
    } else {
      layer.style.height = '0';
    }
  }

  /** @private */
  _updateHeatGlow() {
    this.cardEl.classList.toggle('is-hot', this.vessel.isHot);
  }

  /**
   * No-op satisfying the BenchUI.tick() call site — gas indicator text has
   * been removed from the vessel display (labels are in the Observation log).
   */
  updateGasOnly() {}
}
