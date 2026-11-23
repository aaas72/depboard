# Troubleshooting and FAQ

## The browser didn't open

Open the `➜ Open:` link the terminal printed. On a server or in a container there is no browser to
open: use `--no-open` and open the link from a machine that can reach it, or use `--summary` for
terminal output only.

## The page says "This page needs the link DepBoard printed"

The link's token changes every time DepBoard starts. You opened an old link, or DepBoard was
restarted. Use the link from the current run in the terminal.

## Many versions are in italics, or vulnerabilities show as unknown

Those projects have no `node_modules`, so DepBoard can only estimate the version from the range in
`package.json`, and can't check an estimate for vulnerabilities. Run `npm install` (or your package
manager's install) in those projects and press **Rescan**. Reading exact versions from lock files,
without installing, is on the [roadmap](../roadmap.md).

## Some packages show `?`

The npm registry couldn't be reached for them (a timeout or a network error). A notice at the top of
the screen says how many. Press **Rescan** to try again. Private packages that aren't on the public
registry show no badge at all: there is no public version to compare against.

## A project is missing

- It may be deeper than 6 folders: try `--depth 10`.
- DepBoard skips `node_modules`, `dist`, `build`, `coverage`, `out`, `vendor`, Python virtualenvs,
  and every hidden folder (`.git`, `.next`, …).
- Symbolic links are never followed.
- A `package.json` that can't be read is skipped and listed in a notice at the top of the screen.

## How does DepBoard show a monorepo?

As one project, the way you think of it. A folder with a `workspaces` field in its `package.json`
(npm, yarn, bun) or a `pnpm-workspace.yaml` (pnpm) becomes one column, whose header says how many
packages it brings together (`pnpm · monorepo, 5 packages`). Dependencies between its own packages
are left out. When its packages use one dependency at different versions, the cell shows the most
at-risk one and the details panel lists each package's version. Updating from DepBoard inside a
monorepo comes in a later version.

## Why can't I update a pnpm, yarn, or bun project?

DepBoard updates npm projects only for now, and shows you the command for the others. See
[Updating packages](updating.md).

## Does DepBoard upload my code?

No. It sends package names and versions to the npm registry, and nothing else. See
[Privacy and security](privacy-and-security.md).

## How is DepBoard different from `npm outdated`, ncu, or Dependabot?

They look at one project, or one repository, at a time. DepBoard looks at every project in a folder
at once, which is where version drift and vulnerabilities spread across projects become visible.

## Still stuck?

Run the command again with `--debug` and
[open an issue](https://github.com/aaas72/depboard/issues/new/choose) with the output (delete the
token from the `Open:` line first).
