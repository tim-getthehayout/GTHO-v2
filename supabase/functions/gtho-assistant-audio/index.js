// Signed upload URL for consented early-testing user-mic audio.
// Serves 503 unless all eight GTHO secrets are present and GTHO_ASSISTANT_ENABLED=true.
import { createTestingAudioFunction } from '../../../src/features/assistant/server/compose.js';
export { createTestingAudioFunction };

if (import.meta.main) {
  const { serveConfigured } = await import('../_shared/live.js');
  serveConfigured(createTestingAudioFunction);
}
