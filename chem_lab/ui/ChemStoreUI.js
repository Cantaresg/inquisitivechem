/**
 * ui/ChemStoreUI.js
 * Renders the chemical store as a nested collapsible tree driven entirely by
 * the REAGENTS data array. No chemical names are hardcoded in HTML (TRAP-09).
 *
 * Tree structure:
 *   Category (liquid | solid)
 *   └── Subcategory (acid, base, salt, etc.)
 *       └── Reagent item  ← draggable
 *
 * Each reagent item fires DragDropManager on click-drag or keyboard pick-mode.
 */

import { REAGENTS, SYMBOL_MAP } from '../data/reagents.js';

export class ChemStoreUI {
  /**
   * @param {HTMLElement} treeEl  — #chem-store-tree container
   * @param {import('./DragDropManager.js').DragDropManager} dragDropManager
   */
  constructor(treeEl, dragDropManager) {
    this._treeEl = treeEl;
    this._dm = dragDropManager;
    /** All top-level category elements — used for hover-collapse. */
    this._catEls = [];
    this._build();
  }

  // ─── Build ────────────────────────────────────────────────────────────────

  /** @private */
  _build() {
    // Group reagents: category → subcategory → items
    const grouped = this._groupReagents();

    for (const [category, subcatMap] of grouped) {
      const catEl = this._buildCategory(category, subcatMap);
      this._treeEl.appendChild(catEl);
    }
  }

  /**
   * Group REAGENTS by category then subcategory.
   * Returns a Map preserving insertion order.
   * @private
   * @returns {Map<string, Map<string, Object[]>>}
   */
  _groupReagents() {
    const grouped = new Map();

    for (const reagent of REAGENTS) {
      const cat    = reagent.category    ?? 'other';
      const subcat = reagent.subcategory ?? 'general';

      if (!grouped.has(cat)) grouped.set(cat, new Map());
      const subcatMap = grouped.get(cat);

      if (!subcatMap.has(subcat)) subcatMap.set(subcat, []);
      subcatMap.get(subcat).push(reagent);
    }

    return grouped;
  }

  /**
   * Build the top-level category disclosure element.
   * @private
   */
  _buildCategory(category, subcatMap) {
    const catEl = document.createElement('div');
    catEl.className = 'store-category';
    catEl.setAttribute('aria-expanded', 'false');   // start collapsed

    const btn = document.createElement('button');
    btn.className = 'store-category-btn';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');

    const caret = document.createElement('span');
    caret.className = 'store-caret';
    caret.textContent = '▾';

    const title = document.createElement('span');
    title.textContent = _capitalize(category);

    btn.append(title, caret);

    const subcatList = document.createElement('div');
    subcatList.className = 'store-subcategory-list';

    for (const [subcat, items] of subcatMap) {
      subcatList.appendChild(this._buildSubcategory(subcat, items));
    }

    // Click: toggle this category; collapsing also resets all inner subcategories
    btn.addEventListener('click', () => {
      const expanded = catEl.getAttribute('aria-expanded') === 'true';
      catEl.setAttribute('aria-expanded', String(!expanded));
      btn.setAttribute('aria-expanded', String(!expanded));
      if (expanded) _collapseSubcats(catEl);
    });

    // Mouseleave the whole category block → auto-close after short delay
    let _leaveTimer = null;
    catEl.addEventListener('mouseleave', () => {
      _leaveTimer = setTimeout(() => {
        catEl.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-expanded', 'false');
        _collapseSubcats(catEl);
      }, 420);
    });
    catEl.addEventListener('mouseenter', () => {
      clearTimeout(_leaveTimer);
    });

    catEl.append(btn, subcatList);
    this._catEls.push(catEl);
    return catEl;
  }

  /**
   * Build a subcategory disclosure element.
   * @private
   */
  _buildSubcategory(subcat, items) {
    const subEl = document.createElement('div');
    subEl.className = 'store-subcategory';
    subEl.setAttribute('aria-expanded', 'false');   // start collapsed

    const btn = document.createElement('button');
    btn.className = 'store-subcategory-btn';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');

    const caret = document.createElement('span');
    caret.className = 'store-subcategory-caret';
    caret.textContent = '▾';

    const title = document.createElement('span');
    title.textContent = _capitalizeWords(subcat);

    btn.append(title, caret);

    const itemList = document.createElement('div');
    itemList.className = 'store-item-list';

    for (const reagent of items) {
      itemList.appendChild(this._buildReagentItem(reagent));
    }

    // Click: toggle this subcategory
    btn.addEventListener('click', () => {
      const expanded = subEl.getAttribute('aria-expanded') === 'true';
      subEl.setAttribute('aria-expanded', String(!expanded));
      btn.setAttribute('aria-expanded', String(!expanded));
    });

    // Mouseleave: auto-close the subcategory after a short delay
    let _subLeaveTimer = null;
    subEl.addEventListener('mouseleave', () => {
      _subLeaveTimer = setTimeout(() => {
        subEl.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-expanded', 'false');
      }, 300);
    });
    subEl.addEventListener('mouseenter', () => {
      clearTimeout(_subLeaveTimer);
    });

    subEl.append(btn, itemList);
    return subEl;
  }

  /**
   * Build a draggable reagent item.
   * Registers with DragDropManager so it fires `chemlab:drop`.
   * @private
   */
  _buildReagentItem(reagent) {
    const item = document.createElement('div');
    item.className = 'store-item';
    item.dataset.reagentId = reagent.id;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    // textContent only — label comes from data (TRAP-10)
    const displayName = SYMBOL_MAP[reagent.id] ?? reagent.label;
    item.setAttribute('aria-label', `${displayName} — drag to bench or vessel`);

    // Colour dot
    const dot = document.createElement('span');
    dot.className = 'store-item-dot';
    dot.style.background = reagent.color ?? 'rgba(180,200,220,0.5)';
    dot.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.textContent = displayName;

    item.append(dot, name);

    // Register with drag-drop manager
    this._dm.registerDraggable(item, {
      type:  'reagent',
      id:    reagent.id,
      label: displayName,
    });

    return item;
  }

  /**
   * Restrict the store to a set of allowed reagent IDs.
   * Subcategories and categories with no visible items are hidden automatically.
   * Pass null to restore all items.
   * @param {Set<string>|null} allowedIds
   */
  filter(allowedIds) {
    for (const item of this._treeEl.querySelectorAll('.store-item')) {
      item.hidden = allowedIds !== null && !allowedIds.has(item.dataset.reagentId);
    }
    for (const sub of this._treeEl.querySelectorAll('.store-subcategory')) {
      const hasVisible = [...sub.querySelectorAll('.store-item')].some(i => !i.hidden);
      sub.hidden = !hasVisible;
    }
    for (const cat of this._catEls) {
      const hasVisible = [...cat.querySelectorAll('.store-subcategory')].some(s => !s.hidden);
      cat.hidden = !hasVisible;
    }
  }
}

// ─── Private utilities ────────────────────────────────────────────────────────

/** Collapse all .store-subcategory elements inside a category element. */
function _collapseSubcats(catEl) {
  for (const sub of catEl.querySelectorAll('.store-subcategory')) {
    sub.setAttribute('aria-expanded', 'false');
    const subBtn = sub.querySelector('.store-subcategory-btn');
    if (subBtn) subBtn.setAttribute('aria-expanded', 'false');
  }
}

/** Capitalise the first letter of a string. */
function _capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Capitalise every word (underscore-separated or space-separated). */
function _capitalizeWords(str) {
  if (!str) return '';
  return str.replace(/[_\s]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
