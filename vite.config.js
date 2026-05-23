import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: mode === 'deploy' ? '/projects/sutherland/' : '/',
  build:
    mode === 'deploy'
      ? { outDir: 'sutherland' }
      : {
          lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'sutherland',
          },
        },
  server: {
    host: true,
  },
}));
