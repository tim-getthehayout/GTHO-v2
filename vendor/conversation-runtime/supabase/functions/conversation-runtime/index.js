// JavaScript Edge Function composition entry. Host bindings are supplied by the deployer,
// never guessed from an adopter schema. Import the SAME ESM runtime used by library hosts.
import { createBackendHandler } from "../../../src/index.js";

export function createEdgeFunction(ports, budgets) {
  return createBackendHandler(ports, budgets);
}
export function serveConversationRuntime(
  ports,
  budgets,
  serve = globalThis.Deno?.serve,
) {
  if (typeof serve !== "function") throw new Error("Deno.serve required");
  return serve(createEdgeFunction(ports, budgets));
}
// Direct execution without explicit authenticated host bindings is deliberately fail-closed.
if (import.meta.main) {
  globalThis.Deno.serve(() =>
    Response.json({ error: "host-bindings-required" }, { status: 503 })
  );
}
