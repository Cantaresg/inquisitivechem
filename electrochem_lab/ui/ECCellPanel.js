/**
 * ui/ECCellPanel.js
 * Two-half-cell selector for EC Cell (A-Level galvanic cell) mode.
 *
 * Each column lets the student pick a standard half-cell pair (electrode + ion)
 * and set the ion concentration. The panel is self-contained — it does not
 * rely on ELECTROLYTE_DB since galvanic cell half-cells use fixed electrode/ion
 * couples rather than the combined electrolyte model.
 *
 * Callbacks receive a HalfCell object:
 *   { electrodeId: string, ionId: string, concentration: number,
 *     label: string, colour: string, E0: number }
 *
 * Only A-Level electrolytes are shown. The panel is hidden in O-Level mode.
 */

/** Pre-defined A-Level standard half-cell pairs (E° values match ELECTRODE_DB). */
export const HALF_CELL_PAIRS = [
  {
    id:          'zn',
    label:       'Zn²⁺/Zn',
    formula:     'Zn²⁺(aq) | Zn(s)',
    electrodeId: 'zinc',
    ionId:       'Zn2+',
    E0:          -0.76,
    defaultConc: 1.0,
    colour:      '#b8c9b8',
  },
  {
    id:          'fe',
    label:       'Fe²⁺/Fe',
    formula:     'Fe²⁺(aq) | Fe(s)',
    electrodeId: 'iron',
    ionId:       'Fe2+',
    E0:          -0.44,
    defaultConc: 1.0,
    colour:      '#c4986a',
  },
  {
    id:          'cu',
    label:       'Cu²⁺/Cu',
    formula:     'Cu²⁺(aq) | Cu(s)',
    electrodeId: 'copper',
    ionId:       'Cu2+',
    E0:          +0.34,
    defaultConc: 1.0,
    colour:      '#4a90d9',
  },
  {
    id:          'ag',
    label:       'Ag⁺/Ag',
    formula:     'Ag⁺(aq) | Ag(s)',
    electrodeId: 'silver',
    ionId:       'Ag+',
    E0:          +0.80,
    defaultConc: 1.0,
    colour:      'rgba(200,220,255,0.25)',
  },
];

const MIN_CONC  = 0.01;
const MAX_CONC  = 2.00;
const DEF_CONC  = 1.00;
const CONC_STEP = 0.01;

export class ECCellPanel {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container      — element to build the panel inside
   * @param {Function}    opts.onLeftChange   — callback(halfCell | null)
   * @param {Function}    opts.onRightChange  — callback(halfCell | null)
   */
  constructor({ container, onLeftChange, onRightChange }) {
    this._container     = container;
    this._onLeftChange  = onLeftChange;
    this._onRightChange = onRightChange;

    this._leftPairId  = null;
    this._rightPairId = null;
    this._leftConc    = DEF_CONC;
    this._rightConc   = DEF_CONC;

    this._build();
  }

  // ── Public API ──────────────────────────────────────────────────────

  setVisible(visible) {
    this._container.hidden = !visible;
  }

  get leftHalfCell()  { return this._makeHalfCell(this._leftPairId,  this._leftConc);  }
  get rightHalfCell() { return this._makeHalfCell(this._rightPairId, this._rightConc); }
  get isComplete()    { return !!(this._leftPairId && this._rightPairId); }

  // ── DOM construction ──────────────────────────────────────────────────────

  _build() {
    this._container.innerHTML = '';
    this._container.classList.add('eccell-panel');

    const sides = [
      { title: 'Left half-cell (−/anode)',    side: 'left' },
      { title: 'Right half-cell (+/cathode)', side: 'right' },
    ];

    for (const { title, side } of sides) {
      const col = document.createElement('div');
      col.className = 'eccell-half';
      col.dataset.side = side;
      col.innerHTML = `
        <h4 class="eccell-half-title">${title}</h4>
        <div class="eccell-cards" role="listbox"
             aria-label="${title} half-cell selector"></div>
        <div class="eccell-conc-row">
          <label class="eccell-conc-label">c(Mⁿ⁺) =</label>
          <input class="eccell-slider" type="range"
                 min="${MIN_CONC}" max="${MAX_CONC}"
                 step="${CONC_STEP}" value="${DEF_CONC}">
          <strong class="eccell-conc-value">${DEF_CONC.toFixed(2)}</strong>
          <span class="eccell-conc-unit"> mol dm⁻³</span>
        </div>
      `;
      this._container.appendChild(col);

      const cardsEl = col.querySelector('.eccell-cards');
      const slider  = col.querySelector('.eccell-slider');
      const valEl   = col.querySelector('.eccell-conc-value');

      if (side === 'left') {
        this._leftCardsEl = cardsEl;
        this._leftSlider  = slider;
        this._leftValEl   = valEl;
      } else {
        this._rightCardsEl = cardsEl;
        this._rightSlider  = slider;
        this._rightValEl   = valEl;
      }

      this._renderCards(cardsEl, side);
      this._bindSlider(slider, valEl, side);
    }
  }

  _renderCards(cardsEl, side) {
    cardsEl.innerHTML = '';
    for (const pair of HALF_CELL_PAIRS) {
      const card = document.createElement('div');
      card.className = 'eccell-pair-card';
      card.dataset.pairId = pair.id;
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', 'false');
      card.setAttribute('tabindex', '0');
      card.innerHTML = `
        <span class="eccell-e0-badge">${pair.E0 >= 0 ? '+' : ''}${pair.E0.toFixed(2)} V</span>
        <span class="eccell-pair-label">${pair.label}</span>
        <span class="eccell-pair-formula">${pair.formula}</span>
      `;
      card.style.setProperty('--pair-colour', pair.colour);

      const select = () => this._selectPair(card, cardsEl, pair.id, side);
      card.addEventListener('click', select);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      cardsEl.appendChild(card);
    }
  }

  _selectPair(card, cardsEl, pairId, side) {
    for (const c of cardsEl.querySelectorAll('.eccell-pair-card')) {
      c.classList.remove('eccell-pair-card--selected');
      c.setAttribute('aria-selected', 'false');
    }
    card.classList.add('eccell-pair-card--selected');
    card.setAttribute('aria-selected', 'true');

    if (side === 'left') {
      this._leftPairId = pairId;
      this._onLeftChange(this.leftHalfCell);
    } else {
      this._rightPairId = pairId;
      this._onRightChange(this.rightHalfCell);
    }
  }

  _bindSlider(slider, valEl, side) {
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      valEl.textContent = val.toFixed(2);
      if (side === 'left') {
        this._leftConc = val;
        if (this._leftPairId) this._onLeftChange(this.leftHalfCell);
      } else {
        this._rightConc = val;
        if (this._rightPairId) this._onRightChange(this.rightHalfCell);
      }
    });
  }

  _makeHalfCell(pairId, concentration) {
    if (!pairId) return null;
    const pair = HALF_CELL_PAIRS.find(p => p.id === pairId);
    if (!pair) return null;
    return { electrodeId: pair.electrodeId, ionId: pair.ionId, concentration,
             label: pair.label, colour: pair.colour, E0: pair.E0 };
  }
}
