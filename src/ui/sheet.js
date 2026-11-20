/** @file Sheet lifecycle class — always-in-DOM, .open toggle. See V2_APP_ARCHITECTURE.md §6.2 */

/**
 * Sheet class — manages open/close/save lifecycle for bottom sheets.
 * Sheets are always in the DOM; visibility is toggled via the `.open` CSS class.
 * While any sheet is open, document/body scroll is locked so the page underneath
 * cannot move; the last close restores the previous overflow styles.
 */

let pageScrollLockApplied = false;
let savedBodyOverflow = '';
let savedHtmlOverflow = '';
let touchMoveGuardAttached = false;

function openSheetCount() {
  return document.querySelectorAll('.sheet-wrap.open').length;
}

function eventScrollsOpenPanel(event) {
  let target = event.target;
  if (target && target.nodeType === 3) target = target.parentElement;
  if (!target || typeof target.closest !== 'function') return false;
  const panel = target.closest('.sheet-panel');
  return !!(panel && panel.closest('.sheet-wrap.open'));
}

function onDocumentTouchMove(event) {
  if (eventScrollsOpenPanel(event)) return;
  event.preventDefault();
}

function applyPageScrollLock() {
  if (pageScrollLockApplied) return;
  savedBodyOverflow = document.body.style.overflow;
  savedHtmlOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  if (!touchMoveGuardAttached) {
    document.addEventListener('touchmove', onDocumentTouchMove, { passive: false });
    touchMoveGuardAttached = true;
  }
  pageScrollLockApplied = true;
}

function releasePageScrollLock() {
  if (!pageScrollLockApplied) return;
  document.body.style.overflow = savedBodyOverflow;
  document.documentElement.style.overflow = savedHtmlOverflow;
  savedBodyOverflow = '';
  savedHtmlOverflow = '';
  if (touchMoveGuardAttached) {
    document.removeEventListener('touchmove', onDocumentTouchMove);
    touchMoveGuardAttached = false;
  }
  pageScrollLockApplied = false;
}

function syncPageScrollLock() {
  if (openSheetCount() > 0) applyPageScrollLock();
  else releasePageScrollLock();
}

/**
 * Release leftover page-scroll lock after a test tears down the DOM
 * without going through Sheet.close().
 */
export function resetSheetScrollLock() {
  releasePageScrollLock();
}

export class Sheet {
  /**
   * @param {string} wrapId - ID of the sheet wrapper element
   */
  constructor(wrapId) {
    this.wrapId = wrapId;
    this.onOpen = null;
    this.onClose = null;
    this.onSave = null;
  }

  /**
   * Get the wrapper element.
   * @returns {HTMLElement|null}
   */
  getWrap() {
    return document.getElementById(this.wrapId);
  }

  /**
   * Open the sheet with optional data.
   * @param {*} [data]
   */
  open(data) {
    const wrap = this.getWrap();
    if (wrap) {
      wrap.classList.add('open');
      syncPageScrollLock();
    }
    if (this.onOpen) {
      this.onOpen(data);
    }
  }

  /**
   * Close the sheet.
   */
  close() {
    const wrap = this.getWrap();
    if (wrap) {
      wrap.classList.remove('open');
      syncPageScrollLock();
    }
    if (this.onClose) {
      this.onClose();
    }
  }

  /**
   * Save and close.
   */
  save() {
    if (this.onSave) {
      this.onSave();
    }
    this.close();
  }

  /**
   * Check if sheet is currently open.
   * @returns {boolean}
   */
  isOpen() {
    const wrap = this.getWrap();
    return wrap ? wrap.classList.contains('open') : false;
  }
}
