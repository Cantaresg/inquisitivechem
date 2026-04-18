/**
 * StageController — manages stage sequencing for one lab session.
 *
 * Receives a pre-filtered Stage[] from TitrationLab (filtered by mode).
 * The controller itself is mode-unaware — it only owns the current pointer.
 *
 * advance() lifecycle:
 *   1. current.validate()         — if not ok, return the error reason
 *   2. current.exit()
 *   3. advance internal pointer
 *   4. next.enter()
 *   5. emit 'stageChanged' on bus
 *
 * Event: 'stageChanged' → { prevId: string, nextId: string, stage: Stage }
 */

export class StageController {
  /** @type {import('./stages/Stage.js').Stage[]} */
  #stages;
  /** @type {import('./EventBus.js').EventBus} */
  #bus;
  /** @type {number} */
  #index = 0;

  /**
   * @param {import('./stages/Stage.js').Stage[]} stages  Pre-filtered list for this mode.
   * @param {import('./EventBus.js').EventBus}    bus
   */
  constructor(stages, bus) {
    if (!stages || stages.length === 0) {
      throw new Error('StageController: stages array must not be empty');
    }
    this.#stages = stages;
    this.#bus    = bus;
    // Activate the first stage
    this.#stages[0].enter();
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get current()        { return this.#stages[this.#index]; }
  /** Alias used by UIRenderer. */
  get currentStage()   { return this.#stages[this.#index]; }
  get currentId()      { return this.current.id; }
  get currentIndex()   { return this.#index; }
  get stageCount()     { return this.#stages.length; }
  /** Read-only view of the full stage list (used by UIRenderer for nav pills). */
  get stages()         { return this.#stages; }
  /** True if there is a previous stage to return to. */
  canGoBack()          { return this.#index > 0; }

  // ── Navigation ────────────────────────────────────────────────────────────

  /**
   * Validate the current stage and advance to the next if ok.
   * On the last stage, marks it complete but returns ok without moving.
   * @returns {{ ok: boolean, reason: string }}
   */
  advance() {
    const validation = this.current.validate();
    if (!validation.ok) return validation;

    if (this.#index >= this.#stages.length - 1) {
      // Last stage — nothing to advance to; result is still ok
      return { ok: true, reason: '' };
    }

    const prev = this.current;
    prev.exit();
    this.#index++;
    const next = this.current;
    next.enter();

    this.#bus.emit('stageChanged', { prevId: prev.id, nextId: next.id, stage: next });
    return { ok: true, reason: '' };
  }

  /**
   * Exit the current stage and return to the previous one.
   * Always allowed unless already on the first stage.
   * @returns {{ ok: boolean, reason: string }}
   */
  back() {
    if (this.#index === 0) {
      return { ok: false, reason: 'Already on the first stage.' };
    }
    const prev = this.current;
    prev.exit();
    this.#index--;
    const next = this.current;
    next.enter();

    this.#bus.emit('stageChanged', { prevId: prev.id, nextId: next.id, stage: next });
    return { ok: true, reason: '' };
  }

  /**
   * Jump directly to a stage by id.
   * Only permitted if all preceding stages have been marked complete.
   * @param {string} id
   * @returns {{ ok: boolean, reason: string }}
   */
  jumpTo(id) {
    const idx = this.#stages.findIndex(s => s.id === id);
    if (idx === -1) return { ok: false, reason: `Unknown stage id: "${id}"` };
    if (this.isLocked(id)) return { ok: false, reason: `Stage "${id}" is locked.` };

    const prev = this.current;
    prev.exit();
    this.#index = idx;
    const next = this.current;
    next.enter();

    this.#bus.emit('stageChanged', { prevId: prev.id, nextId: next.id, stage: next });
    return { ok: true, reason: '' };
  }

  // ── Completion / lock helpers ─────────────────────────────────────────────

  /**
   * @param {string} id
   * @returns {boolean}
   */
  isComplete(id) {
    return this.#stages.find(s => s.id === id)?.isComplete ?? false;
  }

  /**
   * A stage is locked if it appears after the current position AND has not
   * yet been marked complete.  Already-completed stages can be revisited.
   * @param {string} id
   * @returns {boolean}
   */
  isLocked(id) {
    const idx = this.#stages.findIndex(s => s.id === id);
    if (idx === -1) return true;
    if (this.#stages[idx].isComplete) return false;
    return idx > this.#index;
  }
}
