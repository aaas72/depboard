import type { AddressInfo } from 'node:net';
import { createApp, type AppOptions } from './app.js';
import { SERVER_HOST } from './security/guard.js';
import { generateToken } from './security/token.js';

export interface StartServerOptions extends Omit<AppOptions, 'token' | 'port'> {
  /** 0 or undefined picks a free port. */
  port?: number | undefined;
}

export interface RunningServer {
  /** The launch URL, token included. Print it once; never log it elsewhere. */
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Starts the local server on 127.0.0.1 only, with a fresh token for this launch. */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const token = generateToken();
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
