/**
 * teacher/teacher-main.js
 * Top-level wiring for the teacher configuration page.
 *
 * Flow:
 *   step-landing  →  step-create (email) → step-editor   (new session)
 *                 →  step-edit   (code)  → step-editor   (existing session)
 */

import { ActivityEditor }  from './ActivityEditor.js';

// SessionManager is lazy-loaded on first save/load so a CDN failure
// (supabase-client.js fetches from jsdelivr) does not block the landing step.
let _mgr = null;
async function getMgr() {
  if (!_mgr) {
    const { SessionManager } = await import('./SessionManager.js');
    _mgr = new SessionManager();
  }
  return _mgr;
}

// ─── DOM refs ────────────────────────────────────────────────────────────────
const sessionTitleInput  = document.getElementById('session-title');
const googleDocsInput    = document.getElementById('session-docs-url');
const tabBar             = document.getElementById('tab-bar');
const tabPanels          = document.getElementById('tab-panels');
const saveBtn            = document.getElementById('btn-save');
const loadInput          = document.getElementById('load-code-input');
const loadBtn            = document.getElementById('btn-load');
const saveStatus         = document.getElementById('save-status');
const modal              = document.getElementById('code-modal');
const modalCode          = document.getElementById('modal-code-value');
const modalCopyBtn       = document.getElementById('modal-copy-btn');
const modalDocsLink      = document.getElementById('modal-docs-link');
const modalCloseBtn      = document.getElementById('modal-close');
const modalNewBtn        = document.getElementById('modal-new-session');
const toastContainer     = document.getElementById('toast-container');

// ─── App state ───────────────────────────────────────────────────────────────

/** @type {Array<{ editor: ActivityEditor, tabBtn: HTMLElement, panel: HTMLElement, labelSpan: HTMLElement }>} */
const activities = [];

let currentIndex  = 0;
let sessionCode   = null;   // null = new; 'CHEM-XXXX' = editing existing
let teacherEmail  = '';

// ─── Step navigation ─────────────────────────────────────────────────────────
const STEPS = ['step-landing', 'step-create', 'step-edit', 'step-editor'];

function showStep(id) {
  for (const s of STEPS) {
    document.getElementById(s).hidden = (s !== id);
  }
}

// Landing
document.getElementById('btn-new').addEventListener('click', () => {
  showStep('step-create');
  document.getElementById('teacher-email').focus();
});

document.getElementById('btn-load-choice').addEventListener('click', () => {
  showStep('step-edit');
  loadInput.value = '';
  loadInput.focus();
});

// Create path
document.getElementById('btn-create-back').addEventListener('click', () => showStep('step-landing'));

document.getElementById('btn-create-continue').addEventListener('click', () => {
  teacherEmail = document.getElementById('teacher-email').value.trim();
  sessionCode  = null;
  clearEditor();
  addActivity();
  showStep('step-editor');
  setStatus('');
});

// Edit path
document.getElementById('btn-edit-back').addEventListener('click', () => showStep('step-landing'));

loadBtn.addEventListener('click', loadSession);
loadInput.addEventListener('keydown', e => { if (e.key === 'Enter') loadSession(); });

// ─── Activity management ─────────────────────────────────────────────────────

function addActivity(initConfig = null) {
  const idx   = activities.length;
  const label = initConfig?.title || `Activity ${idx + 1}`;

  const tabBtn = document.createElement('button');
  tabBtn.type      = 'button';
  tabBtn.className = 'tab-btn';
  tabBtn.dataset.idx = idx;

  const labelSpan = document.createElement('span');
  labelSpan.className   = 'tab-label';
  labelSpan.textContent = label;

  const closeBtn = document.createElement('button');
  closeBtn.type      = 'button';
  closeBtn.className = 'tab-close';
  closeBtn.title     = 'Remove activity';
  closeBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeActivity(activities.indexOf(entry));
  });

  tabBtn.appendChild(labelSpan);
  tabBtn.appendChild(closeBtn);
  tabBtn.addEventListener('click', () => switchTo(activities.indexOf(entry)));

  tabBar.insertBefore(tabBtn, document.getElementById('tab-add-btn'));

  const panel = document.createElement('div');
  panel.className = 'tab-panel';
  tabPanels.appendChild(panel);

  const editor = new ActivityEditor(undefined, undefined, initConfig);
  panel.appendChild(editor.render());

  const titleInput = panel.querySelector('.ae-title');
  titleInput.addEventListener('input', () => {
    const v = titleInput.value.trim();
    labelSpan.textContent = v || `Activity ${activities.indexOf(entry) + 1}`;
  });

  const entry = { editor, tabBtn, panel, labelSpan };
  activities.push(entry);
  switchTo(idx);
  return entry;
}

function removeActivity(idx) {
  if (activities.length <= 1) {
    showToast('A session must have at least one activity.', 'error');
    return;
  }
  const { tabBtn, panel } = activities[idx];
  tabBtn.remove();
  panel.remove();
  activities.splice(idx, 1);
  activities.forEach((entry, i) => {
    entry.tabBtn.dataset.idx = i;
    if (!entry.panel.querySelector('.ae-title').value.trim()) {
      entry.labelSpan.textContent = `Activity ${i + 1}`;
    }
  });
  switchTo(Math.min(idx, activities.length - 1));
}

function switchTo(idx) {
  currentIndex = idx;
  activities.forEach(({ tabBtn, panel }, i) => {
    tabBtn.classList.toggle('active', i === idx);
    panel.classList.toggle('active', i === idx);
  });
}

function clearEditor() {
  sessionTitleInput.value = '';
  googleDocsInput.value   = '';
  while (activities.length) {
    const { tabBtn, panel } = activities.pop();
    tabBtn.remove();
    panel.remove();
  }
}

// ─── Save ────────────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', saveSession);

async function saveSession() {
  const title   = sessionTitleInput.value.trim();
  const docsUrl = googleDocsInput.value.trim();

  if (!title) {
    showToast('Please enter a session title.', 'error');
    sessionTitleInput.focus();
    return;
  }

  const config = {
    title,
    googleDocsUrl: docsUrl,
    teacherEmail:  teacherEmail || undefined,
    createdAt:     new Date().toISOString(),
    activities:    activities.map(a => a.editor.getConfig()),
  };

  saveBtn.disabled = true;
  setStatus('Saving…');

  try {
    const mgr = await getMgr();
    if (sessionCode) {
      await mgr.updateSession(sessionCode, config);
      setStatus('Saved.', 'success');
      showCodeModal(sessionCode, docsUrl);
    } else {
      const result = await mgr.createSession(config);
      sessionCode  = result.code;
      setStatus('Saved.', 'success');
      showCodeModal(sessionCode, docsUrl);
      if (teacherEmail) _sendSessionEmail(sessionCode, config.title, teacherEmail);
    }
  } catch (err) {
    console.error(err);
    setStatus('Save failed.', 'error');
    showToast('Could not save session. Check your Supabase config.', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

async function _sendSessionEmail(code, title, email) {
  try {
    const url = 'https://phkikdadobwnqwdsdjyq.supabase.co/functions/v1/send-email';
    await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to:      email,
        subject: `Your lab session code: ${code}`,
        html:    _sessionEmailHtml(code, title),
      }),
    });
  } catch {
    // Non-fatal — session is already saved; code shown in modal.
    console.warn('Session email could not be sent.');
  }
}

function _sessionEmailHtml(code, title) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d1018;color:#eef2ff;border-radius:12px">
  <p style="margin:0 0 4px;font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:#5a6882">InquisitiveChemistry</p>
  <h1 style="margin:0 0 ${title ? '8px' : '20px'};font-size:1.3rem;font-weight:400;color:#eef2ff">Your lab session is ready</h1>
  ${title ? `<p style="margin:0 0 20px;font-size:0.9rem;color:#a8b4d0">${esc(title)}</p>` : ''}
  <div style="background:#07090f;border:1px solid #1e2535;border-radius:10px;padding:20px;text-align:center;margin-bottom:22px">
    <p style="margin:0 0 6px;font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:#5a6882">Session Code</p>
    <p style="margin:0;font-family:monospace;font-size:2rem;letter-spacing:0.15em;color:#4df0b0">${esc(code)}</p>
  </div>
  <p style="margin:0 0 10px;font-size:0.85rem;color:#a8b4d0;line-height:1.6">Share this code with your students. They enter it in the <strong style="color:#eef2ff">Qualitative Analysis Lab</strong> to join your session.</p>
  <p style="margin:0;font-size:0.78rem;color:#5a6882;line-height:1.5">To edit this session later, open the teacher page and choose <strong style="color:#a8b4d0">Edit Existing Session</strong>.</p>
</div>`;
}

// ─── Load ────────────────────────────────────────────────────────────────────

async function loadSession() {
  const code = loadInput.value.trim().toUpperCase();
  if (!code) return;

  loadBtn.disabled = true;
  setStatus('Loading…');

  try {
    const mgr = await getMgr();
    const { code: resolvedCode, config } = await mgr.loadSession(code);
    sessionCode  = resolvedCode;
    teacherEmail = config.teacherEmail || '';

    sessionTitleInput.value = config.title        || '';
    googleDocsInput.value   = config.googleDocsUrl || '';

    clearEditor();
    (config.activities || []).forEach(actCfg => addActivity(actCfg));
    if (!activities.length) addActivity();

    setStatus(`Loaded: ${resolvedCode}`, 'success');
    showToast(`Session ${resolvedCode} loaded.`, 'success');
    showStep('step-editor');
  } catch (err) {
    console.error(err);
    setStatus('Not found.', 'error');
    showToast(`Session "${code}" not found.`, 'error');
  } finally {
    loadBtn.disabled = false;
  }
}

// ─── Code modal ──────────────────────────────────────────────────────────────

function showCodeModal(code, docsUrl) {
  modalCode.textContent = code;

  if (docsUrl) {
    modalDocsLink.innerHTML = '';
    const a = document.createElement('a');
    a.href   = docsUrl;
    a.target = '_blank';
    a.rel    = 'noopener noreferrer';
    a.textContent = docsUrl.length > 50 ? docsUrl.slice(0, 50) + '…' : docsUrl;
    modalDocsLink.appendChild(a);
  } else {
    modalDocsLink.innerHTML = '<span class="modal-docs-empty">No Google Docs URL set</span>';
  }

  modal.hidden = false;
}

modalCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(modalCode.textContent);
    modalCopyBtn.classList.add('copied');
    showToast('Code copied to clipboard!', 'success');
    setTimeout(() => modalCopyBtn.classList.remove('copied'), 2000);
  } catch {
    showToast('Copy failed — please copy manually.', 'error');
  }
});

modalCloseBtn.addEventListener('click', () => { modal.hidden = true; });

modalNewBtn.addEventListener('click', () => {
  modal.hidden = true;
  teacherEmail = '';
  clearEditor();
  setStatus('');
  document.getElementById('teacher-email').value = '';
  showStep('step-landing');
});

modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

// ─── Utilities ───────────────────────────────────────────────────────────────

function setStatus(msg, kind = '') {
  saveStatus.textContent = msg;
  saveStatus.className   = `save-status ${kind}`;
}

function showToast(message, kind = 'info') {
  const el = document.createElement('div');
  el.className   = `toast ${kind}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3200);
}

document.getElementById('tab-add-btn').addEventListener('click', () => addActivity());
