# Coding Standards

## TypeScript

- `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` in `tsconfig.base.json`.
- **No `any`.** Use `unknown` and narrow it, or a zod schema for external data (registry responses, package.json files, HTTP requests).
- ESM only (`"type": "module"`). Import types with `import type`.
- Define shared types only in `packages/shared`. Derive schema types with `z.infer`.
- Use `interface` for public shapes and `type` for unions and derived types.
- Use literal unions (`'patch' | 'minor'`), not `enum`.

## Naming

| Element               | Style                           | Example                 |
| --------------------- | ------------------------------- | ----------------------- |
| Files                 | kebab-case                      | `registry-client.ts`    |
| React components      | PascalCase (file and component) | `MatrixCell.tsx`        |
| Functions & variables | camelCase                       | `detectPackageManager`  |
| Types & interfaces    | PascalCase                      | `MatrixRow`             |
| Global constants      | UPPER_SNAKE                     | `REGISTRY_CACHE_TTL_MS` |
| Hooks                 | `use` + name                    | `useLogStream`          |

Prefer clear names over short ones: `installedVersion`, not `iv`.

## Structure & style

- **Small, pure functions** wherever possible. Keep side effects (fs, network, exec) at the edges.
- **async/await** only. No chained `.then` and no callbacks.
- **No classes** unless you need real internal state (e.g. the registry cache). Functions and closures are the default.
- **Export through `index.ts`** in each service folder. Code outside the folder imports only through it.
- **No default exports**, except where Vite or a config file requires them.
- **Don't write comments that explain _what_.** The code should say that. Comment only when the **why** isn't obvious.

## Errors

- Domain errors are classes extending `DepboardError`, each with a stable `code` (`INVALID_PACKAGE_NAME`, `FORBIDDEN_PATH`, …).
- The central Fastify error handler maps them to the uniform error format (see [api.md](api.md)).
- Never swallow errors silently. If you ignore one on purpose, say why in a comment.
- One failing package or project **must not** fail the whole operation. Collect the errors and return them alongside the results.

## Cross-platform (Windows / macOS / Linux)

- Always use `path.join` / `path.resolve`. Never build paths by concatenating strings with `/`.
- `fast-glob` patterns use `/`. Convert paths with `fg.convertPathToPattern` when needed.
- Don't assume `bash` or `HOME`. Use `os.homedir()`.
- Line endings: handle `\r\n` when reading command output.
- `execa` resolves `npm.cmd` on Windows. Don't append `.cmd` yourself.

## React

- Function components only, with explicitly typed props.
- No domain logic in components. Compute it on the server, in `lib/`, or in a hook.
- Use `useMemo` / `useCallback` only for a measured performance problem, or to keep table column references stable (TanStack Table needs that).
- Avoid custom CSS unless necessary. Tailwind is the default.

## Formatting

Prettier settles all formatting: 2 spaces, single quotes, semicolons, trailing commas.
Don't debate formatting in reviews. Run `pnpm format`.
