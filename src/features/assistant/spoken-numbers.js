/** Deterministic spoken-number normalization for exact name matching.
 * Converts runs of English number words to digits ("forty-two" -> "42",
 * "one hundred and five" -> "105"). No fuzzy, phonetic or nearest matching:
 * a run that is not a well-formed number converts word by word
 * ("four two" -> "4 2"), so it can only match a name written that way.
 */
const UNITS = Object.freeze({ zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 });
const TEENS = Object.freeze({ ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 });
const TENS = Object.freeze({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 });
const SCALES = Object.freeze({ hundred: 100, thousand: 1000 });
const own = (table, word) => Object.prototype.hasOwnProperty.call(table, word);
const isNumberWord = word => own(UNITS, word) || own(TEENS, word) || own(TENS, word) || own(SCALES, word);
const single = word => own(UNITS, word) ? UNITS[word] : own(TEENS, word) ? TEENS[word] : own(TENS, word) ? TENS[word] : null;

/** Parse one run of number words; null when it is not a well-formed number. */
function parseRun(words) {
  let total = 0, current = 0, last = null;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === 'and') {
      if (last !== 'hundred' && last !== 'thousand') return null;
      if (i === words.length - 1) return null;
      last = 'and';
      continue;
    }
    if (own(UNITS, word)) {
      if (last === 'unit' || last === 'teen') return null;
      if (last === 'tens') { current += UNITS[word]; last = 'unit'; continue; }
      if (word === 'zero' && (words.length > 1)) return null;
      current += UNITS[word]; last = 'unit'; continue;
    }
    if (own(TEENS, word)) {
      if (last === 'unit' || last === 'teen' || last === 'tens') return null;
      current += TEENS[word]; last = 'teen'; continue;
    }
    if (own(TENS, word)) {
      if (last === 'unit' || last === 'teen' || last === 'tens') return null;
      current += TENS[word]; last = 'tens'; continue;
    }
    if (word === 'hundred') {
      if (last !== 'unit' || current === 0 || current > 9) return null;
      current *= 100; last = 'hundred'; continue;
    }
    if (word === 'thousand') {
      if (current === 0 || total !== 0 || last === 'and') return null;
      total = current * 1000; current = 0; last = 'thousand'; continue;
    }
    return null;
  }
  if (last === 'and') return null;
  return total + current;
}

/** Lower-case text with every run of number words replaced by digits. */
export function spokenNumbersToDigits(text) {
  const tokens = String(text ?? '').split(/\s+/).filter(Boolean)
    .flatMap(token => token.includes('-') && token.split('-').every(part => isNumberWord(part.toLowerCase())) ? token.split('-') : [token]);
  const out = [];
  for (let i = 0; i < tokens.length;) {
    if (!isNumberWord(tokens[i].toLowerCase())) { out.push(tokens[i]); i += 1; continue; }
    let end = i;
    while (end + 1 < tokens.length && (isNumberWord(tokens[end + 1].toLowerCase()) || (tokens[end + 1].toLowerCase() === 'and' && end + 2 < tokens.length && isNumberWord(tokens[end + 2].toLowerCase())))) end += 1;
    const run = tokens.slice(i, end + 1).map(word => word.toLowerCase());
    const value = parseRun(run);
    if (value != null) out.push(String(value));
    else out.push(...run.map(word => word === 'and' || own(SCALES, word) ? word : String(single(word))));
    i = end + 1;
  }
  return out.join(' ');
}

/** The only normalization exact name matching applies: case, surrounding
 * whitespace and punctuation, and spoken number words to digits. */
export function normalizeSpokenName(value) {
  const trim = text => text.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '');
  return trim(spokenNumbersToDigits(trim(String(value ?? '').toLowerCase())));
}

/** Deterministic alias key for record names/codes and user input (OI-0206).
 * Builds on normalizeSpokenName, then collapses internal spaces, hyphens and
 * letter-digit separators so "e1", "E-1" and "E - 1" are equal, while "E-11"
 * stays distinct. Never fuzzy, phonetic or nearest-name matching. */
export function normalizeRecordAlias(value) {
  return normalizeSpokenName(value).replace(/[\s\-_./]+/g, '');
}
