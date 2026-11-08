import { createHash } from 'node:crypto';

export const CONTRACT_VERSION = '0.1.2';
const own = (o, k) => Object.hasOwn(o, k);
const text = v => typeof v === 'string' && v.trim().length > 0;
const copy = v => structuredClone(v);
const same = (a, b) => canonical(a) === canonical(b);
const sources = ['user', 'host'];
const editable = new Set(['title', 'type', 'expected', 'actual', 'reproSteps', 'severity', 'impact', 'needsDecision', 'unknowns']);
const hostRequired = ['itemId', 'contractVersion', 'appId', 'screen', 'buildStamp', 'capturedAt'];
const required = [...hostRequired, 'title', 'type', 'firstNote', 'expected', 'actual', 'reproSteps', 'severity', 'impact'];

/** Facts: {state:'known', value, source:'user'|'host'} or
 * {state:'unknown', source:'user'|'host'}. Reproduction additionally permits
 * {state:'not_reproducible', source}. Requests use {state:'not_applicable', source}
 * for steps/severity. Host capture may use {state:'unavailable', reason, source:'host'}.
 * Known reproSteps.value is a nonempty ordered string array, never model-generated.
 * Impact is {affectedWork:Fact, workaround:Fact, dataRisk:Fact}.
 * Source labels are attestations by the trusted caller, not authentication.
 */
function fact(v, { unknown = false, states = [], array = false, host = false } = {}) {
  if (!v || !sources.includes(v.source) || (host && v.source !== 'host')) return false;
  if (v.state === 'known') return array
    ? Array.isArray(v.value) && v.value.length > 0 && v.value.every(text)
    : text(v.value);
  if (own(v, 'value')) return false; // uncertainty cannot also assert a fact
  if (v.state === 'unknown') return unknown;
  if (v.state === 'unavailable') return states.includes(v.state) && text(v.reason);
  return states.includes(v.state);
}
function impactValid(v, partial = false) {
  const keys = ['affectedWork', 'workaround', 'dataRisk'];
  return v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).every(k => keys.includes(k)) &&
    keys.every(k => (partial && !own(v, k)) || fact(v[k], { unknown: true }));
}
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
/** Digest covers all item fields, including legacy metadata, but not confirmation. */
export function itemRevision(item) {
  const { reviewConfirmation, ...content } = item;
  return createHash('sha256').update(canonical(content)).digest('hex');
}
function issues(item, { phase = 'draft', scoped = false, reporterAvailable = false, adapted = false } = {}) {
  if (!['draft', 'filing'].includes(phase)) throw new TypeError('phase must be draft or filing');
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [{ field: 'item', message: 'Expected an item object' }];
  if (phase === 'filing') {
    for (const field of required) if (!own(item, field)) add(field, 'Required at confirmed filing');
    if (scoped && !text(item.scope)) add('scope', 'Authorized host scope required');
    if (reporterAvailable && !text(item.reporterId)) add('reporterId', 'Authenticated reporter required when available');
    if (adapted && !text(item.sourcePurpose)) add('sourcePurpose', 'Preserve adapted record purpose');
  }
  for (const field of ['itemId', 'appId', 'scope', 'reporterId']) {
    if (own(item, field) && !text(item[field])) add(field, 'Must be a nonempty host identifier');
  }
  if (own(item, 'contractVersion') && item.contractVersion !== CONTRACT_VERSION) add('contractVersion', 'Must pin 0.1.2');
  if (own(item, 'capturedAt') && (!text(item.capturedAt) || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(item.capturedAt) || !Number.isFinite(Date.parse(item.capturedAt)))) add('capturedAt', 'Host timestamp must include timezone');
  for (const field of ['screen', 'buildStamp']) if (own(item, field) && !fact(item[field], { host: true, states: ['unavailable'] })) add(field, 'Original host capture or unavailable with reason required');
  for (const field of ['title', 'firstNote', 'expected', 'actual']) if (own(item, field) && !fact(item[field], { unknown: field === 'actual' })) add(field, 'User/host fact required; only actual permits explicit unknown');
  if (own(item, 'type') && !['bug', 'request'].includes(item.type)) add('type', 'Unresolved/help is not a product classification');
  if (own(item, 'impact') && !impactValid(item.impact, phase === 'draft')) add('impact', 'Affected work, workaround and data risk require facts or explicit unknowns');
  if (own(item, 'reproSteps')) {
    const valid = item.type === 'request'
      ? fact(item.reproSteps, { states: ['not_applicable'] }) && item.reproSteps.state === 'not_applicable'
      : fact(item.reproSteps, { unknown: true, array: true, states: ['not_reproducible'] });
    if (!valid) add('reproSteps', 'Known ordered steps, explicit unknown/not_reproducible, or request not_applicable required');
  }
  if (own(item, 'severity')) {
    const v = item.severity;
    const valid = fact(v, { unknown: true, states: item.type === 'request' ? ['not_applicable'] : [] }) &&
      (v.state !== 'known' || ['critical', 'high', 'normal', 'low'].includes(v.value));
    if (!valid) add('severity', 'Explicit supported severity state required');
  }
  for (const field of ['needsDecision', 'unknowns']) if (own(item, field) && (!Array.isArray(item[field]) || !item[field].every(text))) add(field, 'Use an array of unresolved questions');
  if (own(item, 'attachments') && (!Array.isArray(item.attachments) || !item.attachments.every(a => a && text(a.reference) && a.authorized === true && a.reviewed === true))) add('attachments', 'Only authorized, reviewed references are permitted');
  return errors;
}
/** Pure validation. Host must enforce identity, authorization, factual provenance and
 * explicit human confirmation before invoking the trusted host API. No model schema
 * can prove that a statement is true or that a caller actually obtained consent.
 */
export function validateItem(item, options = {}) {
  const errors = issues(item, options);
  if ((options.phase ?? 'draft') === 'filing' && item && typeof item === 'object') {
    const c = item.reviewConfirmation;
    const destination = routeDestination(item);
    if (!c || c.source !== 'host' || c.confirmed !== true || !text(c.evidence) || c.revision !== itemRevision(item) || c.destination !== destination) {
      errors.push({ field: 'reviewConfirmation', message: 'Host evidence of explicit confirmation of this exact revision and destination required' });
    }
  }
  return { valid: errors.length === 0, errors };
}
/** Build is an eligibility result, never a delivery claim. Missing detail -> Design. */
export function routeDestination(item) {
  if (!item || item.type !== 'bug' || (item.needsDecision?.length ?? 0) > 0 || (item.unknowns?.length ?? 0) > 0) return 'design';
  if (issues(item, { phase: 'filing' }).length) return 'design';
  const known = ['title', 'expected', 'actual', 'reproSteps', 'severity'];
  if (!known.every(k => item[k]?.state === 'known')) return 'design';
  if (!['affectedWork', 'workaround', 'dataRisk'].every(k => item.impact?.[k]?.state === 'known')) return 'design';
  return 'build';
}
function finish(session) {
  const freeze = v => {
    if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
    return v;
  };
  return freeze(session);
}
/** Host context is trusted, including opaque legacy fields (preserved unchanged).
 * options: {scoped, reporterAvailable, adapted}. No identity/context is allocated.
 * Item content is JSON-compatible. Public session snapshots are immutable.
 */
export function createSession(hostContext, options = {}) {
  const item = copy(hostContext);
  for (const k of hostRequired) if (!own(item, k)) throw new TypeError(`Host must supply ${k}`);
  if (own(item, 'firstNote') || own(item, 'reviewConfirmation')) throw new TypeError('Start a new capture without note or consent; restore an existing snapshot to resume');
  const result = validateItem(item, { phase: 'draft' });
  if (!result.valid) throw new TypeError(JSON.stringify(result.errors));
  if (options.scoped && !text(item.scope)) throw new TypeError('Host must supply authorized scope');
  if (options.reporterAvailable && !text(item.reporterId)) throw new TypeError('Host must supply reporterId');
  return finish({ item, options: copy(options), status: 'draft', proposals: {}, corrections: [], captureSaved: false, delivery: { localSave: null, syncQueue: null, acknowledgedHandoff: null }, review: null });
}
function ensureActive(s) {
  if (s.status !== 'draft') throw new Error('Resume or correct the draft before continuing');
}
/** Storage callback must durably save the provided snapshot and return {saved:true}.
 * On failure the returned snapshot retains the note, exposes saveError, and cannot
 * prompt. Caller must retain that snapshot and retry persistDraft; no silent loss.
 */
export async function persistDraft(session, persist) {
  if (!session.item.firstNote) throw new Error('No first note to persist');
  const s = copy(session);
  try {
    if (typeof persist !== 'function') throw new TypeError('Host durable persistence callback required');
    const result = await persist(copy(s));
    if (result?.saved !== true) throw new Error('Host did not report durable save');
    s.captureSaved = true;
    s.delivery.localSave = { itemId: s.item.itemId, revision: itemRevision(s.item), evidence: copy(result) };
    delete s.saveError;
  } catch (error) {
    s.saveError = String(error?.message ?? error);
  }
  return finish(s);
}
/** Notes/transcripts are opaque data, never instructions. Speech must already be
 * user-reviewed. The immutable original is never replaced by later corrections.
 */
export async function recordFirstNote(session, input, persist) {
  ensureActive(session);
  if (session.item.firstNote) throw new Error('First note already captured; retry persistence, not capture');
  const value = typeof input === 'string' ? input : input?.kind === 'reviewed_transcript' && input.reviewed === true ? input.text : null;
  if (!text(value)) throw new TypeError('Typed note or user-reviewed transcript required');
  const s = copy(session);
  s.item.firstNote = { state: 'known', value, source: 'user' };
  return persistDraft(finish(s), persist);
}
/** A trusted user correction cannot replace host fields or the original note.
 * Changed facts invalidate review/consent and delivery claims for that revision.
 */
export function applyAnswer(session, patch) {
  if (!session.item.firstNote) throw new Error('Capture the first note before interviewing');
  const s = copy(session);
  for (const [field, input] of Object.entries(patch)) {
    const value = field === 'impact' && input && typeof input === 'object' && !Array.isArray(input) ? { ...s.item.impact, ...input } : input;
    if (!editable.has(field)) throw new TypeError(`Not a user-editable interview field: ${field}`);
    if (!same(s.item[field], value)) {
      s.corrections.push({ field, previous: copy(s.item[field]), value: copy(value), source: 'user' });
      if (value === undefined) delete s.item[field];
      else s.item[field] = copy(value);
    }
  }
  const result = validateItem(s.item, { phase: 'draft' });
  if (!result.valid) throw new TypeError(JSON.stringify(result.errors));
  if (itemRevision(s.item) !== itemRevision(session.item)) {
    delete s.item.reviewConfirmation;
    s.review = null;
    s.status = 'draft';
    s.delivery = { localSave: null, syncQueue: null, acknowledgedHandoff: null };
  }
  return finish(s);
}
/** Model output is never applied, including claimed host fields or consent.
 * Only interview-field suggestions are allowed; all remain labeled proposals.
 */
export function proposeStructuredFields(session, fields) {
  ensureActive(session);
  const s = copy(session);
  for (const [field, value] of Object.entries(fields)) {
    if (!editable.has(field)) throw new TypeError(`Model cannot propose host/tool field: ${field}`);
    s.proposals[field] = { status: 'proposal', source: 'model', value: copy(value) };
  }
  return finish(s);
}
export function isActionable(s) {
  return s.status === 'draft' && s.captureSaved && ['bug', 'request'].includes(s.item.type) &&
    fact(s.item.expected) && fact(s.item.actual, { unknown: true }) && impactValid(s.item.impact);
}
export const readyForReview = isActionable;
/** One discriminating question at a time. No inference from untrusted note text.
 * Review may still expose missing filing fields; actionable is not filing-valid.
 */
export function nextQuestion(s) {
  if (s.status !== 'draft' || !s.captureSaved || !s.item.firstNote || isActionable(s)) return null;
  if (!['bug', 'request'].includes(s.item.type)) return { field: 'type', text: 'Is this unexpected behavior, a request for changed behavior, or only a help question?' };
  if (!fact(s.item.expected)) return { field: 'expected', text: 'What were you trying to do, or what outcome did you want?' };
  if (!fact(s.item.actual, { unknown: true })) return { field: 'actual', text: s.item.type === 'request' ? 'What current limitation gets in your way?' : 'What happened instead? You can say if you do not know.' };
  if (s.item.type === 'bug' && s.item.actual?.state === 'known' && !own(s.item, 'reproSteps')) return { field: 'reproSteps', text: 'What known steps led to this? Unknown or not reproducible is also an answer.' };
  if (!impactValid(s.item.impact)) {
    const prompts = { affectedWork: 'What work is affected?', workaround: 'Is there a practical workaround?', dataRisk: 'Is any data at risk?' };
    const field = Object.keys(prompts).find(k => !fact(s.item.impact?.[k], { unknown: true }));
    return { field: `impact.${field}`, text: prompts[field] };
  }
  return null;
}
/** Review cards may describe incomplete drafts, never silently fill their gaps. */
export function buildReviewCard(session) {
  if (!session.captureSaved || !session.item.firstNote || session.status !== 'draft') throw new Error('A saved active draft is required for review');
  const item = session.item;
  const destination = routeDestination(item);
  return finish({ itemId: item.itemId, revision: itemRevision(item), destination,
    appId: item.appId, scope: item.scope, capturedAt: item.capturedAt, firstNote: copy(item.firstNote), sourcePurpose: item.sourcePurpose,
    title: copy(item.title), type: item.type, expected: copy(item.expected), actual: copy(item.actual),
    reproSteps: copy(item.reproSteps), impact: copy(item.impact), severity: copy(item.severity),
    screen: copy(item.screen), buildStamp: copy(item.buildStamp), attachments: copy(item.attachments ?? []),
    needsDecision: copy(item.needsDecision ?? []), unknowns: copy(item.unknowns ?? []),
    missingOrInvalid: issues(item, { ...session.options, phase: 'filing' }),
    authorization: 'feedback_filing_only' });
}
/** Host calls when this exact card was shown. Confirmation must refer to it. */
export function presentReview(session) {
  const card = buildReviewCard(session);
  const s = copy(session);
  s.review = copy(card);
  return finish(s);
}
/** confirmation: {source:'host', confirmed:true, revision, destination, evidence}.
 * evidence is an opaque host reference to an explicit human action, never model
 * output. This helper validates binding, not authenticity of the caller.
 */
export function acceptReview(session, confirmation) {
  if (session.status !== 'draft' || !session.review || session.review.revision !== itemRevision(session.item)) throw new Error('Show the current review card before accepting');
  const s = copy(session);
  s.item.reviewConfirmation = copy(confirmation);
  const result = validateItem(s.item, { ...s.options, phase: 'filing' });
  if (!result.valid) throw new Error(JSON.stringify(result.errors));
  s.status = 'confirmed';
  return finish(s);
}
/** stop/decline/disconnect/cancel all preserve the draft, revoke consent, never file. */
export function preserveDraft(session, reason = 'stop') {
  if (!['stop', 'decline', 'disconnect', 'cancel'].includes(reason)) throw new TypeError('Unsupported interruption');
  const s = copy(session);
  s.status = 'paused';
  s.pauseReason = reason;
  delete s.item.reviewConfirmation;
  s.review = null;
  return finish(s);
}
export const cancelReview = session => preserveDraft(session, 'cancel');
export function resumeDraft(session) {
  const s = copy(session);
  s.status = 'draft';
  delete s.pauseReason;
  delete s.item.reviewConfirmation;
  s.review = null;
  return finish(s);
}
/** Returns a host-adapter payload, does NOT file or invoke a network/database. */
export function prepareHandoff(session) {
  if (session.status !== 'confirmed') throw new Error('Not explicitly confirmed');
  const result = validateItem(session.item, { ...session.options, phase: 'filing' });
  if (!result.valid) throw new Error(JSON.stringify(result.errors));
  return finish({ itemId: session.item.itemId, revision: itemRevision(session.item), destination: routeDestination(session.item), item: copy(session.item), authorization: 'feedback_filing_only' });
}
/** Host reports facts about persistence/delivery. All reports bind to stable ID and
 * current revision. These are independent observations, not inferred transitions.
 * {state:'local_save'|'sync_queue'|'acknowledged_handoff',itemId,revision,evidence,
 * destination?}. Acknowledgement additionally requires the confirmed destination.
 */
export function recordHostDelivery(session, report) {
  const s = copy(session);
  if (!text(report?.evidence) || report.itemId !== s.item.itemId || report.revision !== itemRevision(s.item)) throw new Error('Host evidence must match item and revision');
  const states = { local_save: 'localSave', sync_queue: 'syncQueue', acknowledged_handoff: 'acknowledgedHandoff' };
  const key = own(states, report.state) ? states[report.state] : null;
  if (!key) throw new TypeError('Unsupported delivery state');
  if (key !== 'localSave') {
    const payload = prepareHandoff(s);
    if (report.destination !== payload.destination) throw new Error('Destination mismatch');
  }
  s.delivery[key] = copy(report);
  return finish(s);
}
export function deliveryComplete(session) {
  const r = session.delivery.acknowledgedHandoff;
  return session.status === 'confirmed' && !!r && r.itemId === session.item.itemId && r.revision === itemRevision(session.item) && r.destination === routeDestination(session.item);
}
