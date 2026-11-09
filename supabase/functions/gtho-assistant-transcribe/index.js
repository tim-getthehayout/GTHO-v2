// Metered transcription of an offline voice note for user review.
// Serves 503 unless all eight GTHO secrets are present and GTHO_ASSISTANT_ENABLED=true.
import { createTranscribeFunction } from '../../../src/features/assistant/server/compose.js';
export { createTranscribeFunction };

if (import.meta.main) {
  const { serveConfigured } = await import('../_shared/live.js');
  serveConfigured(createTranscribeFunction);
}
