/**
 * Development entry point (`pnpm dev`). Never bundled into the published CLI.
 *
 * - Fixed port 4319, so the Vite dev server (5173) can proxy /api to it.
 * - Fixed token from DEPBOARD_DEV_TOKEN (or a printed random one), so reloading the page works.
 * - The Vite origin is allowed here and only here (docs/agent/security.md).
 * - Scans DEPBOARD_DEV_ROOT, or this repository when unset.
 */
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRegistryClient, DEFAULT_REGISTRY_URL } from './registry/registry-client.js';
import { startServer } from './start-server.js';

const DEV_PORT = 4319;
const VITE_PORT = 5173;

const root = path.resolve(
  process.env['DEPBOARD_DEV_ROOT'] ?? path.join(import.meta.dirname, '../../..'),
);
const token = process.env['DEPBOARD_DEV_TOKEN'] ?? randomBytes(32).toString('hex');

const server = await startServer({
  roots: [root],
  registry: createRegistryClient({
    registryUrl: process.env['DEPBOARD_REGISTRY_URL'] ?? DEFAULT_REGISTRY_URL,
    userAgent: 'depboard/dev',
  }),
  port: DEV_PORT,
  token,
  devOrigins: [`http://localhost:${String(VITE_PORT)}`, `http://127.0.0.1:${String(VITE_PORT)}`],
  logger: true,
});

console.warn(`DepBoard dev server scanning ${root}`);
console.warn(`  ➜ Open: http://localhost:${String(VITE_PORT)}/?token=${token}`);

const stop = () => void server.close().finally(() => process.exit(0));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
