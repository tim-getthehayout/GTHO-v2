/** @file DOM builder tests */
import { describe, it, expect, beforeEach } from 'vitest';
import { el, text, clear } from '../../src/ui/dom.js';

describe('dom', () => {
  describe('el()', () => {
    it('creates an element with the given tag', () => {
      const div = el('div');
      expect(div.tagName).toBe('DIV');
    });

    it('sets attributes', () => {
      const input = el('input', { type: 'text', id: 'name' });
      expect(input.getAttribute('type')).toBe('text');
      expect(input.getAttribute('id')).toBe('name');
    });

    it('sets className', () => {
      const div = el('div', { className: 'card active' });
      expect(div.className).toBe('card active');
    });

    it('adds event listeners', () => {
      let clicked = false;
      const btn = el('button', { onClick: () => { clicked = true; } });
      btn.click();
      expect(clicked).toBe(true);
    });

    it('sets dataset', () => {
      const div = el('div', { dataset: { id: '123', type: 'event' } });
      expect(div.dataset.id).toBe('123');
      expect(div.dataset.type).toBe('event');
    });

    it('sets inline style object', () => {
      const div = el('div', { style: { color: 'red', fontSize: '14px' } });
      expect(div.style.color).toBe('red');
      expect(div.style.fontSize).toBe('14px');
    });

    it('appends child elements', () => {
      const parent = el('div', {}, [
        el('span', {}, ['Hello']),
        el('span', {}, ['World']),
      ]);
      expect(parent.children).toHaveLength(2);
    });

    it('appends string children as text nodes', () => {
      const div = el('div', {}, ['Hello']);
      expect(div.textContent).toBe('Hello');
    });

    it('creates elements without innerHTML', () => {
      const div = el('div', {}, ['<script>alert("xss")</script>']);
      expect(div.innerHTML).not.toContain('<script>');
      expect(div.textContent).toContain('<script>');
    });
  });

  describe('text()', () => {
    it('creates a text node', () => {
      const node = text('Hello');
      expect(node.nodeType).toBe(3); // TEXT_NODE
      expect(node.textContent).toBe('Hello');
    });
  });

  describe('clear()', () => {
    it('removes all children from a container', () => {
      const container = el('div', {}, [
        el('span', {}, ['A']),
        el('span', {}, ['B']),
        el('span', {}, ['C']),
      ]);
      expect(container.children).toHaveLength(3);
      clear(container);
      expect(container.children).toHaveLength(0);
    });

    it('works on empty container', () => {
      const container = el('div');
      clear(container);
      expect(container.children).toHaveLength(0);
    });
  });
});
