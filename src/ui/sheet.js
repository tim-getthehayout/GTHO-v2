/** @file Sheet lifecycle class — always-in-DOM, .open toggle. See V2_APP_ARCHITECTURE.md §6.2 */

/**
 * Sheet class — manages open/close/save lifecycle for bottom sheets.
 * Sheets are always in the DOM; visibility is toggled via the `.open` CSS class.
 */
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
