// deno-lint-ignore-file require-await -- test doubles intentionally preserve asynchronous port signatures
import test from "node:test";
import assert from "node:assert/strict";
import { VoiceTransport } from "../src/index.js";
import { evidence, fixture, turn } from "./support.js";

function voiceFixture(runtime) {
  const v = {
    connections: [],
    frames: [],
    texts: [],
    played: [],
    interrupted: 0,
    cancelled: 0,
    closed: 0,
    brokers: 0,
  };
  v.transport = new VoiceTransport({
    async broker() {
      v.brokers++;
      return {
        provider: "test-voice",
        token: "ephemeral-test-only",
        expiresAt: Date.now() + 1000,
      };
    },
    getSession: () => runtime.snapshot(),
    driver: {
      async connect(callbacks) {
        v.connections.push(callbacks);
        return {
          async sendAudio(bytes) {
            v.frames.push(bytes);
          },
          async sendText(text, id) {
            v.texts.push({ text, id });
          },
          async interrupt() {
            v.interrupted++;
          },
          async cancel() {
            v.cancelled++;
          },
          async close() {
            v.closed++;
          },
        };
      },
    },
    onTurn: (t) =>
      t.modality === "text" ? runtime.append(t) : runtime.appendVoiceTurn(t),
    onAudio: (bytes) => v.played.push(bytes),
  });
  return v;
}

test("voice connect/stream/interruption/reconnect preserve one session and stable proposal; replay duplicate-free", async () => {
  const f = fixture(), r = await f.start(), v = voiceFixture(r);
  await v.transport.connect();
  assert.equal(v.transport.state, "connected");
  await v.transport.stream(new Uint8Array([1]));
  assert.equal(v.frames.length, 1);
  v.connections[0].onAudio(new Uint8Array([2]));
  assert.equal(v.played.length, 1);
  v.connections[0].onTurn(turn("utterance-stable", "spoken note", "voice"));
  await v.transport.settled();
  const p = await r.propose({
    destination: "host-feedback",
    fields: { summary: "spoken note" },
    mappings: [{
      turnIds: ["utterance-stable"],
      field: "summary",
      value: "spoken note",
    }],
  });
  await v.transport.interrupt();
  await v.transport.reconnect();
  v.connections[1].onTurn(turn("utterance-stable", "spoken note", "voice"));
  // Stale callbacks from the old connection must not pollute a resumed interview.
  v.connections[0].onTurn(turn("stale-utterance", "late callback", "voice"));
  await v.transport.settled();
  assert.equal(v.connections[1].conversation.transcript.length, 1);
  assert.equal(v.connections[1].conversation.pending.id, p.id);
  assert.equal(r.snapshot().transcript.length, 1);
  assert.equal(r.snapshot().pending.id, p.id);
  assert.equal(r.snapshot().pending.revision, 1);
  assert.equal(f.effects.length, 0);
  await v.transport.text("manual text correction", "fallback-turn");
  assert.equal(r.snapshot().transcript.at(-1).modality, "text");
  assert.equal(v.texts[0].id, "fallback-turn");
  await v.transport.cancel();
  assert.equal(v.transport.state, "cancelled");
  assert.equal(f.effects.length, 0);
  await r.confirm({ proposalId: p.id, revision: 1, evidence: evidence(p) });
  assert.equal(f.effects.length, 1);
  assert.equal(v.brokers, 2);
  assert.ok(!JSON.stringify(r.snapshot()).includes("ephemeral-test-only"));
});

test("voice broker failure and disconnect leave text fallback without resetting pending review", async () => {
  const f = fixture(), r = await f.start(), v = voiceFixture(r);
  const broken = new VoiceTransport({
    broker: async () => {
      throw new Error("not connected");
    },
    driver: {
      connect() {
        throw new Error("must not run");
      },
    },
    getSession: () => r.snapshot(),
    onTurn: (t) => r.append(t),
  });
  await broken.connect();
  assert.equal(broken.state, "text-fallback");
  await broken.text("typed first note", "typed-fallback");
  const p = await r.propose({
    destination: "host",
    fields: { summary: "pending review" },
  });
  await v.transport.connect();
  v.connections[0].onDisconnect();
  assert.equal(v.transport.state, "text-fallback");
  assert.equal(r.snapshot().pending.id, p.id);
  assert.equal(f.effects.length, 0);
});

test("cancel during pending voice authorization ignores late result, never connects or files", async () => {
  let release, connects = 0;
  const f = fixture(), r = await f.start();
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const t = new VoiceTransport({
    broker: () => pending,
    driver: {
      async connect() {
        connects++;
      },
    },
    getSession: () => r.snapshot(),
    onTurn: (x) => r.appendVoiceTurn(x),
  });
  const connecting = t.connect();
  await t.cancel();
  release({
    provider: "test",
    token: "test-token",
    expiresAt: Date.now() + 1000,
  });
  await connecting;
  assert.equal(t.state, "cancelled");
  assert.equal(connects, 0);
  assert.equal(f.effects.length, 0);
});
