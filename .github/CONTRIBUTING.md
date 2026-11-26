# Contributing to DepBoard

Thank you for considering a contribution. DepBoard runs on developers' machines, inside folders
full of their work, so we hold changes to a high bar. This guide tells you exactly what that bar is,
so nothing in review comes as a surprise.

- [Ways to contribute](#ways-to-contribute)
- [Before you start](#before-you-start)
- [Development setup](#development-setup)
- [Making a change](#making-a-change)
- [Pull request requirements](#pull-request-requirements)
- [Standards](#standards)
- [Adding a package manager](#adding-a-package-manager)
- [Releases](#releases)
- [Getting help](#getting-help)

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** with the bug report form. Include the command you ran, your OS, Node version, and
  package manager. A screenshot of the matrix helps (paths inside your home folder already show as
  `~/…`).
- **Suggest a feature** with the feature request form. Tell us what you were trying to see or do.
- **Improve the docs.** Unclear wording is a bug.
- **Fix an issue.** Issues labeled `good first issue` are small and well defined.
- **Report a vulnerability privately**, never in a public issue: see [SECURITY.md](../SECURITY.md).

## Before you start

**Claim the issue before writing code.** Browse [`good first issue`](https://github.com/aaas72/depboard/labels/good%20first%20issue),
[`help wanted`](https://github.com/aaas72/depboard/labels/help%20wanted), or the
[pinned roadmap issue](https://github.com/aaas72/depboard/issues/28), leave a comment on the issue
you want to take, and **wait until the maintainer assigns it to you** before starting. That keeps two
people from doing the same work.

**Agree on design first when needed.** If an issue carries [`needs design`](https://github.com/aaas72/depboard/labels/needs%20design) — or you want to
propose a new feature — share your planned approach in the issue and wait for agreement before
opening a pull request. Unplanned feature pull requests may be closed to keep scope tight. Small typo
and documentation fixes can go straight to a pull request.

Every feature has to pass one question: **does this make the full picture clearer?** DepBoard
answers "what is happening across all my projects at once?". Features that don't serve that answer,
however nice, are deferred. Read the [roadmap](../docs/roadmap.md) for what is planned and what is out of
scope.

## Development setup

You need **Node.js 22.12+** for development (the published CLI supports Node 20.19+) and **pnpm 10**:
`corepack enable` picks the right version from `package.json`.

```bash
git clone https://github.com/aaas72/depboard.git
cd depboard
pnpm install
pnpm test
```

### Running it

```bash
pnpm build
node packages/cli/dist/index.js ~/projects   # the real CLI, exactly as published
```

For UI work, `pnpm dev` runs the server in watch mode on port 4319 and the Vite dev server on
port 5173 with hot reload:

| Variable                | Effect                                                              |
| ----------------------- | ------------------------------------------------------------------- |
| `DEPBOARD_DEV_ROOT`     | Folder to scan (default: this repository)                           |
| `DEPBOARD_DEV_TOKEN`    | Fixed token (64 hex characters) so reloading the page keeps working |
| `DEPBOARD_REGISTRY_URL` | Registry to use instead of registry.npmjs.org                       |

### Repository layout

```
packages/
  shared/   types, error codes, insight wording (no Node or DOM code)
  server/   scanner, registry client, insights, updates, security guard
  web/      React UI
  cli/      the published `depboard` package, bundles the other three
.github/scripts/  CI helpers: local CI, package check, performance budget, license notices
docs/       architecture, security model, UI guidelines, user guide, ADRs
```

The [architecture overview](../docs/architecture.md) explains how the pieces fit.

### Commands

| Command          | What it does                                               |
| ---------------- | ---------------------------------------------------------- |
| `pnpm dev`       | Server and UI in watch mode                                |
| `pnpm build`     | Build every package (the UI, then the CLI bundle)          |
| `pnpm lint`      | ESLint, zero warnings allowed                              |
| `pnpm typecheck` | TypeScript strict checks                                   |
| `pnpm test`      | Unit, integration, and component tests (Vitest)            |
| `pnpm format`    | Format with Prettier                                       |
| `pnpm perf`      | Time-to-first-insight budget against the built CLI         |
| `pnpm ci:local`  | The whole CI pipeline locally, Linux and Node 20 in Docker |
| `pnpm ci:quick`  | The same checks on your machine only, without Docker       |
| `pnpm changeset` | Describe a user-facing change for the changelog            |

## Making a change

1. **Fork and branch from `main`:** fork the repository on GitHub, clone your fork, and create a
   branch for one logical change: `feat/short-name`, `fix/short-name`, `docs/short-name`, or
   `chore/short-name`.
2. **Work in small steps:** a type in `shared`, then the service, then the route, then the UI. Each
   step testable on its own.
3. **Write tests with the code,** not after it. A bug fix starts with a test that fails.
4. **Verify locally before pushing:** run `pnpm lint && pnpm typecheck && pnpm test` (or
   `pnpm ci:quick`, or `pnpm ci:local` with Docker).
5. **Add a changeset** if users will notice the change: `pnpm changeset`. Write it for users, not
   for the code: "The matrix now shows …", not "refactor MatrixRow".
6. **Open a pull request against `main`:** fill in every section of the pull request template, link
   the issue (`Closes #123`), and give the pull request a clean
   [Conventional Commit](https://www.conventionalcommits.org) title — pull requests are
   **squash-merged** into `main` using that title.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org), one logical change per commit:

```
feat(server): detect the package manager from the lock file
fix(web): keep the first column in place on horizontal scroll
docs: explain the vulnerability badges
```

Scopes: `cli`, `server`, `web`, `shared`, `docs`, `ci`, `deps`. The body says **why**, not what.

Commit under your own name: you are the author of what you submit and answer for it in review.

## Pull request requirements

`main` is protected. When you open a pull request, **AppVeyor CI** runs automatically on **Linux,
Windows, and macOS** (lint, typecheck, tests, build, package contents, performance budget, and the
Node 20 runtime smoke test), and `@aaas72` is requested for review.

A pull request can merge when:

- [ ] AppVeyor CI is green on Linux, Windows, and macOS.
- [ ] `pnpm lint` passes with **zero warnings** and `pnpm typecheck` passes.
- [ ] New behavior and its edge cases are tested; no test is skipped to make CI pass.
- [ ] The performance budget still holds (`pnpm perf`), or the PR explains why not.
- [ ] Server changes keep every control in the [security model](../docs/security-model.md) and tick its
      checklist.
- [ ] UI changes follow the [UI guidelines](../docs/ui-guidelines.md) and include a screenshot or GIF.
- [ ] A changeset is included if the change is visible to users.
- [ ] Docs are updated if behavior, flags, or output changed.
- [ ] New dependencies are justified in the description (each one adds weight and attack surface).
- [ ] All review conversations are resolved and the maintainer (`@aaas72`) has approved the latest
      commit (pushing new commits dismisses earlier approvals so every change is reviewed).

Keep pull requests focused, ideally under 400 changed lines. Once approved and green, the maintainer
merges via **Squash and merge** (the PR branch is deleted automatically). Reviewers aim to respond
within a week.

## Standards

### Code

- **TypeScript strict**, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`:
  narrow `unknown`, or validate external data with a schema.
- **ESM only,** `import type` for types, literal unions instead of `enum`, no default exports except
  where a tool requires one.
- **Small pure functions;** side effects (files, network, processes) at the edges.
- **Comments explain why,** never what.
- **Errors** are `DepboardError` with a stable `code`, and every message a user sees answers: what
  happened, why, and what to do next. One broken project never fails the whole scan.
- **Cross-platform:** `path.join` / `path.resolve` only, never string-built paths; never assume bash or
  `HOME`. Windows, macOS, and Linux are equal: a feature that doesn't work on all three doesn't ship.

### Tests

- Vitest next to the code (`*.test.ts`); UI tests with Testing Library.
- **No real network** (the registry is always faked) and **no real `npm install`** in unit tests:
  install commands are pure functions, tested as data.
- Tests describe behavior: `it('marks 18.3.1 → 19.1.0 as major')`.
- Security tests prove that the server rejects a missing token, a bad Origin or Host, and malicious
  names and versions. Insight tests prove that no false finding is ever produced: a wrong insight
  costs more trust than a missing one.

### Performance budgets

| Budget                                         | Limit    |
| ---------------------------------------------- | -------- |
| Time to first insight, 30 projects, cold cache | ≤ 10 s   |
| Matrix scrolling, 500 packages × 30 projects   | 60 fps   |
| UI bundle, gzipped                             | ≤ 250 KB |
| Published package, unpacked                    | ≤ 5 MB   |
| Runtime dependencies of the published package  | none     |

### Decisions

A decision with a reasonable alternative gets an Architecture Decision Record in
[docs/adr](../docs/adr/): the context, the decision, and its consequences. Read the existing ones before
reopening a settled question.

## Adding a package manager

Today DepBoard **reads** projects of every manager but **updates** npm projects only. Adding pnpm,
yarn, or bun updates is the clearest first larger contribution:

1. Add `packages/server/src/adapters/<manager>.ts` with a pure `buildInstallCommand` that returns
   `{ file, args, display }` for one package and exact version, like `npm.ts`. No user-supplied
   flags; dev dependencies keep their flag.
2. Cover it with table tests: names, scoped names, dev dependencies, and rejected input.
3. Wire it in `updates/plan-update.ts` in place of the `MANAGER_NOT_SUPPORTED` refusal for that
   manager. Workspaces need care: the command must run where the manager expects it, because running
   the wrong one inside a workspace can damage it.
4. Run a real update on all three operating systems and describe it in the pull request.

## Releases

DepBoard follows [Semantic Versioning](https://semver.org). The CLI's name, flags, exit codes, and
minimum Node version are the public contract; the HTTP API between the server and the UI is internal
and may change in any release. Before 1.0, a breaking change bumps the minor version and leads the
changelog.

Changesets collect into a release pull request; merging it updates the version and
[the changelog](../packages/cli/CHANGELOG.md). A bad release is fixed with a new patch, never unpublished.

## Getting help

Ask in [GitHub Discussions](https://github.com/aaas72/depboard/discussions), or comment on the
issue you're working on. There are no silly questions here.
