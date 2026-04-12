/** @file Router tests — routes resolve, fallback works */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { route, initRouter, navigate, getRoutes } from '../../src/ui/router.js';
import { el, clear } from '../../src/ui/dom.js';

describe('router', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    window.location.hash = '#/';
  });

  it('registers routes', () => {
    route('#/', () => {});
    route('#/events', () => {});
    const routes = getRoutes();
    expect(routes).toContain('#/');
    expect(routes).toContain('#/events');
  });

  it('renders the matching route on init', () => {
    route('#/', (c) => {
      c.appendChild(el('h1', {}, ['Dashboard']));
    });
    window.location.hash = '#/';
    initRouter(container);
    expect(container.textContent).toContain('Dashboard');
  });

  it('falls back to dashboard for unknown hash', () => {
    route('#/', (c) => {
      c.appendChild(el('h1', {}, ['Dashboard']));
    });
    window.location.hash = '#/unknown';
    initRouter(container);
    expect(container.textContent).toContain('Dashboard');
  });
});
