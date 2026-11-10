import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { supportsWebstorageFlag } from './scripts/run-vitest.mjs';
import { fileURLToPath } from 'url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function getBuildStamp() {
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim();
    const now = new Date();
    const ts = now.toISOString().slice(0, 16).replace('T', '.').replace(':', '');
    return `b${ts}-${hash}`;
  } catch {
    return 'dev';
  }
}

function gthoPwaStampPlugin(stamp) {
  return {
    name: 'gtho-pwa-stamp',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(rootDir, 'dist');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, 'version.json'),
        `{ "stamp": ${JSON.stringify(stamp)} }\n`,
      );

      const copied = path.join(outDir, 'sw.js');
      const sourcePath = fs.existsSync(copied) ? copied : path.join(rootDir, 'public', 'sw.js');
      const source = fs.readFileSync(sourcePath, 'utf8');
      if (!source.includes('__GTHO_BUILD_STAMP__')) {
        throw new Error('gtho-pwa-stamp: sw.js is missing __GTHO_BUILD_STAMP__');
      }
      const stamped = source.replaceAll('__GTHO_BUILD_STAMP__', stamp);
      if (stamped.includes('__GTHO_BUILD_STAMP__')) {
        throw new Error('gtho-pwa-stamp: placeholder remained in dist/sw.js');
      }
      fs.writeFileSync(copied, stamped);
    },
  };
}

const buildStamp = getBuildStamp();

export default defineConfig(({ mode,isSsrBuild }) => ({
  resolve: { alias: mode === 'test' || isSsrBuild ? [] : [{ find: /^node:crypto$/, replacement: path.resolve(rootDir,'src/platform/node-crypto-browser.js') }] },
  base: '/',
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp),
  },
  plugins: [gthoPwaStampPlugin(buildStamp)],
  build: {
    target: 'es2022',
    outDir: 'dist',
    ...(mode === 'assistant-e2e' ? { rolldownOptions: { input: { app: path.resolve(rootDir,'index.html'),review: path.resolve(rootDir,'tests/e2e/fixtures/feedback-platform.html') } } } : {}),
  },
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // Node 26+ enables experimental webstorage that shadows jsdom's localStorage
    // (715+ failures under plain `npm test`). Pin it off for every worker when
    // this Node accepts the flag (Node 20 rejects it with exit 9).
    execArgv: supportsWebstorageFlag() ? ['--no-experimental-webstorage'] : [],
  },
}));
