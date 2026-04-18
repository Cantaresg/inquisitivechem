/**
 * SetupStage — chemical and indicator selection (practice / openLab modes).
 *
 * Responsibilities
 * ────────────────
 * • Lets the student choose titrant, analyte, concentrations, and indicator.
 * • Validates the pair against ReactionSystem.classify().
 * • Writes resolved Chemical / Indicator objects back to labState.
 * • Skipped in 'guided' mode (config arrives pre-loaded via SessionConfig).
 *
 * Phase 3: UI is deferred.  State can be set programmatically for console tests:
 *   stage.setTitrant('naoh', 0.1)
 *   stage.setAnalyte('hcl', 0.1)
 *   stage.setIndicator('mo')
 */

import { Stage }                           from './Stage.js';
import { ChemicalDB }                      from '../data/ChemicalDB.js';
import { IndicatorDB }                     from '../data/IndicatorDB.js';
import { ReactionSystem, UnknownPairError } from '../engine/ReactionSystem.js';

export class SetupStage extends Stage {
  constructor(deps) {
    super('setup', 'Setup', deps);
  }

  // ── Programmatic setters (console-testable API) ───────────────────────────

  /**
   * Choose the titrant (burette chemical) and its concentration.
   * @param {string} chemId
   * @param {number} concMolPerL
   * @returns {{ ok: boolean, reason: string }}
   */
  setTitrant(chemId, concMolPerL) {
    const chem = ChemicalDB.get(chemId);
    if (!chem) return { ok: false, reason: `Unknown chemical: "${chemId}"` };
    this._state.titrant     = chem;
    this._state.titrantConc = concMolPerL;
    return { ok: true, reason: '' };
  }

  /**
   * Choose the analyte (flask chemical) and its concentration.
   * In openLab mode the concentration is typically unknown (pass 0 or null).
   * @param {string} chemId
   * @param {number} concMolPerL
   * @returns {{ ok: boolean, reason: string }}
   */
  setAnalyte(chemId, concMolPerL) {
    const chem = ChemicalDB.get(chemId);
    if (!chem) return { ok: false, reason: `Unknown chemical: "${chemId}"` };
    this._state.analyte     = chem;
    this._state.analyteConc = concMolPerL;
    return { ok: true, reason: '' };
  }

  /**
   * Choose the indicator.
   * @param {string} indicatorId
   * @returns {{ ok: boolean, reason: string }}
   */
  setIndicator(indicatorId) {
    const ind = IndicatorDB.get(indicatorId);
    if (!ind) return { ok: false, reason: `Unknown indicator: "${indicatorId}"` };
    this._state.indicator = ind;
    return { ok: true, reason: '' };
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
    const s = this._state;
    const chemicals  = [...ChemicalDB.all()];
    const indicators = [...IndicatorDB.all()];

    const card = (chem, selected, action) =>
      `<div class="setup-card ${selected ? 'selected' : ''}" data-action="${action}" data-id="${chem.id}" style="cursor:pointer;">
        <h4><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${chem.dot ?? 'var(--accent)'};margin-right:6px;vertical-align:middle;"></span>${chem.formula}</h4>
        <p>${chem.name} · ${chem.strong ? 'Strong' : 'Weak'} ${chem.type}</p>
      </div>`;

    const indCard = (ind, selected) =>
      `<div class="setup-card ${selected ? 'selected' : ''}" data-action="indicator" data-id="${ind.id}" style="cursor:pointer;">
        <h4><span class="ind-dot" style="background:${ind.alkCol}"></span>${ind.name}</h4>
        <p>${ind.desc ?? ''}</p>
      </div>`;

    el.innerHTML = `
      <div style="width:100%;max-width:640px;padding:20px;display:grid;grid-template-columns:1fr 1fr;gap:20px;overflow-y:auto;max-height:100%;">
        <div>
          <div class="panel-section-title">In Burette (Titrant)</div>
          ${chemicals.map(c => card(c, s.titrant?.id === c.id, 'titrant')).join('')}
        </div>
        <div>
          <div class="panel-section-title">In Flask (Analyte)</div>
          ${chemicals.map(c => card(c, s.analyte?.id === c.id, 'analyte')).join('')}
          <div class="panel-section-title" style="margin-top:14px;">Indicator</div>
          ${indicators.map(i => indCard(i, s.indicator?.id === i.id)).join('')}
        </div>
      </div>`;

    el.querySelectorAll('[data-action]').forEach(cardEl => {
      cardEl.addEventListener('click', () => {
        const { action, id } = cardEl.dataset;
        if (action === 'titrant')   this.setTitrant(id, s.titrantConc ?? 0.1);
        if (action === 'analyte')   this.setAnalyte(id, s.analyteConc ?? 0.1);
        if (action === 'indicator') this.setIndicator(id);
        this.renderArea(el);
        this._bus.emit('stageAreaUpdated', { stageId: this.id });
      });
    });
  }

  renderControls(el) {
    const s = this._state;
    const v = this.validate();
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;width:100%;">
        <label style="font-size:11px;color:var(--muted);">Level:</label>
        <select id="level-select" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);font-family:'Inconsolata',monospace;font-size:12px;padding:4px 8px;border-radius:4px;outline:none;">
          <option value="jc"      ${(s.level ?? 'jc') === 'jc'      ? 'selected' : ''}>JC / IB (Full)</option>
          <option value="o_level" ${s.level === 'o_level' ? 'selected' : ''}>O-Level / IGCSE</option>
        </select>
        <label style="font-size:11px;color:var(--muted);margin-left:12px;">
          <input type="checkbox" id="open-lab-chk" ${s.isOpenLab ? 'checked' : ''} style="accent-color:var(--accent);margin-right:4px;">
          Open Lab (randomise analyte concentration)
        </label>
        <div style="margin-left:auto;font-size:11px;" id="setup-validity"
             style="color:${v.ok ? 'var(--accent3)' : 'var(--muted)'};">
          ${v.ok ? '✓ Ready' : (v.reason || 'Select chemicals')}
        </div>
      </div>`;
    el.querySelector('#level-select')?.addEventListener('change', (e) => {
      s.level = e.target.value;
      this._bus.emit('stageAreaUpdated', { stageId: this.id });
    });
    el.querySelector('#open-lab-chk')?.addEventListener('change', (e) => {
      s.isOpenLab = e.target.checked;
    });
  }

  // ── Validation ────────────────────────────────────────────────────────────

  validate() {
    const { titrant, analyte, indicator } = this._state;

    if (!titrant)   return { ok: false, reason: 'Select a titrant for the burette.' };
    if (!analyte)   return { ok: false, reason: 'Select an analyte for the flask.' };
    if (!indicator) return { ok: false, reason: 'Select an indicator.' };

    try {
      ReactionSystem.classify(titrant, analyte);
    } catch (e) {
      if (e instanceof UnknownPairError) {
        return { ok: false, reason: `No pH model for ${titrant.name} + ${analyte.name}.` };
      }
      throw e;
    }

    this._markComplete();
    return { ok: true, reason: '' };
  }
}
