/** DOM-free resolution of the farm, paddock, group or animal a voice entry is about.
 * The model only repeats the NAMES the user said (fields.entryTarget); IDs always
 * come from this host resolution over the operation's own rows. Nothing is ever
 * defaulted: a missing, unknown or ambiguous name yields exactly one question.
 * Shared by the backend (validation, read tool) and the browser (opening the sheet).
 */
import { FARM_ENTRY_UIS } from './farm-entry-contract.js';
import { normalizeSpokenName } from './spoken-numbers.js';

export { ENTRY_TARGET_KEY } from './entry-fields.js';
export const RESOLVE_ENTRY_TARGET_TOOL = Object.freeze({
  name: 'resolve-entry-target',
  description: 'Resolve the names the user said for a first-slice entry. Args: {ui, entryTarget}. Returns {status:"resolved", summary} or {status:"question", question}.',
});
const LABELS = Object.freeze({ move: 'move', place: 'place', feeding: 'feeding', treatment: 'treatment', calving: 'calving' });
/** Asked when the entry surface is ambiguous; lists only the first-slice surfaces. */
export const CHOOSE_ENTRY_QUESTION = `Which entry did you mean: ${FARM_ENTRY_UIS.map(ui => LABELS[ui]).slice(0, -1).join(', ')} or ${LABELS[FARM_ENTRY_UIS.at(-1)]}?`;
/** Names each surface needs from the user. move takes group OR from (source paddock). */
export const ENTRY_TARGET_NAMES = Object.freeze({ treatment: ['animal'], calving: ['animal'], feeding: ['paddock'], move: ['group', 'from', 'to'], place: ['group', 'to'] });

/** Exact matching only: no fuzzy, phonetic or nearest-name matching. */
const norm = normalizeSpokenName;
const named = value => typeof value === 'string' && norm(value) !== '';
const quote = value => `“${String(value).trim()}”`;
const list = names => names.length === 2 ? `${names[0]} or ${names[1]}` : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
const question = text => ({ status: 'question', question: text });

function pick(rows, said, keys, labelOf, kind, ask) {
  const wanted = norm(said);
  const hits = rows.filter(row => keys.some(key => { const value = typeof key === 'function' ? key(row) : row[key]; return value != null && norm(value) === wanted; }));
  if (hits.length === 1) return { row: hits[0] };
  if (!hits.length) return { ask: question(`I couldn't find ${kind} called ${quote(said)}. ${ask}`) };
  return { ask: question(`Which ${kind.replace(/^an? /, '')} did you mean: ${list(hits.slice(0, 5).map(labelOf))}?`) };
}

/**
 * rows(table) -> Promise<rows already scoped to the authenticated operation>.
 * Returns {status:'resolved', target, fill, summary} or {status:'question', question}.
 * fill holds sheet fields set from resolved names (never from model IDs).
 */
export async function resolveEntryTarget({ ui, names, fields = {}, rows }) {
  if (!FARM_ENTRY_UIS.includes(ui)) return question(CHOOSE_ENTRY_QUESTION);
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
    return pick(await locations(), name, ['name', 'fieldCode'], placeLabel, 'a paddock', ask);
  }
  async function openEventAt(location) {
    const ids = [...new Set((await openPaddockWindows()).filter(row => row.locationId === location.id).map(row => row.eventId))];
    const events = (await rows('events')).filter(row => ids.includes(row.id));
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
    const where = await paddock(said.paddock, 'Which paddock did you feed?');
    if (where.ask) return where.ask;
    const event = await openEventAt(where.row);
    if (!event) return question(`Nothing is grazing ${where.row.name} right now. Which paddock did you feed?`);
    return { status: 'resolved', target: { ui, id: event.id }, fill: { locationId: where.row.id }, summary: `feeding at ${where.row.name}` };
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
