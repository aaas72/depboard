# 0002: Minify the CLI bundle (keeping function names), and keep Fastify

- Status: accepted
- Date: 2026-11-20

## Context

After the update step, `dist/index.js` was 2.34 MB unminified. That is under the 5 MB budget, but
`npx depboard` downloads it on first run, and the first run is where our 10-second promise lives.
We measured three builds of the same code (esbuild, Node 24, Windows):

| Build                | Unpacked | gzip   | `--version` startup |
| -------------------- | -------- | ------ | ------------------- |
| Not minified         | 2,397 KB | 451 KB | 169 ms              |
| Minified             | 1,065 KB | 328 KB | 167 ms              |
| Minified + keepNames | 1,125 KB | 349 KB | 173 ms              |

About 1.2 MB of the unminified bundle is Fastify and its dependencies (ajv, fast-json-stringify,
find-my-way, light-my-request, avvio, pino, fast-uri). Replacing Fastify with `node:http` and a small
router would save roughly another 100 KB of download, but means rewriting the server and its security
guard, which are covered by mutation-tested security tests.

## Decision

- Minify the bundle with `keepNames: true` (`packages/cli/tsup.config.ts`). We ship no source maps, so
  kept function names are what makes a `--debug` stack trace readable in a bug report; they cost 21 KB.
- Keep Fastify. The remaining gain from a smaller server does not justify re-doing the most
  security-sensitive code before 0.1.0.

## Consequences

- The published tarball is 458 KB (CLI + UI + README + LICENSE), 1.5 MB unpacked, down from ~2.4 MB.
- Startup time is unchanged. The time-to-first-insight budget is still checked by `pnpm perf`.
- The minified build is what CI tests: the Node 20 smoke test, `pnpm perf`, and the package check all
  run against `dist/index.js` as published. A real update through the UI was verified on it.
- Revisit replacing Fastify only if download size becomes a measured problem for users.
