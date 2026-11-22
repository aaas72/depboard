import { DepboardError } from '@depboard/shared';
import { describe, expect, it } from 'vitest';
import { createRegistryClient } from './registry/registry-client.js';
import { ensurePortFree, startServer } from './start-server.js';

// Never contacted: there are no roots, so nothing is looked up.
const registry = createRegistryClient({ registryUrl: 'http://127.0.0.1:9', userAgent: 'test' });
const options = { roots: [], registry };

describe('ensurePortFree', () => {
  it('passes for a free port and fails with PORT_IN_USE for a taken one', async () => {
    const running = await startServer(options);
    try {
      await expect(ensurePortFree(running.port)).rejects.toMatchObject({ code: 'PORT_IN_USE' });
    } finally {
      await running.close();
    }
    // The same port, now released: the probe must also release it again.
    await expect(ensurePortFree(running.port)).resolves.toBeUndefined();
    const again = await startServer({ ...options, port: running.port });
    await again.close();
  });
});

describe('startServer', () => {
  it('says plainly when the chosen port is taken, instead of an unexpected error', async () => {
    const first = await startServer(options);
    try {
      const second = startServer({ ...options, port: first.port });
      await expect(second).rejects.toBeInstanceOf(DepboardError);
      await expect(second).rejects.toMatchObject({
        code: 'PORT_IN_USE',
        message: `Port ${String(first.port)} is already in use, maybe by another DepBoard.`,
      });
    } finally {
      await first.close();
    }
  });

  it('generates a fresh 64-hex-character token per launch', async () => {
    const a = await startServer(options);
    const b = await startServer(options);
    try {
      const tokenOf = (url: string) => new URL(url).searchParams.get('token');
      expect(tokenOf(a.url)).toMatch(/^[0-9a-f]{64}$/);
      expect(tokenOf(a.url)).not.toBe(tokenOf(b.url));
      expect(new URL(a.url).hostname).toBe('127.0.0.1');
    } finally {
      await a.close();
      await b.close();
    }
  });

  it('accepts a fixed token for development only when it is long and hex', async () => {
    await expect(startServer({ ...options, token: 'short' })).rejects.toThrow(/32 lowercase hex/);
    await expect(startServer({ ...options, token: 'Z'.repeat(40) })).rejects.toThrow();

    const fixed = 'ab'.repeat(16);
    const server = await startServer({ ...options, token: fixed });
    try {
      expect(server.url).toContain(`token=${fixed}`);
    } finally {
      await server.close();
    }
  });
});
