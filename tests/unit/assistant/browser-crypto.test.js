// @vitest-environment node
import { describe,it,expect } from 'vitest';
import { createHash as native } from 'node:crypto';
import { createHash } from '../../../src/platform/node-crypto-browser.js';
describe('browser createHash platform API substitution', () => {
  it.each(['','abc','🐄 é é 漢字','{"z":[1,"é"],"a":{"nested":true}}'])('matches native SHA-256 hex for %s',value => {
    expect(createHash('sha256').update(value).digest('hex')).toBe(native('sha256').update(value).digest('hex'));
  });
  it('is synchronous, chainable, supports bytes and does not silently accept unsupported algorithms/encodings', () => {
    expect(createHash('sha256').update('a').update(new TextEncoder().encode('bc')).digest('hex')).toBe(native('sha256').update('abc').digest('hex'));
    expect(() => createHash('md5')).toThrow();expect(() => createHash('sha256').digest('base64')).toThrow();
  });
});
