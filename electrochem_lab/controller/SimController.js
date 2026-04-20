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
 *   7. (Phase 6) Delegate to ECCellController when in 'eccell' mode.
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
   * @param {import('./ECCellController.js').ECCellController} [opts.ecCellController]
   */
  constructor({ canvas, svg, testPanel, obsPanel, animLayer, setStatus, showToast, ecCellController = null }) {
    this._canvas         = canvas;
    this._svg            = svg;
    this._testPanel      = testPanel;
    this._obsPanel       = obsPanel;
    this._animLayer      = animLayer;
    this._setStatus      = setStatus;
    this._showToast      = showToast;
    this._ecCellCtrl     = ecCellController;

    this._config      = CurriculumConfig.O_LEVEL();
    this._electrolyte = null;
    this._lastResult  = null;
    this._anodeNode   = null;
    this._cathodeNode = null;
    this._mode        = 'electrolysis';   // 'electrolysis' | 'eccell'

    this._lastLoggedKey = null;

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
   * Switch between simulation modes.
   * @param {'electrolysis'|'eccell'} mode
   */
  setMode(mode) {
    if (mode === this._mode) return;
    this._mode = mode;
    if (this._ecCellCtrl) this._ecCellCtrl.setConfig(this._config);
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

  // ── Event binding ───────────────────────────────────────────────────────

  _bindEvents() {
    this._svg.addEventListener('topology-changed', () => this._onTopologyChanged());
    this._svg.addEventListener('canvas:toast', e => this._showToast(e.detail.msg));
  }

  // ── Topology handler ────────────────────────────────────────────────────

  _onTopologyChanged() {
    const validity = CircuitValidator.validate({
      battery:     this._canvas.batteryNode,
      nodes:       this._canvas.nodes,
      wires:       this._canvas.wires,
      beaker:      this._canvas.beakerNode,
      electrolyte: this._electrolyte,
    });

    this._canvas.setLive(validity.isValid);

    if (validity.isValid) {
      this._canvas.setPolarity(validity.anode.id, validity.cathode.id);
      this._anodeNode   = validity.anode;
      this._cathodeNode = validity.cathode;
      this._run();
    } else {
      this._anodeNode   = null;
      this._cathodeNode = null;
      this._lastResult  = null;
      this._canvas.setPolarity(null, null);
      this._testPanel.disable();
      this._animLayer.stop();
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
      this._testPanel.disable();
      this._animLayer.stop();
      this._setStatus('Select an electrolyte below to start the simulation.', 'status-hint');
      return;
    }

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
      this._obsPanel.appendRun({
        electrolyte: this._electrolyte.formula,
        anodeName:   this._anodeNode.data.name,
        cathodeName: this._cathodeNode.data.name,
        observations: result.getObservations(),
        equations:    result.getEquations(this._config),
      });
    }

    this._setStatus(
      `Running · ${this._anodeNode.data.name} (+) / ${this._cathodeNode.data.name} (−) · ${this._electrolyte.formula}`,
      'status-ok',
    );

    this._startAnimation(result);
  }

  // ── Animation ───────────────────────────────────────────────────────────

  _startAnimation(result) {
    // Resolve ElectrodeNode instances from the canvas nodes map
    const anodeNode   = this._canvas.nodes.get(this._anodeNode.id);
    const cathodeNode = this._canvas.nodes.get(this._cathodeNode.id);
    if (!anodeNode || !cathodeNode) return;

    // terminalPositions is a Map<id, {x, y, ...}> in SVG viewport coords.
    // Since SVG fills #circuit-wrap without a viewBox, viewport coords
    // equal wrap-local pixel coords — pass them straight to AnimationLayer.
    const anodeTerms   = anodeNode.terminalPositions;
    const cathodeTerms = cathodeNode.terminalPositions;

    const anodeBot   = anodeTerms.get('rod_bottom');
    const cathodeBot = cathodeTerms.get('rod_bottom');
    if (!anodeBot || !cathodeBot) return;

    this._animLayer.start({
      anodeProduct:   result.anodeProduct,
      cathodeProduct: result.cathodeProduct,
      anodePos:   { x: anodeBot.x,   y: anodeBot.y   },
      cathodePos: { x: cathodeBot.x, y: cathodeBot.y },
    });
  }
}
