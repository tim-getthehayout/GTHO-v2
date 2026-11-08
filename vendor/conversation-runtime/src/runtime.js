import {
  authorizationValid,
  captureValid,
  clone,
  fields,
  intents,
  invariant,
  json,
  nonempty,
  object,
  proposalValid,
  sameScope,
  saveStates,
  scopeValid,
  writeIntent,
} from "./shared.js";

const internal = Symbol("runtime");
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** One authoritative session. Use BackendPorts.withSession across instances/processes. */
export class ConversationRuntime {
  #state;
  #host;
  #queue = Promise.resolve();
  constructor(key, host, state) {
    invariant(key === internal, "use-start-or-resume");
    this.#host = host;
    this.#state = clone(state);
  }
  static async start({ scope, conversationRef, intent, capture }, host) {
    invariant(
      scopeValid(scope) && nonempty(conversationRef) &&
        intents.includes(intent) && captureValid(capture),
      "invalid-session",
    );
    await host.authorize(clone(scope), conversationRef, "start");
    const runtime = new ConversationRuntime(internal, host, {
      version: 1,
      scope,
      conversationRef,
      intent,
      capture,
      transcript: [],
      phase: "converse",
      preserved: [],
      saveState: "draft",
      logs: [],
      answered: [],
      reviewReady: false,
    });
    if (await host.earlyTesting(clone(scope))) {
      await host.ensureTestingConsent(clone(scope));
    }
    await runtime.#checkpoint();
    await runtime.#event("conversation");
    return runtime;
  }
  static async resume(scope, snapshot, host) {
    invariant(
      scopeValid(scope) && object(snapshot) && scopeValid(snapshot.scope) &&
        sameScope(scope, snapshot.scope),
      "scope-mismatch",
    );
    invariant(
      snapshot.version === 1 && nonempty(snapshot.conversationRef) &&
        intents.includes(snapshot.intent) && Array.isArray(snapshot.transcript),
      "invalid-snapshot",
    );
    await host.authorize(clone(scope), snapshot.conversationRef, "resume");
    if (await host.earlyTesting(clone(scope))) {
      await host.ensureTestingConsent(clone(scope));
    }
    return new ConversationRuntime(internal, host, snapshot);
  }
  snapshot() {
    return clone(this.#state);
  }
  #scope() {
    return clone(this.#state.scope);
  }
  async #checkpoint() {
    await this.#host.checkpoint(this.#scope(), this.snapshot());
  }
  async #artifact(artifact) {
    await this.#host.artifact(
      this.#scope(),
      this.#state.conversationRef,
      clone(artifact),
    );
  }
  async #event(type, proposal) {
    await this.#host.event(this.#scope(), {
      type,
      conversationRef: this.#state.conversationRef,
      ...(proposal
        ? { proposalId: proposal.id, revision: proposal.revision }
        : {}),
    });
  }
  #run(action, work) {
    const run = this.#queue.then(async () => {
      await this.#host.authorize(
        this.#scope(),
        this.#state.conversationRef,
        action,
      );
      try {
        return clone(await work());
      } finally {
        await this.#checkpoint();
      }
    });
    this.#queue = run.catch(() => {});
    return run;
  }
  #editable() {
    invariant(
      this.#state.phase !== "executing",
      "execution-unresolved-retry-only",
    );
    invariant(!this.#state.switchRequested, "resolve-intent-switch-first");
  }
  async #append(turn) {
    invariant(
      object(turn) && nonempty(turn.id) &&
        ["user", "assistant"].includes(turn.role) &&
        ["text", "voice"].includes(turn.modality) && nonempty(turn.text),
      "invalid-turn",
    );
    // Narrow envelope: no audio/credentials/arbitrary provider metadata in transcript.
    const clean = {
      id: turn.id,
      role: turn.role,
      modality: turn.modality,
      text: turn.text,
    };
    const existing = this.#state.transcript.find((t) => t.id === clean.id);
    if (existing) {
      invariant(equal(existing, clean), "turn-id-conflict");
      await this.#artifact({
        type: "transcript",
        turns: this.#state.transcript,
      });
      return;
    }
    this.#state.transcript.push(clean);
    this.#state.saveState = "draft";
    await this.#artifact({ type: "transcript", turns: this.#state.transcript });
    await this.#event("conversation");
  }
  append(turn) {
    return this.#run("converse", async () => {
      invariant(turn?.role === "user", "user-turn-required");
      await this.#append(turn);
      return this.snapshot();
    });
  }
  appendVoiceTurn(turn) {
    return this.#run("transport-turn", async () => {
      await this.#append({ ...turn, modality: "voice" });
      return this.snapshot();
    });
  }
  /** Model output is always a suggestion. It cannot confirm, execute or switch intent. */
  converse(turn, provider, { onUsage, maxReadRounds, signal } = {}) {
    return this.#run("converse", async () => {
      this.#editable();
      invariant(turn?.role === "user", "user-turn-required");
      await this.#append(turn);
      if (this.#state.answered.includes(turn.id)) return this.snapshot();
      invariant(
        typeof onUsage === "function" && Number.isSafeInteger(maxReadRounds) &&
          maxReadRounds >= 0,
        "metering-and-read-budget-required",
      );
      const context = await this.#host.context(
        this.#scope(),
        this.#state.intent,
      );
      invariant(
        object(context) && nonempty(context.instructions) &&
          json(context.data) && Array.isArray(context.readTools),
        "invalid-host-context",
      );
      const reads = [];
      for (let round = 0;; round++) {
        signal?.throwIfAborted();
        const { reply, usage } = await provider.respond({
          session: this.snapshot(),
          context: clone(context),
          reads: clone(reads),
        }, signal);
        await onUsage(usage);
        invariant(object(reply), "invalid-provider-reply");
        if (reply.type === "read") {
          invariant(
            round < maxReadRounds && nonempty(reply.tool) &&
              fields(reply.args) &&
              context.readTools.some((t) => t.name === reply.tool),
            "read-tool-denied",
          );
          await this.#host.authorize(
            this.#scope(),
            this.#state.conversationRef,
            "read",
          );
          reads.push(
            await this.#host.read(this.#scope(), reply.tool, clone(reply.args)),
          );
          continue;
        }
        if (reply.type === "answer") {
          invariant(nonempty(reply.text), "invalid-answer");
          await this.#append({
            id: crypto.randomUUID(),
            role: "assistant",
            modality: "text",
            text: reply.text,
          });
          if (this.#state.intent === "how-to") {
            const doc = await this.#host.matchingDoc(this.#scope(), turn.text);
            if (doc) {
              invariant(
                nonempty(doc.title) && nonempty(doc.url) &&
                  /^https?:\/\//.test(doc.url),
                "invalid-doc",
              );
              await this.#append({
                id: crypto.randomUUID(),
                role: "assistant",
                modality: "text",
                text: `${doc.title}: ${doc.url}`,
              });
            }
          }
        } else if (reply.type === "proposal") {
          invariant(writeIntent(this.#state.intent), "read-only-intent");
          if (this.#state.phase === "review") {
            await this.#correct(
              this.#state.pending.revision,
              reply.destination,
              reply.fields,
              turn.modality,
              reply.mappings,
            );
          } else {
            await this.#propose(
              reply.destination,
              reply.fields,
              reply.mappings,
            );
          }
        } else invariant(false, "unsupported-model-action");
        this.#state.answered.push(turn.id);
        return this.snapshot();
      }
    });
  }
  async #install(candidate, mappings, corrections = []) {
    invariant(proposalValid(candidate), "invalid-proposal");
    const prior = this.#state.phase === "review"
      ? clone(this.#state.pending)
      : undefined;
    const proposed = await this.#host.createProposal(
      this.#scope(),
      clone(candidate),
    );
    invariant(
      proposalValid(proposed) &&
        ["id", "itemRef", "revision", "intent"].every((k) =>
          proposed[k] === candidate[k]
        ),
      "host-proposal-identity-changed",
    );
    invariant(Array.isArray(mappings), "invalid-mappings");
    for (const m of mappings) {
      invariant(
        object(m) && nonempty(m.field) &&
          Object.hasOwn(proposed.fields, m.field) &&
          equal(m.value, proposed.fields[m.field]) &&
          Array.isArray(m.turnIds) && m.turnIds.length > 0 &&
          m.turnIds.every((id) =>
            this.#state.transcript.some((t) => t.id === id && t.role === "user")
          ),
        "invalid-mapping",
      );
    }
    if (prior) {
      const modality = corrections[0]?.modality ?? "text";
      corrections = [
        ...new Set([
          ...Object.keys(prior.fields),
          ...Object.keys(proposed.fields),
        ]),
      ]
        .filter((field) => !equal(prior.fields[field], proposed.fields[field]))
        .map((field) => ({
          field,
          before: clone(prior.fields[field] ?? null),
          after: clone(proposed.fields[field] ?? null),
          modality,
        }));
      if (proposed.destination !== prior.destination) {
        corrections.push({
          field: "$destination",
          before: prior.destination,
          after: proposed.destination,
          modality,
        });
      }
    }
    await this.#host.validate(this.#scope(), clone(proposed));
    // Only the actual normalized fields/destination reach the card and execution.
    this.#state.pending = clone(proposed);
    this.#state.phase = "review";
    this.#state.reviewReady = false;
    this.#state.saveState = "draft";
    delete this.#state.confirmation;
    delete this.#state.result;
    const log = {
      proposalId: proposed.id,
      revision: proposed.revision,
      mappings: mappings.map((m) => ({
        field: m.field,
        value: clone(m.value),
        turnIds: [...m.turnIds],
      })),
      corrections,
    };
    this.#state.logs.push(log);
    await this.#review();
    if (mappings.length) await this.#event("field-mapping", proposed);
    if (corrections.length) await this.#event("correction", proposed);
    return clone(proposed);
  }
  async #review() {
    const proposal = this.#state.pending;
    invariant(this.#state.phase === "review" && proposal, "no-review");
    await this.#host.renderReview(this.#scope(), clone(proposal));
    await this.#artifact({ type: "review-card", proposal });
    const log = this.#state.logs.findLast((l) =>
      l.proposalId === proposal.id && l.revision === proposal.revision
    );
    await this.#artifact({ type: "voice-to-entry-log", log });
    await this.#event("review-revision", proposal);
    this.#state.reviewReady = true;
    return clone(proposal);
  }
  review() {
    return this.#run("review", () => this.#review());
  }
  #propose(destination, proposedFields, mappings = []) {
    this.#editable();
    invariant(writeIntent(this.#state.intent), "read-only-intent");
    invariant(this.#state.phase !== "review", "pending-review-exists");
    return this.#install({
      id: crypto.randomUUID(),
      itemRef: crypto.randomUUID(),
      revision: 1,
      intent: this.#state.intent,
      destination,
      fields: clone(proposedFields),
    }, mappings);
  }
  propose({ destination, fields: proposedFields, mappings = [] }) {
    return this.#run(
      "propose",
      () => this.#propose(destination, proposedFields, mappings),
    );
  }
  #correct(
    revision,
    destination,
    proposedFields,
    modality,
    mappings = [],
  ) {
    this.#editable();
    invariant(
      this.#state.phase === "review" &&
        this.#state.pending?.revision === revision,
      "stale-review",
    );
    invariant(
      fields(proposedFields) && ["text", "voice"].includes(modality),
      "invalid-correction",
    );
    const old = this.#state.pending;
    const changes = [
      ...new Set([...Object.keys(old.fields), ...Object.keys(proposedFields)]),
    ]
      .filter((field) => !equal(old.fields[field], proposedFields[field]))
      .map((field) => ({
        field,
        before: clone(old.fields[field] ?? null),
        after: clone(proposedFields[field] ?? null),
        modality,
      }));
    if (destination !== old.destination) {
      changes.push({
        field: "$destination",
        before: old.destination,
        after: destination,
        modality,
      });
    }
    return this.#install(
      {
        ...clone(old),
        revision: old.revision + 1,
        destination,
        fields: clone(proposedFields),
      },
      mappings,
      changes,
    );
  }
  correct(
    {
      revision,
      destination = this.#state.pending?.destination,
      fields: proposedFields,
      modality = "text",
      mappings = [],
    },
  ) {
    return this.#run(
      "correct",
      () =>
        this.#correct(
          revision,
          destination,
          proposedFields,
          modality,
          mappings,
        ),
    );
  }
  requestIntent(intent) {
    return this.#run("intent-switch", async () => {
      invariant(intents.includes(intent), "invalid-intent");
      invariant(!this.#state.switchRequested, "resolve-intent-switch-first");
      invariant(
        this.#state.phase !== "executing",
        "execution-unresolved-retry-only",
      );
      if (intent === this.#state.intent) {
        return { needsDraftDecision: false, intent };
      }
      if (this.#state.phase === "review") {
        this.#state.switchRequested = intent;
        return {
          needsDraftDecision: true,
          choices: ["preserve", "discard"],
          intent,
        };
      }
      this.#switch(intent);
      await this.#event("intent-switch");
      return { needsDraftDecision: false, intent };
    });
  }
  #switch(intent) {
    this.#state.intent = intent;
    this.#state.phase = "converse";
    this.#state.reviewReady = false;
    this.#state.saveState = "draft";
    delete this.#state.pending;
    delete this.#state.confirmation;
    delete this.#state.result;
    delete this.#state.switchRequested;
  }
  resolveIntent(decision) {
    return this.#run("intent-switch", async () => {
      invariant(
        this.#state.switchRequested &&
          ["preserve", "discard"].includes(decision),
        "draft-decision-required",
      );
      if (decision === "preserve") {
        this.#state.preserved.push(clone(this.#state.pending));
      }
      const next = this.#state.switchRequested;
      this.#switch(next);
      await this.#event("intent-switch");
      return this.snapshot();
    });
  }
  restoreDraft(proposalId) {
    return this.#run("restore-draft", async () => {
      this.#editable();
      invariant(this.#state.phase !== "review", "pending-review-exists");
      const draft = this.#state.preserved.find((p) => p.id === proposalId);
      invariant(
        draft && draft.intent === this.#state.intent,
        "draft-intent-mismatch",
      );
      const proposal = await this.#install({
        ...clone(draft),
        revision: draft.revision + 1,
      }, []);
      this.#state.preserved = this.#state.preserved.filter((p) =>
        p.id !== proposalId
      );
      return proposal;
    });
  }
  cancel() {
    return this.#run("cancel", async () => {
      invariant(
        this.#state.phase !== "executing",
        "execution-unresolved-retry-only",
      );
      invariant(this.#state.phase !== "completed", "already-executed");
      delete this.#state.pending;
      delete this.#state.confirmation;
      delete this.#state.switchRequested;
      this.#state.phase = "cancelled";
      this.#state.reviewReady = false;
      this.#state.saveState = "draft";
      await this.#event("cancel");
      return this.snapshot();
    });
  }
  async #resultArtifacts() {
    const p = this.#state.pending;
    // Domain data are NOT mislabeled as a normalized feedback item.
    if (p.intent === "feedback") {
      await this.#artifact({
        type: "normalized-item",
        proposal: p,
        result: this.#state.result.result,
      });
    }
    const log = this.#state.logs.findLast((l) =>
      l.proposalId === p.id && l.revision === p.revision
    );
    log.acceptedResult = {
      itemRef: p.itemRef,
      state: this.#state.result.state,
    };
    await this.#artifact({ type: "voice-to-entry-log", log });
    await this.#event("result", p);
  }
  confirm({ proposalId, revision, evidence }) {
    return this.#run("confirm", async () => {
      invariant(!this.#state.switchRequested, "resolve-intent-switch-first");
      const proposal = this.#state.pending;
      invariant(
        proposal && proposal.id === proposalId &&
          proposal.revision === revision &&
          proposal.intent === this.#state.intent,
        "stale-review",
      );
      if (this.#state.phase === "completed") {
        await this.#resultArtifacts();
        return this.#state.result;
      }
      invariant(
        ["review", "executing"].includes(this.#state.phase) &&
          this.#state.reviewReady,
        "review-required",
      );
      await this.#host.validate(this.#scope(), clone(proposal));
      if (this.#state.phase === "review") {
        invariant(json(evidence), "explicit-confirmation-required");
        const receipt = await this.#host.recordConfirmation(
          this.#scope(),
          clone(proposal),
          clone(evidence),
        );
        invariant(nonempty(receipt), "explicit-confirmation-required");
        this.#state.confirmation = receipt;
        this.#state.phase = "executing";
        // Save exact revision and receipt BEFORE a possibly ambiguous network failure.
        await this.#checkpoint();
      }
      const key = JSON.stringify([
        this.#state.scope.operationId,
        this.#state.conversationRef,
        proposal.id,
        proposal.revision,
      ]);
      const result = await this.#host.execute(
        this.#scope(),
        clone(proposal),
        this.#state.confirmation,
        key,
      );
      invariant(
        object(result) && saveStates.includes(result.state) &&
          json(result.result),
        "invalid-host-result",
      );
      this.#state.result = clone(result);
      this.#state.saveState = result.state;
      this.#state.phase = "completed";
      await this.#checkpoint();
      await this.#resultArtifacts();
      return result;
    });
  }
  saveDraft() {
    return this.#run("save-draft", async () => {
      const state = await this.#host.saveDraft(this.#scope(), this.snapshot());
      invariant(saveStates.includes(state), "invalid-save-state");
      this.#state.saveState = state;
      return state;
    });
  }
  recordInterviewAudio(bytes) {
    return this.#run("testing-audio", async () => {
      invariant(bytes instanceof Uint8Array, "invalid-audio");
      if (!await this.#host.earlyTesting(this.#scope())) {
        return { retained: false };
      }
      invariant(
        await this.#host.ensureTestingConsent(this.#scope()),
        "testing-consent-required",
      );
      const audioRef = await this.#host.storeTestingAudio(
        this.#scope(),
        this.#state.conversationRef,
        bytes.slice(),
      );
      invariant(nonempty(audioRef), "invalid-audio-ref");
      await this.#artifact({ type: "testing-audio", audioRef });
      return { retained: true, audioRef };
    });
  }
  captureOffline(note, capture = this.#state.capture) {
    return this.#run("offline-note", async () => {
      invariant(
        captureValid(capture) && object(note) &&
          ((nonempty(note.text) && note.audio === undefined) ||
            (note.audio instanceof Uint8Array && note.text === undefined)),
        "invalid-offline-note",
      );
      const clean = note.audio
        ? { audio: note.audio.slice() }
        : { text: note.text };
      const noteRef = await this.#host.captureOffline(
        this.#scope(),
        clone(capture),
        clean,
      );
      invariant(nonempty(noteRef), "invalid-note-ref");
      await this.#artifact({
        type: "offline-note",
        noteRef,
        modality: note.audio ? "audio" : "text",
        capture,
      });
      return { noteRef, requiresOnlineReview: true };
    });
  }
}

/** Shared short-lived authorization envelope validator for brokers and transports. */
export { authorizationValid };
