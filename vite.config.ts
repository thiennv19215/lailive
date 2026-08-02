import path from 'node:path';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';

const rendererOnly = process.env.AI_LIVESTREAM_RENDERER_ONLY === '1';

export default defineConfig({
  plugins: [
    vue(),
    ...(rendererOnly ? [] : [electron({
      main: {
        entry: 'electron/main/index.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['sql.js/dist/sql-asm.js', 'tiktok-live-connector', 'tiktok-live-connector/legacy', 'playwright-core'],
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload/index.ts'),
      },
    })]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    // Local agent worktrees can contain their own tests, but are not this workspace's suite.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
