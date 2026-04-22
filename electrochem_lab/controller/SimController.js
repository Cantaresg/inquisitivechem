/**
 * controller/SimController.js
 * Central simulation orchestrator (Phases 4–6).
 *
 * Responsibilities:
 *   1. Listen to 'topology-changed' events on the SVG.
 *   2. Run CircuitValidator to determine if the circuit is complete.
 *   3. When valid AND an electrolyte is selected, run ElectrolysisEngine.
 *   4. Push results to TestPanel, ObsPanel, and AnimationLayer.
 *   5. Expose setElectrolyte() and setLevel() for UI callbacks.
 *   6. Forward canvas:toast events to the toast system.
 *   7. Handle galvanic-cell mode when battery is toggled off.
 *
 * De-duplication: the obs log only appends when the combination of
 * {electrolyteId, concentration, anodeId, cathodeId, level} changes,
 * preventing duplicate entries on re-validation of the same circuit.
 */

import { CircuitValidator }    from '../circuit/CircuitValidator.js';
import { ElectrolysisEngine }  from '../engine/ElectrolysisEngine.js';
import { CurriculumConfig }    from '../engine/CurriculumConfig.js';

export class SimController {
  /**
   * @param {object} opts
   * @param {import('../circuit/CircuitCanvas.js').CircuitCanvas}          opts.canvas
   * @param {SVGElement}   opts.svg
   * @param {import('../ui/TestPanel.js').TestPanel}                        opts.testPanel
   * @param {import('../ui/ObsPanel.js').ObsPanel}                         opts.obsPanel
   * @param {import('../ui/AnimationLayer.js').AnimationLayer}             opts.animLayer
   * @param {Function} opts.setStatus    — setStatus(msg: string, cssClass: string) → void
   * @param {Function} opts.showToast    — showToast(msg: string) → void
   */
  constructor({ canvas, svg, testPanel, obsPanel, animLayer, setStatus, showToast }) {
    this._canvas         = canvas;
    this._svg            = svg;
    this._testPanel      = testPanel;
    this._obsPanel       = obsPanel;
    this._animLayer      = animLayer;
    this._setStatus      = setStatus;
    this._showToast      = showToast;

    this._config      = CurriculumConfig.O_LEVEL();
    this._electrolyte = null;
    this._lastResult  = null;
    this._anodeNode   = null;
    this._cathodeNode = null;
    this._isGalvanic  = false;
    this._reactionMode = 'v1';
    this._lastAnimationKey = null;

    this._lastLoggedKey = null;

    this._animLayer.setDebugListener(snapshot => this._testPanel.setPhaseDebug(snapshot));

    this._bindEvents();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Switch curriculum config (O_LEVEL | A_LEVEL). Re-runs engine if valid. */
  setLevel(level) {
    this._config = level === 'A_LEVEL'
      ? CurriculumConfig.A_LEVEL()
      : CurriculumConfig.O_LEVEL();
    this._obsPanel.setConfig({ level });
    // Force a new obs entry when level changes
    this._lastLoggedKey = null;
    this._run();
  }


  /**
   * Called by ElectrolytePanel when a card is selected or the slider moves.
   * @param {object | null} record — ELECTROLYTE_DB record with live concentration
   */
  setElectrolyte(record) {
    this._electrolyte = record;
    // Update beaker liquid colour immediately
    this._canvas.setElectrolyte(record);
    this._run();
  }

  /**
   * Called by TestPanel when the student runs a chemical test.
   * Appends the test result to the obs log.
   * @param {import('../engine/TestEngine.js').TestResult} testResult
   */
  onTestResult(testResult) {
    this._obsPanel.appendTestResult(testResult);
  }

  /** Select how electrode-position persistence should behave during reactions. */
  setReactionMode(mode) {
    this._reactionMode = ['v1', 'v2', 'v3'].includes(mode) ? mode : 'v1';
    this._applyReactionLock();
  }

  /** Download the current phase-one debug trace. */
  exportPhaseDebugTrace() {
    return this._animLayer.downloadDebugTrace();
  }

  // ── Event binding ───────────────────────────────────────────────────────

  _bindEvents() {
    this._svg.addEventListener('topology-changed', () => this._onTopologyChanged());
    this._svg.addEventListener('canvas:toast', e => this._showToast(e.detail.msg));
  }

  // ── Topology handler ────────────────────────────────────────────────────

  _onTopologyChanged() {
    const validity = CircuitValidator.validate({
      battery:        this._canvas.batteryNode,
      nodes:          this._canvas.nodes,
      wires:          this._canvas.wires,
      beaker:         this._canvas.beakerNode,
      electrolyte:    this._electrolyte,
      batteryEnabled: this._canvas.batteryEnabled,
    });

    this._canvas.setLive(validity.isValid);

    if (validity.isValid) {
      this._canvas.setPolarity(validity.anode.id, validity.cathode.id);
      this._anodeNode   = validity.anode;
      this._cathodeNode = validity.cathode;
      this._isGalvanic  = validity.isGalvanic;
      this._run();
    } else {
      this._anodeNode   = null;
      this._cathodeNode = null;
      this._isGalvanic  = false;
      this._lastResult  = null;
      this._canvas.setPolarity(null, null);
      this._applyReactionLock();
      this._testPanel.disable();
      this._animLayer.stop();
      this._lastAnimationKey = null;
      const hint = validity.errors.find(Boolean) ?? '';
      this._setStatus(
        hint || 'Assemble the circuit to run the simulation.',
        'status-hint',
      );
    }
  }

  // ── Engine run ──────────────────────────────────────────────────────────

  _run() {
    // Need both a complete circuit and a selected electrolyte
    if (!this._anodeNode || !this._cathodeNode) return;

    if (!this._electrolyte) {
      this._applyReactionLock();
      this._testPanel.disable();
      this._animLayer.stop();
      this._lastAnimationKey = null;
      this._setStatus('Select an electrolyte below to start the simulation.', 'status-hint');
      return;
    }

    // ── Run engine (reactions occur in both galvanic and electrolytic cells) ─
    let result;
    try {
      result = ElectrolysisEngine.run(
        this._electrolyte,
        this._anodeNode.data,
        this._cathodeNode.data,
        this._config,
      );
    } catch (err) {
      console.error('[SimController] ElectrolysisEngine error:', err);
      return;
    }

    this._lastResult = result;

    // Update test panel
    this._testPanel.setResult(result, this._electrolyte);

    // Append to obs log only when something meaningful changed
    const logKey = [
      this._electrolyte.id,
      this._electrolyte.concentration.toFixed(1),
      this._anodeNode.id,
      this._cathodeNode.id,
      this._config.level,
    ].join('|');

    if (logKey !== this._lastLoggedKey) {
      this._lastLoggedKey = logKey;
      let equations     = { cathode: '—', anode: '—' };
      let halfEquations = { cathode: '—', anode: '—' };
      try {
        equations     = result.getEquations(this._config);
        halfEquations = result.getEquations({ showHalfEquations: true });
      } catch (err) {
        console.error('[SimController] getEquations error:', err);
      }
      try {
        this._obsPanel.appendRun({
          electrolyte:  this._electrolyte.formula,
          anodeName:    this._anodeNode.data.name,
          cathodeName:  this._cathodeNode.data.name,
          observations: result.getObservations(),
          equations,
          halfEquations,
        });
      } catch (err) {
        console.error('[SimController] appendRun error:', err);
      }
    }

    // Status bar differs for galvanic vs electrolysis mode
    if (!this._canvas.batteryEnabled || this._isGalvanic) {
      const eAnode   = this._anodeNode.data?.standardPotential ?? 0;
      const eCathode = this._cathodeNode.data?.standardPotential ?? 0;
      const emf      = Math.abs(eCathode - eAnode).toFixed(2);
      this._setStatus(
        `Galvanic cell · ${this._anodeNode.data.name} (−) / ${this._cathodeNode.data.name} (+) · EMF = ${emf} V`,
        'status-ok',
      );
    } else {
      this._setStatus(
        `Running · ${this._anodeNode.data.name} (+) / ${this._cathodeNode.data.name} (−) · ${this._electrolyte.formula}`,
        'status-ok',
      );
    }

    this._applyReactionLock();

    const animationKey = this._buildAnimationKey(result);
    const canReanchor = this._reactionMode === 'v2'
      && this._animLayer.isRunning
      && this._lastAnimationKey === animationKey;

    if (canReanchor) {
      this._updateAnimationAnchors();
    } else {
      this._startAnimation(result);
      this._lastAnimationKey = animationKey;
    }
  }

  _applyReactionLock() {
    const shouldLock = this._reactionMode === 'v3'
      && Boolean(this._anodeNode)
      && Boolean(this._cathodeNode)
      && Boolean(this._electrolyte);
    this._canvas.setReactionLock(shouldLock);
  }

  _buildAnimationKey(result) {
    return [
      this._config.level,
      this._electrolyte?.id ?? 'none',
      Number(this._electrolyte?.concentration ?? 0).toFixed(3),
      this._anodeNode?.data?.id ?? 'none',
      this._cathodeNode?.data?.id ?? 'none',
      result?.anodeProduct?.id ?? 'none',
      result?.cathodeProduct?.id ?? 'none',
    ].join('|');
  }

  // ── Animation ───────────────────────────────────────────────────────────

  _updateAnimationAnchors() {
    const anodeNode   = this._canvas.nodes.get(this._anodeNode.id);
    const cathodeNode = this._canvas.nodes.get(this._cathodeNode.id);
    const beakerNode  = this._canvas.beakerNode;
    if (!anodeNode || !cathodeNode || !beakerNode) return;

    const anodeBot   = anodeNode.terminalPositions.get('rod_bottom');
    const cathodeBot = cathodeNode.terminalPositions.get('rod_bottom');
    if (!anodeBot || !cathodeBot) return;

    this._animLayer.updateAnchors({
      electrolyte: this._electrolyte,
      anodeElectrode: this._anodeNode.data,
      cathodeElectrode: this._cathodeNode.data,
      anodePos: { x: anodeBot.x, y: anodeBot.y },
      cathodePos: { x: cathodeBot.x, y: cathodeBot.y },
      beakerBounds: beakerNode.getLiquidBoundsWorld(),
    });
  }

  _startAnimation(result) {
    // Resolve ElectrodeNode instances from the canvas nodes map
    const anodeNode   = this._canvas.nodes.get(this._anodeNode.id);
    const cathodeNode = this._canvas.nodes.get(this._cathodeNode.id);
    const beakerNode  = this._canvas.beakerNode;
    if (!anodeNode || !cathodeNode || !beakerNode) {
      console.warn('[SimController] Animation skipped: missing node or beaker.', {
        hasAnodeNode: Boolean(anodeNode),
        hasCathodeNode: Boolean(cathodeNode),
        hasBeakerNode: Boolean(beakerNode),
      });
      return;
    }

    // terminalPositions is a Map<id, {x, y, ...}> in SVG viewport coords.
    // Since SVG fills #circuit-wrap without a viewBox, viewport coords
    // equal wrap-local pixel coords — pass them straight to AnimationLayer.
    const anodeTerms   = anodeNode.terminalPositions;
    const cathodeTerms = cathodeNode.terminalPositions;

    const anodeBot   = anodeTerms.get('rod_bottom');
    const cathodeBot = cathodeTerms.get('rod_bottom');
    if (!anodeBot || !cathodeBot) {
      console.warn('[SimController] Animation skipped: missing rod_bottom terminal.', {
        hasAnodeBottom: Boolean(anodeBot),
        hasCathodeBottom: Boolean(cathodeBot),
      });
      return;
    }

    this._animLayer.start({
      result,
      electrolyte: this._electrolyte,
      anodeElectrode: this._anodeNode.data,
      cathodeElectrode: this._cathodeNode.data,
      anodePos:   { x: anodeBot.x,   y: anodeBot.y   },
      cathodePos: { x: cathodeBot.x, y: cathodeBot.y },
      beakerBounds: beakerNode.getLiquidBoundsWorld(),
    });
  }
}
