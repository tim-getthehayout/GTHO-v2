// deno-lint-ignore-file require-await -- test doubles intentionally preserve asynchronous port signatures
// Test doubles ONLY. These are NOT adopter adapters or persistence implementations.
import assert from "node:assert/strict";
import { ConversationRuntime, RuntimeError } from "../src/index.js";
export const scope = { operationId: "operation-a", actorId: "person-a" };
export const capture = {
  capturedAt: "2026-11-08T21:51:00Z",
  source: "typed-note",
  context: { original: "retained" },
};
export const usage = {
  model: "test-model",
  inputTokens: 7,
  outputTokens: 3,
  audioMinutes: 0,
  requestCount: 1,
};
export const turn = (
  id = "turn-1",
  text = "first note",
  modality = "text",
) => ({ id, role: "user", text, modality });
export const evidence = (p) => ({
  kind: "human-review",
  id: p.id,
  revision: p.revision,
  intent: p.intent,
});
export function fixture() {
  const f = {
    testing: true,
    consent: true,
    popupCount: 0,
    retainedAudio: [],
    notes: [],
    effects: [],
    calls: [],
    artifacts: [],
    events: [],
    reviews: [],
    confirmations: [],
    sessions: new Map(),
    executions: new Map(),
    reservations: [],
    meters: [],
    providerCalls: [],
    routes: [],
    savedState: "local-save",
    deny: false,
    receipts: new Map(),
    throwAfterExecute: false,
    routing: "shared",
    limitsDeny: false,
    reply: { type: "answer", text: "clarifying question" },
    readTools: [],
    reads: [],
  };
  const consented = new Set();
  const key = (s, ref) => JSON.stringify([s.operationId, s.actorId, ref]);
  f.host = {
    async authorize(s, ref, action) {
      assert.ok(s.operationId && s.actorId && ref && action);
      if (f.deny) throw new Error("private denial detail");
    },
    async context(s, intent) {
      return {
        instructions: `host interview/rules for ${intent}`,
        data: { operation: s.operationId },
        readTools: f.readTools,
      };
    },
    async read(s, name, args) {
      assert.ok(f.readTools.some((t) => t.name === name));
      f.reads.push({ s, name, args });
      return { answer: 4 };
    },
    async createProposal(_s, p) {
      return f.normalize ? f.normalize(p) : p;
    },
    async validate(_s, p) {
      assert.ok(p.fields && p.destination);
      if (f.invalid) throw new Error("validation denied");
    },
    async renderReview(s, p) {
      if (f.renderFail) throw new Error("render failed");
      f.reviews.push({ s, p });
    },
    async recordConfirmation(s, p, e) {
      if (JSON.stringify(e) !== JSON.stringify(evidence(p))) {
        throw new RuntimeError("explicit-confirmation-required");
      }
      const receipt = JSON.stringify([s, p.id, p.revision, p.intent]);
      f.confirmations.push({ s, p, e });
      f.receipts.set(receipt, structuredClone(p));
      return receipt;
    },
    async execute(s, p, receipt, idempotencyKey) {
      f.calls.push({ s, p, receipt, idempotencyKey });
      assert.deepEqual(f.receipts.get(receipt), p);
      const durable = f.sessions.get(key(s, "conversation-1"));
      if (durable) assert.equal(durable.phase, "executing");
      if (f.executions.has(idempotencyKey)) {
        return f.executions.get(idempotencyKey);
      }
      const result = {
        state: "acknowledged-delivery",
        result: { itemRef: p.itemRef },
      };
      f.executions.set(idempotencyKey, result);
      f.effects.push({ s, p });
      if (f.throwAfterExecute) {
        f.throwAfterExecute = false;
        throw new Error("ambiguous network failure");
      }
      return result;
    },
    async checkpoint(s, snapshot) {
      f.sessions.set(
        key(s, snapshot.conversationRef),
        structuredClone(snapshot),
      );
    },
    async artifact(s, ref, a) {
      f.artifacts.push({ s, ref, a });
    },
    async event(s, e) {
      f.events.push({ s, e });
    },
    async saveDraft(_s, snapshot) {
      f.saved = snapshot;
      return f.savedState;
    },
    async earlyTesting() {
      return f.testing;
    },
    async ensureTestingConsent(s) {
      const id = JSON.stringify(s);
      if (!consented.has(id)) {
        f.popupCount++;
        if (f.consent) consented.add(id);
      }
      return consented.has(id);
    },
    async storeTestingAudio(s, ref, bytes) {
      f.retainedAudio.push({ s, ref, bytes });
      return `audio-${f.retainedAudio.length}`;
    },
    async captureOffline(s, c, note) {
      f.notes.push({ s, c, note });
      return `note-${f.notes.length}`;
    },
    async matchingDoc() {
      return f.doc;
    },
  };
  f.provider = {
    name: "test-provider",
    async respond(input) {
      f.providerCalls.push(input);
      if (f.providerFail) throw new Error("private provider error");
      return {
        reply: structuredClone(
          typeof f.reply === "function" ? f.reply(input) : f.reply,
        ),
        usage,
      };
    },
  };
  const locks = new Map();
  f.backend = {
    host: f.host,
    async authenticate(request) {
      const actor = request.headers.get("authorization");
      if (!["person-a", "person-b", "central"].includes(actor)) {
        throw new Error("bad auth");
      }
      return {
        scope: actor === "person-b"
          ? { operationId: "operation-b", actorId: actor }
          : scope,
        canControlBilling: actor === "central",
      };
    },
    billing: {
      async reserve(s, purpose, requestRef, metadata) {
        if (f.limitsDeny && metadata?.kind !== "settlement") {
          throw new Error("capped");
        }
        const lease = `lease-${f.reservations.length}`;
        f.reservations.push({ s, purpose, requestRef, lease });
        return { lease, routing: f.routing };
      },
      async finish(s, lease, measured, billShared, failed) {
        f.meters.push({ s, lease, measured, billShared, failed });
      },
      async own(s) {
        return {
          operation: s.operationId,
          count:
            f.meters.filter((m) => m.s.operationId === s.operationId).length,
        };
      },
      async control() {
        return { operationCount: 2 };
      },
    },
    async provider(s, routing) {
      f.routes.push({ s, routing });
      return f.provider;
    },
    async withSession(s, ref, work) {
      const k = key(s, ref), prior = locks.get(k) ?? Promise.resolve();
      const next = prior.then(() => work(structuredClone(f.sessions.get(k))));
      locks.set(k, next.catch(() => {}));
      return next;
    },
    async voiceAuthorization(s, ref, routing) {
      f.voiceAuth = { s, ref, routing };
      return {
        provider: "test-voice",
        token: "test-ephemeral-value",
        expiresAt: Date.now() + 1000,
      };
    },
    async voiceUsage() {
      return { ...usage, voiceSession: "voice-session-1", audioMinutes: 2 };
    },
  };
  f.start = (intent = "feedback", ref = "conversation-1", s = scope) =>
    ConversationRuntime.start({
      scope: s,
      conversationRef: ref,
      intent,
      capture,
    }, f.host);
  f.checkpoint = (s = scope, ref = "conversation-1") =>
    structuredClone(f.sessions.get(key(s, ref)));
  return f;
}
export async function rejectsCode(work, code) {
  await assert.rejects(work, (error) => error.code === code);
}
