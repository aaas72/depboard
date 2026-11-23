# Roadmap

## Vision

Every dependency tool answers _"what is outdated in this project?"_. DepBoard answers
_"what is happening across all my projects at once?"_, and makes the answer visible in seconds.

Three words define it, and every change is checked against them:

- **Visual.** The answer is a picture, a matrix you take in at a glance, not a wall of terminal text.
- **Local.** It runs on your machine, reads only the folders you point it at, and sends nothing but
  package names and versions to the npm registry. No account, no cloud, no telemetry.
- **Multi-project.** The unit is your folder of projects, not one repository.

## What DepBoard will not do

These are deliberate, not missing features:

- **No cloud service, account, or sign-in.** Your code and folder layout never leave your machine.
- **No telemetry,** now or later, unless one day it is opt-in, documented, and decided in public.
- **No automatic changes.** Nothing is written to a project without a confirmed action that shows the
  exact command first.
- **No pull-request bot.** Renovate and Dependabot do that well for one repository at a time.
- **No scanning of the whole disk.** Only the folders you choose.

## 0.1: the first release

The moment of discovery, done well:

- [x] Scan one or several folders; find every project and the version each one really installed
- [x] The matrix: every package × every project, with how far behind and how dangerous each cell is
- [x] Findings in plain sentences: vulnerabilities, version drift, major versions behind
- [x] Known vulnerabilities from the npm advisory database, in one request for all projects
- [x] One project's view, most urgent first
- [x] Update one package in one npm project, with the exact command shown first
- [x] A terminal summary (`--summary`) for scripts and CI
- [x] Windows, macOS, and Linux; Node 20.19+
- [ ] Published to npm

## 0.x: wider and more exact

Ordered by how much each makes the picture clearer:

1. **Exact versions from lock files** for projects that were never installed, turning estimates and
   "unknown" vulnerability cells into real answers. Old, never-installed projects are exactly who
   DepBoard is for.
2. **Updates inside monorepos.** Monorepos already show as one project; updating the right
   package inside one comes next.
3. **Remembered folders** and an "Add folder" action in the UI.
4. **Vulnerabilities in transitive dependencies,** read from the lock file.
5. **Updates for pnpm, yarn, and bun projects.**
6. **Bulk updates:** one package across every project, or all patch updates at once.
7. **Changelog links** from GitHub Releases, next to each update.
8. **Machine-readable output** (`--json`) for scripts and dashboards.

## 1.0: confidence

- **Version alignment:** suggest one version for a package used at several, turning a drift finding
  into an action.
- **Unused dependency detection.**
- **Rollback:** back up `package.json` and the lock file before every update.
- **Run the project's tests** after an update, and report the result.
- A full, independent security review before 1.0.

## Later

- An editor extension or a desktop app reusing the same UI.
- Translations, including right-to-left languages (the UI is already built for them).

## Have an idea?

Open a [feature request](https://github.com/aaas72/depboard/issues/new/choose) or start a
[discussion](https://github.com/aaas72/depboard/discussions). Tell us what you wanted to see across
your projects; that is the part that decides priority.
