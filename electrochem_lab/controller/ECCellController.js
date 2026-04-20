/**
 * controller/ECCellController.js
 * Galvanic cell mode controller — A-Level only.
 *
 * Responsibilities:
 *   1. Accept left/right half-cell changes from ECCellPanel.
 *   2. When both half-cells are set, run ECCellEngine.
 *   3. Update the VoltmeterNode with the computed EMF.
 *   4. Append a run to ObsPanel when the half-cell combination changes.
 *   5. Update the circuit SVG beaker colours and electrode rod colours.
 *
 * This controller does NOT manage the SVG canvas topology — that belongs to
 * ECCellCanvas. It receives a reference to the VoltmeterNode and uses its
 * public setEMF() method.
 */

import { ECCellEngine }   from '../engine/ECCellEngine.js';
import { ELECTRODE_DB }   from '../data/electrodes.js';

export class ECCellController {
  /**
   * @param {object} opts
   * @param {import('../circuit/VoltmeterNode.js').VoltmeterNode}       opts.voltmeter
   * @param {import('../circuit/ECCellCanvas.js').ECCellCanvas}         opts.ecCellCanvas
   * @param {import('../ui/ObsPanel.js').ObsPanel}                      opts.obsPanel
   * @param {import('../engine/CurriculumConfig.js').CurriculumConfig}  opts.config
   * @param {Function} opts.setStatus    — setStatus(msg, cssClass) → void
   * @param {Function} opts.showToast    — showToast(msg) → void
   */
  constructor({ voltmeter, ecCellCanvas, obsPanel, config, setStatus, showToast }) {
    this._voltmeter    = voltmeter;
    this._ecCanvas     = ecCellCanvas;
    this._obsPanel     = obsPanel;
    this._config       = config;
    this._setStatus    = setStatus;
    this._showToast    = showToast;

    /** @type {{ electrodeId, ionId, concentration, label, colour }|null} */
    this._leftHalfCell  = null;
    /** @type {{ electrodeId, ionId, concentration, label, colour }|null} */
    this._rightHalfCell = null;

    this._lastLogKey = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Called by ECCellPanel's onLeftChange callback. */
  setLeftHalfCell(halfCell) {
    this._leftHalfCell = halfCell;
    this._ecCanvas?.setLeftHalfCell(halfCell);
    this._run();
  }

  /** Called by ECCellPanel's onRightChange callback. */
  setRightHalfCell(halfCell) {
    this._rightHalfCell = halfCell;
    this._ecCanvas?.setRightHalfCell(halfCell);
    this._run();
  }

  /** Update the CurriculumConfig (e.g., if user changes temperature). */
  setConfig(config) {
    this._config = config;
    this._lastLogKey = null;   // force a new obs entry
    this._run();
  }

  // ── Computation ─────────────────────────────────────────────────────────

  _run() {
    if (!this._leftHalfCell || !this._rightHalfCell) {
      this._voltmeter?.setEMF(null);
      this._setStatus(
        this._leftHalfCell
          ? 'Select a right half-cell to see the EMF.'
          : 'Select both half-cells to compute the EMF.',
        ''
      );
      return;
    }

    let result;
    try {
      result = ECCellEngine.run(
        this._leftHalfCell,
        this._rightHalfCell,
        this._config,
      );
    } catch (err) {
      this._setStatus(`EC Cell error: ${err.message}`, 'status--error');
      return;
    }

    // Update voltmeter
    this._voltmeter?.setEMF(result.EMF);

    // Update canvas polarity labels
    this._ecCanvas?.setPolarity(result.anodeCell.electrodeId, result.cathodeCell.electrodeId);

    // Status bar
    this._setStatus(result.getEMFDisplay(this._config), 'status--live');

    // Obs log — de-duplicate
    const logKey = `${this._leftHalfCell.electrodeId}|${this._leftHalfCell.concentration.toFixed(3)}`
                 + `|${this._rightHalfCell.electrodeId}|${this._rightHalfCell.concentration.toFixed(3)}`;
    if (logKey === this._lastLogKey) return;
    this._lastLogKey = logKey;

    const equations = result.getEquations(this._config);
    this._obsPanel.appendECCellRun({
      leftLabel:  this._leftHalfCell.label,
      rightLabel: this._rightHalfCell.label,
      result,
      equations,
      config: this._config,
    });
  }
}
