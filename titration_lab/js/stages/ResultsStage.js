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
    const concSet  = new Set(concordant.map(r => r.runNumber));
    const warnings = (this._state.actionLog ?? []).filter(e => e.level === 'warn');

    const rows = runs.map(r => `
      <tr class="${r.isRough ? 'rough' : (concSet.has(r.runNumber) ? 'concordant' : '')}">
        <td>${r.isRough ? 'R' : r.runNumber}</td>
        <td>${r.initialReading.toFixed(2)}</td>
        <td>${r.finalReading.toFixed(2)}</td>
        <td>${r.titre.toFixed(2)}</td>
      </tr>`).join('');

    const titrantConc  = this._state.titrantConc;
    const analyteVolMl = this._flask.volume ?? 25;
    const analConcVal  = unknownConc !== null ? unknownConc : (this._state.analyteConc ?? null);
    const analConcStr  = analConcVal !== null ? analConcVal.toFixed(4) + ' M' : '—';

    const mistakesHtml = warnings.length === 0
      ? `<div style="color:var(--muted);font-size:11px;">No errors recorded — well done!</div>`
      : warnings.map(w => `
          <div style="margin-bottom:8px;padding:6px 8px;background:rgba(255,180,0,0.07);border-left:2px solid rgba(255,180,0,0.4);border-radius:3px;">
            <div style="font-size:11px;color:rgba(255,200,60,0.9);">${w.action}</div>
            ${w.detail ? `<div style="font-size:10px;color:var(--muted);margin-top:2px;">${w.detail}</div>` : ''}
          </div>`).join('');

    el.innerHTML = `
      <div id="results-main" style="width:100%;max-width:700px;padding:24px;display:flex;flex-direction:column;gap:20px;overflow-y:auto;max-height:100%;">

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
          <div class="calc-row">
            <span class="calc-label">Mean titre</span>
            <span class="calc-value">${meanTitre > 0 ? meanTitre.toFixed(2) + ' mL' : '—'}</span>
          </div>
          <div class="calc-row">
            <span class="calc-label">[${this._state.titrant?.formula ?? 'Titrant'}]</span>
            <span class="calc-value">${titrantConc ? titrantConc.toFixed(4) + ' M' : '—'}</span>
          </div>
          <div class="calc-row">
            <span class="calc-label">Analyte volume</span>
            <span class="calc-value">${analyteVolMl.toFixed(2)} mL</span>
          </div>
          <div class="calc-row" id="analyte-conc-row">
            <span class="calc-label">[${this._state.analyte?.formula ?? 'Analyte'}]</span>
            <span class="calc-value">
              <span id="analyte-conc-hidden" style="display:inline-flex;align-items:center;gap:8px;">
                <span style="color:var(--muted);font-size:11px;">Calculate this yourself</span>
                <button class="btn" id="reveal-analyte-btn" style="font-size:10px;padding:2px 8px;">Reveal</button>
              </span>
              <span id="analyte-conc-value" style="display:none;">${analConcStr}</span>
            </span>
          </div>
        </div>

        <div>
          <div class="panel-section-title">Mistakes &amp; Warnings</div>
          ${mistakesHtml}
        </div>

        <div style="display:flex;gap:10px;padding-bottom:8px;">
          <button class="btn" id="dl-report-btn">⬇ Download Report</button>
        </div>

      </div>`;

    document.getElementById('reveal-analyte-btn')?.addEventListener('click', () => {
      document.getElementById('analyte-conc-hidden').style.display = 'none';
      document.getElementById('analyte-conc-value').style.display  = 'inline';
    });

    document.getElementById('dl-csv-btn')?.addEventListener('click', () => {
      this._downloadCSV(runs, concordant, meanTitre, titrantConc, analyteVolMl, analConcVal, warnings);
    });

    document.getElementById('dl-report-btn')?.addEventListener('click', () => {
      this._downloadReport(runs, concordant, meanTitre, titrantConc, analyteVolMl, analConcVal, warnings);
    });
  }

  renderControls(el) {
    el.innerHTML = `<div style="font-size:11px;color:var(--accent3);">✓ Titration complete. Review your results above.</div>`;
    const restartBtn = document.createElement('button');
    restartBtn.className = 'btn';
    restartBtn.style.cssText = 'margin-left:auto;';
    restartBtn.textContent = '↺ New lab session';
    restartBtn.addEventListener('click', () => {
      sessionStorage.removeItem('titrationLabConfig');
      location.replace('landing.html');
    });
    el.appendChild(restartBtn);
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

  _downloadReport(runs, concordant, meanTitre, titrantConc, analyteVolMl, analConcVal, warnings) {
    const concSet = new Set(concordant.map(r => r.runNumber));
    const titrantName  = this._state.titrant?.name  ?? 'Titrant';
    const analyteName  = this._state.analyte?.name  ?? 'Analyte';
    const indicatorName = this._state.indicator?.name ?? '—';
    const date = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });

    const runRows = runs.map(r => {
      const cls = r.isRough ? '' : (concSet.has(r.runNumber) ? 'background:#e8f5e9;' : '');
      return `<tr style="${cls}">
        <td>${r.isRough ? 'R' : r.runNumber}</td>
        <td>${r.initialReading.toFixed(2)}</td>
        <td>${r.finalReading.toFixed(2)}</td>
        <td><strong>${r.titre.toFixed(2)}</strong></td>
        <td style="font-size:10px;color:#666;">${r.isRough ? 'Rough' : (concSet.has(r.runNumber) ? 'Concordant' : '')}</td>
      </tr>`;
    }).join('');

    const mistakeRows = warnings.length === 0
      ? '<tr><td colspan="2" style="color:#888;">None</td></tr>'
      : warnings.map(w => `<tr><td style="color:#b45309;">${w.action}</td><td style="font-size:11px;">${w.detail}</td></tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Titration Lab Report</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; max-width: 720px; margin: 40px auto; color: #111; }
  h1 { font-size: 16pt; border-bottom: 2px solid #333; padding-bottom: 6px; }
  h2 { font-size: 12pt; margin-top: 24px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #ccc; padding: 5px 10px; text-align: left; }
  th { background: #f0f0f0; }
  .meta { color: #555; font-size: 10pt; margin-bottom: 16px; }
  .calc { display: grid; grid-template-columns: 200px 1fr; gap: 4px 12px; margin-top: 8px; }
  .calc .lbl { color: #444; }
  .calc .val { font-weight: bold; }
</style>
</head>
<body>
<h1>Acid–Base Titration Lab Report</h1>
<div class="meta">
  Date: ${date} &nbsp;|&nbsp;
  Titrant: ${titrantName} &nbsp;|&nbsp;
  Analyte: ${analyteName} &nbsp;|&nbsp;
  Indicator: ${indicatorName}
</div>

<h2>Titration Runs</h2>
<table>
  <thead><tr><th>Run</th><th>Initial / mL</th><th>Final / mL</th><th>Titre / mL</th><th>Note</th></tr></thead>
  <tbody>${runRows}</tbody>
  ${meanTitre > 0 ? `<tfoot><tr><td colspan="3"><strong>Mean titre (concordant)</strong></td><td colspan="2"><strong>${meanTitre.toFixed(2)} mL</strong></td></tr></tfoot>` : ''}
</table>

<h2>Calculations</h2>
<div class="calc">
  <span class="lbl">Mean titre</span>
  <span class="val">${meanTitre > 0 ? meanTitre.toFixed(2) + ' mL' : '—'}</span>
  <span class="lbl">[${this._state.titrant?.formula ?? 'Titrant'}]</span>
  <span class="val">${titrantConc ? titrantConc.toFixed(4) + ' M' : '—'}</span>
  <span class="lbl">Analyte volume</span>
  <span class="val">${analyteVolMl.toFixed(2)} mL</span>
  <span class="lbl">[${this._state.analyte?.formula ?? 'Analyte'}] (calculated)</span>
  <span class="val">${analConcVal !== null ? analConcVal.toFixed(4) + ' M' : '—'}</span>
</div>

<h2>Mistakes &amp; Warnings</h2>
<table>
  <thead><tr><th>Issue</th><th>Detail</th></tr></thead>
  <tbody>${mistakeRows}</tbody>
</table>
</body>
</html>`;

    this._triggerDownload(html, 'titration-report.doc', 'application/msword');
  }

  _triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }

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
