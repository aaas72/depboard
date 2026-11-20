# Contributing to DepBoard

Thanks for helping! This guide gets you from clone to a passing test run.

## Requirements

- **Node.js 22.12+** for development (our dev tooling needs it). The published CLI itself supports Node 20.19+.
- **pnpm 10** (`corepack enable` picks the right version automatically).

## Setup

```bash
pnpm install
pnpm test
```

## Everyday commands

| Command          | What it does                  |
| ---------------- | ----------------------------- |
| `pnpm dev`       | Server and UI in watch mode   |
| `pnpm build`     | Build every package           |
| `pnpm lint`      | ESLint, zero warnings allowed |
| `pnpm typecheck` | TypeScript strict checks      |
| `pnpm test`      | Unit tests (Vitest)           |
| `pnpm format`    | Format with Prettier          |
| `pnpm changeset` | Describe a user-facing change |

Before opening a PR, run `pnpm ci:local`. It runs the whole CI pipeline locally, including Linux and Node 20 in Docker.
Without Docker, `pnpm ci:quick` runs the checks on your machine only.

## Repository layout

```
packages/
  cli/      the published `depboard` package (bundles everything else)
  server/   local Fastify server: scanner, registry, adapters, routes
  web/      React UI
  shared/   types shared by server and UI
```

## Commits and PRs

- [Conventional Commits](https://www.conventionalcommits.org): `feat(server): detect package manager from lock file`.
- Keep PRs small and focused. Add tests with your change, and a changeset if users will notice it.
- Anything touching the server must keep the security rules in [docs/agent/security.md](docs/agent/security.md).

More detail on how we work is in [docs/agent/](docs/agent/).
