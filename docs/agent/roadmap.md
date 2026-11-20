# Roadmap & Scope

> Part-time (~10 hours/week): MVP in about 5 weeks, 1.0 in about 16 weeks.
> **Don't start a phase until the release criterion of the previous one is met.** Durations are estimates.

**Current phase: 0 (foundation).**
When a phase ends, update this line and the "Current status" section in `CLAUDE.md`.

## Phase 0: foundation

- [x] Check that the name `depboard` is available on npm (free) and GitHub (the account name is taken, so the repo lives under the owner's account)
- [x] Create the repo: pnpm workspaces with `cli`, `server`, `web`, `shared`
- [x] Set up strict TypeScript, ESLint, Prettier, and Vitest
- [x] CI on all three platforms (written, not yet run on GitHub)
- [x] LICENSE (MIT) + initial README + CONTRIBUTING
- [ ] First commit and push to GitHub (owner)
- [ ] Confirm CI is green on GitHub

## Phase 1: MVP → `0.1.0` (~5 weeks)

The MVP exists to deliver the first-run aha moment. These capabilities only:

- [x] **Root selection:** current directory by default, explicit path(s), refuse drive roots, warn on home, single-project and no-project hints
- [x] **Project discovery:** scanner + manager detection (walks up to the workspace lock file) + installed versions
- [x] **Version service:** registry client (`/latest` manifests) + 15-minute cache + concurrency limit + retry/timeout
- [ ] **Matrix view:** opens directly on launch, sticky columns, virtualization, P/m/M coloring, search, and "Outdated only"
- [x] **Vulnerabilities (data):** one bulk advisory request for all projects, matched per installed version (direct dependencies only)
- [ ] **Vulnerabilities (UI):** a severity marker per cell, advisory details in the drawer
- [x] **Insights (data):** `vulnerable-spread`, `version-drift`, and `major-lag`, ranked, with family grouping and diverse headlines
- [ ] **Insights (UI):** the drift strip at the top of the matrix
- [ ] **Performance budget:** ≤ 10 s to first insight for ~30 projects (cold cache)
- [ ] **Single-project update:** npm adapter, major confirmation, output streamed over WebSocket
- [ ] **Security controls:** 127.0.0.1, token, Origin/Host checks, input validation
- [ ] Third-party license notices for bundled dependencies (see docs/adr/0001)
- [ ] Record the discovery-moment GIF, write the README, publish

**Release criterion:** `npx depboard <path>` works on Windows, macOS, and Linux against 10 real projects without errors,
and on the author's real projects folder it surfaces at least one drift insight the author didn't know about.

## Phase 2: adoption → `0.x`

Ordered by how much each item strengthens the aha moment:

1. **Exact versions from lock files** (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`) for projects without `node_modules`: turns estimates and "unknown" vulnerability cells into real answers. Old, never-installed projects are exactly our audience.
2. Workspaces / monorepo support (more projects in the picture)
3. Remembered roots (`~/.depboard/config.json`) + "Add folder" in the UI
4. Transitive vulnerabilities (from the lock file, not just direct dependencies)
5. pnpm, yarn, and bun adapters
6. Bulk updates (one package across all projects, or all patches at once)
7. Changelog links from GitHub Releases
8. Multi-select on the project page

- Changelog links from GitHub Releases
- Workspaces / monorepo support
- Multi-select on the project page

## Phase 3: maturity → `1.0.0` (~week 16)

- Version alignment: suggest a single version for a package used at different versions (turns a drift insight into an action)
- Unused dependency detection (depcheck)
- Rollback: back up `package.json` and the lock file before every update
- Run tests automatically after an update
- Full security review before 1.0

## Phase 4: post-1.0

- VS Code extension or desktop app (Tauri) reusing the same UI
- Full Arabic UI (RTL)

## The feature filter

Before adding anything to any phase, ask: **"does this make the full picture clearer?"**

- Yes → it can be scheduled.
- No, but it helps users act on what they've seen (update, rollback) → it supports retention. Schedule it after the items that do pass.
- No → defer it, however nice it is.

## Success metrics (first 6 months)

| Metric                                    | Target |
| ----------------------------------------- | ------ |
| GitHub stars                              | 500    |
| Weekly npm downloads                      | 1,000  |
| External contributors                     | 10     |
| Issues open with no reply for over a week | 0      |

## Risks

| Risk                                                | Impact    | Mitigation                                     |
| --------------------------------------------------- | --------- | ---------------------------------------------- |
| Command-execution vulnerability in the local server | Very high | [security.md](security.md) + review before 1.0 |
| Major update breaks a project                       | High      | Explicit confirmation + backup + run tests     |
| Package managers behave differently                 | Medium    | Adapter layer + tests per manager              |
| Overlap with npm-gui                                | Medium    | Lead with multi-project as the identity        |
| Burnout / project stalls                            | Medium    | Small MVP + attract contributors early         |
