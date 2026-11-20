# Tooling

## Approved stack

| Layer             | Technology                                             | Why                                                                                                   |
| ----------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Language          | TypeScript (strict)                                    | Shared types between server and UI                                                                    |
| Runtime           | Users: Node **>=20.19**. Development: Node **>=22.12** | Users often run us on older setups, so reach matters. Dev tools (Vitest 5, changesets 3) need Node 22 |
| Server            | Fastify + `@fastify/websocket` + `@fastify/static`     | Light and fast, with official plugins                                                                 |
| UI                | React + Vite                                           | Fast development, simple build                                                                        |
| Table             | TanStack Table + `@tanstack/react-virtual`             | Hundreds of rows without lag                                                                          |
| Styling           | Tailwind CSS                                           | Dark mode, fast design                                                                                |
| Versions          | `semver`                                               | Accurate patch / minor / major classification                                                         |
| File scanning     | `fast-glob`                                            | Fast, with ignore patterns                                                                            |
| Command execution | `execa`                                                | Argument arrays, Windows support                                                                      |
| Validation        | `zod`                                                  | One schema for server and UI                                                                          |
| Package names     | `validate-npm-package-name`                            | npm's official validation                                                                             |
| Concurrency       | `p-limit`                                              | Caps registry requests                                                                                |
| Open browser      | `open`                                                 | Cross-platform                                                                                        |
| Server/CLI build  | `tsup`                                                 | Simple ESM bundling                                                                                   |
| Tests             | Vitest + Playwright                                    | Unit and UI                                                                                           |
| Monorepo          | pnpm workspaces                                        | Package separation                                                                                    |
| Releases          | changesets                                             | CHANGELOG and controlled publishing                                                                   |
| Quality           | ESLint (flat config) + `typescript-eslint` + Prettier  |                                                                                                       |
| CI                | GitHub Actions                                         | Tests on ubuntu, windows, macos                                                                       |

## Commands (from repo root)

```bash
pnpm install
pnpm dev              # server (tsx watch) + web (vite) together
pnpm build            # shared → server → web → cli
pnpm lint             # eslint .
pnpm format           # prettier --write .
pnpm typecheck        # tsc --noEmit in every package
pnpm test             # vitest run
pnpm test:e2e         # playwright test
pnpm changeset        # describe a change for the next release
pnpm check:package    # what npm would publish: allowed files + size budget
pnpm ci:quick         # the CI pipeline on this machine only
pnpm ci:local         # + Linux in Docker (Node 22, 24) + built CLI on Node 20.19
```

## Local CI

`pnpm ci:local` reproduces GitHub CI on your machine (see `scripts/ci-local.mjs`):

| Stage         | Where                             | Covers                                                                            |
| ------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| Host          | your OS, your Node                | install (frozen lockfile), format, lint, typecheck, test, build, package contents |
| Node 20 smoke | Docker `node:20.19-bookworm-slim` | the host-built bundle runs on our minimum runtime and scans real folders          |
| Linux         | Docker `node:22` and `node:24`    | the full check suite on a clean copy of the repo (no host `node_modules`)         |

- It needs Docker running. Without it, use `pnpm ci:quick` (host only).
- macOS can't be reproduced locally. Only GitHub CI covers it.
- A Docker volume (`depboard-pnpm-store`) caches downloads between runs.
- `scripts/check-package.mjs` is shared by local and GitHub CI, so the two never drift apart.

To run the tool locally after building:

```bash
node packages/cli/dist/index.js ./fixtures/sample-projects
```

To run a command for a single package: `pnpm --filter @depboard/server test`.

## Dev mode

- The server runs on a fixed port (e.g. `4319`). Vite runs on `5173` and proxies `/api` and `/ws`.
- In dev, the token comes from `DEPBOARD_DEV_TOKEN` and is printed to the terminal.
- The Origin check allows the Vite origin **only** when `NODE_ENV=development`.

## Rules for adding a dependency

1. Ask first: is Node's built-in API or an existing dependency enough? (`fetch`, `crypto`, `fs/promises`, `util.parseArgs` for CLI args.)
2. The package must be maintained (a release within the last year), MIT-compatible, and free of suspicious postinstall scripts.
3. Keep production dependencies of `cli` and `server` to a minimum, because `npx` downloads them on first run.
   UI libraries are bundled into the build, so they belong in `devDependencies`.
4. State the reason for the addition in the PR description.

## CI (`.github/workflows/`)

- `ci.yml`: on every PR, run format check + lint + typecheck + test + build on `ubuntu-latest`, `windows-latest`, and `macos-latest` with Node 22 and 24.
  A separate job builds on Node 22 and then runs the built CLI on **Node 20.19** (the minimum users may have). A third job checks the published tarball contents and its 5 MB budget.
- GitHub Actions are pinned to commit SHAs (see engineering-standards.md, "Supply-chain security").
- TypeScript is pinned to `~6.0` because `typescript-eslint` doesn't support TypeScript 7 yet. `@types/node` is pinned to `~20.19` so code can't use APIs missing on our minimum runtime.
- `e2e.yml`: Playwright on ubuntu, plus windows weekly.
- `release.yml`: changesets. Merging to `main` opens a release PR, and merging that PR publishes to npm with `--provenance`.
