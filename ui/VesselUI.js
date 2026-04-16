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

    // Sketch outline overlay — SVG drawn above live chemistry layers
    const sketchResult = this._buildSketchOverlay();
    if (sketchResult) {
      card.appendChild(sketchResult.svg);
      if (sketchResult.clipPath) {
        card.style.clipPath = `path('${sketchResult.clipPath}')`;
        card.style.borderRadius = '0';
      }
    }

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
    // Flat dishes (solid_dish, evaporating_dish) render wider, flatter chips
    // that look like metal strips or mineral flakes lying on a surface.
    const isDish = this.vessel.type === 'solid_dish' || this.vessel.type === 'evaporating_dish';
    if (present.length > 0) {
      layer.style.height = isDish
        ? `${Math.min(present.length * 14 + 8, 36)}px`
        : `${Math.min(present.length * 20 + 14, 65)}px`;
      present.forEach((solid, i) => {
        const chip = document.createElement('div');
        chip.className = 'vessel-solid-chip';
        chip.style.background = solid.color ?? 'rgba(190,190,190,0.85)';
        chip.title = solid.id;
        // Pseudo-random size + rotation so chips look like real solid lumps/strips
        const seed = i * 17 + (solid.id.charCodeAt(0) ?? 0);
        const w   = isDish ? (32 + (seed % 26)) : (22 + (seed % 18));   // wider for dish
        const h   = isDish ? (5  + ((seed * 3) % 4)) : (12 + ((seed * 3) % 11)); // flatter for dish
        const rot = isDish ? (((seed * 19) % 28) - 14) : (((seed * 37) % 22) - 11);
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

      const colors = sol.ppts.map(p => p.color ?? 'rgba(200,200,200,0.85)');
      const isGoldenRain = sol.ppts.some(p => p.id === 'pbi2');

      if (isGoldenRain && colors.length === 1) {
        // Layered radial gradients simulate light catching different facets of the
        // crystal sediment — gives a glittery, faceted look rather than flat colour.
        layer.style.background = [
          'radial-gradient(ellipse at 18% 28%, rgba(255,255,180,0.60) 0%, transparent 40%)',
          'radial-gradient(ellipse at 78% 52%, rgba(255,228,40,0.42)  0%, transparent 35%)',
          'radial-gradient(ellipse at 50% 82%, rgba(190,130,0,0.32)   0%, transparent 42%)',
          'radial-gradient(ellipse at 40% 15%, rgba(255,255,220,0.35) 0%, transparent 30%)',
          colors[0],
        ].join(', ');
      } else if (colors.length === 1) {
        layer.style.background = colors[0];
      } else {
        // Mixed precipitates: scatter overlapping blobs of each colour so the
        // sediment looks mottled/speckled rather than striped into distinct bands.
        // Positions are deterministic (based on ppt ids) so renders are stable.
        const seed = sol.ppts.reduce((a, p, i) => a + p.id.charCodeAt(0) * (i + 3), 0);
        const blobs = [];
        const blobsPerColor = Math.max(6, Math.round(14 / colors.length));
        colors.forEach((color, ci) => {
          for (let i = 0; i < blobsPerColor; i++) {
            const n  = (seed + ci * 97 + i * 53) & 0xffff;
            const x  = 3  + ((n * 71)       % 94);   // 3..97 %
            const y  = 5  + (((n * 53) >> 3) % 90);  // 5..95 %
            const rx = 14 + ((n * 29)        % 30);  // x-radius 14..44 %
            const ry = 9  + ((n * 17)        % 18);  // y-radius 9..27 %  (flatter blobs)
            blobs.push(
              `radial-gradient(ellipse ${rx}% ${ry}% at ${x}% ${y}%, ${color} 0%, transparent 78%)`
            );
          }
        });
        // Solid base of the first ppt colour underneath all blobs
        layer.style.background = [...blobs, colors[0]].join(', ');
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

  // ─── Sketch overlay helpers ───────────────────────────────────────────────

  /**
   * Returns an SVG sketch overlay element for vessel types that have one,
   * or null for plain types (test_tube, etc.).
   * @private
   */
  _buildSketchOverlay() {
    switch (this.vessel.type) {
      case 'conical_flask':    return { svg: this._buildFlaskSVG(), clipPath: null };
      case 'evaporating_dish': return this._buildDishSketch(160, 60);
      case 'solid_dish':       return this._buildDishSketch(144, 56);
      default: return null;
    }
  }

  /**
   * SVG sketch outline for a 120×180 conical flask.
   * Draws: curved outline, shoulder hatching, glass highlight.
   * @private
   */
  _buildFlaskSVG() {
    const NS   = 'http://www.w3.org/2000/svg';
    const uid  = this.vessel.id;
    const svg  = document.createElementNS(NS, 'svg');
    svg.setAttribute('class',       'vessel-sketch-overlay');
    svg.setAttribute('viewBox',     '0 0 120 180');
    svg.setAttribute('aria-hidden', 'true');

    const OUTLINE  = 'M 46,6 C 46,1 74,1 74,6 L 74,50 C 82,64 112,128 112,172 C 112,176 108,178 104,178 L 16,178 C 12,178 8,176 8,172 C 8,128 38,64 46,50 Z';
    const GREY     = 'rgb(127,127,127)';
    const CLIP_ID  = `flask-clip-${uid}`;

    // ── clipPath (restricts hatching to flask interior) ────────────────────
    const defs = document.createElementNS(NS, 'defs');
    const clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', CLIP_ID);
    const clipShape = document.createElementNS(NS, 'path');
    clipShape.setAttribute('d', OUTLINE);
    clip.appendChild(clipShape);
    defs.appendChild(clip);
    svg.appendChild(defs);

    // ── Shoulder hatching ─────────────────────────────────────────────────
    // Four diagonal lines each side confined to the shoulder zone (y ≤ ~90)
    // where the neck transitions to the body. Extending them further causes
    // them to bleed visibly through the liquid layer (sketch overlay z-index
    // sits above the liquid; clipping only prevents lines from leaving the
    // flask silhouette, not from showing through the liquid fill).
    const hatch = document.createElementNS(NS, 'g');
    hatch.setAttribute('clip-path',    `url(#${CLIP_ID})`);
    hatch.setAttribute('stroke',       GREY);
    hatch.setAttribute('stroke-width', '0.7');
    hatch.setAttribute('opacity',      '0.55');
    const lines = [
      // left shoulder              right shoulder
      [45, 52, 20, 68],            [75, 52, 100, 68],
      [44, 60, 13, 78],            [76, 60, 107, 78],
      [43, 68,  8, 88],            [77, 68, 112, 88],
      [42, 76,  6, 96],            [78, 76, 114, 96],
    ];
    for (const [x1, y1, x2, y2] of lines) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      hatch.appendChild(l);
    }
    svg.appendChild(hatch);

    // ── Glass highlight streak on right side of neck ──────────────────────
    const highlight = document.createElementNS(NS, 'path');
    highlight.setAttribute('d',            'M 72,8 C 73,20 73,38 72,50');
    highlight.setAttribute('fill',         'none');
    highlight.setAttribute('stroke',       'rgb(160,190,170)');
    highlight.setAttribute('stroke-width', '0.9');
    highlight.setAttribute('opacity',      '0.40');
    svg.appendChild(highlight);

    // ── Main outline (drawn last so it sits on top) ───────────────────────
    const outline = document.createElementNS(NS, 'path');
    outline.setAttribute('d',                OUTLINE);
    outline.setAttribute('fill',             'none');
    outline.setAttribute('stroke',           GREY);
    outline.setAttribute('stroke-width',     '1.5');
    outline.setAttribute('stroke-linejoin',  'round');
    svg.appendChild(outline);

    return svg;
  }

  /**
   * SVG sketch outline for dish-type vessels (evaporating_dish, solid_dish).
   * Returns { svg, clipPath } — clipPath is applied to the card in _build() so
   * solid chips are always clipped to the actual dish outline boundary.
   * @param {number} w  card pixel width
   * @param {number} h  card pixel height
   * @private
   */
  _buildDishSketch(w, h) {
    const NS   = 'http://www.w3.org/2000/svg';
    const uid  = this.vessel.id;
    const svg  = document.createElementNS(NS, 'svg');
    svg.setAttribute('class',       'vessel-sketch-overlay');
    svg.setAttribute('viewBox',     `0 0 ${w} ${h}`);
    svg.setAttribute('aria-hidden', 'true');

    const GREY    = 'rgb(127,127,127)';
    const CLIP_ID = `dish-clip-${uid}`;

    // Dish profile: wide at top, curves to a rounded base.
    const hy = Math.round(h * 0.37);   // right/left wall inflection y
    const by = Math.round(h * 0.77);   // base curve end y
    const bm = Math.round(h - 4);      // base midpoint y
    const cx = Math.round(w * 0.77);   // right base curve x control
    const OUTLINE =
      `M 7,4 L ${w - 7},4 ` +
      `C ${w - 2},4 ${w - 2},10 ${w - 2},${hy} ` +
      `C ${w - 2},${by} ${cx},${bm} ${Math.round(w / 2)},${bm} ` +
      `C ${w - cx},${bm} 2,${by} 2,${hy} ` +
      `C 2,10 3,4 7,4 Z`;

    // ── clipPath ──────────────────────────────────────────────────────────
    const defs = document.createElementNS(NS, 'defs');
    const clip = document.createElementNS(NS, 'clipPath');
    clip.setAttribute('id', CLIP_ID);
    const clipShape = document.createElementNS(NS, 'path');
    clipShape.setAttribute('d', OUTLINE);
    clip.appendChild(clipShape);
    defs.appendChild(clip);
    svg.appendChild(defs);

    // ── Hatching on right wall ─────────────────────────────────────────────
    const hatch = document.createElementNS(NS, 'g');
    hatch.setAttribute('clip-path',    `url(#${CLIP_ID})`);
    hatch.setAttribute('stroke',       GREY);
    hatch.setAttribute('stroke-width', '0.7');
    hatch.setAttribute('opacity',      '0.50');
    const rx = w - 4;
    for (const [x1, y1, x2, y2] of [
      [rx - 22, 6,  rx, Math.round(h * 0.42)],
      [rx - 34, 6,  rx, Math.round(h * 0.66)],
      [rx - 44, 6,  rx, Math.round(h * 0.82)],
    ]) {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      hatch.appendChild(l);
    }
    svg.appendChild(hatch);

    // ── Rim highlight ─────────────────────────────────────────────────────
    const rim = document.createElementNS(NS, 'line');
    rim.setAttribute('x1',           '9');
    rim.setAttribute('y1',           '10');
    rim.setAttribute('x2',           String(w - 9));
    rim.setAttribute('y2',           '10');
    rim.setAttribute('stroke',       'rgb(160,190,170)');
    rim.setAttribute('stroke-width', '0.7');
    rim.setAttribute('opacity',      '0.38');
    svg.appendChild(rim);

    // ── Main outline ──────────────────────────────────────────────────────
    const outline = document.createElementNS(NS, 'path');
    outline.setAttribute('d',               OUTLINE);
    outline.setAttribute('fill',            'none');
    outline.setAttribute('stroke',          GREY);
    outline.setAttribute('stroke-width',    '1.5');
    outline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(outline);

    return { svg, clipPath: OUTLINE };
  }

  /**
   * No-op satisfying the BenchUI.tick() call site — gas indicator text has   
   * been removed from the vessel display (labels are in the Observation log).
   */
  updateGasOnly() {}
}
