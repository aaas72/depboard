import { randomBytes, timingSafeEqual } from 'node:crypto';

/** A fresh secret for every launch. 32 random bytes, hex-encoded. Never logged. */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Constant-time comparison, so response timing can't leak how much of a guess was right. */
export function tokensMatch(expected: string, received: unknown): boolean {
  if (typeof received !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
