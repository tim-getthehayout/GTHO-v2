/** Early-testing recordings: only the user's mic, native codec, uploaded through
 * a server-minted signed URL after the server sees an accepted consent row.
 * Assistant output audio is never recorded. */
import { nativeAudioMimeType } from './offline-notes.js';

export function createTestingRecorder({
  stream, MediaRecorderImpl = globalThis.MediaRecorder, maxMs = 0,
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id),
}) {
  const mimeType = nativeAudioMimeType(MediaRecorderImpl);
  if (!mimeType) return null;
  const recorder = new MediaRecorderImpl(stream, { mimeType });
  const chunks = [];
  const startedAt = Date.now();
  let stoppedAt = null;
  const stopCapture = () => {
    stoppedAt ??= Date.now();
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const done = new Promise(resolve => {
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    recorder.onstop = () => { stoppedAt ??= Date.now(); resolve(new Blob(chunks, { type: mimeType.split(';')[0] })); };
  });
  recorder.start(1000);
  let capTimer = 0;
  if (maxMs > 0) capTimer = setTimer(stopCapture, maxMs);
  return {
    capturedAt: new Date(startedAt).toISOString(),
    async stop() {
      if (capTimer) { clearTimer(capTimer); capTimer = 0; }
      stopCapture();
      const blob = await done;
      return { blob, durationMs: stoppedAt - startedAt };
    },
  };
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
