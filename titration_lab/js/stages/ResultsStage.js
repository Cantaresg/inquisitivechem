/**
 * ResultsStage — read-only summary of all titration runs.
 *
 * Computes from labState.runs (written by TitrateStage.recordResult()):
 *   • Mean titre from the best concordant group (all within 0.10 mL).
 *   • Unknown analyte concentration in openLab mode (n₁V₁ = n₂V₂).
 *
 * validate() always passes — the student has already completed the titration.
 *
 * `results` is a plain-object getter safe to serialise (e.g. to CSV).
 */

import { Stage } from './Stage.js';

export class ResultsStage extends Stage {
  constructor(deps) {
    super('results', 'Results', deps);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  enter() {
    this._cleanupBus();
  }

  exit() {
    this._cleanupBus();
  }

  // ── Phase 4: UI rendering ─────────────────────────────────────────────────

  renderArea(el) {
    const { runs, concordant, meanTitre, unknownConc } = this.results;
    const concSet = new Set(concordant.map(r => r.runNumber));

    const rows = runs.map(r => `
      <tr class="${r.isRough ? 'rough' : (concSet.has(r.runNumber) ? 'concordant' : '')}">
        <td>${r.isRough ? 'R' : r.runNumber}</td>
        <td>${r.initialReading.toFixed(2)}</td>
        <td>${r.finalReading.toFixed(2)}</td>
        <td>${r.titre.toFixed(2)}</td>
      </tr>`).join('');

    const calcRows = [
      { label: 'Mean titre',          value: meanTitre > 0 ? meanTitre.toFixed(2) + ' mL' : '—' },
      { label: '[Titrant]',            value: this._state.titrantConc ? this._state.titrantConc.toFixed(4) + ' M' : '—' },
      { label: 'Analyte volume',       value: (this._flask.volume ?? 25).toFixed(2) + ' mL' },
      { label: 'Calculated [Analyte]', value: unknownConc !== null ? unknownConc.toFixed(4) + ' M' : (this._state.analyteConc?.toFixed(4) + ' M' ?? '—') },
    ];

    el.innerHTML = `
      <div style="width:100%;max-width:700px;padding:24px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;max-height:100%;">

        <div>
          <div class="panel-section-title">Titration Runs</div>
          <table class="results-table">
            <thead>
              <tr><th>Run</th><th>Initial / mL</th><th>Final / mL</th><th>Titre / mL</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            ${meanTitre > 0 ? `
            <tfoot>
              <tr><td colspan="3">Mean titre (concordant)</td><td>${meanTitre.toFixed(2)} mL</td></tr>
            </tfoot>` : ''}
          </table>
          <div style="font-size:10px;color:var(--muted);margin-top:6px;">
            <span style="color:var(--accent3);">■</span> Concordant &nbsp;
            <span style="color:var(--muted);">■</span> Rough / discordant
          </div>
        </div>

        <div>
          <div class="panel-section-title">Calculations</div>
          ${calcRows.map(r => `
          <div class="calc-row">
            <span class="calc-label">${r.label}</span>
            <span class="calc-value">${r.value}</span>
          </div>`).join('')}
        </div>

      </div>`;
  }

  renderControls(el) {
    el.innerHTML = `<div style="font-size:11px;color:var(--accent3);">✓ Titration complete. Review your results above.</div>`;
  }

  // ── Data access ───────────────────────────────────────────────────────────

  /**
   * Compute the results summary.
   *
   * @returns {{
   *   runs:        import('./TitrateStage.js').RunRecord[],
   *   concordant:  import('./TitrateStage.js').RunRecord[],
   *   meanTitre:   number,
   *   unknownConc: number|null
   * }}
   */
  get results() {
    const allRuns  = this._state.runs ?? [];
    const accurate = allRuns.filter(r => !r.isRough);
    const concordant = this._findConcordant(accurate);

    const meanTitre = concordant.length > 0
      ? concordant.reduce((sum, r) => sum + r.titre, 0) / concordant.length
      : 0;

    // openLab: derive unknown analyte concentration via n₁V₁ = n₂V₂
    let unknownConc = null;
    if (this._state.mode === 'openLab' && meanTitre > 0) {
      const { titrantConc } = this._state;
      const flaskVolMl = this._flask.volume;   // mL (analyte volume, fixed)
      if (titrantConc && flaskVolMl > 0) {
        // n(titrant) = c(titrant) × V(titre in dm³)
        // c(analyte) = n(titrant) / V(flask in dm³)
        const nTitrant = titrantConc * (meanTitre / 1000);
        unknownConc    = nTitrant / (flaskVolMl / 1000);   // mol dm⁻³
      }
    }

    return { runs: allRuns, concordant, meanTitre, unknownConc };
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /** Final stage — always passable. */
  validate() {
    this._markComplete();
    return { ok: true, reason: '' };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /**
   * Return the largest subset of runs where all titres are within 0.10 mL
   * of each other.  Uses a sliding window over sorted titres.
   * @param {import('./TitrateStage.js').RunRecord[]} runs
   * @returns {import('./TitrateStage.js').RunRecord[]}
   */
  _findConcordant(runs) {
    if (runs.length < 2) return [...runs];
    const sorted = [...runs].sort((a, b) => a.titre - b.titre);
    let best = [];
    for (let i = 0; i < sorted.length; i++) {
      const window = [sorted[i]];
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j].titre - sorted[i].titre <= 0.10) window.push(sorted[j]);
        else break;
      }
      if (window.length > best.length) best = window;
    }
    return best;
  }
}
