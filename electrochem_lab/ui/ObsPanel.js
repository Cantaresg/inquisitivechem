/**
 * ui/ObsPanel.js
 * Observation log and equations tab panel.
 *
 * Hooks into existing DOM elements (created in index.html):
 *   #obs-tabs            — tab strip
 *   #obs-observations    — tabpanel: plain-English log entries
 *   #obs-equations       — tabpanel: equation entries
 *   #export-csv          — CSV download button
 *   #export-docx         — Word download button
 *   #obs-toggle          — sidebar toggle button
 *   #obs-panel           — the collapsible aside
 *
 * Public methods:
 *   appendRun({ electrolyte, anodeName, cathodeName, observations, equations })
 *   appendTestResult(TestResult)
 */

import { exportCSV }  from '../export/csv-export.js';
import { exportDocx } from '../export/docx-export.js';

export class ObsPanel {
  /**
   * @param {object} opts
   * @param {HTMLElement}      opts.tabsEl       — #obs-tabs
   * @param {HTMLElement}      opts.obsEl        — #obs-observations
   * @param {HTMLElement}      opts.eqEl         — #obs-equations
   * @param {HTMLButtonElement} opts.csvBtn      — #export-csv
   * @param {HTMLButtonElement} [opts.docxBtn]   — #export-docx
   * @param {HTMLButtonElement} opts.toggleBtn   — #obs-toggle
   * @param {HTMLElement}      opts.panelEl      — #obs-panel
   * @param {object}           [opts.config]     — { level } for docx export
   */
  constructor({ tabsEl, obsEl, eqEl, csvBtn, docxBtn, toggleBtn, panelEl, config = {} }) {
    this._tabsEl  = tabsEl;
    this._obsEl   = obsEl;
    this._eqEl    = eqEl;
    this._csvBtn  = csvBtn;
    this._docxBtn = docxBtn ?? null;
    this._config  = config;
    this._runs    = [];     // array of run records for export
    this._testLog = [];     // flat list of test results for CSV

    this._bindTabs();
    this._bindExport();
    this._bindToggle(toggleBtn, panelEl);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Append a new electrolysis run entry to both tabs.
   * @param {object} opts
   * @param {string}   opts.electrolyte   — formula string
   * @param {string}   opts.anodeName     — electrode name
   * @param {string}   opts.cathodeName   — electrode name
   * @param {string[]} opts.observations  — from ElectrolysisResult.getObservations()
   * @param {{ cathode: string, anode: string }} opts.equations
   */
  appendRun({ electrolyte, anodeName, cathodeName, observations, equations }) {
    const run = {
      timestamp: new Date().toLocaleTimeString(),
      electrolyte,
      anodeName,
      cathodeName,
      observations,
      equations,
    };
    this._runs.push(run);
    this._renderObsRun(run);
    this._renderEqRun(run);
    if (this._csvBtn)  this._csvBtn.disabled  = false;
    if (this._docxBtn) this._docxBtn.disabled = false;
  }

  /**
   * Append a test-result line under the current observation log.
   * @param {import('../engine/TestEngine.js').TestResult} testResult
   */
  appendTestResult(testResult) {
    // Keep a flat log for CSV export
    this._testLog.push({
      timestamp:   new Date().toLocaleTimeString(),
      testType:    testResult.testType,
      target:      testResult.target,
      observation: testResult.observation,
    });

    const el = document.createElement('div');
    el.className = `obs-test-entry ${testResult.isPositive ? 'obs-test--positive' : 'obs-test--negative'}`;
    el.innerHTML = `
      <span class="obs-test-tag">[Test] ${this._humanTestName(testResult.testType)} @ ${testResult.target}</span>
      <span class="obs-test-text">${testResult.observation}</span>
    `;
    this._obsEl.appendChild(el);
    this._obsEl.scrollTop = this._obsEl.scrollHeight;
  }

  /** Update the config used for docx export (level switch). */
  setConfig(config) {
    this._config = config;
  }

  /**
   * Append a galvanic-cell result entry (EC Cell / A-Level mode).
   * @param {object} opts
   * @param {string} opts.leftLabel   — half-cell label, e.g. "Zn²⁺/Zn"
   * @param {string} opts.rightLabel  — half-cell label, e.g. "Cu²⁺/Cu"
   * @param {import('../engine/ECCellEngine.js').ECCellResult} opts.result
   * @param {{ anode: string, cathode: string, overall: string }} opts.equations
   */
  appendECCellRun({ leftLabel, rightLabel, result, equations }) {
    const ts = new Date().toLocaleTimeString();
    const emfDisplay = result.getEMFDisplay ? result.getEMFDisplay() : `${result.EMF.toFixed(3)} V`;

    // Obs tab entry
    const obsEl = document.createElement('div');
    obsEl.className = 'obs-run-block obs-eccell-block';
    obsEl.innerHTML = `
      <div class="obs-run-header">
        <span class="obs-run-time">${ts}</span>
        <span class="obs-run-ctx">[EC Cell] ${leftLabel} || ${rightLabel}</span>
      </div>
      <ul class="obs-list">
        ${result.getObservations().map(o => `<li class="obs-item">${o}</li>`).join('')}
      </ul>
    `;
    if (this._obsEl.children.length) {
      this._obsEl.appendChild(this._makeDivider());
    }
    this._obsEl.appendChild(obsEl);
    this._obsEl.scrollTop = this._obsEl.scrollHeight;

    // Equations tab entry
    const eqEl = document.createElement('div');
    eqEl.className = 'obs-run-block obs-eccell-block';
    eqEl.innerHTML = `
      <div class="obs-run-header">
        <span class="obs-run-time">${ts}</span>
        <span class="obs-run-ctx">[EC Cell] ${emfDisplay}</span>
      </div>
      <div class="eq-row">
        <span class="eq-label">Cathode (+):</span>
        <code class="eq-text">${equations.cathode}</code>
      </div>
      <div class="eq-row">
        <span class="eq-label">Anode (−):</span>
        <code class="eq-text">${equations.anode}</code>
      </div>
      <div class="eq-row eq-overall">
        <span class="eq-label">Overall:</span>
        <code class="eq-text">${equations.overall ?? ''}</code>
      </div>
    `;
    if (this._eqEl.children.length) {
      this._eqEl.appendChild(this._makeDivider());
    }
    this._eqEl.appendChild(eqEl);
    this._eqEl.scrollTop = this._eqEl.scrollHeight;

    // Enable export buttons
    if (this._csvBtn)  this._csvBtn.disabled  = false;
    if (this._docxBtn) this._docxBtn.disabled = false;
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  _renderObsRun(run) {
    // Divider between runs (skip before the first)
    if (this._runs.length > 1) {
      this._obsEl.appendChild(this._makeDivider());
    }

    const el = document.createElement('div');
    el.className = 'obs-run-block';
    el.innerHTML = `
      <div class="obs-run-header">
        <span class="obs-run-time">${run.timestamp}</span>
        <span class="obs-run-ctx">${run.electrolyte} · ${run.anodeName} (+) / ${run.cathodeName} (−)</span>
      </div>
      <ul class="obs-list">
        ${run.observations.map(o => `<li class="obs-item">${o}</li>`).join('')}
      </ul>
    `;
    this._obsEl.appendChild(el);
    this._obsEl.scrollTop = this._obsEl.scrollHeight;
  }

  _renderEqRun(run) {
    if (this._runs.length > 1) {
      this._eqEl.appendChild(this._makeDivider());
    }

    const el = document.createElement('div');
    el.className = 'obs-run-block';
    el.innerHTML = `
      <div class="obs-run-header">
        <span class="obs-run-time">${run.timestamp}</span>
        <span class="obs-run-ctx">${run.electrolyte}</span>
      </div>
      <div class="eq-row">
        <span class="eq-label">Cathode (−):</span>
        <code class="eq-text">${run.equations.cathode}</code>
      </div>
      <div class="eq-row">
        <span class="eq-label">Anode (+):</span>
        <code class="eq-text">${run.equations.anode}</code>
      </div>
    `;
    this._eqEl.appendChild(el);
    this._eqEl.scrollTop = this._eqEl.scrollHeight;
  }

  _makeDivider() {
    const d = document.createElement('div');
    d.className = 'obs-run-divider';
    return d;
  }

  // ── Tab switching ───────────────────────────────────────────────────────

  _bindTabs() {
    const tabs = this._tabsEl.querySelectorAll('.obs-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        const which = tab.dataset.tab;
        this._obsEl.hidden = (which !== 'observations');
        this._eqEl.hidden  = (which !== 'equations');
      });
    });
  }

  // ── Export buttons ──────────────────────────────────────────────────────

  _bindExport() {
    this._csvBtn?.addEventListener('click', () => {
      exportCSV(this._runs, this._testLog);
    });

    this._docxBtn?.addEventListener('click', async () => {
      this._docxBtn.disabled = true;
      this._docxBtn.textContent = 'Exporting…';
      try {
        await exportDocx(this._runs, this._config);
      } catch (err) {
        alert(err.message);
      } finally {
        this._docxBtn.disabled = false;
        this._docxBtn.textContent = 'Word ↓';
      }
    });
  }

  // ── Sidebar toggle ──────────────────────────────────────────────────────

  _bindToggle(toggleBtn, panelEl) {
    if (!toggleBtn || !panelEl) return;
    toggleBtn.addEventListener('click', () => {
      const open = panelEl.classList.toggle('open');
      toggleBtn.textContent = open ? '▶' : '◀';
      toggleBtn.setAttribute('aria-expanded', String(open));
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _humanTestName(id) {
    const map = {
      litmus: 'Litmus', glowingSplint: 'Glowing Splint',
      burningSplint: 'Burning Splint', smell: 'Smell', flameTest: 'Flame Test',
    };
    return map[id] ?? id;
  }
}
