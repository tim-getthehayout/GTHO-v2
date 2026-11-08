import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { feedback, ConversationRuntime, createBackendHandler } from '../../../src/features/assistant/shared.js';

const root = resolve(import.meta.dirname, '../../..');
const pins = JSON.parse(readFileSync(resolve(root, 'vendor/pins.json'), 'utf8'));
function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = resolve(dir, name);
    return lstatSync(path).isDirectory() ? files(path) : [path];
  });
}
describe('tagged shared module snapshots', () => {
  for (const [name, commit, version] of [
    ['feedback-module', 'f70d0d7d83a0b56ffdcd2a28375b6f746863fecb', '0.1.3'],
    ['conversation-runtime', 'aea11f3cdb137a83f0aecaf38e2e60c9d1ba809a', '0.1.1'],
  ]) {
    it(`keeps the exact ${name} tagged tree and package version`, () => {
      const pin = pins[name];
      expect(pin.commit).toBe(commit);
      expect(pin.version).toBe(version);
      const dir = resolve(root, pin.path);
      expect(JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8')).version).toBe(version);
      const paths = files(dir);
      expect(paths.map(p => relative(dir, p)).sort()).toEqual(Object.keys(pin.files).sort());
      for (const path of paths) {
        expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(pin.files[relative(dir, path)]);
      }
      expect(paths.some(p => p.split('/').includes('.git'))).toBe(false);
    });
  }
  it('imports the public local-checkout library surfaces', () => {
    expect(typeof feedback.createSession).toBe('function');
    expect(typeof feedback.validateItem).toBe('function');
    expect(typeof ConversationRuntime.start).toBe('function');
    expect(typeof createBackendHandler).toBe('function');
  });
  it('does not install shared modules as git dependencies or submodules', () => {
    for (const name of ['package.json', 'package-lock.json']) {
      expect(readFileSync(resolve(root, name), 'utf8')).not.toMatch(/git\+(https|ssh).*?(feedback-module|conversation-runtime)/);
    }
    expect(readdirSync(root)).not.toContain('.gitmodules');
  });
});
