import { describe, expect, it } from 'vitest';
import { parsePackageJson } from './package-json.js';

function parse(json: unknown) {
  const result = parsePackageJson(typeof json === 'string' ? json : JSON.stringify(json));
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.value;
}

describe('parsePackageJson', () => {
  it('reads name and both dependency maps', () => {
    const value = parse({
      name: 'app',
      dependencies: { react: '^18.2.0' },
      devDependencies: { typescript: '~5.4.0' },
    });
    expect(value.name).toBe('app');
    expect(value.dependencies).toEqual([
      { name: 'react', declared: '^18.2.0', depType: 'dependencies' },
      { name: 'typescript', declared: '~5.4.0', depType: 'devDependencies' },
    ]);
  });

  it('accepts a project without dependencies', () => {
    expect(parse({ name: 'empty' }).dependencies).toEqual([]);
  });

  it('reports a package listed in both maps once, as a runtime dependency', () => {
    const value = parse({ dependencies: { a: '1.0.0' }, devDependencies: { a: '2.0.0' } });
    expect(value.dependencies).toEqual([{ name: 'a', declared: '1.0.0', depType: 'dependencies' }]);
  });

  it('skips non-string versions without rejecting the file', () => {
    const value = parse({ dependencies: { good: '1.0.0', bad: 42, worse: null } });
    expect(value.dependencies.map((d) => d.name)).toEqual(['good']);
  });

  it('survives a broken dependency map and wrong field types', () => {
    const value = parse({ name: 7, dependencies: 'oops', devDependencies: { ok: '1.0.0' } });
    expect(value.name).toBeUndefined();
    expect(value.dependencies.map((d) => d.name)).toEqual(['ok']);
  });

  it('drops __proto__ (never a valid npm name), keeps constructor as data, and pollutes nothing', () => {
    const value = parse(
      '{"dependencies":{"__proto__":{"polluted":"yes"},"constructor":"2.0.0"},"devDependencies":{"toString":"1.0.0"}}',
    );
    expect(value.dependencies.map((d) => d.name)).toEqual(['constructor', 'toString']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('accepts a UTF-8 BOM', () => {
    expect(parse('\uFEFF{"name":"bom"}').name).toBe('bom');
  });

  it.each([
    ['{ not json', 'not valid JSON'],
    ['[]', 'not a JSON object'],
    ['"text"', 'not a JSON object'],
    ['null', 'not a JSON object'],
  ])('rejects %s', (text, reason) => {
    expect(parsePackageJson(text)).toEqual({ ok: false, reason });
  });
});
