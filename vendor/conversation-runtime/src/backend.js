import { ConversationRuntime } from "./runtime.js";
import {
  authorizationValid,
  captureValid,
  clone,
  invariant,
  nonempty,
  object,
  RuntimeError,
  scopeValid,
  usageValid,
  zeroUsage,
} from "./shared.js";

const response = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function publicSession(runtime) {
  const state = runtime.snapshot();
  delete state.confirmation;
  delete state.answered;
  return state;
}
async function readBody(request, maxBytes) {
  invariant(
    request.headers.get("content-type")?.split(";")[0].trim() ===
      "application/json",
    "json-required",
  );
  const reader = request.body?.getReader();
  invariant(reader, "body-required");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      invariant(size <= maxBytes, "request-too-large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new RuntimeError("invalid-json");
  }
}

/** Supabase/Deno-compatible Web Request handler. No SDK, database, host adapter or key on device.
 * Supply explicit technical budgets. All content loads under an authenticated scope and lock.
 */
export function createBackendHandler(
  ports,
  { maxReadRounds, maxBodyBytes } = {},
) {
  invariant(
    Number.isSafeInteger(maxReadRounds) && maxReadRounds >= 0 &&
      Number.isSafeInteger(maxBodyBytes) && maxBodyBytes > 0,
    "backend-budgets-required",
  );
  return async (request) => {
    if (request.method !== "POST") {
      return response({ error: "post-required" }, 405);
    }
    let identity;
    try {
      identity = await ports.authenticate(request);
      invariant(scopeValid(identity?.scope), "unauthenticated");
    } catch {
      return response({ error: "unauthenticated" }, 401);
    }
    const scope = clone(identity.scope);
    try {
      const body = await readBody(request, maxBodyBytes);
      invariant(object(body) && nonempty(body.command), "invalid-command");
      // Identity/routing never comes from a JSON operation ID, provider key or client snapshot.
      invariant(
        !["scope", "operationId", "actorId", "snapshot", "apiKey", "routing"]
          .some((k) => Object.hasOwn(body, k)),
        "client-identity-forbidden",
      );
      if (body.command === "billing-own") {
        return response({ billing: await ports.billing.own(scope) });
      }
      if (body.command === "billing-control") {
        if (identity.canControlBilling !== true) {
          return response({ error: "forbidden" }, 403);
        }
        return response({ billing: await ports.billing.control(scope) });
      }
      invariant(
        nonempty(body.conversationRef) && nonempty(body.requestRef),
        "references-required",
      );
      const ref = body.conversationRef;
      return await ports.withSession(scope, ref, async (existing) => {
        invariant(
          !existing || existing.conversationRef === ref,
          "conversation-mismatch",
        );
        let runtime;
        if (body.command === "start") {
          invariant(
            !existing && captureValid(body.capture),
            "session-exists-or-invalid-capture",
          );
          runtime = await ConversationRuntime.start({
            scope,
            conversationRef: ref,
            intent: body.intent,
            capture: body.capture,
          }, ports.host);
        } else {
          invariant(existing, "session-not-found");
          runtime = await ConversationRuntime.resume(
            scope,
            existing,
            ports.host,
          );
        }
        await ports.host.authorize(scope, ref, body.command);
        const purpose = runtime.snapshot().intent;
        const lease = await ports.billing.reserve(
          scope,
          purpose,
          body.requestRef,
          { kind: body.command === "voice-usage" ? "settlement" : "request" },
        );
        invariant(
          nonempty(lease?.lease) &&
            ["shared", "operation-owned"].includes(lease.routing),
          "invalid-billing-reservation",
        );
        const usage = zeroUsage();
        usage.requestCount = 1;
        let failed = true;
        const addUsage = (measured) => {
          invariant(usageValid(measured), "invalid-provider-usage");
          usage.model = measured.model || usage.model;
          if (measured.voiceSession) usage.voiceSession = measured.voiceSession;
          for (
            const key of [
              "inputTokens",
              "outputTokens",
              "audioMinutes",
              "requestCount",
            ]
          ) usage[key] += measured[key];
        };
        try {
          let value;
          switch (body.command) {
            case "start":
            case "resume":
              break;
            case "turn":
              await runtime.converse(
                body.turn,
                await ports.provider(scope, lease.routing),
                { onUsage: addUsage, maxReadRounds, signal: request.signal },
              );
              break;
            case "append":
              await runtime.append(body.turn);
              break;
            case "voice-turn":
              await runtime.appendVoiceTurn(body.turn);
              break;
            case "propose":
              value = await runtime.propose(body.proposal);
              break;
            case "correct":
              value = await runtime.correct(body.correction);
              break;
            case "review":
              value = await runtime.review();
              break;
            case "confirm":
              value = await runtime.confirm(body.confirmation);
              break;
            case "cancel":
              await runtime.cancel();
              break;
            case "intent":
              value = await runtime.requestIntent(body.intent);
              break;
            case "resolve-intent":
              await runtime.resolveIntent(body.decision);
              break;
            case "restore-draft":
              value = await runtime.restoreDraft(body.proposalId);
              break;
            case "save-draft":
              value = await runtime.saveDraft();
              break;
            case "voice-authorization":
              value = await ports.voiceAuthorization(scope, ref, lease.routing);
              invariant(
                authorizationValid(value),
                "invalid-voice-authorization",
              );
              // Return only normalized ephemeral transport credentials, never provider metadata/keys.
              value = {
                provider: value.provider,
                token: value.token,
                expiresAt: value.expiresAt,
              };
              break;
            case "voice-usage":
              addUsage(await ports.voiceUsage(scope, ref, body.requestRef));
              break;
            default:
              throw new RuntimeError("unsupported-command");
          }
          failed = false;
          return response({
            session: publicSession(runtime),
            ...(value === undefined ? {} : { value }),
          });
        } catch (error) {
          if (error?.usage) addUsage(error.usage);
          throw error;
        } finally {
          await ports.billing.finish(
            scope,
            lease.lease,
            usage,
            lease.routing === "shared",
            failed,
          );
        }
      });
    } catch (error) {
      // Do not echo host/provider errors, stack traces, arguments, tokens, or cross-operation content.
      return response({
        error: error instanceof RuntimeError
          ? error.code
          : "backend-unavailable",
      }, error instanceof RuntimeError ? 400 : 503);
    }
  };
}
