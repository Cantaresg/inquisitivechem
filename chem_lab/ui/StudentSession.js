/**
 * ui/StudentSession.js
 * Manages the student session join flow for the Qualitative Analysis Lab.
 *
 * Flow:
 *   1. "Join Session" button in nav → opens join modal
 *   2. Student enters code, name, class → submits
 *   3. Config fetched from Supabase via shared SessionLoader
 *   4. Lab restricted to allowedReagents / allowedTests for the first activity
 *   5. Session info strip shown in title bar; Instructions button opens detail modal
 *
 * If ?session=CODE is present in the URL the modal opens pre-filled.
 */

export class StudentSession {
  /**
   * @param {import('./ChemStoreUI.js').ChemStoreUI} chemStore
   * @param {import('./TestBarUI.js').TestBarUI}     testBar
   * @param {function(string, string): void}         showToast
   */
  constructor(chemStore, testBar, showToast) {
    this._store   = chemStore;
    this._testBar = testBar;
    this._toast   = showToast;
    this._student = null;          // { name, cls, code }
    this._activity = null;         // first activity config

    this._bindJoinBtn();
    this._bindJoinModal();
    this._bindInstructionsModal();

    // Auto-open if the teacher shared a direct URL with ?session=CODE
    const urlCode = new URLSearchParams(location.search).get('session');
    if (urlCode) this._openJoinModal(urlCode.toUpperCase().trim());
  }

  // ─── Join button ─────────────────────────────────────────────────────────

  _bindJoinBtn() {
    document.getElementById('join-session-btn')
      .addEventListener('click', () => this._openJoinModal());
  }

  // ─── Join modal ──────────────────────────────────────────────────────────

  _openJoinModal(prefillCode = '') {
    const modal = document.getElementById('join-modal');
    const codeInput = document.getElementById('join-code');
    if (prefillCode) codeInput.value = prefillCode;
    document.getElementById('join-error').hidden = true;
    modal.hidden = false;
    (prefillCode ? document.getElementById('join-name') : codeInput).focus();
  }

  _bindJoinModal() {
    const modal    = document.getElementById('join-modal');
    const close    = () => { modal.hidden = true; };

    document.getElementById('join-modal-close').addEventListener('click', close);
    document.getElementById('join-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    // Auto-uppercase code as typed
    document.getElementById('join-code').addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase();
    });

    // Enter on any field submits
    for (const id of ['join-code', 'join-name', 'join-class']) {
      document.getElementById(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') this._submit();
      });
    }

    document.getElementById('join-submit').addEventListener('click', () => this._submit());
  }

  async _submit() {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const name = document.getElementById('join-name').value.trim();
    const cls  = document.getElementById('join-class').value.trim();

    if (!code) { this._setError('Please enter a session code.'); return; }
    if (!name) { this._setError('Please enter your name.');       return; }
    if (!cls)  { this._setError('Please enter your class.');      return; }

    const btn = document.getElementById('join-submit');
    btn.disabled = true;
    btn.textContent = 'Joining…';
    document.getElementById('join-error').hidden = true;

    try {
      const { loadSession } = await import('../../../shared/teacher/SessionLoader.js');
      const { config } = await loadSession(code);

      this._student  = { name, cls, code };
      document.getElementById('join-modal').hidden = true;
      this._applyConfig(config);
      this._toast(`Welcome, ${name}! Session ${code} loaded.`, 'info');
    } catch (err) {
      console.error(err);
      this._setError(`Session "${code}" not found. Check the code and try again.`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Join Session';
    }
  }

  _setError(msg) {
    const el = document.getElementById('join-error');
    el.textContent = msg;
    el.hidden = false;
  }

  // ─── Apply session config ────────────────────────────────────────────────

  _applyConfig(config) {
    const activity = (config.activities || [])[0];
    if (!activity) return;
    this._activity = activity;

    if (activity.allowedReagents?.length) {
      this._store.filter(new Set(activity.allowedReagents));
    }
    if (activity.allowedTests?.length) {
      this._testBar.filter(new Set(activity.allowedTests));
    }

    this._showSessionStrip(config, activity);
  }

  _showSessionStrip(config, activity) {
    document.getElementById('lab-title-text').textContent =
      activity.title || config.title || 'Virtual Chemistry Lab';
    document.getElementById('lab-title-badge').hidden = true;
    document.getElementById('lab-version').hidden = true;

    document.getElementById('session-code-badge').textContent = this._student.code;

    const docsLink = document.getElementById('session-docs-link');
    if (config.googleDocsUrl) {
      docsLink.href   = config.googleDocsUrl;
      docsLink.hidden = false;
    }

    document.getElementById('session-info').hidden = false;
  }

  // ─── Instructions modal ──────────────────────────────────────────────────

  _bindInstructionsModal() {
    const modal = document.getElementById('instructions-modal');
    const close = () => { modal.hidden = true; };

    document.getElementById('session-instructions-btn')
      .addEventListener('click', () => this._openInstructions());
    document.getElementById('instructions-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  _openInstructions() {
    const activity = this._activity;
    if (!activity) return;

    document.getElementById('instructions-body').textContent =
      activity.instructions || 'No instructions provided.';

    const qWrap = document.getElementById('instructions-questions');
    qWrap.innerHTML = '';
    if (activity.questions?.length) {
      const h = document.createElement('h3');
      h.className = 'instructions-q-heading';
      h.textContent = 'Questions';
      const ol = document.createElement('ol');
      ol.className = 'instructions-q-list';
      activity.questions.forEach(q => {
        const li = document.createElement('li');
        li.textContent = q;
        ol.appendChild(li);
      });
      qWrap.append(h, ol);
    }

    document.getElementById('instructions-modal').hidden = false;
  }
}
