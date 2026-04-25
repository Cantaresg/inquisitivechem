/**
 * teacher/ActivityEditor.js
 * Manages the state and DOM for a single activity tab in the teacher config UI.
 *
 * Imported data:
 *   REAGENTS            — full reagent catalogue from data/reagents.js
 *   CONFIRMATORY_TESTS  — test definitions from data/tests.js
 *
 * Public API:
 *   new ActivityEditor(reagents, tests, initialConfig?)
 *   .render()        → HTMLElement  (call once; insert into tab panel)
 *   .getConfig()     → ActivityConfig
 *   .loadConfig(cfg) → void
 */

import { REAGENTS }           from '../data/reagents.js';
import { CONFIRMATORY_TESTS } from '../data/tests.js';

// Human-readable labels for reagent subcategories
const SUBCAT_LABELS = {
  acid:          'Acids',
  alkali:        'Alkalis',
  aqueous_salt:  'Aqueous Salts',
  redox_reagent: 'Redox Reagents',
  special:       'Special Reagents',
  metal:         'Metals',
  carbonate:     'Carbonates',
  oxide:         'Oxides',
  halide_salt:   'Halide Salts',
  halogen:       'Halogens',
};

// Preferred display order for categories and subcategories
const CATEGORY_ORDER = ['liquid', 'solid'];
const SUBCAT_ORDER   = [
  'acid', 'alkali', 'aqueous_salt', 'redox_reagent', 'special',
  'metal', 'carbonate', 'oxide', 'halide_salt', 'halogen',
];

let _editorSeq = 0;

export class ActivityEditor {
  /**
   * @param {object[]} reagents  — REAGENTS array (passed in to avoid re-import overhead)
   * @param {object[]} tests     — CONFIRMATORY_TESTS array
   * @param {object}   [init]    — optional initial ActivityConfig to pre-populate
   */
  constructor(reagents = REAGENTS, tests = CONFIRMATORY_TESTS, init = null) {
    this._reagents = reagents;
    this._tests    = tests;
    this._uid      = ++_editorSeq;

    // DOM refs populated by render()
    this._el             = null;
    this._titleInput     = null;
    this._instructTa     = null;
    this._questionsWrap  = null;
    this._reagentChecks  = new Map();  // reagentId → <input type=checkbox>
    this._testChecks     = new Map();  // testId    → <input type=checkbox>
    this._unknownToggle  = null;
    this._unknownPanel   = null;
    this._solnCountInput = null;
    this._solidCountInput= null;

    this._init = init;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Build and return the root DOM element for this editor. Call once. */
  render() {
    const el = document.createElement('div');
    el.className = 'activity-editor';

    el.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="ae-title-${this._uid}">Activity Title</label>
        <input id="ae-title-${this._uid}" type="text" class="ae-title field-input"
               placeholder="e.g. Activity 1: Cation Identification">
      </div>

      <div class="field-group">
        <label class="field-label" for="ae-instruct-${this._uid}">Instructions</label>
        <textarea id="ae-instruct-${this._uid}" class="ae-instruct field-textarea" rows="6"
                  placeholder="Write your lab instructions here. Students will see these when they open the lab."></textarea>
      </div>

      <div class="field-group">
        <label class="field-label">Questions for Students
          <span class="field-hint">(students answer in Google Docs)</span>
        </label>
        <div class="ae-questions-wrap"></div>
        <button type="button" class="ae-add-question btn-small">+ Add Question</button>
      </div>

      <div class="field-group">
        <div class="picker-header">
          <label class="field-label">Allowed Reagents</label>
          <div class="picker-actions">
            <button type="button" class="ae-select-all btn-tiny" data-target="reagent">Select All</button>
            <button type="button" class="ae-clear-all btn-tiny"  data-target="reagent">Clear All</button>
          </div>
        </div>
        <div class="ae-reagent-tree"></div>
      </div>

      <div class="field-group">
        <div class="picker-header">
          <label class="field-label">Allowed Confirmatory Tests</label>
          <div class="picker-actions">
            <button type="button" class="ae-select-all btn-tiny" data-target="test">Select All</button>
            <button type="button" class="ae-clear-all btn-tiny"  data-target="test">Clear All</button>
          </div>
        </div>
        <div class="ae-tests-list"></div>
      </div>

      <div class="field-group unknown-group">
        <div class="unknown-header">
          <div>
            <div class="field-label">Unknown Mode</div>
            <div class="field-hint">Place mystery chemicals in the reagent cabinet</div>
          </div>
          <label class="toggle-switch" aria-label="Enable unknown mode">
            <input type="checkbox" class="ae-unknown-toggle">
            <span class="toggle-knob"></span>
          </label>
        </div>
        <div class="ae-unknown-panel" hidden>
          <div class="unknown-counts">
            <div class="count-field">
              <label class="count-label" for="ae-soln-${this._uid}">Solution unknowns</label>
              <input id="ae-soln-${this._uid}" type="number" class="ae-soln-count count-input"
                     min="0" max="10" value="1">
            </div>
            <div class="count-field">
              <label class="count-label" for="ae-solid-${this._uid}">Solid unknowns</label>
              <input id="ae-solid-${this._uid}" type="number" class="ae-solid-count count-input"
                     min="0" max="10" value="0">
            </div>
          </div>
          <p class="unknown-note">
            Unknowns are drawn from your allowed reagents list above.
            Solutions are drawn from liquid reagents; solids from solid reagents.
          </p>
        </div>
      </div>
    `;

    this._el = el;

    // Cache DOM refs
    this._titleInput      = el.querySelector('.ae-title');
    this._instructTa      = el.querySelector('.ae-instruct');
    this._questionsWrap   = el.querySelector('.ae-questions-wrap');
    this._unknownToggle   = el.querySelector('.ae-unknown-toggle');
    this._unknownPanel    = el.querySelector('.ae-unknown-panel');
    this._solnCountInput  = el.querySelector('.ae-soln-count');
    this._solidCountInput = el.querySelector('.ae-solid-count');

    // Build reagent tree and test list
    this._buildReagentTree(el.querySelector('.ae-reagent-tree'));
    this._buildTestList(el.querySelector('.ae-tests-list'));

    // Wire events
    this._unknownToggle.addEventListener('change', () => {
      this._unknownPanel.hidden = !this._unknownToggle.checked;
    });
    el.querySelector('.ae-add-question').addEventListener('click', () => {
      this._addQuestionRow('');
    });
    el.querySelectorAll('.ae-select-all').forEach(btn => {
      btn.addEventListener('click', () => this._toggleAll(btn.dataset.target, true));
    });
    el.querySelectorAll('.ae-clear-all').forEach(btn => {
      btn.addEventListener('click', () => this._toggleAll(btn.dataset.target, false));
    });

    // Load initial config if provided
    if (this._init) this.loadConfig(this._init);

    return el;
  }

  /**
   * Collect current state into an ActivityConfig object.
   * @returns {object} ActivityConfig
   */
  getConfig() {
    return {
      id:              this._init?.id ?? crypto.randomUUID(),
      title:           this._titleInput.value.trim() || 'Untitled Activity',
      instructions:    this._instructTa.value.trim(),
      questions:       this._collectQuestions(),
      allowedReagents: [...this._reagentChecks.entries()]
                         .filter(([, cb]) => cb.checked)
                         .map(([id]) => id),
      allowedTests:    [...this._testChecks.entries()]
                         .filter(([, cb]) => cb.checked)
                         .map(([id]) => id),
      unknownConfig: {
        enabled:   this._unknownToggle.checked,
        solutions: Math.max(0, parseInt(this._solnCountInput.value, 10) || 0),
        solids:    Math.max(0, parseInt(this._solidCountInput.value, 10) || 0),
      },
    };
  }

  /**
   * Populate editor from a saved ActivityConfig.
   * @param {object} cfg
   */
  loadConfig(cfg) {
    if (!this._el) return;  // render() must be called first

    if (cfg.title)        this._titleInput.value  = cfg.title;
    if (cfg.instructions) this._instructTa.value  = cfg.instructions;

    // Questions
    this._questionsWrap.innerHTML = '';
    (cfg.questions || []).forEach(q => this._addQuestionRow(q));

    // Reagents
    const allowed = new Set(cfg.allowedReagents || []);
    this._reagentChecks.forEach((cb, id) => { cb.checked = allowed.has(id); });

    // Tests
    const allowedTests = new Set(cfg.allowedTests || []);
    this._testChecks.forEach((cb, id) => { cb.checked = allowedTests.has(id); });

    // Unknown mode
    if (cfg.unknownConfig) {
      this._unknownToggle.checked   = !!cfg.unknownConfig.enabled;
      this._unknownPanel.hidden     = !cfg.unknownConfig.enabled;
      this._solnCountInput.value    = cfg.unknownConfig.solutions ?? 1;
      this._solidCountInput.value   = cfg.unknownConfig.solids    ?? 0;
    }

    // Store id for future updates
    this._init = { ...this._init, id: cfg.id };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  _buildReagentTree(container) {
    // Group reagents by category then subcategory
    const groups = new Map();
    for (const r of this._reagents) {
      const catKey = r.category;
      if (!groups.has(catKey)) groups.set(catKey, new Map());
      const subMap = groups.get(catKey);
      if (!subMap.has(r.subcategory)) subMap.set(r.subcategory, []);
      subMap.get(r.subcategory).push(r);
    }

    const catLabel = { liquid: 'Solutions', solid: 'Solids' };

    for (const cat of CATEGORY_ORDER) {
      if (!groups.has(cat)) continue;
      const catSection = document.createElement('div');
      catSection.className = 'tree-category';

      const catHeader = document.createElement('div');
      catHeader.className = 'tree-cat-header';
      catHeader.textContent = catLabel[cat] || cat;
      catSection.appendChild(catHeader);

      const subMap = groups.get(cat);
      const subcatOrder = SUBCAT_ORDER.filter(s => subMap.has(s));
      // Append any subcats not in the explicit order list
      for (const s of subMap.keys()) {
        if (!subcatOrder.includes(s)) subcatOrder.push(s);
      }

      for (const subcat of subcatOrder) {
        const reagentList = subMap.get(subcat);
        const details = document.createElement('details');
        details.className = 'tree-subcat';
        details.open = false;

        const summary = document.createElement('summary');
        summary.className = 'tree-subcat-label';
        const label = SUBCAT_LABELS[subcat]
          ?? subcat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        summary.textContent = label;
        details.appendChild(summary);

        const items = document.createElement('div');
        items.className = 'tree-items';

        for (const r of reagentList) {
          const row = document.createElement('label');
          row.className = 'picker-row';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'picker-cb';
          cb.value = r.id;
          this._reagentChecks.set(r.id, cb);

          const colorDot = document.createElement('span');
          colorDot.className = 'reagent-dot';
          colorDot.style.background = r.color;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'picker-name';
          nameSpan.textContent = r.label;

          row.appendChild(cb);
          row.appendChild(colorDot);
          row.appendChild(nameSpan);
          items.appendChild(row);
        }

        details.appendChild(items);
        catSection.appendChild(details);
      }

      container.appendChild(catSection);
    }
  }

  _buildTestList(container) {
    for (const t of this._tests) {
      const row = document.createElement('label');
      row.className = 'picker-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'picker-cb';
      cb.value = t.id;
      this._testChecks.set(t.id, cb);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'picker-name';
      nameSpan.textContent = t.label;

      row.appendChild(cb);
      row.appendChild(nameSpan);
      container.appendChild(row);
    }
  }

  _addQuestionRow(text = '') {
    const idx  = this._questionsWrap.children.length + 1;
    const row  = document.createElement('div');
    row.className = 'question-row';

    const num = document.createElement('span');
    num.className = 'question-num';
    num.textContent = `Q${idx}`;

    const input = document.createElement('input');
    input.type  = 'text';
    input.className = 'question-input field-input';
    input.placeholder = `Question ${idx}…`;
    input.value = text;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'question-remove btn-icon';
    removeBtn.title = 'Remove question';
    removeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
    removeBtn.addEventListener('click', () => {
      row.remove();
      this._renumberQuestions();
    });

    row.appendChild(num);
    row.appendChild(input);
    row.appendChild(removeBtn);
    this._questionsWrap.appendChild(row);
  }

  _renumberQuestions() {
    this._questionsWrap.querySelectorAll('.question-num').forEach((num, i) => {
      num.textContent = `Q${i + 1}`;
    });
    this._questionsWrap.querySelectorAll('.question-input').forEach((inp, i) => {
      inp.placeholder = `Question ${i + 1}…`;
    });
  }

  _collectQuestions() {
    return [...this._questionsWrap.querySelectorAll('.question-input')]
      .map(inp => inp.value.trim())
      .filter(Boolean);
  }

  _toggleAll(target, checked) {
    const map = target === 'reagent' ? this._reagentChecks : this._testChecks;
    map.forEach(cb => { cb.checked = checked; });
  }
}
