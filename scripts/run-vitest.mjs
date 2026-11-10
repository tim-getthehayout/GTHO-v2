/** Spawn Vitest with --no-experimental-webstorage only on Node versions that
 * accept the flag (Node 26+). Node 20 rejects it (exit 9), which broke CI. */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBSTORAGE_OFF = '--no-experimental-webstorage';
const WEBSTORAGE_ON = '--experimental-webstorage';

export function supportsWebstorageFlag(allowed = process.allowedNodeEnvironmentFlags) {
  return allowed.has(WEBSTORAGE_OFF) || allowed.has(WEBSTORAGE_ON);
}

/** Preserve existing NODE_OPTIONS; add the pin only when this Node accepts it. */
export function nodeOptionsWithWebstorageGuard(
  existing = process.env.NODE_OPTIONS,
  allowed = process.allowedNodeEnvironmentFlags,
) {
  const current = existing ?? '';
  if (!supportsWebstorageFlag(allowed)) return current;
  const tokens = current.split(/\s+/).filter(Boolean);
  if (tokens.includes(WEBSTORAGE_OFF)) return current;
  return current ? `${current} ${WEBSTORAGE_OFF}` : WEBSTORAGE_OFF;
}

export function vitestBinPath() {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isDirectRun()) {
  const child = spawn(process.execPath, [vitestBinPath(), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptionsWithWebstorageGuard() },
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
