// Conversation runtime endpoint. Serves 503 unless all eight GTHO secrets are
// present and GTHO_ASSISTANT_ENABLED=true. This is the SAME tagged library copy
// consumed by the frontend shared.js facade.
import { createBackendHandler } from '../../../vendor/conversation-runtime/src/index.js';
import { createAssistantFunction } from '../../../src/features/assistant/server/compose.js';
import { unconfigured } from '../../../src/features/assistant/server/http.js';
export * as feedback from '../../../vendor/feedback-module/src/index.js';
export { createAssistantFunction };

export function createGthoAssistantHandler(ports, budgets) {
  return createBackendHandler(ports, budgets);
}

export const unconfiguredHandler = unconfigured;

if (import.meta.main) {
  const { serveConfigured } = await import('../_shared/live.js');
  serveConfigured(createAssistantFunction);
}
