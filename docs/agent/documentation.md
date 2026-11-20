# Documentation

> An open-source project lives or dies by the **first 30 seconds** on its GitHub page:
> does the visitor get the idea and try it right away?

## Language

All repository content is in **English**: README, CONTRIBUTING, CHANGELOG, code comments, TSDoc, ADRs, `CLAUDE.md`, and `docs/agent/*`.
An Arabic `README.ar.md` may be added later for community outreach.

## README.md: required structure

1. **Animated GIF** at the very top (under 5MB, 10–15 seconds) showing **the moment of discovery**, not usage steps:
   run the command → matrix appears → drift strip reads _"react is used at 3 different versions across 7 projects"_.
2. A one-line pitch: _**"Discover what's hiding in your projects in 10 seconds."**_
3. **The run command on one line:** `npx depboard ~/projects`
4. Features (short bullets, marking what's available and what's planned).
5. Why DepBoard? (a brief, respectful comparison with npm-gui, ncu, and Renovate).
6. Security (a short paragraph: localhost only, token, no telemetry).
7. Requirements (Node 20+).
8. Contributing, linking to CONTRIBUTING.md.
9. License: MIT.

**Not allowed in the README:** walls of text before the run command, more than 5 badges, or promised features without a "planned" label.

## Messaging (README, posts, package description, social)

Sell the discovery, not the tool.

| ❌ Describes a tool                    | ✅ Promises a discovery                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| "A tool to manage npm packages"        | "Discover what's hiding in your projects in 10 seconds."       |
| "GUI for npm outdated"                 | "You're running 3 versions of React. You just didn't know it." |
| "Update dependencies from the browser" | "One command. Every project. The whole picture."               |

- Lead with the question no other tool answers: _"what is happening across all my projects at once?"_.
- Mention the update button, package-manager support, and the UI later, as supporting points, never as the headline.
- The `description` field in `package.json` follows the same rule.

## Community files

- `CONTRIBUTING.md`: environment setup, commands, commit style, and how to add a new package-manager adapter (the clearest first contribution).
- `CODE_OF_CONDUCT.md`: Contributor Covenant.
- `SECURITY.md`: how to report a vulnerability privately (GitHub private vulnerability reporting).
- `.github/ISSUE_TEMPLATE/`: a bug report template (OS, Node version, package manager) and a feature request template.
- `.github/pull_request_template.md`: the template from [workflow.md](workflow.md).
- Label small, well-defined tasks `good first issue`.

## In-code documentation

- Write **TSDoc** only for functions exported from `shared` and for service interfaces, not for every function.
- Comments explain **why**, not **what**:
  ```ts
  // Only the `latest` manifest: the full metadata for `next` is 25 MB, this is 3 KB.
  const url = `${base}/${name}/latest`;
  ```
- No dead comments and no commented-out code. Git keeps the history.

## Architecture Decision Records (ADRs)

Record every decision that had a reasonable alternative in `docs/adr/NNNN-title.md`:

```markdown
# 0001: Use Fastify over Express

- Status: accepted
- Date: 2026-11-20

## Context

## Decision

## Consequences
```

Decisions that deserve an ADR: choosing Fastify, an in-memory cache rather than a file, the token mechanism, and installed vs. declared version.

## CHANGELOG

changesets generates it automatically. Write changeset descriptions in the user's language, not the code's:

- ✅ `Matrix now highlights projects using different major versions of the same package.`
- ❌ `refactor MatrixRow reducer`
