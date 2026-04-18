/**
 * UIRenderer — top-level UI coordinator for the Titration Lab.
 *
 * Responsibilities:
 *   • Render the app shell (header, 3-column layout, controls bar)
 *   • Render stage navigation pills
 *   • Own and coordinate sub-renderers (BuretteRenderer, FlaskRenderer,
 *     PHGraphRenderer) during the titrate stage
 *   • Render the right-panel tabs: Results | Log | Calculate
 *   • Manage toast notifications
 *   • Delegate centre area and controls to the active Stage via
 *     stage.renderArea(el) and stage.renderControls(el)
 *
 * Subscribes to EventBus events:
 *   stageChanged    → re-render nav + centre + controls
 *   runRecorded     → update results table
 *   toast           → show a toast message
 *
 * @module UIRenderer
 */

import { BuretteRenderer }  from './BuretteRenderer.js';
import { FlaskRenderer }    from './FlaskRenderer.js';
import { PHGraphRenderer }  from './PHGraphRenderer.js';

export class UIRenderer {
  /** @type {HTMLElement} */
  #appEl;
  /** @type {import('../EventBus.js').EventBus} */
  #bus;
  /** @type {import('../StageController.js').StageController} */
  #controller;
  /** @type {Object} labState reference for live reads */
  #state;

  // Sub-renderers (created once on mount, destroyed on unmount)
  /** @type {BuretteRenderer|null}  */ #buretteR = null;
  /** @type {FlaskRenderer|null}    */ #flaskR   = null;
  /** @type {PHGraphRenderer|null}  */ #phR      = null;

  // Cached DOM references (set during _buildShell)
  #animArea    = null;
  #ctrlArea    = null;
  #stageNav    = null;
  #chemList    = null;
  #rightTabs   = null;
  #tabContents = {};

  // Toast container
  #toastEl = null;

  /** @type {Function[]} */
  #unsubs = [];

  /** Active right-panel tab id */
  #activeTab = 'results';

  /**
   * @param {HTMLElement}                                           appEl        Root element (replaces its innerHTML)
   * @param {import('../EventBus.js').EventBus}                    bus
   * @param {import('../StageController.js').StageController}      controller
   * @param {Object}                                                labState
   */
  constructor(appEl, bus, controller, labState) {
    this.#appEl      = appEl;
    this.#bus        = bus;
    this.#controller = controller;
    this.#state      = labState;
    this._buildShell();
    this._subscribe();
    this._renderAll();
  }

  // ── Shell ──────────────────────────────────────────────────

  _buildShell() {
    this.#appEl.innerHTML = '';
    this.#appEl.id = 'app';

    // ── Header
    const header = document.createElement('header');
    header.id = 'app-header';
    header.innerHTML = `<h1><em>Acid–Base</em> Titration Lab</h1>`;
    this.#stageNav = document.createElement('nav');
    this.#stageNav.id = 'stage-nav';
    header.appendChild(this.#stageNav);
    this.#chemList = document.createElement('div');
    this.#chemList.id = 'chem-list';
    header.appendChild(this.#chemList);
    this.#appEl.appendChild(header);

    // ── Main (3-col)
    const main = document.createElement('div');
    main.id = 'main';

    // Left panel
    const left = document.createElement('aside');
    left.id = 'left-panel';
    left.innerHTML = `
      <div class="panel-section-title">Lab Info</div>
      <div id="left-info"></div>`;

    // Centre animation area
    const centre = document.createElement('section');
    centre.id = 'anim-area';

    // Stage header overlay (title + instructions)
    const stageHeader = document.createElement('div');
    stageHeader.id = 'stage-header';
    stageHeader.innerHTML = `
      <div id="stage-title"></div>
      <div id="stage-instructions"></div>`;
    centre.appendChild(stageHeader);

    // Actual animation content goes into a child div so the header overlay floats above it
    const animContent = document.createElement('div');
    animContent.id = 'anim-content';
    animContent.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative;';
    centre.appendChild(animContent);
    this.#animArea = animContent;

    // Right panel
    const right = document.createElement('aside');
    right.id = 'right-panel';
    const tabs = document.createElement('div');
    tabs.id = 'right-tabs';
    const tabDefs = [
      { id: 'results',   label: 'Results' },
      { id: 'log',       label: 'Log' },
      { id: 'calculate', label: 'Calculate' },
    ];
    tabDefs.forEach(({ id, label }) => {
      const btn = document.createElement('div');
      btn.className = 'right-tab' + (id === this.#activeTab ? ' active' : '');
      btn.dataset.tab = id;
      btn.textContent = label;
      btn.addEventListener('click', () => this._switchTab(id));
      tabs.appendChild(btn);
    });
    right.appendChild(tabs);
    tabDefs.forEach(({ id }) => {
      const content = document.createElement('div');
      content.id   = `tab-${id}`;
      content.className = 'right-tab-content' + (id === this.#activeTab ? ' active' : '');
      right.appendChild(content);
      this.#tabContents[id] = content;
    });

    // pH graph lives in the results tab
    const graphWrap = document.createElement('div');
    graphWrap.id = 'ph-graph-host';
    this.#tabContents.results.appendChild(graphWrap);

    // Results table host
    const tableHost = document.createElement('div');
    tableHost.id = 'results-table-host';
    this.#tabContents.results.appendChild(tableHost);

    // Right tabs ref for tab-switching
    this.#rightTabs = tabs;

    main.appendChild(left);
    main.appendChild(centre);
    main.appendChild(right);
    this.#appEl.appendChild(main);

    // ── Controls bar (footer)
    const ctrl = document.createElement('footer');
    ctrl.id = 'stage-controls';
    this.#ctrlArea = ctrl;
    this.#appEl.appendChild(ctrl);

    // ── Toast container
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
    this.#toastEl = toastContainer;

    // ── Reading modal (shared)
    const modal = document.createElement('div');
    modal.id = 'reading-modal';
    modal.className = 'reading-modal hidden';
    modal.innerHTML = `
      <div class="reading-box">
        <h3 id="reading-title">Burette Reading</h3>
        <p id="reading-subtitle"></p>
        <div class="reading-zoom" id="reading-zoom"></div>
        <p id="reading-hint" style="color:var(--muted);font-size:10px;"></p>
        <div class="reading-input-row">
          <input type="number" id="reading-input" step="0.01" min="0" max="50" placeholder="0.00" />
          <span style="font-size:11px;color:var(--muted);">mL</span>
          <button class="btn primary" id="reading-submit">Record</button>
          <button class="btn" id="reading-cancel">Cancel</button>
        </div>
        <div class="reading-feedback" id="reading-feedback"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('reading-cancel').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // ── Rendering ──────────────────────────────────────────────

  _renderAll() {
    this._renderStageNav();
    this._renderChemList();
    this._renderLeftInfo();
    this._renderCentre();
    this._renderControls();
    this._renderResultsTable();
  }

  _renderStageNav() {
    if (!this.#stageNav) return;
    this.#stageNav.innerHTML = '';
    const stages = this.#controller.stages;
    stages.forEach((stage, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'stage-sep';
        sep.textContent = '›';
        this.#stageNav.appendChild(sep);
      }
      const pill = document.createElement('span');
      pill.className = 'stage-pill';
      if (stage === this.#controller.currentStage) pill.classList.add('active');
      else if (stage.isComplete) pill.classList.add('complete');
      else if (this.#controller.isLocked(stage.id)) pill.classList.add('locked');
      pill.textContent = stage.label;
      pill.addEventListener('click', () => {
        if (!this.#controller.isLocked(stage.id)) {
          this.#controller.jumpTo(stage.id);
        }
      });
      this.#stageNav.appendChild(pill);
    });
  }

  _renderChemList() {
    if (!this.#chemList) return;
    const s = this.#state;
    const items = [];
    if (s.titrant)   items.push({ label: s.titrant.formula,   dot: s.titrant.dot   || 'var(--accent)',  role: 'Burette' });
    if (s.analyte)   items.push({ label: s.analyte.formula,   dot: s.analyte.dot   || 'var(--accent2)', role: 'Flask'   });
    if (s.indicator) items.push({ label: s.indicator.name,    dot: s.indicator.alkCol || 'var(--accent3)', role: 'Indicator' });
    this.#chemList.innerHTML = items.map(it => `
      <div class="chem-tag" title="${it.role}">
        <span class="chem-dot" style="background:${it.dot}"></span>
        <span>${it.label}</span>
      </div>`).join('');
  }

  _renderLeftInfo() {
    const el = document.getElementById('left-info');
    if (!el) return;
    const s = this.#state;
    const rows = [
      { label: 'Mode',       value: s.isOpenLab ? 'Open Lab' : 'Standard' },
      { label: 'Level',      value: s.level === 'jc' ? 'JC / IB' : 'O-Level' },
      { label: '[Titrant]',  value: s.concTitrant   ? s.concTitrant.toFixed(4) + ' M' : '—' },
      { label: '[Analyte]',  value: s.isOpenLab ? (s.concKnownRange || '?') : (s.concAnalyte ? s.concAnalyte.toFixed(4) + ' M' : '—') },
      { label: 'Vol analyte', value: s.volAnalyte ? s.volAnalyte.toFixed(2) + ' mL' : '—' },
      { label: 'Vol added',  value: (s.volAdded ?? 0).toFixed(2) + ' mL' },
    ];
    el.innerHTML = rows.map(r => `
      <div class="info-row">
        <span>${r.label}</span>
        <span>${r.value}</span>
      </div>`).join('');
  }

  _renderCentre() {
    if (!this.#animArea) return;
    const stage = this.#controller.currentStage;
    if (!stage) return;

    // Update title + instructions
    const titleEl = document.getElementById('stage-title');
    const instrEl = document.getElementById('stage-instructions');

    // Destroy old sub-renderers if switching away from titrate
    if (stage.id !== 'titrate') this._destroySubRenderers();

    // Delegate to stage
    if (typeof stage.renderArea === 'function') {
      stage.renderArea(this.#animArea);
    } else {
      this.#animArea.innerHTML = `<div style="color:var(--muted);font-size:13px;">${stage.label}</div>`;
    }

    // Build sub-renderers for titrate stage
    if (stage.id === 'titrate') this._mountSubRenderers();
  }

  _renderControls() {
    if (!this.#ctrlArea) return;
    const stage = this.#controller.currentStage;
    if (!stage) return;

    if (typeof stage.renderControls === 'function') {
      stage.renderControls(this.#ctrlArea);
    } else {
      this.#ctrlArea.innerHTML = '';
    }

    // Global prev/next for non-titrate stages
    if (stage.id !== 'titrate' && stage.id !== 'results') {
      const nav = document.createElement('div');
      nav.style.cssText = 'margin-left:auto;display:flex;gap:8px;align-items:center;';
      if (this.#controller.canGoBack()) {
        const prev = document.createElement('button');
        prev.className = 'btn';
        prev.textContent = '← Back';
        prev.addEventListener('click', () => this.#controller.back());
        nav.appendChild(prev);
      }
      if (stage.isComplete) {
        const next = document.createElement('button');
        next.className = 'btn primary';
        next.textContent = stage.id === 'burette' ? 'Start Titrating →' : 'Next →';
        next.addEventListener('click', () => this.#controller.advance());
        nav.appendChild(next);
      }
      this.#ctrlArea.appendChild(nav);
    }
  }

  _renderResultsTable() {
    const host = document.getElementById('results-table-host');
    if (!host) return;
    const runs = this.#state.runs ?? [];
    if (runs.length === 0) {
      host.innerHTML = '<div style="color:var(--muted);font-size:11px;">No runs recorded yet.</div>';
      return;
    }

    // Determine concordant set: sliding window of 2+ accurate runs within 0.10 mL
    const accurate = runs.filter(r => !r.isRough);
    const concordantIndices = new Set();
    for (let i = 0; i + 1 < accurate.length; i++) {
      for (let j = i + 1; j < accurate.length; j++) {
        if (Math.abs(accurate[i].titre - accurate[j].titre) <= 0.10) {
          concordantIndices.add(accurate[i].runNumber);
          concordantIndices.add(accurate[j].runNumber);
        }
      }
    }

    const mean = concordantIndices.size > 0
      ? [...concordantIndices].reduce((s, n) => {
          const run = runs.find(r => r.runNumber === n);
          return s + (run?.titre ?? 0);
        }, 0) / concordantIndices.size
      : null;

    host.innerHTML = `
      <table class="results-table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Initial</th>
            <th>Final</th>
            <th>Titre</th>
          </tr>
        </thead>
        <tbody>
          ${runs.map(r => `
            <tr class="${r.isRough ? 'rough' : (concordantIndices.has(r.runNumber) ? 'concordant' : '')}">
              <td>${r.isRough ? 'R' : r.runNumber}</td>
              <td>${r.initialReading.toFixed(2)}</td>
              <td>${r.finalReading.toFixed(2)}</td>
              <td>${r.titre.toFixed(2)}</td>
            </tr>`).join('')}
        </tbody>
        ${mean !== null ? `
        <tfoot>
          <tr>
            <td colspan="3">Mean titre (concordant)</td>
            <td>${mean.toFixed(2)} mL</td>
          </tr>
        </tfoot>` : ''}
      </table>`;
  }

  // ── Sub-renderers ─────────────────────────────────────────

  _mountSubRenderers() {
    // BuretteRenderer — needs a dedicated container in anim-area
    const buretteHost = document.getElementById('burette-renderer-host');
    const flaskHost   = document.getElementById('flask-renderer-host');
    const dropCont    = document.getElementById('drop-container');

    if (!buretteHost || !flaskHost || !dropCont) return; // renderArea must create these

    const titrantColour = this.#state.titrant?.dot ?? 'rgba(92,184,255,0.6)';

    this.#buretteR = new BuretteRenderer(buretteHost, this.#bus, titrantColour);
    this.#buretteR.setDropContainer(dropCont);

    const ind = this.#state.indicator;
    this.#flaskR = new FlaskRenderer(flaskHost, this.#bus, {
      acidColour: ind?.acidCol,
      alkColour:  ind?.alkCol,
    });

    const graphHost = document.getElementById('ph-graph-host');
    if (graphHost && !this.#phR) {
      this.#phR = new PHGraphRenderer(graphHost, this.#bus);
    }

    // Wire drop animations: when dropAdded fires, animate drop into flask
    // The burette renderer handles level updates; here we coordinate drop visuals
    const flaskWrap = flaskHost.querySelector('.flask-wrap');
    if (flaskWrap) {
      this.#bus.on('dropAdded', () => {
        this.#buretteR?.animateDrop(flaskWrap);
        setTimeout(() => this.#flaskR?.addRipple(), 250);
      });
    }

    // Wire swirlRequested from flask gesture → TitrateStage
    // (TitrateStage listens on its own bus subscription; we just need the animation)
    this.#bus.on('swirled', () => this.#flaskR?.runSwirlAnimation());

    // Initial state sync
    if (this.#state.buretteLevel !== undefined) {
      this.#buretteR.setLevel(this.#state.buretteLevel);
    }
    if (this.#state.buretteInitial !== undefined) {
      this.#buretteR.setReading(this.#state.buretteInitial, this.#state.volAdded ?? 0);
    }
  }

  _destroySubRenderers() {
    this.#buretteR?.destroy(); this.#buretteR = null;
    this.#flaskR?.destroy();   this.#flaskR   = null;
    // PHGraph persists across runs — don't destroy until teardown
  }

  // ── Tab switching ─────────────────────────────────────────

  _switchTab(id) {
    this.#activeTab = id;
    this.#rightTabs?.querySelectorAll('.right-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === id);
    });
    Object.entries(this.#tabContents).forEach(([tid, el]) => {
      el.classList.toggle('active', tid === id);
    });
  }

  // ── Toast ─────────────────────────────────────────────────

  /**
   * Show a toast message.
   * @param {string} message
   * @param {'ok'|'error'|'warning'} [type='ok']
   */
  toast(message, type = 'ok') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    this.#toastEl?.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ── EventBus subscriptions ────────────────────────────────

  _subscribe() {
    this.#unsubs.push(
      this.#bus.on('stageChanged', () => {
        this._renderAll();
      }),
      this.#bus.on('runRecorded', () => {
        this._renderResultsTable();
        this._renderControls();
        this._switchTab('results');
      }),
      this.#bus.on('toast', ({ message, type }) => {
        this.toast(message, type ?? 'ok');
      }),
      this.#bus.on('logAction', ({ action, detail, level }) => {
        const el = this.#tabContents.log;
        if (!el) return;
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
        entry.innerHTML = `
          <span class="log-${level ?? 'action'}">${action}</span>
          ${detail ? `<span class="log-detail">${detail}</span>` : ''}
          <span class="log-time">${now}</span>`;
        el.prepend(entry);
      }),
      this.#bus.on('phUpdated', () => {
        this._renderLeftInfo();
      }),
      this.#bus.on('stageAreaUpdated', () => {
        this._renderControls();
      }),
    );
  }

  /** Tear down all subscriptions and sub-renderers. */
  destroy() {
    this.#unsubs.forEach(fn => fn());
    this.#unsubs = [];
    this._destroySubRenderers();
    this.#phR?.destroy();
    this.#phR = null;
    this.#toastEl?.remove();
    document.getElementById('reading-modal')?.remove();
  }
}
