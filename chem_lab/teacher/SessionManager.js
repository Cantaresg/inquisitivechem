/**
 * Chem lab session manager — thin wrapper over the shared SessionLoader.
 * Owns the sim identifier ('chem_lab') and code prefix ('CHEM-').
 */

import {
  createSession,
  loadSession,
  updateSession,
} from '../../../shared/teacher/SessionLoader.js';

const SIM    = 'chem_lab';
const PREFIX = 'CHEM-';

export class SessionManager {
  async createSession(config) {
    return createSession(SIM, PREFIX, config);
  }

  async loadSession(code) {
    return loadSession(code);
  }

  async updateSession(code, config) {
    return updateSession(code, config);
  }
}
