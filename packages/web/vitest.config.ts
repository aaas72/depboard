import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
    // Component tests render the whole screen; the first one in a file pays for a cold start.
    testTimeout: 20_000,
  },
});
