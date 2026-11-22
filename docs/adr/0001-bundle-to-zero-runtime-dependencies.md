# 0001: Publish a single bundled file with zero runtime dependencies

- Status: accepted
- Date: 2026-11-20

## Context

DepBoard is run mostly through `npx depboard`, often for the first time on a machine. Each runtime
dependency adds download time before the first insight (our promise is 10 seconds), and each one is
another package that could be compromised and then run on thousands of developer machines.

## Decision

The `depboard` package bundles all of its code and dependencies (`fast-glob`, `zod`, and later
`semver`, `fastify`, …) into `dist/` with `tsup` (`noExternal: [/.*/]`). Its `package.json` has no
`dependencies`. Internal workspace packages (`@depboard/server`, `@depboard/shared`) are never published.

## Consequences

- `npx depboard` downloads one small tarball and resolves nothing else, which is fast and predictable.
- Users can't patch a vulnerable transitive dependency with overrides. **We** must ship a patch release
  quickly instead. Renovate on our repo plus CI audit makes this our responsibility.
- Bundled CommonJS code needs a `require` shim in the ESM output (see `packages/cli/tsup.config.ts`).
- Licenses of bundled dependencies must be permissive. The build generates `dist/THIRD_PARTY_LICENSES.md`
  from the exact list of bundled modules (the CLI's esbuild metafile and the UI's Rollup output), and
  **fails** when a package's license is not on the allowlist in `.github/scripts/third-party-notices.mjs`
  (MIT, ISC, BSD-2/3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, CC0-1.0, Unlicense). Adding a license
  to the allowlist is a decision, recorded in the PR.
- The package-size budget (5 MB) in CI covers everything we ship.
