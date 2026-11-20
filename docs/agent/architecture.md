# Architecture

## Overview

```
┌──────────────┐  HTTP + WS (127.0.0.1, token)  ┌──────────────────────────────┐
│  Browser     │ ─────────────────────────────▶ │  Local server (Fastify)      │
│  packages/web│ ◀───────────────────────────── │  packages/server             │
└──────────────┘                                │                              │
                                                │  ┌─────────┐ ┌──────────┐    │
                                                │  │ scanner │ │ registry │    │
                                                │  └────┬────┘ └────┬─────┘    │
                                                │       │      ┌────┴─────┐    │
                                                │       │      │ adapters │    │
                                                └───────┼──────┴────┬─────┴────┘
                                                        ▼           ▼       ▼
                                                  File system   npm/pnpm/  registry.npmjs.org
                                                  (root dir)    yarn/bun
```

We publish a single npm package. The `cli` starts a local server, which serves the built UI
and does **all** the work. The browser only displays data: it never reads files and never calls the internet directly.

`shared` and `server` are private "internal packages": their `exports` point straight at TypeScript source, and `tsup` bundles them into the `cli` build, so nothing internal is ever published separately.

## Packages and dependency direction

| Package  | Responsibility                                                     | Depends on            |
| -------- | ------------------------------------------------------------------ | --------------------- |
| `shared` | Domain types, validation schemas (zod), constants                  | nothing               |
| `server` | Fastify, the three services, routes                                | `shared`              |
| `web`    | React UI                                                           | `shared` (types only) |
| `cli`    | Parse args, generate the token, start the server, open the browser | `server`              |

**Forbidden:** `web` importing from `server` or vice versa, and Node- or DOM-specific code inside `shared`.
`cli` is the package we publish to npm. It bundles the built `web` assets (`dist/web`).

## Choosing what to scan (CLI)

DepBoard **never scans the whole machine**. It scans only the root folder(s) the user gives it.

```bash
npx depboard                     # current directory
npx depboard ~/projects          # one folder
npx depboard ~/work ~/clients    # several folders, merged into one matrix
```

Resolution rules, in order:

1. **Explicit paths** → resolve each with `realpath`, and dedupe nested roots (if `~/work/app` is inside `~/work`, keep `~/work`).
2. **No path** → the current directory.
3. **Refuse** a filesystem root (`/`, `C:\`, any drive root) with a clear message.
4. **Warn** when a root is the user's home directory (it's large and slow), and continue only with `--yes` or an interactive confirm.

After the scan, the CLI handles two special cases:

- **Exactly one project found:** show it, and print plus display in the UI:
  _"Found 1 project. To compare projects, run `npx depboard ..`"_. There's nothing to compare in a single project.
- **No projects found:** don't search elsewhere on your own. List common project folders that **exist** (`~/projects`, `~/dev`, `~/code`, `~/src`, `~/repos`, `~/Documents/GitHub`), checking existence only, never scanning them, and suggest the command:
  _"No projects found here. Did you mean `npx depboard ~/projects`?"_

Phase 2: remember used roots in `~/.depboard/config.json`. When `npx depboard` runs in a folder with no projects, offer the last roots. The UI gets an "Add folder" action (the server validates the path with the same rules).

## Server services

### 1. Scanner (`server/src/scanner/`)

- Uses `fast-glob` to find `**/package.json`. It skips **every hidden folder** (`.git`, `.next`, `.next-verify`, `.venv`, …; tools keep inventing new ones, so a list can't keep up) plus `node_modules`, `dist`, `build`, `coverage`, `out`, `venv`, `site-packages`, and `vendor`.
  These rules come from dogfooding: Python virtualenvs and Next.js build folders contain `package.json` files that are not projects.
- Never follows symlinks (they can leave the root or loop).
- Enforces a max depth (default 6) so it can't get lost in huge trees.
- For each project, it records the name, absolute path, `dependencies`, `devDependencies`, and package manager.
- **Detects the manager:** the `packageManager` field (Corepack) first, then the nearest lock file:
  `pnpm-lock.yaml` → pnpm · `yarn.lock` → yarn · `bun.lock` / `bun.lockb` → bun · `package-lock.json` → npm · none → npm.
  The lock-file search **walks up to parent folders** (a workspace package's lock file sits at the workspace root) but **never above the scan root**. Running `npm install` inside a pnpm workspace would break it, so this is a do-no-harm rule.
- **Current version:** read from `node_modules/<pkg>/package.json`, walking up like Node does (npm/yarn workspaces hoist to the root), never above the scan root. When not installed, `installed` is `null`.
- Package names are validated before any path is built from them, so a crafted name like `../../x` can't read outside `node_modules`.
  Each cell carries both `declared` (the range in package.json) and `installed`.
- In the MVP, workspace packages inside a monorepo show up as independent projects. Full workspaces support arrives in Phase 2.

### 2. Registry client (`server/src/registry/`)

- Requests `https://registry.npmjs.org/<name>/latest`: the manifest of the `latest` dist-tag only.
  **Never the full metadata:** measured on 2026-11-20, `next` is 25.7 MB of metadata (even abbreviated) against 3 KB for `/latest`. Switching cut a real 15-project scan from 10 s to under 4 s.
  When a feature needs the version list (e.g. version alignment), fetch it on demand for that one package.
- Scoped names: `@scope/name` is sent as `@scope%2Fname`.
- **Only plain registry ranges are looked up.** `workspace:`, `file:`, `link:`, `git`, URLs, `npm:` aliases and `catalog:` are never sent to the public registry, so internal and private package names don't leak.
- **In-memory cache** with a 15-minute TTL (configurable), plus **dedupe**: each package is requested once, however many projects use it.
- **Concurrency limit** of 16 requests (a small built-in limiter, `lib/concurrency.ts`), close to npm's own socket limit.
- **Timeout** of 15 s per request, plus **one retry** after 300 ms for network errors, timeouts, 429, and 5xx. 404 is final (`not-found`).
- Failures are never cached, so the next call retries. Successes and 404s are cached for the TTL.
- Honoring the user's `.npmrc` (custom registry) comes later, but the API is designed for it now.
- A failure for one package (404 or network) doesn't break the whole matrix. That cell is marked `unknown`.

**Advisories (MVP)** (`getAdvisories` in `server/src/registry/registry-client.ts`):

- Endpoint verified live on 2026-11-20 (`lodash@4.17.15` returned advisories with `id`, `url`, `title`, `severity`, `vulnerable_versions`, `cwe`, `cvss`).
- **One** bulk request for all projects together, instead of running `npm audit` per project:
  `POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk` with body `{ "<package>": ["<version>", ...] }`.
  This is the same endpoint `npm audit` uses. Send the unique package/version pairs across every project.
- Split very large bodies into chunks (e.g. 500 packages per request) and run them under the same concurrency limit.
- The response maps each package to advisories (`id`, `title`, `url`, `severity`, `vulnerable_versions`).
  Match each cell's installed version with `semver.satisfies(installed, vulnerable_versions)`.
- Severity scale: `low` < `moderate` < `high` < `critical`. A cell keeps its highest severity and the advisory count.
- Same cache TTL as version data. If the request fails, vulnerability data is `unknown` and the matrix still renders.
- MVP scope covers direct dependencies only (those in `package.json`). Transitive dependencies from the lock file come later.

### 3. Package-manager adapters (`server/src/adapters/`)

Unified interface:

```ts
interface PackageManagerAdapter {
  readonly id: 'npm' | 'pnpm' | 'yarn' | 'bun';
  detect(projectDir: string): Promise<boolean>;
  buildInstallCommand(input: UpdateRequest): { file: string; args: string[] };
}
```

- `buildInstallCommand` is a **pure function** that returns the command as an argument array. That makes it easy to test, and the UI can show the exact command before the user confirms.
- One shared `runner.ts` does the actual execution with `execa(file, args, { cwd, shell: false })` and streams stdout/stderr line by line.
- The MVP ships the `npm` adapter only. The others land in Phase 2, and the interface is already ready for them.
- **Per-project job queue:** two installs never run in the same directory at once.

### 4. Insights (`server/src/insights/`)

This service powers the core product moment: the drift sentences at the top of the matrix.

- Pure functions over the matrix data, with no I/O: `computeInsights(projects, rows): Insight[]` (called by `buildMatrix`) and `pickHeadlines(insights, limit)`.
- **Rules** (each reports only what the data proves):
  - `vulnerable-spread`: a known advisory for an **installed** version in 1+ projects. Never from estimates.
  - `version-drift`: 2+ distinct **release lines** among **installed**, non-prerelease versions. A release line is the part where SemVer allows breaks: the major (`17` vs `18`), or the minor before 1.0 (`0.2` vs `0.3`). Patch or minor differences on one major (`4.17.20` vs `4.17.21`) are not news and are not reported.
  - `major-lag`: 1+ major behind `latest` in 2+ projects. Declared ranges count here, because `^17` can never install 19.
- **Family grouping:** drift and lag insights from one npm scope that tell exactly the same story (same lines or gap, same projects) fold into one: "`@angular/*` (8 packages) are used at 3 different major versions…". Found by dogfooding, where eight Angular packages filled the list with one repeated sentence. Vulnerabilities are never merged: each package has its own advisories and fix.
- **Ranking:** score bands encode priorities: critical (10 000) > high (8 000) > drift (5 000) > moderate (3 000) > low (1 000) > lag (500). Within a band, more projects, more release lines, and bigger gaps rank higher. Ties break by package name, so the order is deterministic. Well-known packages get no special treatment; the data decides.
- **Headlines** (`pickHeadlines`): at most one insight per package, and at most 3 of one kind while other kinds have something to say, so 16 vulnerabilities can't hide the drift story (and the other way round). Leftover slots fill by importance.
- Wording lives in `shared/src/insight-text.ts` (`describeInsight` returns parts with `strong` flags for the UI). The server sends structured data only.
- Exhaustively unit-tested. A wrong or noisy insight damages trust more than a missing one.

### 5. Routes (`server/src/routes/`)

Routes are a thin layer: validate input with zod, call the service, return the result. No business logic in routes.
The full contracts are in [api.md](api.md).

## Domain model (in `shared`)

```ts
type UpdateType = 'none' | 'patch' | 'minor' | 'major' | 'prerelease' | 'unknown';

interface Project {
  id: string;
  name: string;
  path: string;
  manager: PmId;
}

interface MatrixCell {
  projectId: string;
  declared: string; // "^18.2.0"
  installed: string | null;
  updateType: UpdateType;
  depType: 'dependencies' | 'devDependencies';
  vulnerability:
    { severity: 'low' | 'moderate' | 'high' | 'critical'; count: number } | null | 'unknown';
}

interface MatrixRow {
  name: string;
  latest: string | null;
  cells: Record<string, MatrixCell>;
}
```

- `Project.id` is a stable hash of the absolute path. Paths are never used as identifiers in URLs.
- The server computes `updateType` (`server/src/versions/classify.ts`). The UI never computes it. Rules:
  - It's a **risk level**, not "which digit changed". Following SemVer, a 0.x minor bump and any 0.0.x bump are `major` (possibly breaking).
  - A prerelease moving to its own final release (`19.0.0-rc.1 → 19.0.0`) is `prerelease`, not `major`.
  - At or ahead of `latest` (e.g. a canary) is `none`.
- **`version` and `versionSource`:** the installed version when known (`installed`), else the lowest version the range allows (`declared`, an estimate shown as such).
- **Vulnerabilities are only checked on installed versions.** For a `declared` estimate the status is `unknown`, because the range floor can be vulnerable while the version really used isn't, or the reverse. Reading exact versions from lock files (Phase 2) removes most of these unknowns.

## Runtime flow

1. `npx depboard [paths...]`: `cli` resolves the roots following "Choosing what to scan" above.
2. It generates a random token, picks a free port, and starts the server on `127.0.0.1`.
3. It opens `http://127.0.0.1:<port>/?token=<token>` in the browser.
4. The UI keeps the token in memory (or `sessionStorage`), strips it from the address bar, and sends it with every request.
5. `GET /api/matrix` runs the scanner, registry client (versions + advisories), and insights service, and returns the matrix with its insights.
6. Update: `POST /api/update` returns a `jobId` immediately and streams output over `/ws/logs`. When the job ends, only the affected project is rescanned.

## Performance budget

The promise is **"discover what's hiding in your projects in 10 seconds"**, so speed is a feature:

- **≤ 10 s to first insight**, cold cache, for ~30 projects / ~500 unique packages on a normal connection.
- Scan results (local, fast) render immediately. Registry data fills in progressively. Don't block the first paint on the network.
- Version drift between _installed_ versions needs no network at all, so compute and show it from the scan alone, before registry data arrives.
- Track the budget with an e2e timing check against the fixtures.

## Architectural principles

- **Services don't know about Fastify:** scanner, registry, and adapters can be tested without starting a server.
- **Manual dependency injection** via `createApp(deps)`, with no DI library. This makes mocking straightforward.
- **No database:** all state is in memory. Backups (Phase 3) are stored as files under `~/.depboard/backups`.
- **Significant decisions** are recorded as ADRs in `docs/adr/` (see [documentation.md](documentation.md)).
