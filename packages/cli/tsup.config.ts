import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'tsup';

const webDist = path.resolve('..', 'web', 'dist');

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
  // Ship the built UI inside the package, next to the CLI (dist/web). The root build runs
  // @depboard/web first, because this package depends on it.
  onSuccess: () => {
    if (!fs.existsSync(path.join(webDist, 'index.html'))) {
      throw new Error('packages/web is not built: run `pnpm build` from the repo root.');
    }
    fs.cpSync(webDist, path.resolve('dist', 'web'), { recursive: true });
    return Promise.resolve();
  },
  banner: {
    // Bundled CommonJS dependencies call require() for Node built-ins, which ESM output lacks.
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __depboardCreateRequire } from 'node:module';",
      'const require = __depboardCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});
