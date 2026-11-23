---
'depboard': minor
---

Monorepos show as one project. A folder with a `workspaces` field (npm, yarn, bun) or a `pnpm-workspace.yaml` becomes one column, named after its root, with the dependencies of all its packages and none of the links between them. When its packages use one dependency at different versions, the cell shows the most at-risk one and the details list each package's version.
