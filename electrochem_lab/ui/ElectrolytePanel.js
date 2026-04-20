/**
 * ui/ElectrolytePanel.js
 * Renders electrolyte selection cards in the #electrolyte-cards container
 * and owns the concentration slider.
 *
 * Does NOT build its own DOM — it hooks into elements created in index.html:
 *   #electrolyte-cards   — the scrollable card row
 *   #conc-slider         — range input
 *   #conc-value          — <strong> showing the live concentration
 *
 * @fires onSelect(record | null)           — electrolyte card selected / deselected
 * @fires onConcentrationChange(record)     — slider moved (only fires if a card is selected)
 */

import {
  ELECTROLYTE_DB,
  getElectrolytesForLevel,
  isChlorideConcentrated,
} from '../data/electrolytes.js';

export class ElectrolytePanel {
  /**
   * @param {object} opts
   * @param {HTMLElement}      opts.cardsContainer         — #electrolyte-cards
   * @param {HTMLInputElement} opts.slider                 — #conc-slider
   * @param {HTMLElement}      opts.sliderValueEl          — #conc-value
   * @param {Function}         opts.onSelect               — callback(record | null)
   * @param {Function}         opts.onConcentrationChange  — callback(record)
   */
  constructor({ cardsContainer, slider, sliderValueEl, onSelect, onConcentrationChange }) {
    this._container = cardsContainer;
    this._slider    = slider;
    this._valEl     = sliderValueEl;
    this._onSelect  = onSelect;
    this._onChange  = onConcentrationChange;

    this._selectedId = null;
    this._level      = 'O_LEVEL';

    this._bindSlider();
    this.renderForLevel('O_LEVEL');
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Re-render cards for a new curriculum level. Clears current selection. */
  renderForLevel(level) {
    this._level      = level;
    this._selectedId = null;
    this._render();
    this._onSelect(null);
  }

  /**
   * The currently-selected electrolyte record with the live slider concentration,
   * or null if nothing is selected.
   * @returns {object | null}
   */
  get selectedRecord() {
    if (!this._selectedId) return null;
    const base = ELECTROLYTE_DB[this._selectedId];
    if (!base) return null;
    const concentration = parseFloat(this._slider.value);
    // Shallow clone with live concentration + recomputed isConcentrated flag
    const record = { ...base, concentration };
    record.isConcentrated = isChlorideConcentrated(record, concentration);
    return record;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = '';
    const electrolytes = getElectrolytesForLevel(this._level);

    for (const elec of electrolytes) {
      const card = document.createElement('div');
      card.className = 'elec-card';
      card.dataset.elecId = elec.id;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Select ${elec.name}`);
      card.setAttribute('title', elec.description);

      card.innerHTML = `
        <div class="elec-colour-dot" style="background:${elec.colour}"></div>
        <div class="elec-formula">${elec.formula}</div>
        <div class="elec-name">${elec.name}</div>
      `;

      card.addEventListener('click', () => this._select(card, elec.id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._select(card, elec.id);
        }
      });

      this._container.appendChild(card);
    }
  }

  _select(card, elecId) {
    // Deselect all, then select clicked
    this._container.querySelectorAll('.elec-card')
      .forEach(c => {
        c.classList.remove('elec-card--selected');
        c.setAttribute('aria-pressed', 'false');
      });

    card.classList.add('elec-card--selected');
    card.setAttribute('aria-pressed', 'true');
    this._selectedId = elecId;

    // Reset slider to this electrolyte's default concentration
    const base = ELECTROLYTE_DB[elecId];
    if (base && this._slider) {
      this._slider.value = base.concentration;
      if (this._valEl) this._valEl.textContent = base.concentration.toFixed(1);
    }

    this._onSelect(this.selectedRecord);
  }

  _bindSlider() {
    if (!this._slider) return;
    this._slider.addEventListener('input', () => {
      const val = parseFloat(this._slider.value);
      if (this._valEl) this._valEl.textContent = val.toFixed(1);
      if (this._selectedId) {
        this._onChange(this.selectedRecord);
      }
    });
  }
}
