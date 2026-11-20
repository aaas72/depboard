# DepBoard — Main Agent Guide

> Entry point for any AI agent (or contributor) working on this project.
> Original concept document: `تقرير مشروع لوحة إدارة مكتبات npm لعدة مشاريع.pdf` in the repo root.

## What is this project?

An open-source (MIT) tool that runs with a single command:

```bash
npx depboard ~/projects
```

It scans **only the folder(s) the user points it at** (the current directory by default, never the whole disk),
discovers every `package.json` below it, and opens a browser UI showing a **matrix**:
one row per package, one column per project. Each cell shows the version in use, colored by its distance
from the latest release (patch / minor / major), with buttons to update one project or many.

**Identity in three words:** visual · local · multi-project.
This is what sets us apart from `npm-gui` (single project), `ncu` / `taze` (terminal only), and Renovate / Dependabot (cloud).
Reject any decision that weakens one of the three.

## The core (read this before anything else)

**In one sentence:** the first tool that shows every package of every project you have on a single screen.

Every existing tool answers _"what is outdated in this project?"_.
DepBoard answers a question no tool has answered: _**"what is happening across all my projects at once?"**_

### The aha moment is the product

A developer runs DepBoard for the first time and discovers that React is used at **three different versions across seven projects**,
and that a package with a known vulnerability sits in **four of them** without anyone noticing.
That moment is what earns the star and the shared link. **Any feature that doesn't serve this moment is secondary.**

Why it pulls developers in:

- **A pain everyone knows and nobody has solved:** every developer has a folder of old, side, and client projects. Everyone knows they're behind, and nobody opens them one by one to check.
- **Instant value at zero cost:** one command, no account, no config, no code uploaded anywhere. Results in seconds.

### What is NOT the core (even though it matters)

- **The update button:** npm-gui, ncu, and others already have one. It's what _keeps_ users, not what _brings_ them.
- **A pretty UI:** it helps, but npm-gui has a UI and never spread.
- **Multiple package managers:** expected, taken for granted.

### How we protect the core

1. **The matrix is the first thing on screen.** No welcome page, no project list, no dashboard in front of it.
2. **Drift is surfaced at the top**, in plain sentences: _"react is used at 3 different versions"_, _"lodash has a vulnerability in 4 projects"_.
   These sentences are what people screenshot and share.
3. **The README GIF shows this exact moment of discovery**, not usage steps.
4. **Time to first insight ≤ 10 seconds** for a typical projects folder. Speed is part of the promise.
5. **The feature filter:** before building anything, ask _"does this make the full picture clearer?"_. If not, defer it.

### How we talk about it

Never: _"a tool to manage npm packages"_ (that describes a tool).
Always: _**"Discover what's hiding in your projects in 10 seconds."**_ (that promises a moment of discovery).

## Golden rules (no exceptions)

1. **Security first:** the server listens on `127.0.0.1` only. Reject every request that lacks the token or has an invalid `Origin` / `Host`.
   User input never reaches a shell. See [docs/agent/security.md](docs/agent/security.md).
2. **The browser never touches files or the external network:** every operation goes through the local server.
3. **MVP scope discipline:** v0.1 is project discovery, the matrix view with drift and vulnerability insights, and single updates.
   Don't add a later-phase feature unless explicitly asked. Every feature must pass the feature filter above.
4. **Zero config:** the command must work without a config file. Every new option needs a sensible default.
5. **Windows is first-class from day one:** use `path` and `execa`. Never hand-build paths with `/`, and never assume bash.
6. **Shared types live only in `packages/shared`:** never duplicate a type between server and web.
7. **Never declare a task done** until `pnpm lint && pnpm typecheck && pnpm test` passes.
8. **Do no harm:** read-only by default. Nothing is written to a user's project without an explicit, confirmed update. See [engineering-standards.md](docs/agent/engineering-standards.md).
9. **No AI attribution:** never list Claude or any AI as author, co-author, or contributor: no commit trailers, no PR footers, nothing in package.json / LICENSE / docs. See [workflow.md](docs/agent/workflow.md).

## Agent file map

Read the specialized file **before** working in its area:

| File                                                                       | Read when                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------- |
| [docs/agent/engineering-standards.md](docs/agent/engineering-standards.md) | **Always.** The quality bar: gates every change must pass |
| [docs/agent/architecture.md](docs/agent/architecture.md)                   | Changing structure, packages, or data flow                |
| [docs/agent/api.md](docs/agent/api.md)                                     | Adding or changing an endpoint or the WebSocket contract  |
| [docs/agent/security.md](docs/agent/security.md)                           | Any server code, command execution, or path handling      |
| [docs/agent/ui-ux.md](docs/agent/ui-ux.md)                                 | Any work in `packages/web`                                |
| [docs/agent/coding-standards.md](docs/agent/coding-standards.md)           | Before writing any code                                   |
| [docs/agent/tooling.md](docs/agent/tooling.md)                             | Commands, the tech stack, adding a dependency             |
| [docs/agent/testing.md](docs/agent/testing.md)                             | Writing or running tests                                  |
| [docs/agent/workflow.md](docs/agent/workflow.md)                           | How to work, git, the definition of done                  |
| [docs/agent/documentation.md](docs/agent/documentation.md)                 | Writing README, docs, comments, or ADRs                   |
| [docs/agent/roadmap.md](docs/agent/roadmap.md)                             | Current phase and what is in scope                        |

## Repository layout (short)

```
depboard/
├── packages/
│   ├── cli/       # entry point: npx depboard <path>
│   ├── server/    # Fastify: scanner/ registry/ adapters/ routes/
│   ├── web/       # React + Vite + TanStack Table + Tailwind
│   └── shared/    # shared TypeScript types and schemas
├── docs/agent/    # specialized agent guides
├── docs/adr/      # architecture decision records
└── .github/workflows/
```

## Core commands

```bash
pnpm install          # install all packages
pnpm dev              # server + web in dev mode
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit across packages
pnpm test             # Vitest
pnpm test:e2e         # Playwright
pnpm build            # build all packages
```

## Current status

- **Phase:** 0, foundation before the MVP (see [roadmap.md](docs/agent/roadmap.md)).
- **Name:** `depboard` is free on npm (checked 2026-11-20). The `depboard` GitHub account is taken, so the repo lives under the owner's account.
- **Open questions, tentatively resolved:** Windows is supported in 0.1. The UI ships in English first, with the code ready for i18n and RTL.

## Language

Everything in the repository is in **English**: code, comments, commit messages, README, and all docs (including this file and `docs/agent/`).
