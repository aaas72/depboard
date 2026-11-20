import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createRegistryClient, DEFAULT_REGISTRY_URL, startServer } from '@depboard/server';
import { openBrowser } from './open-browser.js';
import { run, type ServeOptions } from './run.js';

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

/** The UI is copied next to this file at build time (dist/web). */
function findStaticDir(): string | undefined {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
  return fs.existsSync(path.join(dir, 'index.html')) ? dir : undefined;
}

/** Starts the server and closes it cleanly on Ctrl+C or when the terminal goes away. */
async function serve(options: ServeOptions): Promise<{ url: string }> {
  const server = await startServer({
    roots: options.roots,
    registry: options.registry,
    depth: options.depth,
    port: options.port,
    initial: options.initial,
    staticDir: options.staticDir,
    logger: options.debug,
  });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    console.error('\nStopping DepBoard…');
    void server.close().finally(() => process.exit(0));
    // Never hang on shutdown.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  process.once('SIGHUP', shutdown);

  return { url: server.url };
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
  startServer: serve,
  openBrowser,
  staticDir: findStaticDir(),
});
