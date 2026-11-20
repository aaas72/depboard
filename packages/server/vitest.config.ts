import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests here touch the real file system and start Fastify. Under heavy load
    // (CI runners, parallel jobs) the first test of a file pays the cold start and can pass
    // 5 s, Vitest's default. Reproduced locally with 6 parallel runs; 20 s leaves wide margin.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
