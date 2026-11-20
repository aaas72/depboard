import type { AddressInfo } from 'node:net';
import { createApp, type AppOptions } from './app.js';
import { SERVER_HOST } from './security/guard.js';
import { generateToken } from './security/token.js';

export interface StartServerOptions extends Omit<AppOptions, 'token' | 'port'> {
  /** 0 or undefined picks a free port. */
  port?: number | undefined;
  /**
   * Development only (`src/dev.ts`), so the Vite page keeps working across restarts.
   * The CLI never passes it: every real launch gets a fresh random token.
   */
  token?: string | undefined;
}

export interface RunningServer {
  /** The launch URL, token included. Print it once; never log it elsewhere. */
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Starts the local server on 127.0.0.1 only, with a fresh token for this launch. */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  if (options.token !== undefined && !/^[0-9a-f]{32,}$/.test(options.token)) {
    throw new Error('A fixed token must be at least 32 lowercase hex characters.');
  }
  const token = options.token ?? generateToken();
  let port = 0;
  const app = await createApp({ ...options, token, port: () => port });

  // Never 0.0.0.0 or "localhost" (which can resolve to another interface): see security.md.
  await app.listen({ host: SERVER_HOST, port: options.port ?? 0 });
  port = (app.server.address() as AddressInfo).port;

  return {
    url: `http://${SERVER_HOST}:${String(port)}/?token=${token}`,
    port,
    close: () => app.close(),
  };
}
