import { describe, expect, it, vi } from 'vitest';

const spawn = vi.fn(() => ({ on: vi.fn(), unref: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));

const { openBrowser } = await import('./open-browser.js');

describe('openBrowser', () => {
  const url = 'http://127.0.0.1:4319/?token=abc';

  it.each([
    ['win32', 'rundll32.exe', ['url.dll,FileProtocolHandler', url]],
    ['darwin', 'open', [url]],
    ['linux', 'xdg-open', [url]],
  ] as const)('uses the platform opener on %s, never a shell', (platform, command, args) => {
    spawn.mockClear();
    openBrowser(url, platform);
    expect(spawn).toHaveBeenCalledWith(command, args, expect.objectContaining({ shell: false }));
  });

  it.each([
    'https://evil.example',
    'file:///etc/passwd',
    'http://127.0.0.1:4319/&calc.exe'.replace('/&', '&'),
  ])('refuses anything but our own local server: %s', (bad) => {
    spawn.mockClear();
    openBrowser(bad, 'win32');
    expect(spawn).not.toHaveBeenCalled();
  });
});
