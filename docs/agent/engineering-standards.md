# Engineering Standards (the quality bar)

> DepBoard will run on thousands, possibly millions, of developer machines, inside folders full of other people's work.
> One careless release can break trust permanently. These rules are **gates, not guidelines**: work that fails one isn't done.

## 1. First principle: do no harm

- **Read-only by default.** DepBoard never writes to a user's project, except when the user explicitly confirms an update. Scanning, viewing, and insights never touch files.
- **No surprises.** Every action that changes something shows the exact command first. Nothing runs in the background without being visible in the Activity log.
- **Degrade, don't fail.** Offline? Show local data (installed-version drift needs no network) with a clear "offline" notice. One broken `package.json`? Skip it, report it, show the rest.
- **Clean exit.** On `Ctrl+C` or a closed terminal, kill child processes, close the server, and leave no lock files or half-written state.

## 2. Public contract & versioning

What we promise to keep stable (breaking it = major version):

- CLI name, arguments, flags, and exit codes.
- Machine-readable output (`--json`, when added).
- Minimum supported Node version.

What is **internal** and may change in any release: the HTTP/WS API between our own server and UI, internal package names, and file layout.
State this in the README so nobody builds on the internal API by accident.

Rules:

- Strict SemVer. Before 1.0, a breaking change bumps minor and is called out first in the changelog.
- **Deprecate before removing:** a flag gets a deprecation warning for at least one minor release before removal.
- **Never `npm unpublish`.** A bad release is fixed with a new patch, and the bad version is marked with `npm deprecate`.

## 3. Compatibility

- **Node:** `engines: ">=20.19"`. Our users run DepBoard over _old_ projects, often on older setups, so reach matters. CI tests Node 20, 22, and 24. Raising the minimum is a major change.
- **OS:** Windows, macOS, and Linux are equal. A feature that doesn't work on all three doesn't ship.
- **Terminals:** honor `NO_COLOR` and `FORCE_COLOR`. Without a TTY (CI, pipes), never prompt: fail with a clear message telling the user to pass `--yes`.
- **Browsers:** last 2 versions of Chrome, Edge, Firefox, and Safari.
- **Paths:** spaces, Unicode (Arabic folder names included), long Windows paths, and symlinks must all work. Fixtures cover each.

## 4. CLI conventions

```
depboard [paths...] [options]

  --port <n>      Port to use (default: random free port)
  --no-open       Don't open the browser
  --yes, -y       Skip confirmations (non-interactive use)
  --depth <n>     Max folder depth (default: 6)
  --debug         Verbose logs to stderr
  --version, -v
  --help, -h
```

- **Exit codes:** `0` success · `1` runtime error · `2` invalid usage.
- **Streams:** results and the URL go to stdout. Logs, warnings, and progress go to stderr.
- **Startup output:** short and scannable, at most 5 lines before the URL. No banners or ASCII art.
- Every flag is documented in `--help` and the README, and has a test.

## 5. Error messages

Every user-facing error answers three questions: **what happened, why, and what to do next.**

```
✖ Can't scan C:\ — DepBoard doesn't scan whole drives.
  Point it at the folder that holds your projects, e.g.:
    npx depboard C:\Users\you\projects
```

- No stack traces by default. They appear only with `--debug`.
- Never blame the user. Never print raw error objects. Never write "Something went wrong" with no detail.
- Each error has a stable `code` (see [coding-standards.md](coding-standards.md)) so issues can be searched.

## 6. Performance budgets (enforced in CI where possible)

| Budget                                           | Target                                       |
| ------------------------------------------------ | -------------------------------------------- |
| Time to first insight, cold cache, ~30 projects  | ≤ 10 s                                       |
| Time to first paint after the browser opens      | ≤ 1 s                                        |
| Matrix scroll with 500 × 30                      | 60 fps, no jank                              |
| UI bundle (gzipped, initial)                     | ≤ 250 KB                                     |
| Published package unpacked size                  | ≤ 5 MB                                       |
| Production dependencies of the published package | as few as possible; every addition justified |
| Server memory with 100 projects                  | ≤ 300 MB                                     |

A PR that breaks a budget must say so and justify it. Without a justification it doesn't merge.

## 7. Supply-chain security

We sit on developer machines, which makes us a supply-chain target. So:

- Publish only from CI, with **npm provenance** and **2FA** on the npm account.
- Pin GitHub Actions to a commit SHA, not a tag.
- Commit `pnpm-lock.yaml`. CI installs with `--frozen-lockfile`.
- **No install scripts** in our package (`preinstall` / `postinstall`).
- `files` allowlist in `package.json`. CI checks `npm pack --dry-run` so no source maps, tests, or secrets leak into the tarball.
- Keep our own dependencies updated with Renovate, so we dogfood the problem we solve.
- `SECURITY.md` with private reporting. Acknowledge reports within 72 hours.

## 8. Privacy

- **Zero telemetry**, now and later. If usage data is ever considered, it must be opt-in, documented, and decided in an ADR.
- The network sends package names and versions to the npm registry only. Paths, project names, and file contents never leave the machine.

## 9. UI quality

- Accessibility: WCAG 2.2 AA, full keyboard use, screen-reader labels. Color is never the only signal.
- Visual consistency: design tokens only, with no one-off colors, sizes, or spacings.
- Every screen has designed states for: loading, empty, partial (some data failed), error, and offline.
- **Dogfooding gate:** before every release, a maintainer runs it on their real projects folder and records the first-run experience. If anything is confusing, the release waits.

## 10. Code quality gates (required CI checks)

- `pnpm lint` with **zero warnings** (`--max-warnings 0`).
- `pnpm typecheck` in strict mode.
- `pnpm test` with the coverage thresholds from [testing.md](testing.md).
- `pnpm test:e2e`.
- Package contents check (`npm pack --dry-run`) and size budget.
- All on Windows, macOS, and Linux.

Code review, even when the reviewer is an agent:

- Does it pass the feature filter ("does this make the full picture clearer?")?
- Is every new failure mode handled and tested?
- Does it touch the server? Then the [security.md](security.md) checklist applies.
- Would a first-time user understand every new message, label, and flag?

## 11. Release engineering

- changesets → a release PR → merge → publish from CI.
- Pre-releases go to the `next` dist-tag (`npx depboard@next`) and are tested by maintainers and early users before `latest`.
- Release notes lead with what users _see_, then fixes, then internals.
- Smoke test after publishing: CI runs `npx depboard@<new-version> --version` on all three OSes.

## 12. Community responsiveness

- New issues get a first response within 7 days (success metric: 0 issues waiting longer).
- A bug report gets either a fix, a workaround, or an honest "won't fix" with the reason.
- Be kind and specific in reviews. First-time contributors get extra guidance, not extra rules.
