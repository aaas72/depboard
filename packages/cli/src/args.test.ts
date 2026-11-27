import { describe, expect, it } from 'vitest';
import { DepboardError } from '@depboard/shared';
import { DEFAULT_DEPTH, parseCliArgs } from './args.js';

describe('parseCliArgs', () => {
  it('defaults to the current directory with safe options', () => {
    expect(parseCliArgs([])).toEqual({
      paths: [],
      port: undefined,
      open: true,
      yes: false,
      summary: false,
      json: false,
      depth: DEFAULT_DEPTH,
      debug: false,
      help: false,
      version: false,
    });
  });

  it('collects several paths, including ones with spaces and Arabic names', () => {
    const options = parseCliArgs(['~/work', 'C:\\My Projects', '/home/me/مشاريع']);
    expect(options.paths).toEqual(['~/work', 'C:\\My Projects', '/home/me/مشاريع']);
  });

  it('parses --summary and --json', () => {
    expect(parseCliArgs(['--summary']).summary).toBe(true);
    expect(parseCliArgs(['--json']).json).toBe(true);
  });

  it('parses flags', () => {
    const options = parseCliArgs(['--port', '4319', '--no-open', '-y', '--depth', '3', '--debug']);
    expect(options).toMatchObject({ port: 4319, open: false, yes: true, depth: 3, debug: true });
  });

  it.each([
    ['--port', '0'],
    ['--port', '70000'],
    ['--port', 'abc'],
    ['--depth', '1.5'],
    ['--depth', '99'],
  ])('rejects %s %s as invalid usage', (flag, value) => {
    expect(() => parseCliArgs([flag, value])).toThrow(DepboardError);
  });

  it('rejects unknown flags with a hint', () => {
    try {
      parseCliArgs(['--registry=http://evil']);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DepboardError);
      expect((error as DepboardError).code).toBe('INVALID_USAGE');
      expect((error as DepboardError).hint).toContain('--help');
    }
  });
});
