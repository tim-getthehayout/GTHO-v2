/** @file DOM builder — el(), text(), clear(). No innerHTML. See V2_APP_ARCHITECTURE.md §6.1 */

/**
 * Create a DOM element with attributes and children.
 * @param {string} tag - HTML tag name
 * @param {object} [attrs={}] - Attributes and event listeners
 * @param {Array<Node|string>} [children=[]] - Child nodes or strings
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(value)) {
        element.dataset[dk] = dv;
      }
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key === 'disabled' || key === 'checked' || key === 'selected') {
      if (value) element.setAttribute(key, '');
      // false/falsy: don't set the attribute
    } else {
      element.setAttribute(key, value);
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  }

  return element;
}

/**
 * Create a text node.
 * @param {string} str
 * @returns {Text}
 */
export function text(str) {
  return document.createTextNode(str);
}

/**
 * Remove all children from a container.
 * @param {HTMLElement} container
 */
export function clear(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}
