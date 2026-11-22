# Privacy and security

DepBoard runs on your machine, inside folders full of your work. Here is exactly what it does and
doesn't do.

## What leaves your machine

Two kinds of requests, both to the public npm registry (`registry.npmjs.org`):

1. **The latest version of each package,** by name.
2. **Known vulnerabilities for the installed versions,** as package names and version numbers, in one
   request. This is the same database `npm audit` uses.

That is all. **Never** your file paths, project names, folder layout, or file contents. No
telemetry, no account, no analytics.

Dependencies that point somewhere private (`workspace:`, `file:`, `link:`, git URLs, `npm:` aliases,
`catalog:`) are never looked up on the public registry, so internal package names don't leak.

An update you confirm runs `npm install`, which talks to the registry the way npm always does.

## What DepBoard reads and writes

- It **reads** only inside the folders you give it: `package.json` files, and the `package.json` of
  each installed dependency in `node_modules` to learn its version.
- It **writes** nothing, ever, except through an update you confirm in the UI, and that update is
  `npm install` run in that one project.
- It keeps everything in memory. When you stop it, nothing is left behind: no cache, no config file,
  no log.

## How the local server is protected

The browser UI talks to a small server DepBoard starts on your machine. Any website you have open
could try to reach it, so:

- It listens on `127.0.0.1` only, so other devices on your network can't connect.
- Every request needs a token created fresh for this run. The token is in the link the terminal
  prints; the UI moves it out of the address bar immediately.
- Requests from other websites are refused (Origin and Host checks), which also stops DNS rebinding.
- Commands run without a shell, for a package the project already declares, at an exact version.
  A crafted package name can't become a command.

The full threat model, for reviewers and contributors, is in the
[security model](../security-model.md).

## Found a vulnerability?

Please report it privately; see [SECURITY.md](../../SECURITY.md).
