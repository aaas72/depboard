import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev, /api (including the job stream) is proxied to the dev server (packages/server/src/dev.ts)
// on its fixed port. changeOrigin makes the Host header 127.0.0.1:4319, which the server's Host
// check requires.
const DEV_SERVER = 'http://127.0.0.1:4319';

/**
 * Records every module that ends up in the built UI, outside dist/ so it is never served or
 * published. The CLI build turns it into THIRD_PARTY_LICENSES.md (.github/scripts/third-party-notices.mjs).
 */
function bundledModules(): Plugin {
  return {
    name: 'depboard-bundled-modules',
    apply: 'build',
    generateBundle(_options, bundle) {
      const ids = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of Object.keys(output.modules)) {
          if (!id.startsWith('\0')) ids.add(id.split('?')[0] ?? id);
        }
      }
      fs.mkdirSync('build-meta', { recursive: true });
      fs.writeFileSync(path.join('build-meta', 'modules.json'), JSON.stringify([...ids].sort()));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), bundledModules()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: DEV_SERVER, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
