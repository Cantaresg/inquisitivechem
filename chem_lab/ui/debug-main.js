/**
 * ui/debug-main.js
 * Initialises the DebugLogger and connects it to the BenchUI instance.
 *
 * Imports benchUI directly from main.js — both are ES modules so they share
 * the same module registry; this import is free and avoids any event timing issues.
 */

import { DebugLogger } from './DebugLogger.js';
import { benchUI }     from './main.js';

const panelEl   = document.getElementById('debug-log-panel');
const listEl    = document.getElementById('debug-log-list');
const toggleBtn = document.getElementById('debug-log-nav-btn');
const clearBtn  = document.getElementById('debug-log-clear');
const exportBtn = document.getElementById('debug-log-export');
const closeBtn  = document.getElementById('debug-log-close');

const logger = new DebugLogger(panelEl, listEl, toggleBtn, clearBtn, exportBtn);

closeBtn.addEventListener('click', () => logger.close());

benchUI.setDebugLogger(logger);

