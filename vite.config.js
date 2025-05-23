import { resolve } from 'path';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'sutherland',
    },
  },
  server: {
    host: true,
  },
  plugins: [wasm(), topLevelAwait()],
});
