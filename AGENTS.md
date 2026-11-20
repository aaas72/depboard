# AGENTS.md

This repository's agent instructions live in [CLAUDE.md](CLAUDE.md).
Specialized guides are in [docs/agent/](docs/agent/). Read `CLAUDE.md` first, then the guide that matches your task.

The core: DepBoard answers _"what is happening across all my projects at once?"_. The product is the first-run "aha moment"
(e.g. "react is used at 3 different versions across 7 projects"). The matrix and its drift insights come first; anything that
doesn't make the full picture clearer is deferred.

Non-negotiables (summary):

- Server binds to `127.0.0.1` only; every request needs the session token and a valid `Origin`/`Host`.
- Never pass user input to a shell — use `execa` with an argument array and validate package names and versions first.
- MVP scope = project discovery + matrix view with drift and vulnerability insights + single update. Nothing else without explicit approval.
- Scan only the folder(s) the user gives (default: current directory). Never scan the whole disk.
- Windows is a first-class platform.
- No AI attribution anywhere: no `Co-Authored-By` trailers, no "Generated with" footers, no AI in package.json/LICENSE/docs. The owner is the sole author.
- Run `pnpm lint && pnpm typecheck && pnpm test` before declaring work done.
