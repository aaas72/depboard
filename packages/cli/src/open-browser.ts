import { spawn } from 'node:child_process';

/**
 * Opens a URL in the default browser without a shell, so nothing in the URL is ever interpreted
 * as a command. Failure is not an error: the URL is always printed for the user to click.
 */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) return; // only ever our own local server

  const [command, args] =
    platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: false });
    child.on('error', () => {
      // No browser available (e.g. a headless server): the printed URL is enough.
    });
    child.unref();
  } catch {
    // Same as above.
  }
}
