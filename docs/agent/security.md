# Security

> The riskiest part of this project is that it is **a local server that runs commands on the user's machine**.
> Any website open in the user's browser can try to attack it. Security is a day-one requirement, not a later feature.

## Threat model

| Attacker                      | Attack                                      | Defense                                            |
| ----------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Malicious site in another tab | `fetch('http://127.0.0.1:PORT/api/update')` | Token + Origin check                               |
| DNS rebinding                 | A domain resolving to 127.0.0.1             | `Host` header check                                |
| Another device on the network | Connecting to the port                      | Bind to `127.0.0.1` only                           |
| Crafted package name          | `react; rm -rf ~` or `--registry=evil`      | No shell + name/version validation                 |
| Crafted path                  | `../../etc` or a symlink                    | Check the path is inside the root after `realpath` |

## Mandatory controls

### Network

- `server.listen({ host: '127.0.0.1', port })`. **Never** use `0.0.0.0` or `localhost` (it may resolve to IPv6 or something else).
- **Token:** generate it with `crypto.randomBytes(32).toString('hex')` on every launch. Require it on every HTTP request (`x-depboard-token` header) and on the WS connection (query).
  Compare with `crypto.timingSafeEqual`.
- **Origin:** accept only `http://127.0.0.1:<port>`. Any other Origin returns 403, and so does a missing Origin on a non-GET request.
- **Host:** accept only `127.0.0.1:<port>`, to block DNS rebinding.
- **No CORS:** never add `@fastify/cors`.
- Apply these controls in one global `onRequest` hook, not per route. The only exemption is the static UI assets.

### Command execution

- Only `execa(file, args, { shell: false })`. **Never** use `exec`, `execSync`, `shell: true`, or command strings.
- Validate package names with `validate-npm-package-name` (`validForOldPackages`). Reject any name starting with `-`.
- Version: `semver.valid(v)` or the literal `latest`, nothing else. No ranges, git URLs, or file paths.
- Arguments come from a fixed allowlist inside the adapter. No user-supplied flags are ever passed through.
- `cwd` must be a known project path from the scan results, looked up by `projectId`. Never accept a path from the request.

### Paths

- DepBoard scans **only** the root folder(s) the user passed (or the current directory). It never discovers or scans folders on its own.
- **Refuse** filesystem roots (`/`, any Windows drive root like `C:\`). **Warn** on the home directory and require confirmation (`--yes` or an interactive prompt).
- Suggesting common folders (`~/projects`, `~/dev`, …) when nothing is found may only check that they **exist** (`fs.stat`). It must never read or scan them without an explicit new command from the user.
- Resolve each root folder with `fs.realpath` at startup.
- Every path a service touches must be checked:
  ```ts
  const rel = path.relative(root, await fs.realpath(target));
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new ForbiddenPathError();
  ```
- On Windows, normalize case and separators before comparing.

### Data & privacy

- No telemetry. The only remote hosts we contact are the npm registry (version metadata + the bulk security-advisories endpoint) and, in Phase 2, the GitHub API for changelogs.
- The advisory request sends package names and versions only: no paths, no project names, no file contents. Say this in the README's Security section.
- Never log the token. Print the launch URL once, in the terminal only.
- The UI strips the token from the URL with `history.replaceState` as soon as it reads it.

## Checklist for every PR that touches the server

- [ ] No direct `child_process` usage outside `runner.ts`.
- [ ] Every new input has a zod schema.
- [ ] Tests prove the server rejects: a missing token (401), a bad Origin (403), and a malicious package name (400).
- [ ] No new dependency without justification (each dependency adds attack surface).

## Before 1.0

Complete a full security review (manual + `/security-review`) and enable `npm provenance` when publishing.
