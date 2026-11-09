/** Early-testing recordings: only the user's mic, native codec, uploaded through
 * a server-minted signed URL after the server sees an accepted consent row.
 * Assistant output audio is never recorded. */
import { nativeAudioMimeType } from './offline-notes.js';

export function createTestingRecorder({ stream, MediaRecorderImpl = globalThis.MediaRecorder }) {
  const mimeType = nativeAudioMimeType(MediaRecorderImpl);
  if (!mimeType) return null;
  const recorder = new MediaRecorderImpl(stream, { mimeType });
  const chunks = [];
  const startedAt = Date.now();
  const done = new Promise(resolve => {
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
  });
  recorder.start(1000);
  return { capturedAt: new Date(startedAt).toISOString(), async stop() { if (recorder.state !== 'inactive') recorder.stop(); const blob = await done; return { blob, durationMs: Date.now() - startedAt }; } };
}

/** Upload then record the metadata row through the normal artifact path. */
export async function uploadTestingAudio({ api, storage, persist, scope, conversationRef, recording, capturedAt }) {
  if (!recording.blob.size) return null;
  const grant = await api.testingAudioUpload(conversationRef, recording.blob.type);
  if (recording.blob.size > grant.maxBytes) throw new Error('testing-audio-too-large');
  const { error } = await storage.from(grant.bucket).uploadToSignedUrl(grant.path, grant.token, recording.blob, { contentType: grant.mimeType });
  if (error) throw new Error('testing-audio-upload-failed');
  return persist(scope, 'assistantTestingAudio', { operationId: scope.operationId, conversationId: conversationRef, consentId: grant.consentId, audioReference: grant.path, capturedAt, durationMs: Math.round(recording.durationMs) });
}
