import { defineConfig } from 'vite';

export default defineConfig({
  base: '/GTHO-v2/',
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
