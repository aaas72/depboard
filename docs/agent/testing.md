# Testing

## Principles

- **No real network calls in tests.** Always mock the registry.
- **No real `npm install`** in unit tests. Test adapters through `buildInstallCommand`, which is a pure function.
- Every bug fix comes with a test that fails before the fix.
- Tests describe **behavior**, not implementation: `it('marks 18.3.1 → 19.1.0 as major')`.

## Layers

| Type        | Tool                     | Location                      | Covers                                                                    |
| ----------- | ------------------------ | ----------------------------- | ------------------------------------------------------------------------- |
| Unit        | Vitest                   | Next to the file: `*.test.ts` | scanner, registry, adapters, insights, updateType calculation, validation |
| Integration | Vitest + `app.inject()`  | `server/test/`                | Routes, including the security controls                                   |
| Component   | Vitest + Testing Library | `web/src/**/*.test.tsx`       | Matrix, badges, dialogs                                                   |
| End-to-end  | Playwright               | `e2e/`                        | Real CLI run on fixtures, matrix rendering, updates                       |

## Fixtures

```
fixtures/
├── sample-projects/
│   ├── app-react18/        package.json + package-lock.json
│   ├── app-react19/        package.json + pnpm-lock.yaml
│   ├── api-service/        package.json + yarn.lock
│   └── nested/deep/lib/    depth handling
└── registry/               recorded registry responses (JSON), one per package used
```

- Add a fixture for each edge case: a project with no lock file, a malformed `package.json`, a scoped package (`@types/node`), a prerelease version, and a non-existent package (404).
- Create `node_modules` inside fixtures by hand with the bare minimum (a `package.json` with a `version`). Never install them for real.

## Network mocking

- Server: use `undici`'s `MockAgent`, or pass a fake `fetch` through `createApp(deps)`.
- E2E: start the server with `DEPBOARD_REGISTRY_URL` pointing to a local server that serves `fixtures/registry/`.

## Mandatory security tests

`server/test/security.test.ts` must prove, for every route:

- 401 with no token or a wrong token.
- 403 with `Origin: https://evil.example`, and 403 with `Host: evil.example`.
- 400 for names like `react; rm -rf /`, `--registry=http://x`, `../../x`, and `react@1.0.0 lodash`.
- 400 for versions like `^1.0.0`, `git+https://...`, and `file:../x`.
- 403 for a project path outside the root, including a symlink pointing outside.

## Coverage

- Target **90%+** for `scanner`, `registry`, `adapters`, `insights`, and `security`, and 70%+ overall.

## Insights tests

The drift sentences are the product's headline, so a false insight is worse than a missing one. Cover:

- No drift when all projects share one version (including the same version declared with different ranges).
- Drift counted on **installed** versions, not declared ranges (`^18.2.0` and `^18.3.0` both installed as `18.3.1` → no drift).
- Prereleases and `unknown` cells excluded from drift counts.
- Ranking order is stable and deterministic for a given input.
- `vulnerable-spread`: an installed version inside `vulnerable_versions` is flagged, and one just outside the range isn't. High/critical outranks any drift.
- A failed advisory request marks cells `unknown` and produces no vulnerability insights. It never produces a false "no vulnerabilities".

## Advisory mocking

Recorded bulk-advisory responses live in `fixtures/registry/advisories/`. Include at least one package with a `critical` advisory used in several fixture projects, so the e2e test can assert the `vulnerable-spread` sentence.

## Root selection tests

- No argument → scans the current directory.
- Several paths, nested ones deduped.
- A drive root (`/`, `C:\`) is refused. The home directory requires confirmation.
- One project → the single-project hint. Zero projects → suggestions list only folders that exist, and **none of them is scanned** (assert the scanner was never called on them).

## Performance check

An e2e test launches the CLI against a large fixture (~30 projects) with the mocked registry and asserts the first insight renders within the 10-second budget.

- Don't write filler tests to raise the number. The critical paths are what matter.

## Before declaring done

```bash
pnpm lint && pnpm typecheck && pnpm test
```

If you touched the UI or the update flow, also run `pnpm test:e2e`.
If a test fails, report it with the output. Never `.skip` a test to get CI green.
