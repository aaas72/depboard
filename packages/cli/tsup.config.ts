import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  sourcemap: false,
  minify: false,
  // Bundle everything: the published package has zero runtime dependencies (docs/adr/0001).
  noExternal: [/.*/],
  banner: {
    // Bundled CommonJS dependencies call require() for Node built-ins, which ESM output lacks.
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __depboardCreateRequire } from 'node:module';",
      'const require = __depboardCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});
