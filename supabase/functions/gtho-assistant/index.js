// Composition only: host identity, durable runtime persistence/locking, billing,
// UI review and provider bindings must be supplied before this is operational.
// This is the SAME tagged library copy consumed by the frontend shared.js facade.
import { createBackendHandler } from '../../../vendor/conversation-runtime/src/index.js';
export * as feedback from '../../../vendor/feedback-module/src/index.js';

export function createGthoAssistantHandler(ports, budgets) {
  return createBackendHandler(ports, budgets);
}

export function unconfiguredHandler() {
  return Response.json({ error: 'gtho-host-bindings-required' }, {
    status: 503, headers: { 'Cache-Control': 'no-store' },
  });
}

// No in-memory production store, fake membership, provider keys or fabricated billing.
// Do not deploy this fallback as a working assistant.
if (import.meta.main) globalThis.Deno.serve(unconfiguredHandler);
