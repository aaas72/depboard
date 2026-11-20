import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { displayPath, expandHome, isFilesystemRoot, isInside, isSamePath } from './paths.js';

const home = os.homedir();

describe('isInside', () => {
  it('treats a folder as inside itself', () => {
    expect(isInside(home, home)).toBe(true);
  });

  it('detects children and rejects siblings with a shared prefix', () => {
    expect(isInside(path.join(home, 'work'), path.join(home, 'work', 'app'))).toBe(true);
    expect(isInside(path.join(home, 'work'), path.join(home, 'workshop'))).toBe(false);
    expect(isInside(path.join(home, 'work'), home)).toBe(false);
  });

  it('ignores case on Windows but not on Linux', () => {
    expect(isInside('C:\\Projects', 'c:\\projects\\app', 'win32')).toBe(
      process.platform === 'win32',
    );
    expect(isSamePath('/home/A', '/home/a', 'linux')).toBe(false);
  });
});

describe('isFilesystemRoot', () => {
  it('recognizes the root of the current drive', () => {
    expect(isFilesystemRoot(path.parse(process.cwd()).root)).toBe(true);
  });

  it('rejects normal folders', () => {
    expect(isFilesystemRoot(home)).toBe(false);
  });
});

describe('expandHome', () => {
  it.each([
    ['~', home],
    ['~/projects', path.join(home, 'projects')],
    ['~\\projects', path.join(home, 'projects')],
  ])('expands %s', (input, expected) => {
    expect(expandHome(input, home)).toBe(expected);
  });

  it('leaves other paths alone, including names that merely start with ~', () => {
    expect(expandHome('~other/x', home)).toBe('~other/x');
    expect(expandHome('./src', home)).toBe('./src');
  });
});

describe('displayPath', () => {
  it('shortens paths under home', () => {
    expect(displayPath(path.join(home, 'projects'), home)).toBe(`~${path.sep}projects`);
    expect(displayPath(home, home)).toBe('~');
  });
});
