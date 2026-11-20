import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev, /api is proxied to the dev server (packages/server/src/dev.ts) on its fixed port.
// changeOrigin makes the Host header 127.0.0.1:4319, which the server's Host check requires.
const DEV_SERVER = 'http://127.0.0.1:4319';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: DEV_SERVER, changeOrigin: true },
      '/ws': { target: DEV_SERVER, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
