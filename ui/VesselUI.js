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

    // Register the card body as a vessel draggable too, so users can grab the
    // flask itself to pour — not just the small caption handle.
    this._dm.registerDraggable(card, {
      type:  'vessel',
      id:    this.vessel.id,
      label: this.vessel.name,
    }, { vesselId: this.vessel.id });

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
      layer.style.height = `${Math.min(present.length * 20 + 14, 65)}px`;
      present.forEach((solid, i) => {
        const chip = document.createElement('div');
        chip.className = 'vessel-solid-chip';
        chip.style.background = solid.color ?? 'rgba(190,190,190,0.85)';
        chip.title = solid.id;
        // Pseudo-random size + rotation so chips look like real solid lumps
        const seed = i * 17 + (solid.id.charCodeAt(0) ?? 0);
        const w   = 22 + (seed % 18);              // 22–40 px
        const h   = 12 + ((seed * 3) % 11);         // 12–23 px
        const rot = ((seed * 37) % 22) - 11;         // −11° to +11°
        chip.style.width     = `${w}px`;
        chip.style.height    = `${h}px`;
        chip.style.transform = `rotate(${rot}deg)`;
        layer.appendChild(chip);
      });
    } else {
      layer.style.height = '0';
    }
  }

  /** @private */
  _updatePptLayer(sol) {
    const layer = this.cardEl.querySelector('.vessel-ppt');
    if (!layer) return;
    layer.textContent = '';
    layer.style.background = '';

    if (sol.ppts.length > 0) {
      // Height scales with ppt count; taller than chips for visibility
      const heightPx = Math.min(sol.ppts.length * 22 + 14, 70);
      layer.style.height = `${heightPx}px`;

      // Fill the layer with the ppt colour(s) — looks like settled sediment
      const colors = sol.ppts.map(p => p.color ?? 'rgba(200,200,200,0.85)');
      if (colors.length === 1) {
        layer.style.background = colors[0];
      } else {
        const step  = 100 / colors.length;
        const stops = colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`);
        layer.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
      }

      // Grain overlay div giving a powdery/granular texture (CSS class handles it)
      const grain = document.createElement('div');
      grain.className = 'vessel-ppt-grain';
      layer.appendChild(grain);
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
