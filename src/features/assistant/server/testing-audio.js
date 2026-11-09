/** gtho-assistant-audio: mints a signed upload URL for one user-mic recording,
 * only after the server sees this actor's accepted consent for the conversation. */
import { readJson, json, httpError } from './http.js';
import { AUDIO_MIME_TYPES, MAX_AUDIO_BYTES, TESTING_AUDIO_BUCKET } from './config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requireData = ({ data, error }) => { if (error) throw new Error('assistant-persistence-failed'); return data; };

export function createTestingAudioHandler({ client, config, randomUUID = () => crypto.randomUUID() }) {
  return async (scope, request) => {
    const body = await readJson(request, 1024);
    if (!body || Object.keys(body).some(key => !['conversationRef', 'mimeType'].includes(key)) || !UUID.test(body.conversationRef ?? '')) throw httpError(400, 'invalid-audio-request');
    const mimeType = String(body.mimeType ?? '').split(';')[0].trim().toLowerCase();
    if (!AUDIO_MIME_TYPES.includes(mimeType)) throw httpError(400, 'unsupported-audio-type');
    if (config.earlyTesting !== true) throw httpError(403, 'early-testing-off');
    const consents = requireData(await client.from('assistant_testing_consents').select('id, decision, decided_at').eq('operation_id', scope.operationId).eq('actor_id', scope.actorId).eq('conversation_id', body.conversationRef).order('decided_at', { ascending: false }).limit(1));
    if (consents?.[0]?.decision !== 'accepted') throw httpError(403, 'testing-consent-required');
    const path = `${scope.operationId}/${body.conversationRef}/${randomUUID()}`;
    const { data, error } = await client.storage.from(TESTING_AUDIO_BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) throw new Error('signed-upload-unavailable');
    return json({ bucket: TESTING_AUDIO_BUCKET, path, token: data.token, consentId: consents[0].id, mimeType, maxBytes: MAX_AUDIO_BYTES });
  };
}
