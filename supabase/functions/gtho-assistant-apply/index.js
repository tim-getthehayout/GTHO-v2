// Records the browser's local-save receipt against the durable execution claim.
// Serves 503 unless all eight GTHO secrets are present and GTHO_ASSISTANT_ENABLED=true.
import { createApplyFunction } from '../../../src/features/assistant/server/compose.js';
export { createApplyFunction };

if (import.meta.main) {
  const { serveConfigured } = await import('../_shared/live.js');
  serveConfigured(createApplyFunction);
}
