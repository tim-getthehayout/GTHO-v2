import { defineConfig } from 'vite';
import { execSync } from 'child_process';

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

export default defineConfig({
  base: '/GTHO-v2/',
  define: {
    __BUILD_STAMP__: JSON.stringify(getBuildStamp()),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
