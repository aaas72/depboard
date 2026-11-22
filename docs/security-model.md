# Security model

DepBoard is a local server that can run `npm install` on your machine. Any website open in your
browser can try to talk to it. This page is the threat model and the controls that answer it.
Every change to the server must keep them; reviewers check them on every pull request.

To report a vulnerability, see [SECURITY.md](../SECURITY.md). Please don't open a public issue.

## Threat model

| Attacker                      | Attack                                              | Defense                                                   |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| A website in another tab      | `fetch('http://127.0.0.1:PORT/api/update', …)`      | Per-launch token in a header, Origin check                |
| DNS rebinding                 | A domain that resolves to 127.0.0.1                 | `Host` header check                                       |
| Another device on the network | Connecting to the port                              | The server listens on `127.0.0.1` only                    |
| A crafted package name        | `react; rm -rf ~`, `--registry=http://evil`         | No shell, ever; strict name and version validation        |
| A crafted path                | `../../etc`, or a symlink out of the scanned folder | Projects are looked up by id from the scan, never by path |
| A leaked launch URL           | Token in browser history, a referrer, a screenshot  | Token moved out of the URL at once, `no-referrer`         |

## Network

- The server binds to `127.0.0.1`, never `0.0.0.0` and never `localhost` (which can resolve to
  another interface).
- A token of 32 random bytes is generated on every launch. Every `/api` request must carry it in
  the `x-depboard-token` header; it is compared in constant time. It is never accepted in a query
  string, so it can't leak through logs or history.
- `Origin` must be exactly `http://127.0.0.1:<port>`. A request with another Origin, or a write
  without one, gets 403.
- `Host` must be exactly `127.0.0.1:<port>`, which stops DNS rebinding.
- No CORS, ever.
- One global guard (`server/src/security/guard.ts`) applies these checks, deciding by the **matched
  route**, not the raw URL, so encodings such as `/%61pi/matrix` can't slip past. Unknown routes need
  the token too.
- Every response carries `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, and `Cross-Origin-Resource-Policy: same-origin`; API responses
  are `Cache-Control: no-store`. Request bodies are capped at 64 KB. Errors never include stack
  traces or paths.

## Running commands

- `server/src/updates/runner.ts` is the only place a process starts: `execa(file, args)` with
  `shell: false`. No `exec`, no command strings. (The CLI's browser opener is the one other,
  fixed-argument exception.)
- Package names are validated against npm's rules, and names starting with `-` are rejected, so a
  name can never become a flag. An update only accepts a package the project already declares.
- Versions must be exact SemVer (or `latest`, resolved by the server). No ranges, URLs, or paths.
- The working directory is a project path from the scan, looked up by its id. A request never
  supplies a path.
- A major update requires an explicit confirmation flag; the UI sends it only after the user
  confirms a dialog that shows the exact command.

## Files

- DepBoard reads only inside the folders you pass (or the current folder). It never discovers or
  scans other folders on its own. When it finds nothing, it may suggest common folders such as
  `~/projects`, after checking only that they exist.
- Drive roots are refused; the home folder needs confirmation.
- Symlinks are never followed during the scan. Package names are validated before any path is built
  from them, so `../../x` can't read outside `node_modules`.
- Nothing is ever written to a project except by a confirmed update.

## Privacy

- No telemetry, now or later. If usage data is ever considered, it must be opt-in and decided in an
  ADR.
- Outgoing requests: the npm registry, for each package's latest version, and its advisory
  endpoint, for the installed versions. Package names and versions only: never paths, project names,
  or file contents.
- Private and internal packages stay private: `workspace:`, `file:`, `link:`, git, URL, `npm:`
  alias, and `catalog:` dependencies are never sent to the public registry.
- The token is printed once, in the terminal, and never logged.

## Supply chain

- The published package bundles its dependencies and has no install scripts. A build step fails on
  any bundled dependency whose license isn't on the permissive allowlist, and ships every notice in
  `dist/THIRD_PARTY_LICENSES.md`.
- `pnpm-lock.yaml` is committed and CI installs with `--frozen-lockfile`. GitHub Actions are pinned
  to commit SHAs.
- A package-contents check fails CI if anything other than `dist`, the README, and the license
  would be published.

## Checklist for pull requests that touch the server

- [ ] No new process spawning outside `updates/runner.ts`.
- [ ] Every new input is validated with a schema.
- [ ] Tests show the server still rejects a missing token (401), a bad Origin or Host (403), and a
      malicious package name or version (400).
- [ ] No new dependency without a reason in the PR description.
