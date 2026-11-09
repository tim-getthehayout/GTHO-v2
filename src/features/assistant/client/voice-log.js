/** Device-local host events for the voice-to-entry log: what the device itself
 * asked (e.g. the fallback entry-target question), kept out of the model
 * transcript so the log still shows truthfully what was asked. No new table:
 * there is no existing column for a host-asked question (reported gap). */
import { INTENT_PURPOSE } from '../intent-routing.js';

export const voiceLogKey = operationId => `gtho-voice-log:${operationId}`;

export function createVoiceLog({ operationId, storage = globalThis.localStorage, now = () => new Date().toISOString(), randomUUID = () => crypto.randomUUID() }) {
  const key = voiceLogKey(operationId);
  const read = () => {
    try { const list = JSON.parse(storage?.getItem(key) ?? '[]'); return Array.isArray(list) ? list : []; }
    catch { return []; }
  };
  return {
    /** Records one host event; returns it (also when the device cannot store it). */
    hostEvent({ conversationRef, intent, type, text }) {
      const entry = { id: randomUUID(), kind: 'host-event', conversationRef, purpose: INTENT_PURPOSE[intent] ?? null, type, text, at: now() };
      const list = read();
      list.push(entry);
      try { storage?.setItem(key, JSON.stringify(list)); } catch { /* shown this session only */ }
      return entry;
    },
    events() { return read(); },
  };
}
