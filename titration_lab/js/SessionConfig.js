/**
 * SessionConfig — load and save lab configuration.
 *
 * Phase 5: reads/writes sessionStorage.
 * Phase 6: full index.html UI writes the config; this class only reads it.
 * Phase 8+: swap load() to GET /api/session/:key — no other class changes.
 *
 * Default config (used when sessionStorage is empty, e.g. direct file:// access)
 * provides a working NaOH vs HCl titration so Phase 5 integration testing is
 * possible without the index.html menu.
 */

const STORAGE_KEY = 'titrationLabConfig';

/** @type {Object} */
const DEFAULT_CONFIG = {
  mode:        'practice',
  level:       'o_level',
  titrant:     'naoh',
  analyte:     'hcl',
  indicator:   'pp',
  temperature: 25,
  Kw:          1e-14,
  concTitrant: 0.1,
  concAnalyte: 0.1,
  sessionKey:  null,
};

export class SessionConfig {
  /**
   * Load configuration from sessionStorage (or fall back to the default).
   * Returns a plain config object.
   * @param {string|null} [key=null]  Session key (Phase 8+: API lookup)
   * @returns {Promise<Object>}
   */
  static async load(key = null) {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      } catch {
        // Corrupted storage — fall through to default
      }
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Persist config to sessionStorage before navigating to lab.html.
   * @param {Object} config
   */
  static save(config) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}
