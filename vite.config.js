import { resolve } from 'path';
import sourcemaps from 'rollup-plugin-sourcemaps';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'sutherland',
    },
    rollupOptions: {
      plugins: [sourcemaps()],
    },
  },
});
