import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'tsup';

const webDist = path.resolve('..', 'web', 'dist');
const webModules = path.resolve('..', 'web', 'build-meta', 'modules.json');

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  sourcemap: false,
  // Minified, but with function names kept: no source maps ship, so names are what keeps a
  // --debug stack trace readable in a bug report. See docs/agent/roadmap.md for the measurements.
  minify: true,
  keepNames: true,
  // Bundle everything: the published package has zero runtime dependencies (docs/adr/0001).
  noExternal: [/.*/],
  // The list of bundled modules, turned into THIRD_PARTY_LICENSES.md below, then removed.
  metafile: true,
  // Ship the built UI inside the package, next to the CLI (dist/web). The root build runs
  // @depboard/web first, because this package depends on it.
  onSuccess: async () => {
    if (!fs.existsSync(path.join(webDist, 'index.html'))) {
      throw new Error('packages/web is not built: run `pnpm build` from the repo root.');
    }
    fs.cpSync(webDist, path.resolve('dist', 'web'), { recursive: true });

    // Every bundled package's license, generated from what was actually bundled (docs/adr/0001).
    // The build fails if a license isn't on the allowlist.
    const metafile = path.resolve('dist', 'metafile-esm.json');
    const notices = await import('../../scripts/third-party-notices.mjs');
    const files = [
      ...notices.filesFromMetafile(metafile, process.cwd()),
      ...(JSON.parse(fs.readFileSync(webModules, 'utf8')) as string[]),
    ];
    const { markdown, problems } = notices.buildNotices(files);
    fs.rmSync(metafile);
    if (problems.length > 0) {
      throw new Error(
        `Bundled packages with licenses that need a decision:\n  ${problems.join('\n  ')}`,
      );
    }
    fs.writeFileSync(path.resolve('dist', 'THIRD_PARTY_LICENSES.md'), markdown);
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
