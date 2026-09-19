import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * The web lab runs the REAL engine, not a mock.
 *
 * `packages/contracts` and `packages/core` are plain ESM TypeScript compiled by
 * `tsc -b` into `dist/`. Pointing the aliases at that output means the browser
 * executes exactly the same code the CLI and the tests execute - there is no
 * second implementation of the rules to drift out of sync.
 *
 * `node:crypto` is the one Node built-in the engine touches
 * (packages/core/src/replay/hash.ts). Browsers have no such module, so it is
 * aliased to a pure-JS SHA-256. SHA-256 is SHA-256, so hashes stay identical to
 * the CLI's; see frontend/test/sha256.test.ts for the proof.
 *
 * Use `npm run dev` (which builds the packages first) rather than a bare
 * `npx vite`, otherwise the aliases point at a stale or missing dist/.
 */
const repoRoot = path.resolve(__dirname, '..');

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        // Must come first: it is an exact module id, not a package prefix.
        {find: /^node:crypto$/, replacement: path.resolve(__dirname, 'src/lab/sha256.ts')},
        {
          find: '@promptchien/contracts',
          replacement: path.join(repoRoot, 'packages/contracts/dist/src/index.js'),
        },
        {
          find: '@promptchien/core',
          replacement: path.join(repoRoot, 'packages/core/dist/src/index.js'),
        },
        {find: '@', replacement: path.resolve(__dirname, '.')},
      ],
    },
    server: {
      // The engine lives outside the Vite root, so it has to be allowed.
      fs: {allow: [__dirname, repoRoot]},
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
