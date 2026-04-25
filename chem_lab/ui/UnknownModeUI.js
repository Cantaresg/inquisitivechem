/**
 * ui/UnknownModeUI.js
 * Unknown Salt Mode — generates one or more mystery salts for students to identify.
 *
 * Three modes:
 *   1 unknown    — one vessel labelled "Unknown A"
 *   2 unknowns   — two separate vessels labelled "Unknown A" and "Unknown B"
 *   mixed salts  — one vessel containing two compatible salts (no precipitation
 *                  between them), labelled "Unknown (mixed)"
 *
 * Depends on BenchUI.addUnknownVessel() and BenchUI.addMixedUnknownVessel().
 */

import { REAGENTS }             from '../data/reagents.js';
import { PRECIPITATION_TABLE }  from '../data/reactions.js';

// Chemicals students can realistically identify in an A-level / IGCSE lab.
// Excluded:
//   k2cro4_aq  — no accessible confirmatory test for chromate
//   na2s_aq    — H₂S hazard makes it unsuitable as a student unknown
//   mno2_s     — catalyst / oxidant, not a standard qual-analysis unknown
//   *_conc     — concentrated acids are not used as unknowns
const _EXCLUDED = new Set(['k2cro4_aq', 'na2s_aq', 'mno2_s']);

const UNKNOWN_POOL = REAGENTS.filter(r => {
  if (_EXCLUDED.has(r.id)) return false;
  if (r.category === 'liquid') {
    if (r.subcategory === 'aqueous_salt') return true;
    if (r.subcategory === 'alkali')       return true;
    if (r.subcategory === 'acid')         return !r.id.endsWith('_conc');
    return false;
  }
  if (r.category === 'solid') {
    return ['metal', 'carbonate', 'oxide', 'salt'].includes(r.subcategory);
  }
  return false;
});

/** Ion symbols that carry a positive charge. */
function _cations(reagent) {
  return Object.keys(reagent.ions ?? {}).filter(s => s.includes('+'));
}

/** Ion symbols that carry a negative charge (excluding molecular species). */
function _anions(reagent) {
  return Object.keys(reagent.ions ?? {}).filter(s => s.includes('-') && !s.includes('+'));
}

/**
 * Returns true if mixing reagentA and reagentB would produce a precipitate,
 * i.e. any cation from one salt pairs with an anion from the other in
 * PRECIPITATION_TABLE with a non-null entry.
 */
function _wouldPrecipitate(a, b) {
  const catsA = _cations(a), ansA = _anions(a);
  const catsB = _cations(b), ansB = _anions(b);
  for (const cat of catsA) for (const an of ansB)
    if (PRECIPITATION_TABLE[cat]?.[an] != null) return true;
  for (const cat of catsB) for (const an of ansA)
    if (PRECIPITATION_TABLE[cat]?.[an] != null) return true;
  return false;
}

/** Fast reagent lookup by id — used during answer checking. */
const _REAGENT_BY_ID = new Map(REAGENTS.map(r => [r.id, r]));

// Na⁺ and K⁺ have no reliable bench test (flame test only) so they are
// excluded from the identification list.
const _CATION_EXCLUDE = new Set(['Na+', 'K+']);

/** All testable cation symbols appearing across UNKNOWN_POOL (sorted). */
const _ALL_CATIONS = [...new Set(UNKNOWN_POOL.flatMap(r => _cations(r)))]
  .filter(c => !_CATION_EXCLUDE.has(c))
  .sort();
/** All anion symbols appearing across UNKNOWN_POOL (sorted). */
const _ALL_ANIONS  = [...new Set(UNKNOWN_POOL.flatMap(r => _anions(r)))].sort();

/**
 * Format a raw ion symbol using unicode sub/superscripts.
 * 'SO4²-' → 'SO₄²⁻',  'NH4+' → 'NH₄⁺',  'Fe3+' → 'Fe³⁺'
 */
function _fmtIon(sym) {
  const SUBS = '₀₁₂₃₄₅₆₇₈₉';
  // Longest charge suffix first to avoid partial matches (e.g. '3+' before '+').
  const CHARGES = [['3+', '³⁺'], ['2+', '²⁺'], ['²-', '²⁻'], ['+', '⁺'], ['-', '⁻']];
  for (const [raw, pretty] of CHARGES) {
    if (sym.endsWith(raw)) {
      const formula = sym.slice(0, -raw.length);
      const fmtFormula = formula.replace(/\d+/g, n => [...n].map(d => SUBS[+d]).join(''));
      return fmtFormula + pretty;
    }
  }
  return sym;
}

/**
 * Canonical sorted, comma-joined string of every ion present across one or
 * more reagents.  Used as the answer key so that any chemical combination
 * that produces the same ion set is accepted as correct.
 * e.g. NaCl + Ca(NO3)₂  ≡  NaNO3 + CaCl2  → "Ca2+,Cl-,NO3-,Na+"
 */
function _ionKey(...reagents) {
  const ions = new Set();
  for (const r of reagents) for (const ion of Object.keys(r.ions ?? {})) ions.add(ion);
  return [...ions].sort().join(',');
}

function _pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

export class UnknownModeUI {
  /**
   * @param {import('./BenchUI.js').BenchUI}                        benchUI
   * @param {function(string, 'info'|'error'): void}                showToast
   * @param {import('./DragDropManager.js').DragDropManager}        dragDropManager
   */
  constructor(benchUI, showToast, dragDropManager) {
    this._bench       = benchUI;
    this._toast       = showToast;
    this._dm          = dragDropManager;
    this._answers     = null;  // null = no active unknowns
    this._justDropped = false; // suppresses click after a completed drag

    this._btn        = document.getElementById('unknown-mode-btn');
    this._overlay    = document.getElementById('unknown-modal-overlay');
    this._modal      = document.getElementById('unknown-modal');
    this._setupSec   = document.getElementById('unknown-setup-section');
    this._activeSec  = document.getElementById('unknown-active-section');
    this._vesselList = document.getElementById('unknown-vessels-list');
    this._answerEl   = document.getElementById('unknown-answer-display');
    this._stockPanel    = document.getElementById('unknown-stock');
    this._stockItems    = document.getElementById('unknown-stock-items');
    this._guessSec      = document.getElementById('unknown-guess-section');
    this._guessPanel    = document.getElementById('unknown-guess-panel');
    this._guessPanelBody = document.getElementById('unknown-guess-panel-body');

    this._bind();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _bind() {
    this._btn.addEventListener('click', () => this._open());
    this._overlay.addEventListener('click', () => this._close());
    document.getElementById('unknown-modal-close')
      .addEventListener('click', () => this._close());
    document.getElementById('unknown-generate-btn')
      .addEventListener('click', () => this._generate());
    document.getElementById('unknown-reveal-btn')
      .addEventListener('click', () => this._toggleReveal());
    document.getElementById('unknown-reset-btn')
      .addEventListener('click', () => this._reset());

    // Handle all unknown-type drops before BenchUI sees them.
    // Bench-floor: BenchUI ignores type!=='reagent', so we create the vessel.
    // Vessel drops: BenchUI would look up detail.id in REAGENTS (which is the
    //   answer label, not a reagent id), so we resolve it here and re-dispatch
    //   as type==='reagent' with the real reagent id.
    document.addEventListener('chemlab:drop', (e) => {
      const detail = e.detail;
      if (!detail || detail.type !== 'unknown' || !this._answers) return;

      const answer = this._answers.find(a => a.label === detail.id);
      if (!answer) return;

      this._justDropped = true; // block the click event that follows pointerup

      const vesselCard = e.target.closest('[data-vessel-id]');
      if (vesselCard) {
        // Pour into vessel — call handleDrop with the real reagent id.
        const reagentId = answer.reagentA ? answer.reagentA.id : answer.reagent.id;
        this._bench.handleDrop(vesselCard.dataset.vesselId, {
          type: 'reagent', id: reagentId, label: answer.label,
        });
        if (answer.reagentA) {
          // Mixed unknown: also add the second salt.
          this._bench.handleDrop(vesselCard.dataset.vesselId, {
            type: 'reagent', id: answer.reagentB.id, label: answer.label,
          });
        }
      } else {
        // Bench floor — create a fresh vessel.
        let vesselUI;
        if (answer.reagentA) {
          vesselUI = this._bench.addMixedUnknownVessel(answer.reagentA, answer.reagentB, answer.label);
        } else {
          vesselUI = this._bench.addUnknownVessel(answer.reagent, answer.label);
        }
        if (!vesselUI) this._toast('Bench is full — wash a vessel first.', 'error');
      }
    });
  }

  _open() {
    this._modal.hidden   = false;
    this._overlay.hidden = false;
    this._btn.classList.add('active');
  }

  _close() {
    this._modal.hidden   = true;
    this._overlay.hidden = true;
    if (!this._answers) this._btn.classList.remove('active');
  }

  _generate() {
    const mode = document.querySelector('input[name="unknown-mode"]:checked')?.value ?? '1';

    this._answers = [];
    this._answerEl.hidden = true;
    this._answerEl.textContent = '';
    document.getElementById('unknown-reveal-btn').textContent = 'Reveal Answer';

    if (mode === '1') {
      const salt = _pick(UNKNOWN_POOL);
      this._answers.push({ label: 'Unknown A', reagent: salt });
      this._bench.addUnknownVessel(salt, 'Unknown A');

    } else if (mode === '2') {
      const saltA = _pick(UNKNOWN_POOL);
      let saltB;
      do { saltB = _pick(UNKNOWN_POOL); } while (saltB.id === saltA.id);
      this._answers.push(
        { label: 'Unknown A', reagent: saltA },
        { label: 'Unknown B', reagent: saltB },
      );
      this._bench.addUnknownVessel(saltA, 'Unknown A');
      this._bench.addUnknownVessel(saltB, 'Unknown B');

    } else {  // mixed salts
      const saltA  = _pick(UNKNOWN_POOL);
      // Restrict to same category (both liquid or both solid) so a conical flask
      // is never mixed with a solid_dish, and apply the precipitation guard for liquids.
      const pool2  = UNKNOWN_POOL.filter(
        r => r.id !== saltA.id && r.category === saltA.category && !_wouldPrecipitate(saltA, r)
      );
      if (pool2.length === 0) {
        this._toast('Could not find a compatible salt pair — please try again.', 'error');
        this._answers = null;
        return;
      }
      const saltB = _pick(pool2);
      this._answers.push({ label: 'Unknown (mixed)', reagentA: saltA, reagentB: saltB });
      this._bench.addMixedUnknownVessel(saltA, saltB, 'Unknown (mixed)');
    }

    // Build the vessel-tag list shown in the active section
    this._vesselList.innerHTML = '';
    for (const a of this._answers) {
      const tag = document.createElement('div');
      tag.className   = 'unknown-vessel-tag';
      tag.textContent = a.label;
      this._vesselList.appendChild(tag);
    }

    this._setupSec.hidden  = true;
    this._activeSec.hidden = false;
    this._btn.classList.add('active');
    this._buildGuessSection();
    this._buildStockPanel();
    this._close();
    this._toast('Unknown salt(s) added to the bench. More stock available in the right panel.', 'info');
  }

  /** Populate the right-panel stock drawer with one button per active unknown. */
  _buildStockPanel() {
    this._stockItems.innerHTML = '';
    for (const answer of this._answers) {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'unknown-stock-item';
      btn.title     = `Add a fresh vessel of ${answer.label} to the bench`;

      const icon  = document.createElement('span');
      icon.className   = 'unknown-stock-icon';
      icon.textContent = '⚗';
      icon.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className   = 'unknown-stock-label';
      label.textContent = answer.label;

      const hint  = document.createElement('span');
      hint.className   = 'unknown-stock-hint';
      hint.textContent = '+ add';

      btn.append(icon, label, hint);

      this._dm.registerDraggable(btn, {
        type:  'unknown',
        id:    answer.label,   // used by bench-floor drop handler to find the answer
        label: answer.label,
      });

      btn.addEventListener('click', () => {
        if (this._justDropped) { this._justDropped = false; return; }
        let vesselUI;
        if (answer.reagentA) {
          vesselUI = this._bench.addMixedUnknownVessel(answer.reagentA, answer.reagentB, answer.label);
        } else {
          vesselUI = this._bench.addUnknownVessel(answer.reagent, answer.label);
        }
        if (!vesselUI) {
          this._toast('Bench is full — wash a vessel first.', 'error');
        }
      });

      this._stockItems.appendChild(btn);
    }
    this._stockPanel.hidden = false;
  }

  /** Build one ion-identification block per answer — shown in the right panel and mirrored in the modal. */
  _buildGuessSection() {
    this._guessSec.innerHTML       = '';
    this._guessPanelBody.innerHTML = '';

    for (const answer of this._answers) {
      const block = this._buildIonBlock(answer);
      this._guessPanelBody.appendChild(block);
      this._guessSec.appendChild(block.cloneNode(true));
    }

    // Check button in the right panel
    const checkBtnPanel = document.createElement('button');
    checkBtnPanel.type        = 'button';
    checkBtnPanel.className   = 'unknown-check-btn';
    checkBtnPanel.textContent = 'Check Guess';
    checkBtnPanel.addEventListener('click', () => this._checkGuesses(this._guessPanelBody));
    this._guessPanelBody.appendChild(checkBtnPanel);

    // Check button in the modal active section
    const checkBtnModal = document.createElement('button');
    checkBtnModal.type        = 'button';
    checkBtnModal.id          = 'unknown-check-btn';
    checkBtnModal.className   = 'unknown-check-btn';
    checkBtnModal.textContent = 'Check Guess';
    checkBtnModal.addEventListener('click', () => this._checkGuesses(this._guessSec));
    this._guessSec.appendChild(checkBtnModal);

    this._guessPanel.hidden = false;
  }

  /** @private */
  _buildIonBlock(answer) {
    const reagents   = answer.reagentA ? [answer.reagentA, answer.reagentB] : [answer.reagent];
    const answerIons = new Set(_ionKey(...reagents).split(',').filter(Boolean));

    const block = document.createElement('div');
    block.className          = 'unknown-ion-block';
    block.dataset.answerIons = [...answerIons].sort().join(',');

    const title = document.createElement('div');
    title.className   = 'unknown-ion-title';
    title.textContent = answer.label + ' — ions present:';
    block.appendChild(title);

    if (answerIons.size === 0) {
      const note = document.createElement('div');
      note.className   = 'unknown-ion-fallback';
      note.textContent = 'Solid — identify by physical tests';
      block.appendChild(note);
      return block;
    }

    block.appendChild(this._buildIonGroup('Cations', _ALL_CATIONS, answerIons));
    block.appendChild(this._buildIonGroup('Anions',  _ALL_ANIONS,  answerIons));
    return block;
  }

  /** @private */
  _buildIonGroup(groupLabel, ionList, answerIons) {
    const group = document.createElement('div');
    group.className = 'unknown-ion-group';

    const lbl = document.createElement('span');
    lbl.className   = 'unknown-ion-group-label';
    lbl.textContent = groupLabel + ':';
    group.appendChild(lbl);

    const wrap = document.createElement('div');
    wrap.className = 'unknown-ion-items';

    for (const ion of ionList) {
      const item = document.createElement('label');
      item.className = 'unknown-ion-item';

      const cb = document.createElement('input');
      cb.type             = 'checkbox';
      cb.dataset.ion      = ion;
      cb.dataset.expected = answerIons.has(ion) ? '1' : '0';

      const span = document.createElement('span');
      span.textContent = _fmtIon(ion);

      item.append(cb, span);
      wrap.appendChild(item);
    }

    group.appendChild(wrap);
    return group;
  }

  /** @param {HTMLElement} container — the panel or modal section to read ion blocks from */
  _checkGuesses(container) {
    const blocks = [...container.querySelectorAll('.unknown-ion-block')];
    let allCorrect  = true;
    let hasAnyGuess = false;

    for (const block of blocks) {
      const answerIons = new Set((block.dataset.answerIons || '').split(',').filter(Boolean));
      if (answerIons.size === 0) continue;

      for (const item of block.querySelectorAll('.unknown-ion-item')) {
        const cb       = item.querySelector('input[type=checkbox]');
        const expected = answerIons.has(cb.dataset.ion);
        const checked  = cb.checked;

        item.classList.remove('correct', 'wrong', 'missed');
        if (checked) hasAnyGuess = true;

        if      (checked && expected)  item.classList.add('correct');
        else if (checked && !expected) { item.classList.add('wrong');  allCorrect = false; }
        else if (!checked && expected) { item.classList.add('missed'); allCorrect = false; }
      }
    }

    if (hasAnyGuess && allCorrect && blocks.length > 0) this._toast('All ions identified correctly!', 'info');
  }

  _toggleReveal() {
    const btn = document.getElementById('unknown-reveal-btn');
    if (!this._answerEl.hidden) {
      this._answerEl.hidden = true;
      btn.textContent = 'Reveal Answer';
      return;
    }
    const lines = this._answers.map(a =>
      a.reagentA
        ? `${a.label}:\n  ${a.reagentA.label}\n  + ${a.reagentB.label}`
        : `${a.label}:  ${a.reagent.label}`
    );
    this._answerEl.textContent = lines.join('\n\n');
    this._answerEl.hidden = false;
    btn.textContent = 'Hide Answer';
  }

  /** Reset to setup state and clear all bench vessels. */
  _reset() {
    this._bench.clearAll();
    this._answers = null;
    this._answerEl.hidden = true;
    this._answerEl.textContent = '';
    document.getElementById('unknown-reveal-btn').textContent = 'Reveal Answer';
    this._setupSec.hidden  = false;
    this._activeSec.hidden = true;
    this._btn.classList.remove('active');
    this._guessSec.innerHTML       = '';
    this._guessPanelBody.innerHTML = '';
    this._guessPanel.hidden        = true;
    this._stockItems.innerHTML     = '';
    this._stockPanel.hidden        = true;
  }
}
