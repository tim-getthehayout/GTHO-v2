import { describe, it, expect } from 'vitest';
import { spokenNumbersToDigits, normalizeSpokenName, normalizeRecordAlias } from '../../../src/features/assistant/spoken-numbers.js';

describe('spoken number words to digits (deterministic)', () => {
  it.each([
    ['forty-two', '42'], ['forty two', '42'], ['Forty-Two', '42'], ['seven', '7'], ['zero', '0'], ['thirteen', '13'],
    ['twenty', '20'], ['one hundred', '100'], ['one hundred and five', '105'], ['three hundred twelve', '312'],
    ['two thousand', '2000'], ['two thousand and twenty six', '2026'], ['nine hundred ninety nine', '999'],
    ['paddock forty two', 'paddock 42'], ['north forty', 'north 40'], ['tag one oh one', 'tag 1 oh 1'],
  ])('%s -> %s', (said, digits) => expect(spokenNumbersToDigits(said)).toBe(digits));
  it('a run that is not a well-formed number converts word by word, never guessed', () => {
    expect(spokenNumbersToDigits('four two')).toBe('4 2');
    expect(spokenNumbersToDigits('twenty thirty')).toBe('20 30');
    expect(spokenNumbersToDigits('one and two')).toBe('1 and 2');
    expect(spokenNumbersToDigits('zero seven')).toBe('0 7');
  });
  it('leaves non-number words, digits and hyphenated names alone', () => {
    expect(spokenNumbersToDigits('Home 42')).toBe('Home 42');
    expect(spokenNumbersToDigits('east-west')).toBe('east-west');
    expect(spokenNumbersToDigits('someone')).toBe('someone');
  });
  it('normalizes only case, surrounding whitespace/punctuation and number words', () => {
    expect(normalizeSpokenName('  “Forty-Two.”  ')).toBe('42');
    expect(normalizeSpokenName('#42')).toBe('42');
    expect(normalizeSpokenName('Rosie!')).toBe('rosie');
    expect(normalizeSpokenName("O'Brien's")).toBe("o'brien's");
    expect(normalizeSpokenName('Rosey')).not.toBe(normalizeSpokenName('Rosie'));
  });
});

describe('record alias normalization (spaces, hyphens, letter-digit boundaries)', () => {
  it('treats e1, E-1 and E - 1 as the same alias, but not E-11', () => {
    expect(normalizeRecordAlias('e1')).toBe('e1');
    expect(normalizeRecordAlias('E-1')).toBe('e1');
    expect(normalizeRecordAlias('E - 1')).toBe('e1');
    expect(normalizeRecordAlias('E-11')).toBe('e11');
    expect(normalizeRecordAlias('e1')).not.toBe(normalizeRecordAlias('E-11'));
  });
  it('still applies spoken numbers and is not fuzzy', () => {
    expect(normalizeRecordAlias('paddock forty two')).toBe(normalizeRecordAlias('Paddock 42'));
    expect(normalizeRecordAlias('Rosie')).not.toBe(normalizeRecordAlias('Rosey'));
  });
});

describe('baseline name normalization (pre-alias gap)', () => {
  it('normalizeSpokenName still treats e1 and E - 1 as different; aliases close the gap', () => {
    expect(normalizeSpokenName('e1')).not.toBe(normalizeSpokenName('E - 1'));
    expect(normalizeRecordAlias('e1')).toBe(normalizeRecordAlias('E - 1'));
  });
});
