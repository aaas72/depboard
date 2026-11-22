#!/usr/bin/env node
// Starts the built CLI's server against a folder, then checks it from the outside: the UI page
// loads, the API answers with the token and refuses without it. Used by local and GitHub CI to
// prove the bundle works on our minimum Node version.
//
//   node .github/scripts/smoke-server.mjs <path-to-cli-dist-index.js> <projects-folder>
import { spawn } from 'node:child_process';

const [cli, folder] = process.argv.slice(2);
if (!cli || !folder) {
  console.error('usage: smoke-server.mjs <cli> <folder>');
  process.exit(2);
}

const child = spawn(process.execPath, [cli, folder, '--no-open'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DEPBOARD_REGISTRY_URL: 'http://127.0.0.1:9' }, // offline on purpose
});

let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

function fail(message) {
  console.error(`✖ ${message}\n--- CLI output ---\n${output}`);
  child.kill();
  process.exit(1);
}

const url = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(null), 20_000);
  child.stdout.on('data', () => {
    const match = /http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}/.exec(output);
    if (match) {
      clearTimeout(timer);
      resolve(match[0]);
    }
  });
});
if (!url) fail('the server did not print a launch URL within 20 s');

const { origin, searchParams } = new URL(url);
const token = searchParams.get('token');

const page = await fetch(`${origin}/`);
if (page.status !== 200) fail(`UI page returned ${page.status}`);

const matrix = await fetch(`${origin}/api/matrix`, { headers: { 'x-depboard-token': token } });
if (matrix.status !== 200) fail(`/api/matrix with the token returned ${matrix.status}`);
const body = await matrix.json();
if (!Array.isArray(body.projects) || body.projects.length !== 2) fail('expected 2 projects');

const denied = await fetch(`${origin}/api/matrix`);
if (denied.status !== 401) fail(`/api/matrix without the token returned ${denied.status}`);

child.kill('SIGINT');
console.log(`✔ Server OK on Node ${process.versions.node}: UI, API with token, 401 without`);
process.exit(0);
