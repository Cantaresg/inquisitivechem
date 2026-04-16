/**
 * ui/DebugLogger.js
 * Debug reaction logger for manual QA sessions.
 *
 * Intercepts every mix event dispatched by BenchUI and renders a timestamped
 * card in the debug panel with:
 *   - Auto-logged context (vessel, reagent added, engine events / observations)
 *   - "Your observation" textarea — filled in by the tester
 *   - "Differs from expected" toggle → reveals "Expected" textarea when clicked
 *
 * Activation: toggled via the floating 🔬 button injected into the nav.
 * The entire panel is outside the main app grid so it never displaces layout.
 */

export class DebugLogger {
  /**
   * @param {HTMLElement} panelEl   — #debug-log-panel
   * @param {HTMLElement} listEl    — #debug-log-list  (scroll container)
   * @param {HTMLElement} toggleBtn — the nav button that opens/closes the panel
   * @param {HTMLElement} clearBtn  — #debug-log-clear
   * @param {HTMLElement} exportBtn — #debug-log-export
   */
  constructor(panelEl, listEl, toggleBtn, clearBtn, exportBtn) {
    this._panel     = panelEl;
    this._list      = listEl;
    this._toggleBtn = toggleBtn;
    this._clearBtn  = clearBtn;
    this._exportBtn = exportBtn;

    /** @type {Array<{entry: Object, observedEl: HTMLTextAreaElement, expectedEl: HTMLTextAreaElement}>} */
    this._entries = [];

    this._open = false;
    this._seq  = 0;           // entry counter for display labels

    this._toggleBtn.addEventListener('click', () => this.toggle());
    this._clearBtn.addEventListener('click',  () => this._clear());
    this._exportBtn.addEventListener('click', () => this._export());
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Called by BenchUI after every successful reagent drop / vessel-to-vessel pour.
   *
   * @param {Object} entry
   * @param {string}   entry.vesselName   — e.g. "Mixture 1"
   * @param {string}   entry.reagentLabel — reagent that was added, or "→ Vessel N (pour)"
   * @param {string[]} entry.ionsBefore   — ion keys before the drop
   * @param {string[]} entry.ionsAfter    — ion keys after
   * @param {string[]} entry.pptsBefore
   * @param {string[]} entry.pptsAfter
   * @param {import('../engine/ReactionEngine.js').ReactionEvent[]} entry.events
   */
  log(entry) {
    this._seq++;
    const seq  = this._seq;
    const time = new Date().toLocaleTimeString();

    // ── Build the observations/equations summary from engine events ────────
    const obsLines = entry.events
      .filter(ev => ev.observation)
      .map(ev => ev.observation);
    const eqLines = entry.events
      .filter(ev => ev.equation)
      .map(ev => ev.equation);

    const hasEvents = obsLines.length > 0 || eqLines.length > 0;

    // ── Card root ──────────────────────────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'dl-card';
    card.setAttribute('data-seq', seq);

    // Header row
    const hdr = document.createElement('div');
    hdr.className = 'dl-card-header';

    const badge = document.createElement('span');
    badge.className = 'dl-seq';
    badge.textContent = `#${seq}`;

    const title = document.createElement('span');
    title.className = 'dl-title';
    // TRAP-10: textContent only
    title.textContent = `${entry.vesselName} ← ${entry.reagentLabel}`;

    const ts = document.createElement('span');
    ts.className = 'dl-time';
    ts.textContent = time;

    hdr.append(badge, title, ts);
    card.appendChild(hdr);

    // State diff row
    const diff = document.createElement('div');
    diff.className = 'dl-diff';

    const ionsChanged =
      JSON.stringify(entry.ionsBefore.sort()) !== JSON.stringify(entry.ionsAfter.sort());
    const pptsChanged =
      JSON.stringify(entry.pptsBefore.sort()) !== JSON.stringify(entry.pptsAfter.sort());

    if (ionsChanged || pptsChanged) {
      if (ionsChanged) {
        const added   = entry.ionsAfter .filter(i => !entry.ionsBefore.includes(i));
        const removed = entry.ionsBefore.filter(i => !entry.ionsAfter .includes(i));
        if (added.length)   _appendChips(diff, 'ions +', added,   'dl-chip-add');
        if (removed.length) _appendChips(diff, 'ions −', removed,  'dl-chip-rem');
      }
      if (pptsChanged) {
        const added   = entry.pptsAfter .filter(p => !entry.pptsBefore.includes(p));
        const removed = entry.pptsBefore.filter(p => !entry.pptsAfter .includes(p));
        if (added.length)   _appendChips(diff, 'ppt +', added,   'dl-chip-add');
        if (removed.length) _appendChips(diff, 'ppt −', removed,  'dl-chip-rem');
      }
    } else {
      const noChange = document.createElement('span');
      noChange.className = 'dl-no-change';
      noChange.textContent = 'no ion / precipitate change';
      diff.appendChild(noChange);
    }
    card.appendChild(diff);

    // Engine observations (auto-logged)
    if (hasEvents) {
      const evBox = document.createElement('div');
      evBox.className = 'dl-engine-obs';
      if (obsLines.length) {
        const label = document.createElement('div');
        label.className = 'dl-field-label';
        label.textContent = 'Engine observations:';
        evBox.appendChild(label);
        for (const line of obsLines) {
          const p = document.createElement('p');
          p.className = 'dl-engine-obs-line';
          p.textContent = line;
          evBox.appendChild(p);
        }
      }
      if (eqLines.length) {
        const label = document.createElement('div');
        label.className = 'dl-field-label';
        label.textContent = 'Equations:';
        evBox.appendChild(label);
        for (const line of eqLines) {
          const p = document.createElement('p');
          p.className = 'dl-engine-obs-line dl-equation';
          p.textContent = line;
          evBox.appendChild(p);
        }
      }
      card.appendChild(evBox);
    }

    // "Your observation" textarea
    const obsLabel = document.createElement('label');
    obsLabel.className = 'dl-field-label';
    obsLabel.textContent = 'Your observation:';
    card.appendChild(obsLabel);

    const observedEl = document.createElement('textarea');
    observedEl.className = 'dl-textarea dl-observed';
    observedEl.placeholder = 'What did you see?';
    observedEl.rows = 2;
    card.appendChild(observedEl);

    // "Differs from expected" toggle
    const diffBtn = document.createElement('button');
    diffBtn.type = 'button';
    diffBtn.className = 'dl-diff-toggle';
    diffBtn.textContent = '⚠ Differs from expected';
    card.appendChild(diffBtn);

    // "Expected" textarea (hidden until toggle is clicked)
    const expectedWrap = document.createElement('div');
    expectedWrap.className = 'dl-expected-wrap';
    expectedWrap.hidden = true;

    const expLabel = document.createElement('label');
    expLabel.className = 'dl-field-label';
    expLabel.textContent = 'What did you expect?';
    expectedWrap.appendChild(expLabel);

    const expectedEl = document.createElement('textarea');
    expectedEl.className = 'dl-textarea dl-expected';
    expectedEl.placeholder = 'Describe the expected behaviour…';
    expectedEl.rows = 2;
    expectedWrap.appendChild(expectedEl);
    card.appendChild(expectedWrap);

    diffBtn.addEventListener('click', () => {
      const showing = !expectedWrap.hidden;
      expectedWrap.hidden = showing;
      diffBtn.classList.toggle('dl-diff-active', !showing);
      if (!showing) expectedEl.focus();
    });

    this._list.prepend(card);   // newest at top
    this._entries.unshift({ entry, seq, observedEl, expectedEl, diffBtn });

    // Auto-open panel on first entry so the tester notices it
    if (!this._open) this.open();
  }

  open() {
    this._open = true;
    this._panel.hidden = false;
    this._toggleBtn.classList.add('dl-nav-active');
    this._toggleBtn.setAttribute('aria-expanded', 'true');
  }

  close() {
    this._open = false;
    this._panel.hidden = true;
    this._toggleBtn.classList.remove('dl-nav-active');
    this._toggleBtn.setAttribute('aria-expanded', 'false');
  }

  toggle() {
    this._open ? this.close() : this.open();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _clear() {
    this._list.innerHTML = '';
    this._entries = [];
    this._seq = 0;
  }

  _export() {
    const lines = [];
    for (const { entry, seq, observedEl, expectedEl, diffBtn } of [...this._entries].reverse()) {
      lines.push(`=== #${seq} ${entry.vesselName} ← ${entry.reagentLabel} ===`);

      const obsLines = entry.events.filter(ev => ev.observation).map(ev => ev.observation);
      if (obsLines.length) {
        lines.push('Engine observations:');
        for (const o of obsLines) lines.push(`  ${o}`);
      }

      const observed = observedEl.value.trim();
      if (observed) lines.push(`Your observation: ${observed}`);

      if (diffBtn.classList.contains('dl-diff-active')) {
        const expected = expectedEl.value.trim();
        if (expected) lines.push(`Expected: ${expected}`);
        lines.push('*** MISMATCH FLAGGED ***');
      }

      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `chem-debug-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _appendChips(parent, labelText, items, chipClass) {
  const row = document.createElement('div');
  row.className = 'dl-chip-row';
  const label = document.createElement('span');
  label.className = 'dl-chip-label';
  label.textContent = labelText + ': ';
  row.appendChild(label);
  for (const item of items) {
    const chip = document.createElement('span');
    chip.className = `dl-chip ${chipClass}`;
    chip.textContent = item;
    row.appendChild(chip);
  }
  parent.appendChild(row);
}
