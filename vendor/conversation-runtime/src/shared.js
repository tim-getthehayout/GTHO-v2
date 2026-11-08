export class RuntimeError extends Error {
  constructor(code) {
    super(code);
    this.name = "RuntimeError";
    this.code = code;
  }
}
export function invariant(value, code) {
  if (!value) throw new RuntimeError(code);
}
export const clone = (value) => structuredClone(value);
export const intents = Object.freeze([
  "feedback",
  "data-entry",
  "data-questions",
  "how-to",
]);
export const saveStates = Object.freeze([
  "draft",
  "local-save",
  "sync-queue",
  "acknowledged-delivery",
]);
export const writeIntent = (intent) =>
  intent === "feedback" || intent === "data-entry";
export const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
export function json(value) {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(json);
  return object(value) && Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every(json);
}
export function fields(value) {
  return object(value) && json(value);
}
export function scopeValid(scope) {
  return object(scope) && nonempty(scope.operationId) &&
    nonempty(scope.actorId);
}
export function sameScope(a, b) {
  return a.operationId === b.operationId && a.actorId === b.actorId;
}
export function captureValid(capture) {
  return object(capture) && nonempty(capture.capturedAt) &&
    nonempty(capture.source) && fields(capture.context);
}
export function proposalValid(proposal) {
  return object(proposal) && nonempty(proposal.id) &&
    nonempty(proposal.itemRef) &&
    Number.isSafeInteger(proposal.revision) && proposal.revision > 0 &&
    writeIntent(proposal.intent) &&
    nonempty(proposal.destination) && fields(proposal.fields);
}
export const zeroUsage = () => ({
  model: "",
  inputTokens: 0,
  outputTokens: 0,
  audioMinutes: 0,
  requestCount: 0,
});
export function usageValid(usage) {
  return object(usage) && typeof usage.model === "string" &&
    ["inputTokens", "outputTokens", "audioMinutes", "requestCount"].every((k) =>
      Number.isFinite(usage[k]) && usage[k] >= 0
    ) &&
    (usage.voiceSession === undefined || nonempty(usage.voiceSession));
}
export function authorizationValid(auth) {
  return object(auth) && nonempty(auth.provider) && nonempty(auth.token) &&
    Number.isFinite(auth.expiresAt) && auth.expiresAt > Date.now();
}
