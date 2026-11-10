/** DOM-free resolution of the farm, paddock, group or animal a voice entry is about.
 * The model only repeats the NAMES the user said (fields.entryTarget); IDs always
 * come from this host resolution over the operation's own rows. Nothing is ever
 * defaulted: a missing, unknown or ambiguous name yields exactly one question.
 * Shared by the backend (validation, read tool) and the browser (opening the sheet).
 */
import { FARM_ENTRY_UIS } from './farm-entry-contract.js';
import { normalizeSpokenName, normalizeRecordAlias } from './spoken-numbers.js';
import { applyPendingClarification, allocateFeedingLines, carryoverTimingQuestion } from './feeding-clarification.js';

export { ENTRY_TARGET_KEY } from './entry-fields.js';
export const RESOLVE_ENTRY_TARGET_TOOL = Object.freeze({
  name: 'resolve-entry-target',
  description: 'Resolve the names the user said for a first-slice entry. Args: {ui, entryTarget}. Returns {status:"resolved", summary} or {status:"question", question}.',
});
const LABELS = Object.freeze({ move: 'move', place: 'place', feeding: 'feeding', treatment: 'treatment', calving: 'calving' });
/** Asked only when no entry surface can be inferred; lists the first-slice surfaces. */
export const CHOOSE_ENTRY_QUESTION = `Which entry did you mean: ${FARM_ENTRY_UIS.map(ui => LABELS[ui]).slice(0, -1).join(', ')} or ${LABELS[FARM_ENTRY_UIS.at(-1)]}?`;
/** Names each surface needs from the user. move takes group OR from (source paddock). */
export const ENTRY_TARGET_NAMES = Object.freeze({ treatment: ['animal'], calving: ['animal'], feeding: ['paddock'], move: ['group', 'from', 'to'], place: ['group', 'to'] });

/** Exact matching only: no fuzzy, phonetic or nearest-name matching. */
const norm = normalizeSpokenName;
const named = value => typeof value === 'string' && norm(value) !== '';
const quote = value => `“${String(value).trim()}”`;
const list = names => names.length === 2 ? `${names[0]} or ${names[1]}` : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
const question = text => ({ status: 'question', question: text });

/** Plain-words prompts for missing targets / required sheet fields (use the UI's own fields). */
const MISSING_PROMPTS = Object.freeze({
  feeding: Object.freeze({ paddock: 'which paddock', lines: 'how many bales' }),
  treatment: Object.freeze({ animal: 'which animal was treated' }),
  calving: Object.freeze({ animal: 'which cow calved' }),
  move: Object.freeze({ group: 'which group', from: 'which paddock they are leaving', to: 'where they are going' }),
  place: Object.freeze({ group: 'which group', to: 'which paddock' }),
});

/** One plain-words question for whatever the chosen UI still needs. */
function missingFieldsQuestion(ui, names = {}, fields = {}) {
  const prompts = MISSING_PROMPTS[ui];
  if (!prompts) return CHOOSE_ENTRY_QUESTION;
  const said = names && typeof names === 'object' && !Array.isArray(names) ? names : {};
  const needed = [];
  for (const key of ENTRY_TARGET_NAMES[ui] ?? []) {
    // move: group OR from satisfies the source side.
    if (ui === 'move' && key === 'from' && named(said.group)) continue;
    if (ui === 'move' && key === 'group' && named(said.from)) continue;
    if (!named(said[key])) needed.push(prompts[key] ?? key);
  }
  if (ui === 'feeding' && (fields.lines == null || fields.lines === '')) {
    if (!needed.includes(prompts.lines)) needed.unshift(prompts.lines);
  }
  if (!needed.length) {
    if (ui === 'feeding') return 'Which paddock did you feed?';
    return `What else do you need for this ${LABELS[ui] ?? ui}?`;
  }
  if (needed.length === 1) {
    const only = needed[0];
    return only.startsWith('which') || only.startsWith('what') || only.startsWith('how') || only.startsWith('where')
      ? `${only.charAt(0).toUpperCase()}${only.slice(1)}?`
      : `Which ${only}?`;
  }
  const [first, ...rest] = needed;
  const head = first.charAt(0).toUpperCase() + first.slice(1);
  return `${head}, and ${rest.join(' and ')}?`;
}

function pick(rows, said, keys, labelOf, kind, ask, nameNorm = norm) {
  const wanted = nameNorm(said);
  if (wanted === '') return { ask: question(ask) };
  const hits = rows.filter(row => keys.some(key => { const value = typeof key === 'function' ? key(row) : row[key]; return value != null && nameNorm(value) === wanted; }));
  if (hits.length === 1) return { row: hits[0] };
  if (!hits.length) return { ask: question(`I couldn't find ${kind} called ${quote(said)}. ${ask}`) };
  return { ask: question(`Which ${kind.replace(/^an? /, '')} did you mean: ${list(hits.slice(0, 5).map(labelOf))}?`) };
}

/** Named paddocks the user said: one string, a comma-separated list, or an array. */
export function parseSaidPaddockNames(said = {}) {
  const raw = said?.paddock ?? said?.paddocks ?? null;
  if (Array.isArray(raw)) return raw.map(value => String(value).trim()).filter(named);
  if (typeof raw !== 'string') return [];
  return raw.split(',').map(value => value.trim()).filter(named);
}

/**
 * rows(table) -> Promise<rows already scoped to the authenticated operation>.
 * Returns {status:'resolved', target, fill, summary} or {status:'question', question}.
 * fill holds sheet fields set from resolved names (never from model IDs).
 */
export async function resolveEntryTarget({ ui, names, fields = {}, rows, pendingClarification = null, utterance = '' }) {
  if (!FARM_ENTRY_UIS.includes(ui)) return question(CHOOSE_ENTRY_QUESTION);
  const merged = pendingClarification ? applyPendingClarification(pendingClarification, names, fields, utterance) : { names, fields };
  names = merged.names;
  fields = merged.fields;
  const said = names && typeof names === 'object' && !Array.isArray(names) ? names : {};
  const animals = async () => (await rows('animals')).filter(row => row.active !== false);
  const groups = async () => (await rows('groups')).filter(row => !row.archivedAt);
  const locations = async () => (await rows('locations')).filter(row => !row.archived);
  const openPaddockWindows = async () => (await rows('eventPaddockWindows')).filter(row => !row.dateClosed);
  const openGroupWindows = async () => (await rows('eventGroupWindows')).filter(row => !row.dateLeft);
  const animalLabel = row => row.tagNum ? `tag ${row.tagNum}${row.name ? ` (${row.name})` : ''}` : row.name || row.eid;
  const placeLabel = row => row.name;
  async function paddock(name, ask) {
    if (!named(name)) return { ask: question(ask) };
    const candidates = await locations();
    const match = pick(candidates, name, ['name', 'fieldCode'], placeLabel, 'a paddock', ask, normalizeRecordAlias);
    if (match.ask) return match;
    // Alias collisions: another location shares this normalized name/code.
    const alias = normalizeRecordAlias(name);
    const collisions = candidates.filter(row => (
      row.id !== match.row.id
      && [row.name, row.fieldCode].some(value => value != null && normalizeRecordAlias(value) === alias)
    ));
    if (collisions.length) {
      return { ask: question(`Which paddock did you mean: ${list([match.row, ...collisions].slice(0, 5).map(placeLabel))}?`) };
    }
    return match;
  }
  async function openEventsAt(location) {
    const ids = [...new Set((await openPaddockWindows()).filter(row => row.locationId === location.id).map(row => row.eventId))];
    return (await rows('events')).filter(row => ids.includes(row.id) && !row.dateOut);
  }
  async function openEventAt(location) {
    const events = await openEventsAt(location);
    return events.length === 1 ? events[0] : null;
  }
  async function destination(ask) {
    const to = await paddock(said.to, ask);
    if (to.ask) return to;
    if (fields.destType === 'join') {
      const event = await openEventAt(to.row);
      if (!event) return { ask: question(`Nothing is grazing ${to.row.name} right now. Which paddock should they go to?`) };
      return { row: to.row, fill: { existingEventId: event.id } };
    }
    return { row: to.row, fill: { locationId: to.row.id } };
  }

  if (ui === 'treatment' || ui === 'calving') {
    const ask = ui === 'treatment' ? 'Which animal was treated?' : 'Which cow calved?';
    if (!named(said.animal)) return question(ask);
    const animal = pick(await animals(), said.animal, ['tagNum', 'name', 'eid', row => row.tagNum ? `tag ${row.tagNum}` : null], animalLabel, 'an animal', ask);
    if (animal.ask) return animal.ask;
    return { status: 'resolved', target: { ui, id: animal.row.id }, fill: {}, summary: `${ui} for ${animalLabel(animal.row)}` };
  }
  if (ui === 'feeding') {
    const ask = missingFieldsQuestion('feeding', said, fields);
    const names = parseSaidPaddockNames(said);
    if (!names.length) return { status: 'question', question: ask, pending: { ui: 'feeding', names: said, fields, field: 'paddock' } };
    const resolved = [];
    for (const name of names) {
      const where = await paddock(name, ask);
      if (where.ask) return { ...where.ask, pending: { ui: 'feeding', names: said, fields, field: 'paddock' } };
      if (!resolved.some(row => row.id === where.row.id)) resolved.push(where.row);
    }
    const eventSets = [];
    for (const loc of resolved) {
      const events = await openEventsAt(loc);
      if (!events.length) return question(`Nothing is grazing ${loc.name} right now. Which paddock did you feed?`);
      if (events.length > 1) return question(`More than one open event includes ${loc.name}. Which paddock did you feed?`);
      eventSets.push(events[0]);
    }
    const eventIds = [...new Set(eventSets.map(event => event.id))];
    if (eventIds.length > 1) {
      const labels = resolved.map(placeLabel);
      return question(`Those paddocks are on different events. Which paddocks did you feed: ${list(labels)}?`);
    }
    const event = eventSets[0];
    const locationIds = resolved.map(row => row.id);
    const labels = resolved.map(placeLabel);
    const fill = locationIds.length === 1
      ? { locationId: locationIds[0] }
      : { locationId: locationIds[0], locationIds };
    const pending = { ui: 'feeding', names: said, fields, fill, field: 'paddock' };
    const askPending = (field, text) => ({ status: 'question', question: text, pending: { ...pending, field } });
    if (locationIds.length > 1 && fields.lines != null && fields.lines !== '') {
      const allocated = allocateFeedingLines(fields.lines, locationIds, fields.quantityBasis);
      if (allocated.status === 'question') {
        const text = allocated.field === 'quantityBasis'
          ? `Is the quantity a total across ${list(labels)}, or the same amount per paddock?`
          : `How should the total be allocated across ${list(labels)}?`;
        return askPending(allocated.field, text);
      }
      if (allocated.quantityBasis) fill.quantityBasis = allocated.quantityBasis;
      fill.allocatedLines = allocated.allocations;
    }
    const carryover = fields.carryover && typeof fields.carryover === 'object' ? fields.carryover : null;
    if (carryover && (carryover.remainingQuantity != null || (Array.isArray(carryover.items) && carryover.items.length))) {
      if (!carryover.timing) return askPending('carryoverTiming', carryoverTimingQuestion());
      fill.carryover = carryover;
    }
    const summary = locationIds.length === 1 ? `feeding at ${labels[0]}` : `feeding at ${labels.join(', ')}`;
    return { status: 'resolved', target: { ui, id: event.id }, fill, summary };
  }
  if (ui === 'move') {
    let event, scopedGroupWindowId = null, from;
    if (named(said.group)) {
      const group = pick(await groups(), said.group, ['name'], placeLabel, 'a group', 'Which group are you moving?');
      if (group.ask) return group.ask;
      const open = await openGroupWindows();
      const mine = open.filter(row => row.groupId === group.row.id);
      if (mine.length !== 1) return question(`${group.row.name} isn't in a paddock right now. Which group are you moving?`);
      event = (await rows('events')).find(row => row.id === mine[0].eventId);
      // Mirrors the UI group launch (dashboard group card/strip, event detail
      // group row): the group's move is always scoped to its own window, so the
      // wizard picks scoped-remaining or scoped-last itself.
      scopedGroupWindowId = mine[0].id;
      from = group.row.name;
    } else if (named(said.from)) {
      const source = await paddock(said.from, 'Which paddock are they moving from?');
      if (source.ask) return source.ask;
      event = await openEventAt(source.row);
      if (!event) return question(`Nothing is grazing ${source.row.name} right now. Which group are you moving?`);
      from = source.row.name;
    } else return question('Which group are you moving?');
    if (!event) return question('Which group are you moving?');
    const to = await destination('Where are they moving to?');
    if (to.ask) return to.ask;
    return { status: 'resolved', target: { ui, id: event.id, farmId: event.farmId, scopedGroupWindowId }, fill: to.fill, summary: `move ${from} to ${to.row.name}` };
  }
  // place: an unplaced group; the farm is the destination paddock's farm.
  if (!named(said.group)) return question('Which group are you placing?');
  const group = pick(await groups(), said.group, ['name'], placeLabel, 'a group', 'Which group are you placing?');
  if (group.ask) return group.ask;
  if ((await openGroupWindows()).some(row => row.groupId === group.row.id)) return question(`${group.row.name} is already in a paddock. Did you mean a move?`);
  const to = await destination('Which paddock are you placing them in?');
  if (to.ask) return to.ask;
  return { status: 'resolved', target: { ui, id: group.row.id, farmId: to.row.farmId }, fill: to.fill, summary: `place ${group.row.name} in ${to.row.name}` };
}
