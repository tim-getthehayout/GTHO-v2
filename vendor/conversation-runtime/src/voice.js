import {
  authorizationValid,
  clone,
  intents,
  invariant,
  nonempty,
  object,
} from "./shared.js";

/** Transport state only: never owns a second transcript or grants host-data permissions.
 * driver.connect({authorization,conversation,signal,onTurn,onAudio,onDisconnect}) -> connection:
 * {sendAudio(bytes),sendText(text,id),interrupt(),cancel(),close()}.
 * Driver maps provider wire events to final turns with stable IDs across reconnects.
 * getSession reads the authoritative session; drivers hydrate it on every connect/reconnect.
 * onTurn feeds ConversationRuntime.append/appendVoiceTurn (or authenticated backend equivalent).
 * broker obtains new ephemeral credentials from the authenticated backend, not a device key.
 */
export class VoiceTransport {
  #broker;
  #driver;
  #onTurn;
  #getSession;
  #onAudio;
  #onState;
  #connection;
  #epoch = 0;
  #attempt;
  #abort;
  #delivery = Promise.resolve();
  #state = "text-fallback";
  constructor(
    {
      broker,
      driver,
      getSession,
      onTurn,
      onAudio = () => {},
      onState = () => {},
    },
  ) {
    invariant(
      typeof broker === "function" && typeof driver?.connect === "function" &&
        typeof onTurn === "function" && typeof getSession === "function",
      "invalid-voice-ports",
    );
    this.#broker = broker;
    this.#driver = driver;
    this.#onTurn = onTurn;
    this.#getSession = getSession;
    this.#onAudio = onAudio;
    this.#onState = onState;
  }
  get state() {
    return this.#state;
  }
  #set(state) {
    this.#state = state;
    this.#onState(state);
  }
  connect() {
    if (this.#connection) return Promise.resolve();
    if (this.#attempt) return this.#attempt;
    const epoch = ++this.#epoch;
    this.#abort = new AbortController();
    this.#set("connecting");
    const attempt = (async () => {
      try {
        const auth = await this.#broker(this.#abort.signal);
        invariant(authorizationValid(auth), "invalid-voice-authorization");
        if (epoch !== this.#epoch) return;
        const session = await this.#getSession();
        invariant(
          object(session) && nonempty(session.conversationRef) &&
            intents.includes(session.intent) &&
            Array.isArray(session.transcript),
          "invalid-voice-session",
        );
        if (epoch !== this.#epoch) return;
        const conversation = {
          conversationRef: session.conversationRef,
          intent: session.intent,
          transcript: clone(session.transcript),
          capture: clone(session.capture),
          ...(session.phase === "review"
            ? { pending: clone(session.pending) }
            : {}),
        };
        const connection = await this.#driver.connect({
          conversation,
          authorization: clone(auth),
          signal: this.#abort.signal,
          onTurn: (turn) => {
            if (epoch !== this.#epoch) return;
            this.#delivery = this.#delivery.then(async () => {
              if (epoch === this.#epoch) await this.#onTurn(clone(turn));
            }).catch(async () => {
              if (epoch === this.#epoch) {
                await this.#disconnect("text-fallback");
              }
            });
          },
          onAudio: (bytes) => {
            if (epoch === this.#epoch) this.#onAudio(bytes);
          },
          onDisconnect: () => {
            if (epoch === this.#epoch) void this.#disconnect("text-fallback");
          },
        });
        if (epoch !== this.#epoch) {
          await connection.close();
          return;
        }
        this.#connection = connection;
        this.#set("connected");
      } catch {
        if (epoch === this.#epoch) await this.#disconnect("text-fallback");
      }
    })();
    this.#attempt = attempt;
    void attempt.finally(() => {
      if (this.#attempt === attempt) this.#attempt = undefined;
    });
    return attempt;
  }
  async #disconnect(state) {
    ++this.#epoch;
    this.#abort?.abort();
    const connection = this.#connection;
    this.#connection = undefined;
    this.#attempt = undefined;
    this.#set(state);
    try {
      await connection?.close();
    } catch { /* text fallback remains usable */ }
  }
  async stream(bytes) {
    invariant(
      bytes instanceof Uint8Array && this.#connection,
      "voice-not-connected",
    );
    try {
      await this.#connection.sendAudio(bytes);
    } catch {
      await this.#disconnect("text-fallback");
    }
  }
  async interrupt() {
    try {
      await this.#connection?.interrupt();
    } catch {
      await this.#disconnect("text-fallback");
    }
    // No session reset, proposal submission or confirmation.
  }
  async cancel() {
    try {
      await this.#connection?.cancel();
    } finally {
      await this.#disconnect("cancelled");
    }
  }
  async reconnect() {
    await this.#disconnect("text-fallback");
    return this.connect();
  }
  async text(text, id = crypto.randomUUID()) {
    invariant(nonempty(text) && nonempty(id), "invalid-turn");
    // Always same authoritative session, even when the voice provider is unavailable.
    await this.#onTurn({ id, role: "user", modality: "text", text });
    if (this.#connection) {
      try {
        await this.#connection.sendText(text, id);
      } catch {
        await this.#disconnect("text-fallback");
      }
    }
    return id;
  }
  async settled() {
    await this.#delivery;
  }
}
