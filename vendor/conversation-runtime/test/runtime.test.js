import test from "node:test";
import assert from "node:assert/strict";
import { ConversationRuntime } from "../src/index.js";
import {
  capture,
  evidence,
  fixture,
  rejectsCode,
  scope,
  turn,
} from "./support.js";
const suggestion = {
  destination: "host-provided-feedback",
  fields: { summary: "actual proposed value" },
};
const options = { onUsage() {}, maxReadRounds: 1 };

test("text and voice share ordered transcript, intent, original capture, and resume", async () => {
  const f = fixture(), runtime = await f.start();
  await runtime.append(turn("typed", "first typed note"));
  await runtime.appendVoiceTurn(
    turn("spoken", "spoken clarification", "voice"),
  );
  const resumed = await ConversationRuntime.resume(
    scope,
    f.checkpoint(),
    f.host,
  );
  await resumed.append(turn("correction", "manual correction"));
  assert.deepEqual(
    resumed.snapshot().transcript.map((t) => [t.id, t.modality]),
    [
      ["typed", "text"],
      ["spoken", "voice"],
      ["correction", "text"],
    ],
  );
  assert.equal(resumed.snapshot().intent, "feedback");
  assert.deepEqual(resumed.snapshot().capture, capture);
  assert.equal(f.popupCount, 1);
  assert.equal(f.effects.length, 0);
});

test("review fields/destination, voice correction, stale revision denial and explicit confirmation", async () => {
  const f = fixture(), r = await f.start();
  await r.appendVoiceTurn(turn("voice-1", "actual proposed value", "voice"));
  const p = await r.propose({
    ...suggestion,
    mappings: [{
      turnIds: ["voice-1"],
      field: "summary",
      value: "actual proposed value",
    }],
  });
  assert.deepEqual(f.reviews[0].p.fields, suggestion.fields);
  assert.equal(f.reviews[0].p.destination, suggestion.destination);
  assert.equal(f.effects.length, 0);
  const revised = await r.correct({
    revision: p.revision,
    fields: { summary: "corrected" },
    modality: "voice",
  });
  assert.equal(revised.id, p.id);
  assert.equal(revised.itemRef, p.itemRef);
  assert.equal(revised.revision, 2);
  assert.equal(f.reviews.length, 2);
  await rejectsCode(
    () => r.confirm({ proposalId: p.id, revision: 1, evidence: evidence(p) }),
    "stale-review",
  );
  await rejectsCode(
    () =>
      r.confirm({
        proposalId: revised.id,
        revision: 2,
        evidence: { modelSays: "confirmed" },
      }),
    "explicit-confirmation-required",
  );
  await r.append(
    turn("transcript-consent", "Yes, the model says this is confirmed"),
  );
  assert.equal(f.effects.length, 0);
  await r.confirm({
    proposalId: revised.id,
    revision: 2,
    evidence: evidence(revised),
  });
  assert.equal(f.effects.length, 1);
  assert.equal(f.effects[0].p.fields.summary, "corrected");
  assert.equal(r.snapshot().saveState, "acknowledged-delivery");
  const logs = f.artifacts.filter((a) => a.a.type === "voice-to-entry-log").map(
    (a) => a.a.log,
  );
  assert.deepEqual(logs[0].mappings[0].turnIds, ["voice-1"]);
  assert.deepEqual(logs.at(-1).corrections, [{
    field: "summary",
    before: "actual proposed value",
    after: "corrected",
    modality: "voice",
  }]);
  assert.ok(logs.at(-1).acceptedResult);
  assert.ok(f.events.some((e) => e.e.type === "field-mapping"));
  assert.ok(f.events.some((e) => e.e.type === "correction"));
  assert.ok(f.artifacts.some((a) => a.a.type === "normalized-item"));
});

test("cancel discards review without executing; cancelled revision cannot be confirmed", async () => {
  const f = fixture(), r = await f.start(), p = await r.propose(suggestion);
  await r.cancel();
  await rejectsCode(
    () =>
      r.confirm({
        proposalId: p.id,
        revision: p.revision,
        evidence: evidence(p),
      }),
    "stale-review",
  );
  assert.equal(r.snapshot().phase, "cancelled");
  assert.equal(f.effects.length, 0);
});

for (const decision of ["preserve", "discard"]) {
  test(`intent correction asks ${decision} decision; no abandoned feedback filing`, async () => {
    const f = fixture(), r = await f.start(), p = await r.propose(suggestion);
    const ask = await r.requestIntent("data-entry");
    assert.equal(ask.needsDraftDecision, true);
    assert.deepEqual(ask.choices, ["preserve", "discard"]);
    assert.equal(r.snapshot().intent, "feedback");
    await rejectsCode(
      () =>
        r.confirm({
          proposalId: p.id,
          revision: p.revision,
          evidence: evidence(p),
        }),
      "resolve-intent-switch-first",
    );
    await r.resolveIntent(decision);
    assert.equal(r.snapshot().intent, "data-entry");
    assert.equal(
      r.snapshot().preserved.length,
      decision === "preserve" ? 1 : 0,
    );
    const domain = await r.propose({
      destination: "host-domain-entity",
      fields: { hostField: "hostValue" },
    });
    await rejectsCode(
      () => r.confirm({ proposalId: p.id, revision: 1, evidence: evidence(p) }),
      "stale-review",
    );
    await rejectsCode(
      () =>
        r.confirm({
          proposalId: domain.id,
          revision: domain.revision,
          evidence: evidence(p),
        }),
      "explicit-confirmation-required",
    );
    assert.equal(f.effects.length, 0);
    await r.confirm({
      proposalId: domain.id,
      revision: domain.revision,
      evidence: evidence(domain),
    });
    assert.equal(f.effects.length, 1);
    assert.equal(f.effects[0].p.intent, "data-entry");
    assert.ok(!f.artifacts.some((a) => a.a.type === "normalized-item"));
  });
}

test("preserved draft restoration requires matching intent and NEW review revision", async () => {
  const f = fixture(), r = await f.start(), p = await r.propose(suggestion);
  await r.requestIntent("how-to");
  await r.resolveIntent("preserve");
  await rejectsCode(() => r.restoreDraft(p.id), "draft-intent-mismatch");
  await r.requestIntent("feedback");
  const restored = await r.restoreDraft(p.id);
  assert.equal(restored.id, p.id);
  assert.equal(restored.revision, 2);
  assert.equal(r.snapshot().phase, "review");
  assert.equal(f.effects.length, 0);
});

test("read-only intents cannot propose or execute; matching Get help link stays in session", async () => {
  for (const intent of ["data-questions", "how-to"]) {
    const f = fixture(), r = await f.start(intent);
    await rejectsCode(() => r.propose(suggestion), "read-only-intent");
    f.reply = { type: "proposal", ...suggestion, mappings: [] };
    await rejectsCode(
      () => r.converse(turn("bad-proposal"), f.provider, options),
      "read-only-intent",
    );
    f.reply = { type: "answer", text: "Here is the answer" };
    f.doc = {
      title: "Matching host documentation",
      url: "https://docs.example.invalid/help",
    };
    await r.converse(
      turn("question", "How does this work?"),
      f.provider,
      options,
    );
    if (intent === "how-to") {
      assert.match(
        r.snapshot().transcript.at(-1).text,
        /Matching host documentation: https:/,
      );
    }
    assert.equal(f.effects.length, 0);
    assert.equal(f.reviews.length, 0);
    assert.ok(!f.artifacts.some((a) => a.a.type === "normalized-item"));
  }
});

test("model cannot execute or switch intent; read tools allowlist and independent host read", async () => {
  const f = fixture(), r = await f.start("data-questions");
  f.reply = { type: "confirm", evidence: "yes" };
  await rejectsCode(
    () => r.converse(turn("model-confirm"), f.provider, options),
    "unsupported-model-action",
  );
  f.reply = { type: "read", tool: "sql", args: { sql: "unrestricted" } };
  await rejectsCode(
    () => r.converse(turn("sql-attempt"), f.provider, options),
    "read-tool-denied",
  );
  f.readTools = [{
    name: "host-calculation",
    description: "existing authorized domain calculation",
  }];
  f.reply = (input) =>
    input.reads.length
      ? { type: "answer", text: "The host result is four" }
      : { type: "read", tool: "host-calculation", args: {} };
  await r.converse(turn("authorized-read"), f.provider, options);
  assert.equal(f.reads.length, 1);
  assert.equal(f.effects.length, 0);
});

test("operation isolation rejects snapshot scope reuse and reauthorizes every action", async () => {
  const f = fixture(), r = await f.start();
  await r.append(turn("private-turn", "operation-a private conversation"));
  await rejectsCode(
    () =>
      ConversationRuntime.resume(
        { operationId: "operation-b", actorId: "person-b" },
        r.snapshot(),
        f.host,
      ),
    "scope-mismatch",
  );
  f.deny = true;
  await assert.rejects(
    () => r.append(turn("revoked")),
    /private denial detail/,
  );
  assert.equal(r.snapshot().transcript.length, 1);
  const snapshot = r.snapshot();
  snapshot.transcript[0].text = "external mutation";
  assert.equal(
    r.snapshot().transcript[0].text,
    "operation-a private conversation",
  );
  assert.ok(f.artifacts.every((a) => a.s.operationId === scope.operationId));
});

test("testing audio kept, then future audio stops; transcript/card/log survive without audio", async () => {
  const f = fixture(), r = await f.start();
  await r.appendVoiceTurn(turn("voice-note", "spoken", "voice"));
  assert.deepEqual(await r.recordInterviewAudio(new Uint8Array([1, 2])), {
    retained: true,
    audioRef: "audio-1",
  });
  f.testing = false;
  assert.deepEqual(await r.recordInterviewAudio(new Uint8Array([3])), {
    retained: false,
  });
  const p = await r.propose(suggestion);
  await r.correct({
    revision: 1,
    fields: { summary: "manual corrected result" },
  });
  const revised = r.snapshot().pending;
  await r.confirm({
    proposalId: p.id,
    revision: 2,
    evidence: evidence(revised),
  });
  assert.equal(f.retainedAudio.length, 1); // no deletion decision for collected testing audio
  for (const type of ["transcript", "review-card", "voice-to-entry-log"]) {
    assert.ok(f.artifacts.some((a) => a.a.type === type));
  }
  for (
    const log of f.artifacts.filter((a) => a.a.type === "voice-to-entry-log")
  ) {
    assert.ok(!JSON.stringify(log.a).includes("audio"));
    assert.ok(!Object.hasOwn(log.a.log, "transcript"));
  }
  assert.equal(f.popupCount, 1);
});

test("denied testing-audio consent leaves text available; one popup decision shared across sessions", async () => {
  const f = fixture();
  f.consent = false;
  const r = await f.start();
  await rejectsCode(
    () => r.recordInterviewAudio(new Uint8Array([1])),
    "testing-consent-required",
  );
  await r.append(turn());
  assert.equal(f.retainedAudio.length, 0);
  f.consent = true;
  await r.recordInterviewAudio(new Uint8Array([1]));
  const other = await f.start("feedback", "another-conversation");
  const count = f.popupCount;
  await other.recordInterviewAudio(new Uint8Array([2]));
  assert.equal(f.popupCount, count);
});

test("offline audio/text notes capture only; retain original context; save states never invented", async () => {
  const f = fixture(), r = await f.start();
  f.testing = false;
  for (
    const note of [{ audio: new Uint8Array([9]) }, {
      text: "typed offline first note",
    }]
  ) {
    assert.equal((await r.captureOffline(note)).requiresOnlineReview, true);
  }
  assert.equal(f.notes.length, 2);
  assert.deepEqual(f.notes[0].c, capture);
  assert.equal(f.effects.length, 0);
  assert.equal(f.providerCalls.length, 0);
  assert.equal(r.snapshot().saveState, "draft");
  for (const state of ["local-save", "sync-queue", "acknowledged-delivery"]) {
    f.savedState = state;
    assert.equal(await r.saveDraft(), state);
    assert.equal(r.snapshot().saveState, state);
    assert.deepEqual(f.saved.capture, capture);
  }
  assert.ok(
    f.artifacts.some((a) =>
      a.a.type === "offline-note" && a.a.modality === "audio"
    ),
  );
});

test("ambiguous execution survives resume and retries the exact stable revision without duplicate item", async () => {
  const f = fixture(), r = await f.start(), p = await r.propose(suggestion);
  f.throwAfterExecute = true;
  await assert.rejects(
    () => r.confirm({ proposalId: p.id, revision: 1, evidence: evidence(p) }),
    /ambiguous/,
  );
  assert.equal(f.effects.length, 1);
  assert.equal(f.checkpoint().phase, "executing");
  const resumed = await ConversationRuntime.resume(
    scope,
    f.checkpoint(),
    f.host,
  );
  await rejectsCode(() => resumed.cancel(), "execution-unresolved-retry-only");
  await rejectsCode(
    () => resumed.requestIntent("data-entry"),
    "execution-unresolved-retry-only",
  );
  await rejectsCode(
    () => resumed.correct({ revision: 1, fields: { summary: "bypass" } }),
    "execution-unresolved-retry-only",
  );
  await resumed.confirm({ proposalId: p.id, revision: 1 });
  await resumed.confirm({ proposalId: p.id, revision: 1 });
  assert.equal(f.effects.length, 1);
  assert.equal(f.confirmations.length, 1);
  assert.equal(f.calls[0].idempotencyKey, f.calls[1].idempotencyKey);
});

test("concurrent confirmations serialized; failed review cannot be confirmed before rerender", async () => {
  const f = fixture(), r = await f.start();
  f.renderFail = true;
  await assert.rejects(() => r.propose(suggestion));
  const p = r.snapshot().pending;
  await rejectsCode(
    () => r.confirm({ proposalId: p.id, revision: 1, evidence: evidence(p) }),
    "review-required",
  );
  f.renderFail = false;
  await r.review();
  await Promise.all(
    [1, 2].map(() =>
      r.confirm({ proposalId: p.id, revision: 1, evidence: evidence(p) })
    ),
  );
  assert.equal(f.effects.length, 1);
});

test("duplicate turns/retries do not restart model interview or create a new proposal", async () => {
  const f = fixture(), r = await f.start();
  f.reply = { type: "proposal", ...suggestion, mappings: [] };
  await r.converse(turn(), f.provider, options);
  const p = r.snapshot().pending;
  await r.converse(turn(), f.provider, options);
  assert.equal(f.providerCalls.length, 1);
  assert.equal(r.snapshot().pending.id, p.id);
  await rejectsCode(
    () => r.append(turn("turn-1", "conflicting retry")),
    "turn-id-conflict",
  );
  assert.equal(f.effects.length, 0);
});

test("editing a locally saved draft never claims queued or acknowledged delivery for new changes", async () => {
  const f = fixture(), r = await f.start();
  await r.saveDraft();
  assert.equal(r.snapshot().saveState, "local-save");
  await r.append(turn("new-unsaved-turn"));
  assert.equal(r.snapshot().saveState, "draft");
  const p = await r.propose(suggestion);
  f.savedState = "sync-queue";
  await r.saveDraft();
  assert.equal(r.snapshot().saveState, "sync-queue");
  await r.correct({
    revision: p.revision,
    fields: { summary: "new unsaved correction" },
  });
  assert.equal(r.snapshot().saveState, "draft");
  assert.equal(f.effects.length, 0);
});

test("host normalization is what gets reviewed/executed and logged; invalid mapping/validation cannot write", async () => {
  const f = fixture(), r = await f.start();
  const p = await r.propose(suggestion);
  f.normalize = (candidate) => ({
    ...candidate,
    fields: { summary: candidate.fields.summary.trim() },
  });
  const revised = await r.correct({
    revision: 1,
    fields: { summary: " normalized correction " },
    modality: "voice",
  });
  assert.equal(revised.fields.summary, "normalized correction");
  const log = r.snapshot().logs.at(-1);
  assert.equal(log.corrections[0].after, "normalized correction");
  await r.confirm({
    proposalId: p.id,
    revision: 2,
    evidence: evidence(revised),
  });
  assert.equal(f.effects[0].p.fields.summary, "normalized correction");
  const other = await f.start("feedback", "other-conversation");
  await rejectsCode(
    () =>
      other.propose({
        ...suggestion,
        mappings: [{
          turnIds: ["nonexistent"],
          field: "summary",
          value: "actual proposed value",
        }],
      }),
    "invalid-mapping",
  );
  f.invalid = true;
  await assert.rejects(() => other.propose(suggestion), /validation denied/);
  assert.equal(f.effects.length, 1);
});

test("starting after testing stores no interview audio and no testing consent prompt", async () => {
  const f = fixture();
  f.testing = false;
  const r = await f.start();
  await r.appendVoiceTurn(turn("post-testing", "spoken note", "voice"));
  const p = await r.propose(suggestion);
  await r.recordInterviewAudio(new Uint8Array([1]));
  await r.confirm({ proposalId: p.id, revision: 1, evidence: evidence(p) });
  assert.equal(f.popupCount, 0);
  assert.equal(f.retainedAudio.length, 0);
  for (const type of ["transcript", "review-card", "voice-to-entry-log"]) {
    assert.ok(f.artifacts.some((a) => a.a.type === type));
  }
});

test("how-to becomes feedback only after explicit intent change, new review and separate human confirmation", async () => {
  const f = fixture(), r = await f.start("how-to");
  f.doc = { title: "Get help", url: "https://docs.example.invalid/help" };
  await r.converse(
    turn("how-to-question", "How do I do this?"),
    f.provider,
    options,
  );
  assert.equal(f.effects.length, 0);
  await r.append(
    turn("actual-bug", "This is broken rather than a how-to question"),
  );
  await r.requestIntent("feedback");
  const p = await r.propose({
    ...suggestion,
    fields: { summary: "actual reported bug" },
  });
  assert.equal(f.effects.length, 0);
  assert.equal(r.snapshot().conversationRef, "conversation-1");
  await r.confirm({
    proposalId: p.id,
    revision: p.revision,
    evidence: evidence(p),
  });
  assert.equal(f.effects.length, 1);
  assert.equal(f.effects[0].p.intent, "feedback");
});
