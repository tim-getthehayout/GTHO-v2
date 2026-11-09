// deno-lint-ignore-file require-await -- test doubles intentionally preserve asynchronous port signatures
import test from "node:test";
import assert from "node:assert/strict";
import {
  createEdgeFunction,
  serveConversationRuntime,
} from "../supabase/functions/conversation-runtime/index.js";
import { capture, evidence, fixture, turn } from "./support.js";
const budgets = { maxReadRounds: 1, maxBodyBytes: 8192 };
function setup() {
  const f = fixture(), handler = createEdgeFunction(f.backend, budgets);
  let sequence = 0;
  const send = async (body, actor = "person-a") => {
    const response = await handler(
      new Request("https://runtime.example.invalid", {
        method: "POST",
        headers: { authorization: actor, "content-type": "application/json" },
        body: JSON.stringify({
          conversationRef: "conversation-1",
          requestRef: `request-${++sequence}`,
          ...body,
        }),
      }),
    );
    return {
      status: response.status,
      data: await response.json(),
      headers: response.headers,
    };
  };
  return {
    f,
    handler,
    send,
    start: (actor = "person-a") =>
      send({ command: "start", capture, intent: "feedback" }, actor),
  };
}

test("JavaScript Edge Function imports shared library, composes Deno server, and fails closed on auth", async () => {
  const { f, handler, send } = setup();
  const served = serveConversationRuntime(f.backend, budgets, (h) => h);
  assert.equal(typeof served, "function");
  const auth = await send({ command: "resume" }, "invalid-identity");
  assert.equal(auth.status, 401);
  assert.equal(f.reservations.length, 0);
  assert.equal(
    (await handler(new Request("https://example.invalid"))).status,
    405,
  );
  const result = await send({
    command: "start",
    capture,
    intent: "feedback",
    operationId: "operation-b",
  });
  assert.equal(result.status, 400);
  assert.equal(result.data.error, "client-identity-forbidden");
});

test("authenticated operation isolation for identical refs, forged snapshots and private content", async () => {
  const { f, send, start } = setup();
  await start();
  await send({
    command: "turn",
    turn: turn("a-turn", "operation-a private content"),
  });
  const missing = await send({ command: "resume" }, "person-b");
  assert.equal(missing.status, 400);
  assert.ok(!JSON.stringify(missing.data).includes("private content"));
  await start("person-b");
  const b = await send({ command: "resume" }, "person-b");
  assert.equal(b.data.session.scope.operationId, "operation-b");
  assert.equal(b.data.session.transcript.length, 0);
  const a = await send({ command: "resume" });
  assert.ok(
    a.data.session.transcript.some((t) =>
      t.text === "operation-a private content"
    ),
  );
  assert.ok(!JSON.stringify(b.data).includes("operation-a private content"));
  const forged = await send(
    { command: "resume", snapshot: f.checkpoint() },
    "person-b",
  );
  assert.equal(forged.data.error, "client-identity-forbidden");
  // Also reject an incorrectly implemented storage port returning another operation's snapshot.
  f.backend.withSession = (_s, _ref, work) => work(f.checkpoint());
  assert.equal(
    (await send({ command: "resume" }, "person-b")).data.error,
    "scope-mismatch",
  );
});

test("day-one metering: purpose, tokens, model/session/audio/count; separate billing logs and own subscription routing", async () => {
  const { f, send, start } = setup();
  await start();
  f.routing = "operation-owned";
  await send({
    command: "turn",
    turn: turn("metered-turn", "private transcript"),
  });
  const m = f.meters.at(-1);
  assert.equal(m.billShared, false);
  assert.equal(m.failed, false);
  assert.equal(m.s.operationId, "operation-a");
  assert.equal(m.measured.model, "test-model");
  assert.equal(m.measured.inputTokens, 7);
  assert.equal(m.measured.outputTokens, 3);
  assert.equal(m.measured.requestCount, 2); // backend request plus provider request
  assert.equal(f.reservations.at(-1).purpose, "feedback");
  assert.equal(f.routes.at(-1).routing, "operation-owned");
  assert.ok(!JSON.stringify(f.meters).includes("private transcript"));
  const auth = await send({ command: "voice-authorization" });
  assert.equal(auth.status, 200);
  assert.equal(f.voiceAuth.routing, "operation-owned");
  assert.ok(!JSON.stringify(f.checkpoint()).includes("test-ephemeral-value"));
  f.limitsDeny = true; // settlement remains possible after consumption even at a cap
  assert.equal((await send({ command: "voice-usage" })).status, 200);
  assert.equal(f.meters.at(-1).measured.audioMinutes, 2);
  assert.equal(f.meters.at(-1).measured.voiceSession, "voice-session-1");
  assert.ok(!f.artifacts.some((a) => a.a.type === "billing"));
});

test("caps stop provider calls before work; failed calls get failed metering without error disclosure", async () => {
  const { f, send, start } = setup();
  await start();
  f.limitsDeny = true;
  assert.equal((await send({ command: "turn", turn: turn() })).status, 503);
  assert.equal(f.providerCalls.length, 0);
  f.limitsDeny = false;
  f.providerFail = true;
  const failed = await send({ command: "turn", turn: turn() });
  assert.equal(failed.status, 503);
  assert.equal(failed.data.error, "backend-unavailable");
  assert.ok(!JSON.stringify(failed).includes("private provider error"));
  assert.equal(f.meters.at(-1).failed, true);
});

test("own-operation billing cannot select another operation; central control checks backend identity", async () => {
  const { send, start } = setup();
  await start();
  const a = await send({ command: "billing-own" });
  assert.equal(a.data.billing.operation, "operation-a");
  const b = await send({ command: "billing-own" }, "person-b");
  assert.equal(b.data.billing.operation, "operation-b");
  assert.equal(b.data.billing.count, 0);
  assert.equal(
    (await send(
      { command: "billing-own", operationId: "operation-a" },
      "person-b",
    )).status,
    400,
  );
  assert.equal((await send({ command: "billing-control" })).status, 403);
  assert.equal(
    (await send({ command: "billing-control" }, "central")).data.billing
      .operationCount,
    2,
  );
});

test("backend confirms exact host-reviewed revision; receipts never returned; concurrent retries yield one item", async () => {
  const { f, send, start } = setup();
  await start();
  const proposed = await send({
    command: "propose",
    proposal: { destination: "host-feedback", fields: { summary: "proposed" } },
  });
  const p = proposed.data.value;
  assert.equal(f.effects.length, 0);
  const result = await Promise.all(
    [1, 2].map(() =>
      send({
        command: "confirm",
        confirmation: {
          proposalId: p.id,
          revision: p.revision,
          evidence: evidence(p),
        },
      })
    ),
  );
  assert.ok(result.every((r) => r.status === 200));
  assert.equal(f.effects.length, 1);
  assert.ok(
    result.every((r) => !Object.hasOwn(r.data.session, "confirmation")),
  );
  assert.equal(result[0].headers.get("cache-control"), "no-store");
});

test("backend body streaming bound and disallowed request media types", async () => {
  const { handler } = setup();
  const request = (body, contentType) =>
    new Request("https://runtime.example.invalid", {
      method: "POST",
      headers: { authorization: "person-a", "content-type": contentType },
      body,
    });
  const large = await handler(
    request(JSON.stringify({ content: "x".repeat(9000) }), "application/json"),
  );
  assert.equal((await large.json()).error, "request-too-large");
  assert.equal(
    (await (await handler(request("{}", "text/plain"))).json()).error,
    "json-required",
  );
  assert.equal(
    (await (await handler(request("{bad json", "application/json"))).json())
      .error,
    "invalid-json",
  );
});

test("failed model output still settles independently measured token usage", async () => {
  const { f, send, start } = setup();
  await start();
  const { XaiProvider } = await import("../src/index.js");
  f.backend.provider = async () =>
    new XaiProvider({
      apiKey: "test-key",
      model: "test-model",
      fetch: async () =>
        Response.json({
          output: [{
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "invalid output" }],
          }],
          usage: { input_tokens: 19, output_tokens: 9 },
        }),
    });
  assert.equal((await send({ command: "turn", turn: turn() })).status, 400);
  assert.equal(f.meters.at(-1).measured.inputTokens, 19);
  assert.equal(f.meters.at(-1).measured.outputTokens, 9);
  assert.equal(f.meters.at(-1).failed, true);
});
