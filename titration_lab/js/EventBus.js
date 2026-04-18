/**
 * EventBus — lightweight pub/sub for decoupling simulation from UI.
 *
 * Design notes
 * ─────────────
 * • `on()` returns an unsubscribe function; Stage subclasses should store
 *   these and call them all inside `exit()` to prevent memory leaks (§8.4).
 * • Errors thrown by a handler are caught and reported so they don't silently
 *   kill other handlers registered for the same event.
 * • No dependency on DOM / browser globals — safe to use in Node for testing.
 */
export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map();

  /**
   * Subscribe to an event.
   * @param {string}   event
   * @param {Function} callback  Receives the data payload.
   * @returns {Function} Unsubscribe function — call it inside Stage.exit().
   */
  on(event, callback) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe a specific callback from an event.
   * @param {string}   event
   * @param {Function} callback
   */
  off(event, callback) {
    this.#listeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event, calling all registered handlers with `data`.
   * Handler errors are caught individually so they don't cancel sibling handlers.
   * @param {string} event
   * @param {*}      [data]
   */
  emit(event, data) {
    const handlers = this.#listeners.get(event);
    if (!handlers) return;
    for (const cb of handlers) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[EventBus] Handler for "${event}" threw:`, err);
      }
    }
  }
}
