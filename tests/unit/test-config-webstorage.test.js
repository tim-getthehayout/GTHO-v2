/**
 * @file Plain `npm test` on Node 26+ fails when experimental webstorage is on:
 * Node's native localStorage shadows jsdom's, so `localStorage.clear()` throws
 * and hundreds of unit tests fail. Pin `--no-experimental-webstorage` only when
 * this Node accepts the flag, so CI on Node 20 is not killed with exit 9.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeOptionsWithWebstorageGuard, supportsWebstorageFlag } from '../../scripts/run-vitest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const viteConfigSrc = readFileSync(join(root, 'vite.config.js'), 'utf8');
const runnerSrc = readFileSync(join(root, 'scripts/run-vitest.mjs'), 'utf8');

describe('test config pins --no-experimental-webstorage when supported', () => {
  it('exposes jsdom localStorage (flag must be active in this worker on Node 26+)', () => {
    expect(typeof localStorage).toBe('object');
    expect(typeof localStorage.clear).toBe('function');
    localStorage.setItem('gtho-webstorage-probe', '1');
    expect(localStorage.getItem('gtho-webstorage-probe')).toBe('1');
    localStorage.clear();
    expect(localStorage.getItem('gtho-webstorage-probe')).toBeNull();
  });

  it('vite.config.js guards worker execArgv with supportsWebstorageFlag', () => {
    expect(viteConfigSrc).toMatch(/supportsWebstorageFlag\(\)\s*\?\s*\[[^\]]*--no-experimental-webstorage/);
  });

  it('npm test:unit runs through scripts/run-vitest.mjs', () => {
    expect(pkg.scripts['test:unit']).toBe('node scripts/run-vitest.mjs run');
    expect(runnerSrc).toMatch(/process\.execPath/);
    expect(runnerSrc).toMatch(/stdio:\s*'inherit'/);
  });

  it('adds --no-experimental-webstorage when the flag is supported, and keeps NODE_OPTIONS', () => {
    const allowed = new Set(['--no-experimental-webstorage', '--experimental-webstorage']);
    expect(supportsWebstorageFlag(allowed)).toBe(true);
    expect(nodeOptionsWithWebstorageGuard('', allowed)).toBe('--no-experimental-webstorage');
    expect(nodeOptionsWithWebstorageGuard(null, allowed)).toBe('--no-experimental-webstorage');
    expect(nodeOptionsWithWebstorageGuard('--trace-warnings', allowed))
      .toBe('--trace-warnings --no-experimental-webstorage');
    // Do not duplicate the pin if it is already present.
    expect(nodeOptionsWithWebstorageGuard('--no-experimental-webstorage --trace-warnings', allowed))
      .toBe('--no-experimental-webstorage --trace-warnings');
  });

  it('omits the flag when this Node does not accept it, and keeps NODE_OPTIONS', () => {
    const allowed = new Set(['--trace-warnings']);
    expect(supportsWebstorageFlag(allowed)).toBe(false);
    expect(nodeOptionsWithWebstorageGuard('', allowed)).toBe('');
    expect(nodeOptionsWithWebstorageGuard(null, allowed)).toBe('');
    expect(nodeOptionsWithWebstorageGuard('--trace-warnings', allowed)).toBe('--trace-warnings');
    expect(nodeOptionsWithWebstorageGuard('--trace-warnings --max-old-space-size=4096', allowed))
      .toBe('--trace-warnings --max-old-space-size=4096');
  });
});
