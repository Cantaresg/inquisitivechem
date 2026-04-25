/**
 * TitrationLab — top-level controller; wires all components for one lab session.
 *
 * Construction order:
 *   1. EventBus (shared message backbone)
 *   2. PHEngine (temperature / Kw from config)
 *   3. BuretteSimulator, FlaskSimulator
 *   4. labState (plain object shared by all stages as a read/write context)
 *   5. Stage list filtered by mode
 *   6. StageController (activates stage[0].enter() on construction)
 *   7. UIRenderer (subscribes to bus; renders shell immediately)
 *
 * labState contracts:
 *   Written by TitrationLab constructor (static config):
 *     titrant, analyte, indicator, titrantConc, analyteConc,
 *     concTitrant (alias), concAnalyte (alias), volAnalyte,
 *     level, mode, isOpenLab, concKnownRange
 *   Written by stages during the lab:
 *     runs        — by TitrateStage.recordResult()
 *   Kept live by TitrationLab bus subscriptions:
 *     volAdded    — updated on 'phUpdated'
 *     buretteLevel — updated on 'levelChanged'
 *     buretteInitial — updated on 'stageChanged' when leaving BuretteStage
 */

import { EventBus }           from './EventBus.js';
import { PHEngine }           from './engine/PHEngine.js';
import { BuretteSimulator }   from './simulation/BuretteSimulator.js';
import { FlaskSimulator }     from './simulation/FlaskSimulator.js';
import { StageController }    from './StageController.js';
import { UIRenderer }         from './ui/UIRenderer.js';
import { ChemicalDB }         from './data/ChemicalDB.js';
import { IndicatorDB }        from './data/IndicatorDB.js';

import { SetupStage }     from './stages/SetupStage.js';
import { StandardStage }  from './stages/StandardStage.js';
import { PipetteStage }   from './stages/PipetteStage.js';
import { BuretteStage }   from './stages/BuretteStage.js';
import { TitrateStage }   from './stages/TitrateStage.js';
import { ResultsStage }   from './stages/ResultsStage.js';

export class TitrationLab {
  /** @type {HTMLElement} */
  #appEl;
  /** @type {Object} Raw config from SessionConfig.load() */
  #config;
  /** @type {import('./EventBus.js').EventBus} */
  #bus;
  /** @type {import('./engine/PHEngine.js').PHEngine} */
  #phEngine;
  /** @type {import('./simulation/BuretteSimulator.js').BuretteSimulator} */
  #burette;
  /** @type {import('./simulation/FlaskSimulator.js').FlaskSimulator} */
  #flask;
  /** @type {Object} Shared plain-object context for stages */
  #labState;
  /** @type {import('./StageController.js').StageController} */
  #stageCtrl;
  /** @type {import('./ui/UIRenderer.js').UIRenderer} */
  #renderer;
  /** Bus unsubscribe functions owned by TitrationLab */
  #unsubs = [];

  /**
   * @param {HTMLElement} appEl  Mount point — its innerHTML will be replaced.
   * @param {Object}      config Resolved config object from SessionConfig.load()
   */
  constructor(appEl, config) {
    this.#appEl  = appEl;
    this.#config = config;
    this._init();
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  _init() {
    const cfg = this.#config;

    // 1. Bus
    this.#bus = new EventBus();

    // 2. Chemistry engine
    this.#phEngine = new PHEngine({
      temperature: cfg.temperature ?? 25,
      Kw:          cfg.Kw         ?? 1e-14,
    });

    // 3. Simulators
    this.#burette = new BuretteSimulator(this.#bus);
    this.#flask   = new FlaskSimulator(this.#bus, this.#phEngine);

    // 4. Resolve chemicals / indicator from DB
    const titrant   = ChemicalDB.get(cfg.titrant);
    const analyte   = ChemicalDB.get(cfg.analyte);
    const indicator = IndicatorDB.get(cfg.indicator);

    // 5. labState — all stages share this object by reference
    this.#labState = {
      // Static config
      mode:        cfg.mode        ?? 'practice',
      level:       cfg.level       ?? 'o_level',
      subType:     cfg.subType     ?? null,
      isOpenLab:   cfg.mode === 'openLab',
      titrant,
      analyte,
      indicator,
      titrantConc:  cfg.concTitrant ?? 0.1,
      analyteConc:  cfg.concAnalyte ?? 0.1,
      concTitrant:  cfg.concTitrant ?? 0.1,   // alias for UIRenderer
      concAnalyte:  cfg.concAnalyte ?? 0.1,   // alias for UIRenderer
      volAnalyte:   25,
      concKnownRange: cfg.concKnownRange ?? null,
      // Dynamic — kept live by bus subscriptions below
      runs:          [],
      actionLog:     [],   // { action, detail, level } entries from logAction bus
      volAdded:      0,
      buretteLevel:  50,
      buretteInitial: 0,
    };

    // 6. Stage list
    const stages = this._buildStageList();

    // 7. Stage controller (calls stages[0].enter())
    this.#stageCtrl = new StageController(stages, this.#bus);

    // 8. Keep labState live
    this._subscribeLive();

    // 9. UI renderer (builds the shell and renders immediately)
    this.#renderer = new UIRenderer(
      this.#appEl,
      this.#bus,
      this.#stageCtrl,
      this.#labState,
    );
  }

  // ── Stage list factory ────────────────────────────────────────────────────

  /**
   * Build and return the pre-filtered Stage[] for this session's mode.
   * StageController receives the result and is never mode-aware itself.
   * @returns {import('./stages/Stage.js').Stage[]}
   */
  _buildStageList() {
    const deps = {
      bus:      this.#bus,
      labState: this.#labState,
      burette:  this.#burette,
      flask:    this.#flask,
      renderer: null,   // stages call bus.emit('toast') — UIRenderer listens
    };

    const { mode, level } = this.#labState;
    const all = {
      setup:    new SetupStage(deps),
      standard: new StandardStage(deps),
      pipette:  new PipetteStage(deps),
      burette:  new BuretteStage(deps),
      titrate:  new TitrateStage(deps),
      results:  new ResultsStage(deps),
    };

    /** @type {import('./stages/Stage.js').Stage[]} */
    let list;

    if (mode === 'guided') {
      // SetupStage skipped — config arrives pre-loaded.
      // StandardStage shown only for JC/IB level.
      list = level === 'jc'
        ? [all.standard, all.pipette, all.burette, all.titrate, all.results]
        : [all.pipette, all.burette, all.titrate, all.results];
    } else {
      // practice / openLab — SetupStage first.
      // JC level adds StandardStage (weighing primary standard before pipetting).
      list = (level === 'jc')
        ? [all.setup, all.standard, all.pipette, all.burette, all.titrate, all.results]
        : [all.setup, all.pipette, all.burette, all.titrate, all.results];
    }

    return list;
  }

  // ── Live labState sync ────────────────────────────────────────────────────

  _subscribeLive() {
    this.#unsubs.push(
      // Track volume added for the left-panel display (payload is cumulative this run)
      this.#bus.on('phUpdated', ({ volAdded }) => {
        this.#labState.volAdded = volAdded;
      }),
      // Keep burette level current so sub-renderers can sync on mount
      this.#bus.on('levelChanged', ({ level }) => {
        this.#labState.buretteLevel = level;
      }),
      // On stage transition, re-sync buretteInitial for new run context.
      // Add 0.10 mL meniscus sag so the display matches the student's reading
      // (bottom of meniscus) rather than the raw glass-contact-line position.
      this.#bus.on('stageChanged', ({ nextId }) => {
        if (nextId === 'titrate') {
          this.#labState.buretteInitial = (this.#burette.initialReading ?? 0) + 0.10;
          this.#labState.volAdded = 0;
        }
      }),
      // New run started inside TitrateStage
      this.#bus.on('newRunStarted', () => {
        this.#labState.buretteInitial = (this.#burette.initialReading ?? 0) + 0.10;
        this.#labState.volAdded = 0;
      }),
      // Accumulate all action-log entries so ResultsStage can surface mistakes
      this.#bus.on('logAction', ({ action, detail, level }) => {
        this.#labState.actionLog.push({ action, detail: detail ?? '', level: level ?? 'action' });
      }),
    );
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Reset the entire lab session: re-instantiate simulators and restart from
   * the first stage without a full page reload.
   */
  reset() {
    this.#renderer.destroy();
    this.#unsubs.forEach(fn => fn());
    this.#unsubs = [];
    this._init();
  }

  /**
   * Export all recorded runs to a CSV file and trigger a browser download.
   * Column order: Run, Rough, Initial (mL), Final (mL), Titre (mL)
   */
  exportCSV() {
    const runs = this.#labState.runs ?? [];
    if (runs.length === 0) {
      this.#bus.emit('toast', { message: 'No runs to export yet.', type: 'warning' });
      return;
    }

    const header = 'Run,Rough,Initial (mL),Final (mL),Titre (mL)';
    const rows   = runs.map(r =>
      [
        r.isRough ? 'R' : r.runNumber,
        r.isRough ? 'true' : 'false',
        r.initialReading.toFixed(2),
        r.finalReading.toFixed(2),
        r.titre.toFixed(2),
      ].join(',')
    );

    const csv  = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'titration-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Accessors (for testing / debugging) ─────────────────────────────────

  get labState()    { return this.#labState; }
  get stageCtrl()   { return this.#stageCtrl; }
  get burette()     { return this.#burette; }
  get flask()       { return this.#flask; }
  get bus()         { return this.#bus; }
}
