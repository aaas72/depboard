# Workflow

## The agent's loop for every task

1. **Understand:** read `CLAUDE.md`, the specialized guide for the area, and the relevant code. Check the current phase in [roadmap.md](roadmap.md).
2. **Check scope:** is the task in the current phase, and does it pass the feature filter ("does this make the full picture clearer?", see [roadmap.md](roadmap.md))? If not, stop and ask.
3. **Plan:** for tasks spanning more than one package, write a short plan (files to change + tests to add) before coding.
4. **Work in small steps:** type in `shared` → service → route → UI. Each step should be testable on its own.
5. **Test:** write tests alongside the code, not after it (see [testing.md](testing.md)).
6. **Verify:** `pnpm lint && pnpm typecheck && pnpm test` while iterating. Before committing a finished change, run `pnpm ci:local` (or `pnpm ci:quick` without Docker).
7. **Document:** update `api.md` or the README, or add a changeset, if user-visible behavior changed.
8. **Report honestly:** what was done, what wasn't, and what failed.

## When to ask instead of deciding

- Adding a new production dependency.
- Changing an API contract or the shape of `MatrixRow`.
- Anything that relaxes a security control.
- A feature from a later phase.
- Changing the name, the license, or the package structure.

## Git

- **Main branch:** `main`, protected. Changes merge only through PRs.
- **Branch names:** `feat/matrix-virtualization`, `fix/windows-path-scan`, `docs/readme-gif`, `chore/ci-node22`.
- **Commit messages:** [Conventional Commits](https://www.conventionalcommits.org):
  ```
  feat(server): detect package manager from lock file
  fix(web): keep first column sticky on horizontal scroll
  test(security): reject package names with shell metacharacters
  ```
  Scopes: `cli`, `server`, `web`, `shared`, `docs`, `ci`, `deps`.
- One commit = one logical change. Don't mix a refactor with a feature.
- The agent never commits or pushes unless the project owner explicitly asks.
- **No AI attribution, anywhere.** The project owner is the sole author. Never add `Co-Authored-By` trailers for an AI, "Generated with …" lines in PRs, or an AI in `author` / `contributors` (package.json), LICENSE, README, CHANGELOG, or release notes. Commits use the owner's git identity. Never change `git config user.*`.

## Pull requests

Description template:

```markdown
## What

## Why

## How to test

## Checklist

- [ ] lint / typecheck / test pass
- [ ] tests added
- [ ] changeset added (if user-facing)
- [ ] docs updated (api.md / README)
- [ ] security checklist reviewed (if server touched)
```

- Keep PRs small and focused (preferably under 400 changed lines).
- Include a screenshot or GIF for any visible UI change.

## Definition of done

- [ ] Works on Windows, macOS, and Linux (CI green on all three).
- [ ] Tests cover the new behavior and its edge cases.
- [ ] No `any`, no leftover `console.log`, no `TODO` without a linked issue.
- [ ] Security controls intact.
- [ ] Docs updated.
- [ ] Changeset present if the change is user-facing.

## Releases

- Semantic Versioning. Before 1.0, breaking changes bump `minor`.
- Run `pnpm changeset` for every PR that changes visible behavior.
- Publishing happens only through GitHub Actions. Never run `npm publish` by hand.
