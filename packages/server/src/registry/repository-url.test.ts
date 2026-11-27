import { describe, expect, it } from 'vitest';
import { extractChangelogUrl } from './repository-url.js';

describe('extractChangelogUrl', () => {
  it('normalizes GitHub repository formats to /releases', () => {
    expect(
      extractChangelogUrl({ repository: { url: 'git+https://github.com/lodash/lodash.git' } }),
    ).toBe('https://github.com/lodash/lodash/releases');
    expect(
      extractChangelogUrl({ repository: { url: 'git://github.com/vercel/next.js.git' } }),
    ).toBe('https://github.com/vercel/next.js/releases');
    expect(extractChangelogUrl({ repository: 'github:pnpm/pnpm' })).toBe(
      'https://github.com/pnpm/pnpm/releases',
    );
    expect(extractChangelogUrl({ repository: 'facebook/react' })).toBe(
      'https://github.com/facebook/react/releases',
    );
  });

  it('falls back to a safe HTTPS homepage when repository is missing', () => {
    expect(extractChangelogUrl({ homepage: 'https://vitest.dev/' })).toBe('https://vitest.dev');
  });

  it('rejects javascript:, data:, http:, SSH, and malformed URLs', () => {
    expect(extractChangelogUrl({ repository: { url: 'javascript:alert(1)' } })).toBeNull();
    expect(extractChangelogUrl({ homepage: 'data:text/html,<script>' })).toBeNull();
    expect(extractChangelogUrl({ repository: { url: 'http://github.com/a/b' } })).toBeNull();
    expect(extractChangelogUrl({ repository: { url: 'git@github.com:a/b.git' } })).toBeNull();
    expect(extractChangelogUrl({})).toBeNull();
  });
});
