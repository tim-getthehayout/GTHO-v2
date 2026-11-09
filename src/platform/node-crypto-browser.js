/** Browser platform API substitution only. No item revision/canonicalization here. */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw new TypeError('Unsupported hash algorithm');
  const hash = sha256.create();
  const api = {
    update(data,encoding = 'utf8') {
      if (!['utf8','utf-8'].includes(encoding)) throw new TypeError('Unsupported input encoding');
      hash.update(typeof data === 'string' ? new TextEncoder().encode(data) : data);
      return api;
    },
    digest(encoding) {
      if (encoding !== 'hex') throw new TypeError('Unsupported digest encoding');
      return bytesToHex(hash.digest());
    },
  };
  return api;
}
