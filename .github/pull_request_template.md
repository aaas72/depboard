## What

<!-- One or two sentences: what changes for users or contributors. -->

## Why

<!-- The problem this solves. Link the issue: "Closes #123". -->

## How to test

<!-- Steps a reviewer can follow. For UI changes, add a screenshot or GIF. -->

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass (`pnpm ci:local` if you can)
- [ ] Tests cover the new behavior and its edge cases
- [ ] A changeset is added, if users will notice the change (`pnpm changeset`)
- [ ] Docs are updated, if behavior, flags, or output changed
- [ ] Server changes keep the [security model](../docs/security-model.md) and tick its checklist
- [ ] UI changes follow the [UI guidelines](../docs/ui-guidelines.md) and include a screenshot
- [ ] New dependencies are justified above
