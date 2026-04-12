import { defineConfig } from 'vite';

export default defineConfig({
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
