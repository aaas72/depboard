#!/usr/bin/env node
// Checks the performance budgets from .github/CONTRIBUTING.md against the BUILT CLI,
// the way a user runs it, on a generated projects folder and a local registry with realistic
// latency (the real registry's speed varies too much to gate CI on).
//
//   node .github/scripts/perf-budget.mjs <path-to-cli-dist-index.js>
//
// Budgets checked (cold cache: every run is a fresh process):
//   1. Time to first insight, ~30 projects  ≤ 10 s   (`--summary` prints the headlines)
//   2. Time until the UI and API answer       ≤ 10 s   (launch URL printed, page + matrix served)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const cli = process.argv[2];
if (!cli) {
  console.error('usage: perf-budget.mjs <cli>');
  process.exit(2);
}

const BUDGET_MS = 10_000;
const PROJECTS = 30;
const PACKAGES = 300;
const DEPS_PER_PROJECT = 30;
const DEV_DEPS_PER_PROJECT = 15;
// Per-request latency of the fake registry. Real `/latest` calls take ~50–200 ms; the bulk
// advisory call is slower. Deliberately on the slow side of typical.
const LATEST_MS = [120, 250];
const ADVISORY_MS = 900;
const RUNS = 3;

// ── A deterministic, realistic projects folder ─────────────────────────────────────────────
let seed = 42;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};
const pick = (n) => Math.floor(random() * n);

const names = Array.from({ length: PACKAGES }, (_, i) =>
  i % 10 === 0 ? `@scope-${String(i % 7)}/pkg-${String(i)}` : `pkg-${String(i)}`,
);
const latestMajor = new Map(names.map((name) => [name, 2 + pick(4)]));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'depboard-perf-'));
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
};

for (let p = 0; p < PROJECTS; p++) {
  // Some projects sit deeper, like real folders do: client/app, archive/old-thing.
  const dir = path.join(root, p % 5 === 0 ? `group-${String(p % 3)}` : '', `project-${String(p)}`);
  const pkg = {
    name: `project-${String(p)}`,
    version: '1.0.0',
    dependencies: {},
    devDependencies: {},
  };
  const chosen = new Set();
  while (chosen.size < DEPS_PER_PROJECT + DEV_DEPS_PER_PROJECT) chosen.add(names[pick(PACKAGES)]);
  [...chosen].forEach((name, i) => {
    const major = Math.max(1, (latestMajor.get(name) ?? 2) - pick(3));
    const version = `${String(major)}.${String(pick(10))}.${String(pick(10))}`;
    const field = i < DEPS_PER_PROJECT ? 'dependencies' : 'devDependencies';
    pkg[field][name] = `^${version}`;
    // Installed copies: also the bulk of files a real scan must skip without reading.
    write(path.join(dir, 'node_modules', name, 'package.json'), { name, version });
    write(path.join(dir, 'node_modules', name, 'index.js'), 'module.exports = {};\n');
  });
  write(path.join(dir, 'package.json'), pkg);
  write(path.join(dir, 'package-lock.json'), { lockfileVersion: 3 });
  write(path.join(dir, 'src', 'index.js'), '// app\n');
}

// ── A local registry with latency ───────────────────────────────────────────────────────────
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let requests = 0;
const registry = http.createServer((req, res) => {
  requests++;
  void (async () => {
    const url = decodeURIComponent(req.url ?? '');
    if (req.method === 'POST' && url === '/-/npm/v1/security/advisories/bulk') {
      let body = '';
      for await (const chunk of req) body += chunk;
      await delay(ADVISORY_MS);
      const asked = Object.keys(JSON.parse(body));
      // A few vulnerable packages, so the insight path is exercised like in real life.
      const answer = Object.fromEntries(
        asked
          .filter((name) => name.endsWith('7'))
          .map((name) => [
            name,
            [
              {
                id: name.length,
                title: 'Example advisory',
                url: 'https://example.invalid',
                severity: 'high',
                vulnerable_versions: '<2.0.0',
              },
            ],
          ]),
      );
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer));
      return;
    }
    const match = /^\/(.+)\/latest$/.exec(url);
    const name = match?.[1];
    await delay(LATEST_MS[0] + Math.random() * (LATEST_MS[1] - LATEST_MS[0]));
    if (name && latestMajor.has(name)) {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ name, version: `${String(latestMajor.get(name))}.4.2` }));
    } else {
      res.writeHead(404).end('{}');
    }
  })();
});
await new Promise((resolve) => registry.listen(0, '127.0.0.1', resolve));
const registryUrl = `http://127.0.0.1:${String(registry.address().port)}`;

// ── Measurements ────────────────────────────────────────────────────────────────────────────
function startCli(args, until) {
  const started = performance.now();
  const child = spawn(process.execPath, [cli, root, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DEPBOARD_REGISTRY_URL: registryUrl, NO_COLOR: '1' },
  });
  let output = '';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`timed out after 60 s\n${output}`));
    }, 60_000);
    const check = () => {
      const result = until(output);
      if (result) {
        clearTimeout(timer);
        resolve({ ms: performance.now() - started, output, result, child });
      }
    };
    child.stdout.on('data', (chunk) => {
      output += chunk;
      check();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('exit', () => {
      check();
    });
  });
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const results = [];
let ok = true;

function report(label, values, budget) {
  const value = median(values);
  const passed = value <= budget;
  ok &&= passed;
  results.push(
    `${passed ? '✔' : '✖'} ${label}: ${(value / 1000).toFixed(2)} s median of ${String(values.length)} (budget ${(budget / 1000).toFixed(0)} s; runs: ${values.map((v) => (v / 1000).toFixed(2)).join(', ')})`,
  );
}

try {
  // 1. First insight in the terminal.
  const insight = [];
  for (let i = 0; i < RUNS; i++) {
    const run = await startCli(
      ['--summary'],
      (out) => out.includes("What's hiding in your projects:") && /\d+ projects/.test(out),
    );
    insight.push(run.ms);
    run.child.kill();
    if (i === 0 && !/30 projects/.test(run.output))
      throw new Error(`unexpected summary:\n${run.output}`);
  }
  report(
    `Time to first insight (${String(PROJECTS)} projects, ${String(PACKAGES)} packages)`,
    insight,
    BUDGET_MS,
  );

  // 2. The browser UI is ready to show it: page and matrix both served.
  const ready = [];
  for (let i = 0; i < RUNS; i++) {
    const run = await startCli(['--no-open'], (out) =>
      /http:\/\/127\.0\.0\.1:\d+\/\?token=([0-9a-f]{64})/.exec(out),
    );
    const url = new URL(run.result[0]);
    const fetching = performance.now();
    const page = await fetch(new URL('/', url));
    const matrix = await fetch(new URL('/api/matrix', url), {
      headers: { 'x-depboard-token': run.result[1] },
    });
    const body = await matrix.json();
    // From launch to the matrix in hand: what the page needs before it can paint.
    ready.push(run.ms + (performance.now() - fetching));
    if (page.status !== 200 || matrix.status !== 200 || body.projects.length !== PROJECTS) {
      throw new Error(`UI not ready: page ${String(page.status)}, matrix ${String(matrix.status)}`);
    }
    run.child.kill();
  }
  report('Time until the UI can show the matrix', ready, BUDGET_MS);
} catch (error) {
  ok = false;
  results.push(`✖ ${error instanceof Error ? error.message : String(error)}`);
} finally {
  registry.close();
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(results.join('\n'));
console.log(`(registry requests served: ${String(requests)})`);
process.exit(ok ? 0 : 1);
