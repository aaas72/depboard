import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TOKEN_HEADER, type ErrorResponse } from '@depboard/shared';
import { tokensMatch } from './token.js';

export const SERVER_HOST = '127.0.0.1';
export { TOKEN_HEADER };

export interface GuardOptions {
  token: string;
  /** The port the server listens on, read per request (it's only known after listen). */
  port: () => number;
  /**
   * Extra origins allowed in development only (the Vite dev server).
   * Never set in production code paths.
   */
  devOrigins?: readonly string[];
}

function reject(reply: FastifyReply, status: 401 | 403, message: string): FastifyReply {
  const body: ErrorResponse = { error: { code: 'FORBIDDEN_REQUEST', message } };
  return reply.code(status).header('cache-control', 'no-store').send(body);
}

/** Routes that need the token. Static UI files don't: they contain no data. */
function isProtected(url: string): boolean {
  return url.startsWith('/api/') || url === '/api';
}

/**
 * One global gate in front of every route (docs/agent/security.md):
 * - Host must be exactly 127.0.0.1:<port>  → blocks DNS rebinding
 * - Origin, when present, must be our own  → blocks other sites in the browser
 * - non-GET requests must carry an Origin  → no blind cross-site writes
 * - /api needs the session token (header)  → nothing works without the launch URL
 */
export function registerGuard(app: FastifyInstance, options: GuardOptions): void {
  const allowedOrigins = () =>
    new Set([`http://${SERVER_HOST}:${String(options.port())}`, ...(options.devOrigins ?? [])]);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const expectedHost = `${SERVER_HOST}:${String(options.port())}`;
    if (request.headers.host !== expectedHost) {
      return reject(reply, 403, 'Requests must be addressed to the DepBoard server directly.');
    }

    const origin = request.headers.origin;
    if (origin !== undefined && !allowedOrigins().has(origin)) {
      return reject(reply, 403, 'Cross-origin requests are not allowed.');
    }
    if (origin === undefined && request.method !== 'GET' && request.method !== 'HEAD') {
      return reject(reply, 403, 'Requests that change something must come from the DepBoard page.');
    }

    // Decide by the route Fastify actually matched, not the raw URL, so encoded tricks
    // like /%61pi/matrix can't slip past. Unmatched routes need the token too.
    const route = request.routeOptions.url;
    if (route === undefined || isProtected(route) || isProtected(request.url)) {
      // Header only, never the query string: a token in a URL can leak (history, logs, Referer).
      if (!tokensMatch(options.token, request.headers[TOKEN_HEADER])) {
        return reject(
          reply,
          401,
          'Missing or invalid session token. Open the link DepBoard printed.',
        );
      }
    }
  });

  app.addHook('onSend', async (request, reply) => {
    // The token travels in the page URL once: never let it leak through Referer.
    void reply.header('referrer-policy', 'no-referrer');
    void reply.header('x-content-type-options', 'nosniff');
    void reply.header('x-frame-options', 'DENY');
    void reply.header('cross-origin-resource-policy', 'same-origin');
    if (isProtected(request.url)) void reply.header('cache-control', 'no-store');
  });
}
