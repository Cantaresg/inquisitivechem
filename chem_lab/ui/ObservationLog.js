/**
 * ui/ObservationLog.js
 * Right-panel observation log and equations viewer.
 *
 * TRAP-04: docx export loaded lazily via import() — never at top level.
 * TRAP-08: right panel starts COLLAPSED — no auto-opening ever.
 * TRAP-10: all chemistry / user text rendered via textContent — no innerHTML
 *          with external data.
 * BUG-19:  append() deduplicates by entry.id (event UUID) before inserting.
 */

export class ObservationLog {
  /**
   * @param {HTMLElement} panelEl      — #obs-panel (the entire right panel)
   * @param {HTMLElement} listEl       — #obs-list  (observations tab content)
   * @param {HTMLElement} equationsEl  — #obs-equations (equations tab content)
   * @param {HTMLElement} exportBtnEl  — #obs-export-btn
   * @param {HTMLElement} tabObs       — .obs-tab[data-tab="observations"]
   * @param {HTMLElement} tabEq        — .obs-tab[data-tab="equations"]
   * @param {HTMLElement} headerEl     — #obs-panel-header (click to collapse/expand)
   */
  constructor(panelEl, listEl, equationsEl, exportBtnEl, tabObs, tabEq, headerEl) {
    this._panelEl     = panelEl;
    this._listEl      = listEl;
    this._equationsEl = equationsEl;
    this._exportBtn   = exportBtnEl;
    this._tabObs      = tabObs;
    this._tabEq       = tabEq;
    this._headerEl    = headerEl;

    /** Set of entry.id strings already in the log (BUG-19). */
    this._seen = new Set();

    /** All log entries in insertion order. Used for docx export. */
    this._entries = [];

    // TRAP-08: panel collapsed on startup
    this._panelEl.dataset.collapsed = 'true';

    this._bindControls();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Append a new observation entry.
   * Deduplicates by entry.id (BUG-19).
   *
   * @param {{
   *   id:          string,
   *   type:        string,
   *   observation: string,
   *   equation:    string,
   *   timestamp:   Date,
   *   label?:      string,
   * }} entry
   */
  append(entry) {
    // BUG-19: dedup by UUID
    if (this._seen.has(entry.id)) return;
    this._seen.add(entry.id);
    this._entries.push(entry);

    this._insertObsRow(entry);

    if (entry.equation) {
      this._insertEqRow(entry);
    }
  }

  /** Clear all entries from the log (called by wash-all or session reset). */
  clear() {
    this._seen.clear();
    this._entries = [];
    this._listEl.textContent      = '';
    this._equationsEl.textContent = '';
  }

  // ─── DOM insertion ────────────────────────────────────────────────────────

  /**
   * Insert one <details> row into the observations list.
   * TRAP-10: all text set via textContent.
   * @private
   */
  _insertObsRow(entry) {
    const details = document.createElement('details');
    details.className = 'obs-entry';

    const summary = document.createElement('summary');

    const timeSpan = document.createElement('span');
    timeSpan.className = 'obs-entry-time';
    timeSpan.textContent = `${entry.label ?? _typeLabel(entry.type)} — ${_formatTime(entry.timestamp)}`;

    const typeTag = document.createElement('span');
    typeTag.className = `obs-entry-type obs-type-${entry.type}`;
    typeTag.textContent = _typeLabel(entry.type);

    summary.append(timeSpan, typeTag);

    const body = document.createElement('div');
    body.className = 'obs-entry-body';
    // TRAP-10: textContent only
    body.textContent = entry.observation;

    details.append(summary, body);
    this._listEl.appendChild(details);

    // Auto-scroll to keep the latest entry visible
    this._listEl.scrollTop = this._listEl.scrollHeight;
  }

  /**
   * Insert one <details> equation row into the equations tab.
   * @private
   */
  _insertEqRow(entry) {
    const details = document.createElement('details');
    details.className = 'eq-entry';

    const summary = document.createElement('summary');
    summary.textContent = `${entry.label ?? _typeLabel(entry.type)} — ${_formatTime(entry.timestamp)}`;

    const body = document.createElement('div');
    body.className = 'eq-body';
    // TRAP-10: textContent for equation (monospace)
    body.textContent = entry.equation;

    details.append(summary, body);
    this._equationsEl.appendChild(details);
  }

  // ─── Controls ─────────────────────────────────────────────────────────────

  /** @private */
  _bindControls() {
    // Collapse / expand toggle (TRAP-08: starts collapsed)
    this._headerEl.addEventListener('click', () => {
      const collapsed = this._panelEl.dataset.collapsed === 'true';
      const nowCollapsed = !collapsed;
      this._panelEl.dataset.collapsed = String(nowCollapsed);
      // Keep aria-expanded in sync with visible state
      this._headerEl.setAttribute('aria-expanded', String(!nowCollapsed));
    });

    // Tab switching
    if (this._tabObs) {
      this._tabObs.addEventListener('click', () => this._switchTab('observations'));
    }
    if (this._tabEq) {
      this._tabEq.addEventListener('click', () => this._switchTab('equations'));
    }

    // Export (TRAP-04: lazy import of docx.js)
    if (this._exportBtn) {
      this._exportBtn.addEventListener('click', () => this.exportDocx());
    }
  }

  /** @private */
  _switchTab(tab) {
    if (tab === 'observations') {
      this._listEl.classList.remove('hidden');
      this._equationsEl.classList.remove('visible');
      this._tabObs?.classList.add('active');
      this._tabEq?.classList.remove('active');
    } else {
      this._listEl.classList.add('hidden');
      this._equationsEl.classList.add('visible');
      this._tabObs?.classList.remove('active');
      this._tabEq?.classList.add('active');
    }
  }

  // ─── DOCX export (TRAP-04: lazy import) ──────────────────────────────────

  /**
   * Lazily import docx.js and generate a lab report document.
   * The `lib/docx-export.js` module is only loaded when the user clicks Export.
   */
  async exportDocx() {
    if (this._entries.length === 0) {
      alert('Nothing to export — the observation log is empty.');
      return;
    }

    let exportModule;
    try {
      // TRAP-04: lazy, not top-level
      exportModule = await import('../lib/docx-export.js');
    } catch {
      alert('Export module could not be loaded. Make sure lib/docx-export.js is present.');
      return;
    }

    try {
      await exportModule.exportLabReport(this._entries);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  }
}

// ─── Private utilities ────────────────────────────────────────────────────────

/**
 * Format a Date as HH:MM:SS.
 * @param {Date} date
 * @returns {string}
 */
function _formatTime(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('en-GB', { hour12: false });
}

/**
 * Human-readable event type label.
 * @param {string} type
 * @returns {string}
 */
function _typeLabel(type) {
  const MAP = {
    precipitation: 'Precipitation',
    gas:           'Gas',
    redox:         'Redox',
    complexation:  'Complexation',
    dissolution:   'Dissolution',
    neutralisation:'Neutralisation',
    test:          'Test',
    no_reaction:   'No reaction',
  };
  return MAP[type] ?? type;
}
