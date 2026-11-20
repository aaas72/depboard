#!/usr/bin/env node
// Runs the CI pipeline on this machine: the host OS directly, Linux in Docker (Node 22 and 24), and
// the built CLI on Node 20 (the oldest runtime users may have). macOS can't be reproduced locally.
//
//   pnpm ci:local           everything
//   pnpm ci:local --quick   host checks only (no Docker)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');
const isWindows = process.platform === 'win32';

const results = [];

function run(label, command, args, options = {}) {
  process.stderr.write(`\n▶ ${label}\n`);
  const started = Date.now();
  // pnpm and npm are .cmd shims on Windows, which only run through cmd.exe. Every argument here is
  // a fixed constant from this file, never user input.
  const viaCmd = isWindows && (command === 'pnpm' || command === 'npm');
  const result = viaCmd
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: repo,
        stdio: 'inherit',
        ...options,
      })
    : spawnSync(command, args, { cwd: repo, stdio: 'inherit', ...options });
  const ok = result.status === 0;
  results.push({ label, ok, seconds: ((Date.now() - started) / 1000).toFixed(1) });
  return ok;
}

function hostChecks() {
  const os =
    { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[process.platform] ?? process.platform;
  const steps = [
    ['install', ['install', '--frozen-lockfile']],
    ['format', ['format:check']],
    ['lint', ['lint']],
    ['typecheck', ['typecheck']],
    ['test', ['test']],
    ['build', ['build']],
  ];
  for (const [name, args] of steps) {
    if (!run(`${os} (Node ${process.versions.node}): ${name}`, 'pnpm', args)) return false;
  }
  return run(`${os}: package contents`, 'node', ['scripts/check-package.mjs']);
}

function dockerAvailable() {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

/**
 * Full check suite inside a Linux container. The repo is mounted read-only and copied without
 * node_modules/dist, because native binaries installed on Windows don't run on Linux.
 */
function linuxChecks(nodeVersion) {
  const script = [
    'set -e',
    'mkdir /app',
    'tar -C /src --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -C /app -xf -',
    'cd /app',
    'corepack enable >/dev/null',
    'pnpm config set store-dir /pnpm-store >/dev/null',
    'pnpm install --frozen-lockfile --reporter=silent',
    'pnpm format:check',
    'pnpm lint',
    'pnpm typecheck',
    'pnpm test',
    'pnpm build',
  ].join(' && ');
  return run(`Linux (Node ${nodeVersion}): full check`, 'docker', [
    'run',
    '--rm',
    '-e',
    'COREPACK_ENABLE_DOWNLOAD_PROMPT=0',
    '-e',
    'CI=true',
    '-v',
    `${repo}:/src:ro`,
    '-v',
    'depboard-pnpm-store:/pnpm-store',
    `node:${nodeVersion}-bookworm-slim`,
    'bash',
    '-c',
    script,
  ]);
}

/** Runs the CLI built on the host on Node 20.19: proves the bundle works on our minimum runtime. */
function node20Smoke() {
  const script = [
    'set -e',
    'node --version',
    'node /cli/dist/index.js --version',
    'node /cli/dist/index.js --help >/dev/null',
    'mkdir -p /tmp/p/a /tmp/p/b',
    `echo '{"name":"a","dependencies":{"react":"^18.0.0"}}' > /tmp/p/a/package.json`,
    `echo '{"name":"b","dependencies":{"react":"^19.0.0"}}' > /tmp/p/b/package.json`,
    'node /cli/dist/index.js /tmp/p | grep -q "2 projects"',
    'echo "scan OK"',
  ].join(' && ');
  return run('Node 20.19: built CLI smoke test', 'docker', [
    'run',
    '--rm',
    '-v',
    `${path.join(repo, 'packages', 'cli')}:/cli:ro`,
    'node:20.19-bookworm-slim',
    'bash',
    '-c',
    script,
  ]);
}

let ok = hostChecks();

if (ok && !quick) {
  if (dockerAvailable()) {
    ok = node20Smoke() && ok;
    for (const version of ['22', '24']) ok = linuxChecks(version) && ok;
  } else {
    process.stderr.write('\n⚠ Docker is not running: skipped Linux and Node 20 checks.\n');
  }
}

process.stderr.write('\n──────── Local CI summary ────────\n');
for (const { label, ok: passed, seconds } of results) {
  process.stderr.write(`${passed ? '✔' : '✖'} ${label}  (${seconds}s)\n`);
}
if (!quick) process.stderr.write('ℹ macOS is only covered by GitHub CI.\n');
process.stderr.write(ok ? '\nAll local checks passed.\n' : '\nLocal CI failed.\n');
process.exit(ok ? 0 : 1);
