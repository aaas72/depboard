import { createRequire } from 'node:module';
import os from 'node:os';
import { createInterface } from 'node:readline/promises';
import { createRegistryClient, DEFAULT_REGISTRY_URL } from '@depboard/server';
import { run } from './run.js';

function readVersion(): string {
  const require = createRequire(import.meta.url);
  const pkg = require('../package.json') as { version: string };
  return pkg.version;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

const version = readVersion();

process.exitCode = await run(process.argv.slice(2), {
  stdout: (line) => {
    console.log(line);
  },
  stderr: (line) => {
    console.error(line);
  },
  cwd: process.cwd(),
  homedir: os.homedir(),
  version,
  confirm: process.stdin.isTTY && process.stderr.isTTY ? confirm : null,
  registry: createRegistryClient({
    // Overridable for e2e tests against a local fake registry. Honoring .npmrc comes later.
    registryUrl: process.env['DEPBOARD_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL,
    userAgent: `depboard/${version}`,
  }),
});
