/**
 * ui/BenchUI.js
 * Manages 6 vessel slots on the lab bench.
 *
 * BUG-12: maximum 6 vessels — check before any operation that adds a vessel.
 * BUG-13: mixture counter — increments on each new mixture name; never renumbers.
 * BUG-14: evaporating_dish vessels silently reject reagent drops.
 * BUG-19: dedup log entries — only pass events whose observation is non-empty;
 *         ObservationLog.append() deduplicates by event UUID.
 *
 * Event flow for a reagent drop onto an existing vessel:
 *   1. Resolve reagent from REAGENTS by id.
 *   2. Apply the reagent to vessel.solution (addIons, addSolid, addGas).
 *   3. Call ReactionEngine.process(vessel, reagent) → events[].
 *   4. Apply event side-effects (ionChanges, pptAdded/Removed, gasAdded, colorChange).
 *   5. Recalculate pH.
 *   6. Re-render VesselUI.
 *   7. AnimationManager.playAll(events, vesselEl).
 *   8. ObservationLog.append for each event with a non-empty observation.
 */

import { REAGENTS, SYMBOL_MAP } from '../data/reagents.js';
import { ReactionEngine }  from '../engine/ReactionEngine.js';
import { Vessel }          from '../engine/Vessel.js';
import { VesselUI }        from './VesselUI.js';

/** Minimal unique ID for synthetic log entries. */
function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export class BenchUI {
  /**
   * @param {HTMLElement}   containerEl    — #bench-area element
   * @param {import('./AnimationManager.js').AnimationManager}  animManager
   * @param {import('./ObservationLog.js').ObservationLog}      obsLog
   * @param {import('./DragDropManager.js').DragDropManager}    dragDropManager
   * @param {function(string, 'info'|'error'): void}            showToast
   */
  constructor(containerEl, animManager, obsLog, dragDropManager, showToast) {
    this._containerEl = containerEl;
    this._animManager = animManager;
    this._obsLog       = obsLog;
    this._dm           = dragDropManager;
    this._showToast    = showToast;

    /**
     * 6 fixed slots. Each is either an occupied entry or null (empty).
     * @type {Array<{vessel: import('../engine/Vessel.js').Vessel, vesselUI: VesselUI}|null>}
     */
    this._slots = new Array(6).fill(null);

    /**
     * Ever-incrementing counter for mixture names (BUG-13).
     * Never decremented on vessel removal.
     * @type {number}
     */
    this._mixtureCounter = 0;

    /**
     * Currently selected lab tool ('heat' | 'cool' | 'wash' | null).
     * Set by selectTool(); applied on the next vessel click.
     * @type {string|null}
     */
    this._selectedTool = null;

    /**
     * References to the tool panel <button> elements, set via setToolButtons().
     * @type {NodeList|null}
     */
    this._toolBtns = null;

    this._bindBenchEvents();

    /** @type {import('./DebugLogger.js').DebugLogger|null} */
    this._debugLogger = null;
  }

  /**
   * Attach a DebugLogger instance. Called from debug-main.js after init.
   * @param {import('./DebugLogger.js').DebugLogger} logger
   */
  setDebugLogger(logger) {
    this._debugLogger = logger;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Number of occupied vessel slots. */
  get vesselCount() {
    return this._slots.filter(Boolean).length;
  }

  /**
   * Returns a Map of vesselId → {vessel, vesselUI} for all occupied slots.
   * Used by TestBarUI to resolve a vessel from a drop event.
   * @returns {Map<string, {vessel: import('../engine/Vessel.js').Vessel, vesselUI: VesselUI}>}
   */
  getVesselMap() {
    const map = new Map();
    for (const slot of this._slots) {
      if (slot) map.set(slot.vessel.id, slot);
    }
    return map;
  }

  /**
   * Drop a reagent onto an empty bench area → create a new vessel.
   * This is also called when the user drops directly onto the bench background.
   * @param {Object} reagent  — entry from REAGENTS
   * @returns {VesselUI|null}  null if at capacity
   */
  addVessel(reagent) {
    if (this.vesselCount >= 6) {
      this._showToast('Bench is full — maximum 6 vessels.', 'error');
      return null;
    }

    // Solid reagents go on a watch-glass / solid dish, not a conical flask.
    // 'solid_dish' accepts reagent drops (unlike 'evaporating_dish' which rejects them).
    const vesselType = reagent.category === 'solid' ? 'solid_dish' : 'conical_flask';
    const vessel = new Vessel(SYMBOL_MAP[reagent.id] ?? reagent.label ?? reagent.id, vesselType);

    // Scale the initial reagent exactly like handleDrop does for subsequent additions.
    // Without this, a vessel created from H₂SO₄ (ions:{H+:2}) would add H⁺=2 instead of 0.002.
    const molFactor = (reagent.concentration ?? 1) * 0.001;
    const scaledFirst = {
      ...reagent,
      ions:   Object.fromEntries(
                Object.entries(reagent.ions ?? {}).map(([k, v]) => [k, v * molFactor])
              ),
      solids: reagent.solids?.map(s => ({ ...s, amount: 0.001 })) ?? [],
    };
    this._populateSolution(vessel.solution, scaledFirst);

    const vesselUI = new VesselUI(vessel, this._dm);
    vesselUI.render();

    this._mountVessel(vessel, vesselUI);
    return vesselUI;
  }

  /**
   * Process a reagent drop onto an existing vessel.
   *
   * BUG-14: evaporating_dish vessels silently reject reagent drops.
   *
   * @param {string} vesselId
   * @param {{ type: string, id: string }} dragDetail
   */
  handleDrop(vesselId, dragDetail) {
    const slot = this._slots.find(s => s?.vessel.id === vesselId);
    if (!slot) return;

    // BUG-14: evaporating_dish rejects reagent drops
    if (slot.vessel.type === 'evaporating_dish') {
      this._showToast('Evaporating dishes do not accept reagent drops.', 'error');
      return;
    }

    // Vessel-to-vessel pour: user dragged one vessel label onto another
    if (dragDetail.type === 'vessel') {
      this._pourVesselInto(vesselId, dragDetail.id);
      return;
    }

    // Test tools are handled by TestBarUI at document level — ignore here
    if (dragDetail.type === 'test') return;

    const reagent = REAGENTS.find(r => r.id === dragDetail.id);
    if (!reagent) {
      this._showToast('Unknown reagent.', 'error');
      return;
    }

    // Snapshot before mutation — used by DebugLogger to show diffs
    const ionsBefore = { ...slot.vessel.solution.ions };
    const pptsBefore = slot.vessel.solution.ppts.map(p => p.id ?? p);

    // Name becomes "Mixture N" when a second reagent is combined (BUG-13)
    const isFirstAddition = Object.keys(slot.vessel.solution.ions).length === 0
      && slot.vessel.solution.solids.length === 0;
    if (!isFirstAddition && !slot.vessel.name.startsWith('Mixture')) {
      this._mixtureCounter++;
      slot.vessel.name = `Mixture ${this._mixtureCounter}`;
    }

    // Step 1: run the engine on a clone (BUG-02) to get events
    // Scale reagent ions: stoich coefficient × concentration × 0.001 L = moles added
    const molFactor = (reagent.concentration ?? 1) * 0.001;
    const scaledReagent = {
      ...reagent,
      ions: Object.fromEntries(
        Object.entries(reagent.ions ?? {}).map(([k, v]) => [k, v * molFactor])
      ),
      solids: reagent.solids?.map(s => ({ ...s, amount: 0.001 })) ?? [],
    };
    const events = ReactionEngine.process(slot.vessel, scaledReagent);

    // Step 2: apply the reagent to the LIVE solution (the "pour" step)
    this._populateSolution(slot.vessel.solution, scaledReagent);

    // Step 3: apply all event side-effects to the live solution
    this._applyEvents(slot.vessel.solution, events);

    // Step 4: recalculate pH (BUG-03)
    slot.vessel.solution.recalculatePH();

    // Step 5: re-render vessel
    slot.vesselUI.render();

    // Step 6: play animations simultaneously
    this._animManager.playAll(events, slot.vesselUI.cardEl);

    // Schedule repeating bubble animation for as long as gas is being produced
    if (events.some(ev => ev.gasAdded)) {
      slot._nextBubbleAt = Date.now() + 2500;
    }

    // Step 7: append to observation log (BUG-19)
    for (const ev of events) {
      if (ev.observation) {
        this._obsLog.append({
          id:          ev.id,
          type:        ev.type,
          observation: ev.observation,
          equation:    ev.equation,
          timestamp:   new Date(),
        });
      }
    }

    // Toast if no visible reaction
    const anyObservation = events.some(ev => ev.observation);
    if (!anyObservation) {
      this._showToast('No visible reaction.', 'info');
    }

    // Debug logger hook (only active when DebugLogger is attached)
    if (this._debugLogger) {
      this._debugLogger.log({
        vesselName:   slot.vessel.name,
        reagentLabel: reagent.label ?? reagent.id,
        ionsBefore:   Object.keys(ionsBefore),
        ionsAfter:    Object.keys(slot.vessel.solution.ions),
        pptsBefore,
        pptsAfter:    slot.vessel.solution.ppts.map(p => p.id ?? p),
        events,
      });
    }
  }

  /**
   * Filter a vessel: produces a filtrate evaporating dish (ions + gases only).
   * The source vessel becomes the residue (ppts + solids only, ions cleared).
   * Net: +1 vessel. Aborts with toast if bench is already at 6 (BUG-12).
   *
   * @param {string} vesselId
   */
  filterVessel(vesselId) {
    if (this.vesselCount >= 6) {
      this._showToast('Bench is full — no room for the filtrate vessel.', 'error');
      return;
    }

    const slot = this._slots.find(s => s?.vessel.id === vesselId);
    if (!slot) return;

    const sourceSol = slot.vessel.solution;

    // Build filtrate vessel (evaporating dish with only the liquid portion)
    this._mixtureCounter++;
    const filtrateVessel    = new Vessel(`Filtrate ${this._mixtureCounter}`, 'evaporating_dish');
    const filtrateSol       = filtrateVessel.solution;
    filtrateSol.ions        = { ...sourceSol.ions };
    filtrateSol.gases       = sourceSol.gases.map(g => ({ ...g }));
    filtrateSol.pH          = sourceSol.pH;
    filtrateSol.volumeL     = sourceSol.volumeL;
    filtrateSol._colorOverride = sourceSol._colorOverride;

    // Residue: clear ions/gases from source vessel, keep ppts + solids
    sourceSol.ions  = {};
    sourceSol.gases = [];
    sourceSol._colorOverride = null;
    sourceSol.recalculatePH();
    sourceSol.isFiltered = true;
    slot.vessel.name = `Residue (${slot.vessel.name})`;

    slot.vesselUI.render();

    const filtrateUI = new VesselUI(filtrateVessel, this._dm);
    filtrateUI.render();
    this._mountVessel(filtrateVessel, filtrateUI);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Add reagent's ions, solids and dissolved gas to a solution.
   * @private
   */
  _populateSolution(sol, reagent) {
    sol.volumeL = (sol.volumeL ?? 0) + 0.001;      // +1 cm³ per addition
    sol.addIons(reagent.ions ?? {});               // ions already in moles
    if (Array.isArray(reagent.solids)) {
      // Pass the reagent display colour so VesselUI can draw solid chips (Bug-2).
      for (const s of reagent.solids) sol.addSolid(s.id, s.amount, reagent.color ?? null, s.passivated ?? false);
    }
    if (reagent.dissolvedGas) {
      sol.addGas(reagent.dissolvedGas, 0.75);
    }
  }

  /**
   * Apply event side-effects to the live solution.
   * ionChanges semantics: null ⇒ remove ion; number ⇒ set ion to that value
   * (values are absolute post-reaction concentrations computed from the clone).
   * @private
   */
  _applyEvents(sol, events) {
    for (const ev of events) {
      // Ion changes: null = consume, number = set to absolute value
      for (const [sym, val] of Object.entries(ev.ionChanges ?? {})) {
        if (val === null) {
          sol.removeIon(sym);
        } else {
          sol.setIon(sym, val);
        }
      }

      // Solid removed
      if (ev.solidRemoved) {
        sol.removeSolid(ev.solidRemoved);
      }

      // Solid deposited (displacement reaction — less-reactive metal appears as solid)
      if (ev.solidDeposited) {
        sol.addSolid(ev.solidDeposited.id, ev.solidDeposited.amount, ev.solidDeposited.color);
      }

      // Precipitate added
      if (ev.pptAdded) {
        sol.addPpt(ev.pptAdded);
      }

      // Precipitate removed (complexation dissolves a ppt)
      if (ev.pptRemoved) {
        sol.removePpt(ev.pptRemoved);
      }

      // Gas added
      if (ev.gasAdded) {
        sol.addGas(ev.gasAdded.id, ev.gasAdded.pressure);
      }

      // Explicit colour override (redox, complexation, easter egg)
      if (ev.colorChange?.to) {
        sol.color = ev.colorChange.to;
      }

      // Al₂O₃ passivation state change — clears or sets passivated flag on solid
      if (ev.solidPassivation) {
        const solid = sol.solids.find(s => s.id === ev.solidPassivation.id);
        if (solid) solid.passivated = ev.solidPassivation.passivated;
      }
    }

    // A "colorless" override left by a previous complexation or redox event
    // would permanently mask any strongly-coloured ion added afterwards (e.g.
    // Cu²⁺ appearing blue after Zn(OH)₄²⁻ formed earlier).  Clear it here so
    // the ion-derived colour in Solution.get color() takes over.
    // Distinct meaningful overrides (deep-blue Cu-NH₃ complex, brown MnO₂)
    // use non-transparent values and are intentionally not in this set.
    if (sol._colorOverride === 'rgba(200,220,255,0.10)') {
      sol._colorOverride = null;
    }
  }

  /**
   * Mount a vessel + UI into the first empty slot.
   * @private
   */
  _mountVessel(vessel, vesselUI) {
    const idx = this._slots.findIndex(s => s === null);
    this._slots[idx] = { vessel, vesselUI };
    this._containerEl.appendChild(vesselUI.el);
  }

  // ─── Public tool API ─────────────────────────────────────────────────────

  /**
   * Wire the tool panel <button> elements so BenchUI manages their active state.
   * Called once from main.js after the DOM is ready.
   * @param {NodeList|HTMLElement[]} btns  — .tool-btn elements
   */
  setToolButtons(btns) {
    this._toolBtns = btns;
    for (const btn of btns) {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        // Toggle: clicking active tool deselects it.
        this._selectedTool = (this._selectedTool === tool) ? null : tool;
        this._refreshToolButtons();
      });
    }
  }

  /** @private */
  _refreshToolButtons() {
    if (!this._toolBtns) return;
    for (const b of this._toolBtns) {
      b.classList.toggle('active', b.dataset.tool === this._selectedTool);
    }
  }

  /**
   * Apply the active tool to a vessel, then deselect the tool.
   * @private
   */
  _applyTool(vesselId) {
    const tool = this._selectedTool;
    if (!tool) return;
    this._selectedTool = null;
    this._refreshToolButtons();

    if (tool === 'heat') {
      this._setVesselHeat(vesselId, true);
    } else if (tool === 'cool') {
      this._setVesselHeat(vesselId, false);
    } else if (tool === 'swirl') {
      this._onSwirl(vesselId);
    } else if (tool === 'wash') {
      this._onWash(vesselId);
    }
  }

  /**
   * Apply or remove heat on a vessel, and re-run thermal reactions.
   * @private
   */
  _setVesselHeat(vesselId, isHot) {
    const slot = this._slots.find(s => s?.vessel.id === vesselId);
    if (!slot) return;

    slot.vessel.setHeat(isHot);
    slot.vesselUI.render();

    // ── PbI₂ golden rain heat/cool cycle ─────────────────────────────────
    const sol = slot.vessel.solution;
    if (isHot) {
      const pbi2 = sol.ppts.find(p => p.id === 'pbi2');
      if (pbi2) {
        sol.removePpt('pbi2');
        sol.color = null;   // Pb²⁺ and I⁻ are colourless in solution
        sol._goldenRainReady = true;
        slot.vesselUI.render();
        this._obsLog.append({
          id: _uid(), type: 'dissolution',
          observation: 'On heating, the golden-yellow precipitate dissolved to give a clear, colourless solution.',
          equation: 'PbI₂(s) ⇌ Pb²⁺(aq) + 2I⁻(aq)',
          timestamp: new Date(),
        });
      }
    } else if (sol._goldenRainReady) {
      sol.color = null;
      sol._goldenRainReady = false;
      slot.vesselUI.render();  // render clear solution; ppt builds up gradually below

      // Timing constants mirror _animGoldenRain (FALL_DUR=10000, STAGGER=4500, TOTAL=15000)
      // Crystals begin fading at ~8 000 ms; sediment starts building at the same moment
      // and grows slowly over 7 s, so it fully fills just as the last crystals vanish.
      const SETTLE_START = 8000;
      const SETTLE_DUR   = 7000;

      setTimeout(() => {
        sol.addPpt({ id: 'pbi2', color: '#f5d800', formula: 'PbI₂', label: 'golden yellow' });
        slot.vesselUI.render();
        const pptLayer = slot.vesselUI.cardEl.querySelector('.vessel-ppt');
        if (pptLayer) {
          // Grow from the bottom like settling sediment accumulating
          pptLayer.style.transformOrigin = 'bottom';
          pptLayer.style.transform       = 'scaleY(0)';
          pptLayer.style.opacity         = '0';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            pptLayer.style.transition =
              `transform ${SETTLE_DUR}ms cubic-bezier(0.1, 0, 0.35, 1),` +
              `opacity   ${Math.round(SETTLE_DUR * 0.65)}ms ease-in`;
            pptLayer.style.transform = 'scaleY(1)';
            pptLayer.style.opacity   = '1';
          }));
        }
      }, SETTLE_START);

      this._animManager.play('anim_golden_rain', slot.vesselUI.cardEl).then(() => {
        // Strip inline transition/transform so future render() calls work normally
        const pptLayer = slot.vesselUI.cardEl.querySelector('.vessel-ppt');
        if (pptLayer) {
          pptLayer.style.transition     = '';
          pptLayer.style.transform      = '';
          pptLayer.style.transformOrigin = '';
          pptLayer.style.opacity         = '';
        }
      });
      this._obsLog.append({
        id: _uid(), type: 'precipitation',
        observation: 'On cooling, shimmering golden crystals of lead(II) iodide rained back out of solution — the classic "golden rain" experiment.',
        equation: 'Pb²⁺(aq) + 2I⁻(aq) → PbI₂(s)',
        timestamp: new Date(),
      });
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    if (!isHot) return;  // cooling produces no thermal reactions

    const dummyReagent = { id: '__heat__', ions: {}, solids: [] };
    const events = ReactionEngine.process(slot.vessel, dummyReagent);
    const thermalEvents = events.filter(ev => ev.type === 'gas' || ev.type === 'displacement' || ev.solidRemoved);
    if (thermalEvents.length === 0) return;

    this._applyEvents(slot.vessel.solution, thermalEvents);
    slot.vessel.solution.recalculatePH();
    slot.vesselUI.render();
    this._animManager.playAll(thermalEvents, slot.vesselUI.cardEl);

    for (const ev of thermalEvents) {
      if (ev.observation) {
        this._obsLog.append({
          id:          ev.id,
          type:        ev.type,
          observation: ev.observation,
          equation:    ev.equation,
          timestamp:   new Date(),
        });
      }
    }
  }

  // ─── Bench event delegation ───────────────────────────────────────────────

  /**
   * Bind bench-level event delegation.
   * chemlab:drop on a vessel → handleDrop
   * chemlab:drop on bench floor → addVessel (reagents only)
   * click on a vessel (with tool selected) → _applyTool
   * @private
   */
  _bindBenchEvents() {
    this._containerEl.addEventListener('chemlab:drop', (e) => {
      const detail = e.detail;
      if (!detail) return;

      const vesselCard = e.target.closest('[data-vessel-id]');
      if (vesselCard) {
        this.handleDrop(vesselCard.dataset.vesselId, detail);
      } else if (detail.type === 'reagent') {
        // Dropped on bench background — create a new vessel
        const reagent = REAGENTS.find(r => r.id === detail.id);
        if (reagent) this.addVessel(reagent);
      }
    });

    // Vessel click: apply the active tool (heat/cool/wash) if one is selected.
    this._containerEl.addEventListener('click', (e) => {
      if (!this._selectedTool) return;
      const vessel = e.target.closest('[data-vessel-id]');
      if (!vessel) return;
      this._applyTool(vessel.dataset.vesselId);
    });

    // Register the bench container itself as a drop zone so reagents can be
    // dropped onto the empty bench to create new vessels.
    this._dm.registerDropZone(this._containerEl);
  }

  /**
   * Swirl the vessel — simulates re-introducing dissolved O₂ by shaking.
   * Only has a visible effect when the traffic light indicator is in its reduced
   * (yellow/leuco) state; the IndigoCarmine ion is regenerated and the reverse
   * colour sequence (yellow → amber → red → green → blue) is played.
   * The cycle can be repeated indefinitely as long as glucose is still present.
   * @private
   */
  _onSwirl(vesselId) {
    const slot = this._slots.find(s => s?.vessel.id === vesselId);
    if (!slot) return;

    const sol = slot.vessel.solution;

    // Only reacts if IndigoCarmine has been consumed (i.e. the indicator is
    // in its reduced leuco / yellow state after the traffic light reaction).
    const hasIndigoConsumed = (sol.ions['IndigoCarmine'] ?? 0) <= 0;
    if (!hasIndigoConsumed) return;

    // Restore IndigoCarmine (O₂ from air re-oxidises the leuco form)
    sol.setIon('IndigoCarmine', 1);
    // _colorOverride stays yellow until the animation overrides it;
    // the REDOX rule will re-consume IndigoCarmine + glucose on the next drop.
    // For swirl we don't run a full process() — we just drive the visual cycle.

    const observation =
      'The vessel was swirled, dissolving oxygen from the air. '
      + 'The indicator was re-oxidised, cycling back through green, red, and amber '
      + 'before returning to deep blue.';

    this._obsLog.append({
      id:          `swirl-${Date.now()}`,
      type:        'redox',
      observation,
      equation:    'leuco-indigo carmine + O₂ → indigo carmine (blue)',
      timestamp:   new Date(),
    });

    // Play reverse animation — blue is the final colorChange.to in the animation,
    // so the liquid layer will end in the correct deep-blue state.
    this._animManager.play('anim_traffic_light_reverse', slot.vesselUI.cardEl);
  }

  /**
   * Handle vessel wash (discard) requested by VesselUI.
   * Asks for confirmation before removing.
   * @private
   */
  _onWash(vesselId) {
    const idx = this._slots.findIndex(s => s?.vessel.id === vesselId);
    if (idx === -1) return;

    const name = this._slots[idx].vessel.name;
    if (!window.confirm(`Wash and discard "${name}"?\nThis cannot be undone.`)) return;

    const { vesselUI } = this._slots[idx];
    this._dm.unregisterDropZone(vesselUI.el);
    vesselUI.el.remove();
    this._slots[idx] = null;
  }



  /**
   * Pour the full contents of the source vessel into the target vessel.
   * Runs chemistry, plays animations, removes the empty source vessel.
   * @private
   */
  _pourVesselInto(targetId, sourceId) {
    if (targetId === sourceId) return;

    const targetSlot = this._slots.find(s => s?.vessel.id === targetId);
    const sourceSlot = this._slots.find(s => s?.vessel.id === sourceId);
    if (!targetSlot || !sourceSlot) return;

    if (targetSlot.vessel.type === 'evaporating_dish') {
      this._showToast('Evaporating dishes do not accept vessel drops.', 'error');
      return;
    }

    const sourceSol = sourceSlot.vessel.solution;

    // Synthetic reagent representing the poured vessel’s dissolved contents
    const syntheticReagent = {
      id:    '__vessel_pour__',
      ions:  { ...sourceSol.ions },
      solids: sourceSol.solids.map(s => ({ ...s })),
      dissolvedGas: null,
    };

    // Rename target to Mixture N when two populated vessels are combined
    if (!targetSlot.vessel.name.startsWith('Mixture')) {
      this._mixtureCounter++;
      targetSlot.vessel.name = `Mixture ${this._mixtureCounter}`;
    }

    // Run the engine on clone so events are generated
    const events = ReactionEngine.process(targetSlot.vessel, syntheticReagent);

    // Pour — transfer all constituents from source to target (live solution)
    targetSlot.vessel.solution.addIons(sourceSol.ions);
    for (const solid of sourceSol.solids) {
      targetSlot.vessel.solution.addSolid(solid.id, solid.amount, solid.color ?? null);
    }
    for (const ppt of sourceSol.ppts) {
      targetSlot.vessel.solution.addPpt(ppt);
    }
    for (const gas of sourceSol.gases) {
      targetSlot.vessel.solution.addGas(gas.id, gas.pressure);
    }

    // Apply reaction event side-effects
    this._applyEvents(targetSlot.vessel.solution, events);
    targetSlot.vessel.solution.recalculatePH();

    // Re-render, animate, log
    targetSlot.vesselUI.render();
    this._animManager.playAll(events, targetSlot.vesselUI.cardEl);

    if (events.some(ev => ev.gasAdded)) {
      targetSlot._nextBubbleAt = Date.now() + 2500;
    }

    for (const ev of events) {
      if (ev.observation) {
        this._obsLog.append({
          id:          ev.id,
          type:        ev.type,
          observation: ev.observation,
          equation:    ev.equation,
          timestamp:   new Date(),
        });
      }
    }

    if (!events.some(ev => ev.observation)) {
      this._showToast('No visible reaction.', 'info');
    }

    // Discard the now-empty source vessel silently
    this._removeVessel(sourceId);
  }

  /**
   * Remove a vessel from the bench without confirmation.
   * Used internally after vessel-to-vessel pouring.
   * @private
   */
  _removeVessel(vesselId) {
    const idx = this._slots.findIndex(s => s?.vessel.id === vesselId);
    if (idx === -1) return;
    const { vesselUI } = this._slots[idx];
    this._dm.unregisterDropZone(vesselUI.el);
    vesselUI.el.remove();
    this._slots[idx] = null;
  }

  /**
   * Decay gas pressure on all occupied vessels each animation frame.
   * Calls tickGasPressure on solution, then updates gas indicator only
   * (avoids a full re-render on every frame). Bug-4.
   * @param {number} deltaSeconds  elapsed seconds since last frame (capped at 0.1 s)
   */
  tick(deltaSeconds) {
    const now = Date.now();
    for (const slot of this._slots) {
      if (!slot) continue;
      const sol = slot.vessel.solution;

      if (sol.gases.length > 0) {
        sol.tickGasPressure(deltaSeconds);
        slot.vesselUI.updateGasOnly();
      }

      // Aerial oxidation: Fe²⁺ → Fe³⁺ on standing (pale green → reddish-brown)
      // Also covers Fe(OH)₂ ppt (green → reddish-brown Fe(OH)₃).
      if ((sol.ions['Fe2+'] ?? 0) > 0 || sol.ppts.some(p => p.id === 'fe_oh2')) {
        if (sol.tickFe2Oxidation(deltaSeconds)) {
          slot.vesselUI.updateLiquidOnly();
        }
      }

      // Re-fire bubble animation periodically while gas remains
      if (slot._nextBubbleAt !== undefined) {
        if (sol.gases.length === 0) {
          slot._nextBubbleAt = undefined;
        } else if (now >= slot._nextBubbleAt) {
          this._animManager.play('anim_bubbles', slot.vesselUI.cardEl, {});
          slot._nextBubbleAt = now + 2500;
        }
      }
    }
  }
}
