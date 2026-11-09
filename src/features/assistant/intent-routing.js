/** One push-to-talk for farm entries, farm questions, app feedback and how-to.
 * The model may only SUGGEST another intent through the host read tool
 * `route-intent`; the switch itself always goes through the runtime's own
 * `intent` / `resolve-intent` commands, issued by the trusted client. */
export const INTENT_PURPOSE = Object.freeze({ 'data-entry': 'write', 'data-questions': 'question', feedback: 'feedback', 'how-to': 'how-to' });
const INTENTS = Object.freeze(Object.keys(INTENT_PURPOSE));

export const ROUTE_INTENT_TOOL = Object.freeze({
  name: 'route-intent',
  description: 'Call with {intent} when the latest user request belongs to a different intent: "data-entry" (record farm work), "data-questions" (a question about farm records), "feedback" (a problem or idea about the app) or "how-to" (how to use the app). Returns {status:"switch-requested"}; then answer in one short sentence. Never call it for the current intent.',
});
export const ROUTING_INSTRUCTION = 'One push-to-talk handles farm entries, farm questions, app feedback and how-to. If the latest request is not for the current intent, call route-intent first instead of answering or proposing. Ask which entry the user meant only for a farm write whose entry is unclear.';

/** The suggested intent, or null when the args are not exactly {intent} naming another intent. */
export function parseRoute(args, currentIntent) {
  if (args === null || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== 'intent')) return null;
  return INTENTS.includes(args.intent) && args.intent !== currentIntent ? args.intent : null;
}
