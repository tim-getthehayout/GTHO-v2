/**
 * @file Plain `npm test` on Node 26+ fails when experimental webstorage is on:
 * Node's native localStorage shadows jsdom's, so `localStorage.clear()` throws
 * and hundreds of unit tests fail. Pin `--no-experimental-webstorage` in the
 * Vitest config (and the npm test:unit script) so workers always get jsdom's
 * storage.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const viteConfigSrc = readFileSync(join(root, 'vite.config.js'), 'utf8');

describe('test config pins --no-experimental-webstorage', () => {
  it('exposes jsdom localStorage (flag must be active in this worker)', () => {
    expect(typeof localStorage).toBe('object');
    expect(typeof localStorage.clear).toBe('function');
    localStorage.setItem('gtho-webstorage-probe', '1');
    expect(localStorage.getItem('gtho-webstorage-probe')).toBe('1');
    localStorage.clear();
    expect(localStorage.getItem('gtho-webstorage-probe')).toBeNull();
  });

  it('vite.config.js passes --no-experimental-webstorage via execArgv', () => {
    expect(viteConfigSrc).toMatch(/execArgv:\s*\[[^\]]*--no-experimental-webstorage/);
  });

  it('npm test:unit sets NODE_OPTIONS=--no-experimental-webstorage', () => {
    expect(pkg.scripts['test:unit']).toMatch(/NODE_OPTIONS=--no-experimental-webstorage/);
  });
});
