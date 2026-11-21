// Builds THIRD_PARTY_LICENSES.md for the published `depboard` package from what was actually
// bundled: the CLI's esbuild metafile and the UI's module list (written by a Vite plugin).
// Fails when a bundled package's license isn't on the allowlist, so a copyleft dependency can't
// slip into a release unnoticed (docs/adr/0001).
//
// Called by packages/cli/tsup.config.ts after each build. Also runnable by hand:
//   node scripts/third-party-notices.mjs <cli-metafile.json> <web-modules.json> <output.md>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Permissive licenses that only ask for the notice to be kept. Anything else needs a decision. */
export const ALLOWED_LICENSES = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Unlicense',
]);

/** True when an SPDX expression can be satisfied with allowed licenses ("A OR B", "A AND B"). */
export function isAllowedLicense(expression) {
  if (typeof expression !== 'string' || expression.trim() === '') return false;
  const clean = expression.replace(/[()]/g, ' ').trim();
  return clean
    .split(/\s+OR\s+/i)
    .some((alternative) =>
      alternative
        .split(/\s+AND\s+/i)
        .every((id) => ALLOWED_LICENSES.has(id.trim().replace(/\+$/, ''))),
    );
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses
      .map((l) => (typeof l === 'string' ? l : l.type))
      .filter(Boolean)
      .join(' OR ');
  }
  return '';
}

/** The package that owns a bundled file: the nearest package.json with a name, inside node_modules. */
function packageDirOf(file) {
  if (!file.split(/[\\/]/).includes('node_modules')) return null; // our own workspace code
  let dir = path.dirname(fs.realpathSync(file));
  for (;;) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (typeof pkg.name === 'string' && typeof pkg.version === 'string') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function noticeFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => /^(licen[cs]e|copying|notice)(\.|-|$)/i.test(name))
    .sort()
    .map((name) => fs.readFileSync(path.join(dir, name), 'utf8').trim());
}

/**
 * @param {string[]} files absolute paths of every bundled module
 * @returns {{ markdown: string, packages: number, problems: string[] }}
 */
export function buildNotices(files) {
  const dirs = new Map();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const dir = packageDirOf(file);
    if (dir) dirs.set(dir, true);
  }

  const entries = [...dirs.keys()]
    .map((dir) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      return {
        name: pkg.name,
        version: pkg.version,
        license: licenseOf(pkg),
        author: typeof pkg.author === 'string' ? pkg.author : (pkg.author?.name ?? null),
        texts: noticeFiles(dir),
      };
    })
    // The same package can appear twice via different paths; keep one per name@version.
    .filter((e, i, all) => all.findIndex((o) => o.name === e.name && o.version === e.version) === i)
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

  const problems = entries
    .filter((e) => !isAllowedLicense(e.license))
    .map(
      (e) =>
        `${e.name}@${e.version}: license "${e.license || 'none declared'}" is not on the allowlist`,
    );

  const sections = entries.map((e) => {
    const body =
      e.texts.length > 0
        ? e.texts.map((text) => '```text\n' + text.replace(/```/g, "'''") + '\n```').join('\n\n')
        : // Some packages ship no license file. Keep what they do declare: the license and the author.
          `_No license file is included in this package. Its package.json declares the ${e.license} license${e.author ? `, copyright ${e.author}` : ''}._`;
    return `## ${e.name}@${e.version}\n\nLicense: ${e.license}\n\n${body}`;
  });

  const markdown = [
    '# Third-party licenses',
    '',
    'DepBoard bundles the following open-source packages into its published files',
    '(`dist/index.js` and the browser UI in `dist/web`). Their licenses and notices follow.',
    'This file is generated at build time from the exact list of bundled modules.',
    '',
    ...entries.map((e) => `- ${e.name}@${e.version} (${e.license})`),
    '',
    sections.join('\n\n'),
    '',
  ].join('\n');

  return { markdown, packages: entries.length, problems };
}

/** Bundled module paths from an esbuild metafile (paths relative to `cwd`). */
export function filesFromMetafile(metafile, cwd) {
  const meta = JSON.parse(fs.readFileSync(metafile, 'utf8'));
  return Object.keys(meta.inputs).map((input) => path.resolve(cwd, input));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [metafile, webModules, output] = process.argv.slice(2);
  if (!metafile || !webModules || !output) {
    console.error(
      'usage: third-party-notices.mjs <cli-metafile.json> <web-modules.json> <output.md>',
    );
    process.exit(2);
  }
  const files = [
    ...filesFromMetafile(metafile, process.cwd()),
    ...JSON.parse(fs.readFileSync(webModules, 'utf8')),
  ];
  const { markdown, packages, problems } = buildNotices(files);
  if (problems.length > 0) {
    console.error(
      `✖ Bundled packages with licenses that need a decision:\n  ${problems.join('\n  ')}`,
    );
    process.exit(1);
  }
  fs.writeFileSync(output, markdown);
  console.log(`✔ Third-party licenses: ${String(packages)} packages → ${output}`);
}
