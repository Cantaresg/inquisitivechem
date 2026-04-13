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
    catEl.setAttribute('aria-expanded', 'true');

    const btn = document.createElement('button');
    btn.className = 'store-category-btn';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'true');

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

    btn.addEventListener('click', () => {
      const expanded = catEl.getAttribute('aria-expanded') === 'true';
      catEl.setAttribute('aria-expanded', String(!expanded));
      btn.setAttribute('aria-expanded', String(!expanded));
    });

    // Hover auto-collapse: when entering a category button, expand this one
    // and collapse all sibling categories so the store stays tidy.
    btn.addEventListener('mouseenter', () => {
      for (const other of this._catEls) {
        if (other !== catEl && other.getAttribute('aria-expanded') === 'true') {
          other.setAttribute('aria-expanded', 'false');
          other.querySelector('.store-category-btn')?.setAttribute('aria-expanded', 'false');
        }
      }
      catEl.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-expanded', 'true');
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
    subEl.setAttribute('aria-expanded', 'true');

    const btn = document.createElement('button');
    btn.className = 'store-subcategory-btn';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'true');

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

    btn.addEventListener('click', () => {
      const expanded = subEl.getAttribute('aria-expanded') === 'true';
      subEl.setAttribute('aria-expanded', String(!expanded));
      btn.setAttribute('aria-expanded', String(!expanded));
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

    // Auto-close the parent subcategory once a drag actually starts (300 ms
    // threshold separates drag from a simple click).
    let _dragTimer = null;
    item.addEventListener('pointerdown', () => {
      _dragTimer = setTimeout(() => {
        const subEl = item.closest('.store-subcategory');
        if (subEl) {
          subEl.setAttribute('aria-expanded', 'false');
          subEl.querySelector('.store-subcategory-btn')?.setAttribute('aria-expanded', 'false');
        }
        _dragTimer = null;
      }, 300);
    });
    item.addEventListener('pointerup', () => {
      clearTimeout(_dragTimer);
      _dragTimer = null;
    });

    return item;
  }
}

// ─── Private utilities ────────────────────────────────────────────────────────

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
