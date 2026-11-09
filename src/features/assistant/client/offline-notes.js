/** Offline voice notes: native-codec Blobs in IndexedDB on this device only.
 * 3-minute recording cap, no device total cap; a quota failure is surfaced to
 * the user and the note is never dropped silently. */
export const OFFLINE_NOTE_MAX_MS = 3 * 60 * 1000;
const DB = 'gtho-assistant-offline-notes';
const STORE = 'notes';

export function nativeAudioMimeType(MediaRecorderImpl = globalThis.MediaRecorder) {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4']) {
    if (MediaRecorderImpl?.isTypeSupported?.(type)) return type;
  }
  return null;
}

function openDb(indexedDB) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function run(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('offline-note-transaction-aborted'));
  });
}
export const isQuotaError = error => error?.name === 'QuotaExceededError' || /quota/i.test(error?.message ?? '');

export function createOfflineNoteStore({ indexedDB = globalThis.indexedDB, onQuota = () => {} } = {}) {
  let dbPromise;
  const db = () => (dbPromise ??= openDb(indexedDB));
  return {
    /** Returns the opaque device-local reference; on quota error warns and rethrows. */
    async save({ blob, capturedAt, context, conversationId }) {
      const id = crypto.randomUUID();
      try { await run(await db(), 'readwrite', store => store.put({ id, blob, mimeType: blob.type, capturedAt, context, conversationId })); }
      catch (error) { if (isQuotaError(error)) onQuota(error); throw error; }
      return id;
    },
    async list() { const rows = await run(await db(), 'readonly', store => store.getAll()); return rows.sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt))); },
    async get(id) { return run(await db(), 'readonly', store => store.get(id)); },
    /** Only after its reviewed transcript has become the first turn. */
    async remove(id) { await run(await db(), 'readwrite', store => store.delete(id)); },
  };
}

/** Records one note with MediaRecorder's native codec, stopping at 3 minutes. */
export function recordNote({ stream, MediaRecorderImpl = globalThis.MediaRecorder, setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = id => globalThis.clearTimeout(id) }) {
  const mimeType = nativeAudioMimeType(MediaRecorderImpl);
  if (!mimeType) throw new Error('no-native-audio-codec');
  const recorder = new MediaRecorderImpl(stream, { mimeType });
  const chunks = [];
  const done = new Promise((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
    recorder.onerror = event => reject(event.error ?? new Error('recording-failed'));
  });
  recorder.start();
  const cap = setTimer(() => { if (recorder.state !== 'inactive') recorder.stop(); }, OFFLINE_NOTE_MAX_MS);
  return { done, stop() { clearTimer(cap); if (recorder.state !== 'inactive') recorder.stop(); return done; } };
}
