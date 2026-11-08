// deno-lint-ignore-file require-await -- test doubles intentionally preserve asynchronous port signatures
import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceBroker, XaiProvider } from "../src/index.js";
import { fixture, rejectsCode, turn } from "./support.js";
const output = (text) => ({
  output: [{
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  }],
  usage: { input_tokens: 11, output_tokens: 5 },
});

test("xAI replaceable provider isolates wire/key and sends scoped history with store:false", async () => {
  const f = fixture(), r = await f.start();
  await r.append(turn("typed"));
  await r.appendVoiceTurn(turn("spoken", "spoken", "voice"));
  let sent;
  const provider = new XaiProvider({
    apiKey: "test-only-key",
    model: "configured-model",
    fetch: async (url, request) => {
      sent = { url, request };
      return Response.json(
        output(JSON.stringify({ type: "answer", text: "clarification" })),
      );
    },
  });
  const result = await provider.respond({
    session: r.snapshot(),
    context: await f.host.context(r.snapshot().scope, "feedback"),
    reads: [],
  });
  assert.equal(result.reply.text, "clarification");
  assert.equal(result.usage.inputTokens, 11);
  assert.equal(sent.url, "https://api.x.ai/v1/responses");
  const body = JSON.parse(sent.request.body);
  assert.equal(body.store, false);
  assert.equal(body.model, "configured-model");
  const input = JSON.parse(body.input[1].content);
  assert.equal(input.transcript.length, 2);
  assert.equal(input.transcript[1].modality, "voice");
  assert.ok(!sent.request.body.includes("test-only-key"));
  assert.equal(sent.request.headers.Authorization, "Bearer test-only-key");
  assert.ok(!JSON.stringify(provider).includes("test-only-key"));
  assert.ok(!JSON.stringify(r.snapshot()).includes("test-only-key"));
});

test("xAI output cannot authorize writes; malformed output preserves metering and redacts errors", async () => {
  const f = fixture(), r = await f.start();
  const args = {
    session: r.snapshot(),
    context: await f.host.context(r.snapshot().scope, "feedback"),
    reads: [],
  };
  const bad = new XaiProvider({
    apiKey: "test-key",
    model: "configured-model",
    fetch: async () =>
      Response.json(
        output(JSON.stringify({ type: "confirm", evidence: "yes" })),
      ),
  });
  await assert.rejects(
    () => bad.respond(args),
    (error) =>
      error.code === "invalid-provider-output" &&
      error.usage.inputTokens === 11,
  );
  const raw = new XaiProvider({
    apiKey: "test-key",
    model: "configured-model",
    fetch: async () => Response.json(output("private invalid response")),
  });
  await assert.rejects(
    () => raw.respond(args),
    (error) =>
      error.code === "invalid-provider-output" &&
      !String(error).includes("private invalid response"),
  );
  const down = new XaiProvider({
    apiKey: "test-key",
    model: "configured-model",
    fetch: async () => new Response("private provider error", { status: 500 }),
  });
  await rejectsCode(() => down.respond(args), "provider-request-failed");
  assert.equal(f.effects.length, 0);
});

test("voice broker enforces explicit lifetime policy, drops vendor metadata, requires expiring credentials", async () => {
  let exchangeInput;
  const broker = createVoiceBroker({
    exchange: async (input) => {
      exchangeInput = input;
      return {
        provider: "xai",
        token: "test-ephemeral",
        expiresAt: Date.now() + 1000,
        vendorExtra: "not exposed",
      };
    },
    validateLifetime: (expiresAt) => expiresAt <= Date.now() + 2000,
  });
  const input = {
    scope: { operationId: "a", actorId: "person" },
    conversationRef: "c",
    routing: "operation-owned",
  };
  const token = await broker(input);
  assert.deepEqual(exchangeInput, input);
  assert.equal(token.token, "test-ephemeral");
  assert.equal(token.vendorExtra, undefined);
  const expired = createVoiceBroker({
    exchange: async () => ({
      provider: "xai",
      token: "test-expired",
      expiresAt: 1,
    }),
    validateLifetime: () => true,
  });
  await rejectsCode(() => expired(input), "invalid-voice-authorization");
  const excessive = createVoiceBroker({
    exchange: async () => token,
    validateLifetime: () => false,
  });
  await rejectsCode(() => excessive(input), "invalid-voice-authorization");
});
