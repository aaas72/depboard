# API & WebSocket Contracts

All routes live under `/api` and require the `x-depboard-token` header. The WebSocket takes the token in the query string.
Every input is validated with a zod schema defined in `packages/shared/src/schemas/`. The UI reuses the same schemas.

## Endpoints

| Method | Path                  | Purpose                                                                                             | Phase                |
| ------ | --------------------- | --------------------------------------------------------------------------------------------------- | -------------------- |
| GET    | `/api/projects`       | List discovered projects, the scanned roots, and a `hint` for the single-project / no-project cases | MVP                  |
| GET    | `/api/matrix`         | Matrix: packages × projects                                                                         | MVP                  |
| GET    | `/api/packages/:name` | Package details: latest, versions, changelog, vulnerabilities                                       | MVP (partial)        |
| POST   | `/api/update`         | Update a package in one or more projects                                                            | MVP (single project) |
| POST   | `/api/rescan`         | Rescan the root folder                                                                              | MVP                  |
| WS     | `/ws/logs`            | Stream install command output                                                                       | MVP                  |

## Shapes

### `GET /api/matrix`

```jsonc
{
  "projects": [
    { "id": "a1b2", "name": "web-app", "path": "C:/projects/web-app", "manager": "npm" },
  ],
  "rows": [
    {
      "name": "react",
      "latest": "19.1.0",
      "cells": {
        "a1b2": {
          "declared": "^18.2.0",
          "installed": "18.3.1",
          "updateType": "major",
          "depType": "dependencies",
          "vulnerability": null,
        },
      },
    },
  ],
  "insights": [
    {
      "kind": "version-drift",
      "package": "react",
      "versions": ["17.0.2", "18.3.1", "19.1.0"],
      "projectIds": ["a1b2", "c3d4", "e5f6"],
      "score": 0.92,
    },
  ],
  "scannedAt": "2026-11-20T10:00:00.000Z",
}
```

Optional query: `?onlyOutdated=true`.

`insights` are sorted by `score` (descending). Kinds:

- `version-drift`: the same package at 2+ distinct installed versions across projects (MVP).
- `major-lag`: a package one or more majors behind `latest` in 2+ projects (MVP).
- `vulnerable-spread`: a package with a known advisory in 1+ projects (MVP), with extra `severity` (highest found) and `advisories` (`id`, `title`, `url`) fields.

`cell.vulnerability` is `null` (no known advisory), `"unknown"` (the advisory lookup failed), or `{ "severity": "high", "count": 2 }`.

The server returns structured data only. The UI builds the sentence, so wording stays translatable.

### `POST /api/update`

```jsonc
// Request
{ "package": "react", "version": "19.1.0", "projectIds": ["a1b2"], "confirmMajor": true }
// Response 202
{ "jobId": "j_7f3c", "commands": [{ "projectId": "a1b2", "display": "npm install react@19.1.0" }] }
```

- `version` must be a valid semver version or `latest`.
- A major update without `"confirmMajor": true` is rejected with `409` and code `MAJOR_NOT_CONFIRMED`.
- In the MVP, `projectIds` accepts exactly one item. Bulk updates come in Phase 2.

### `/ws/logs?token=...`

Server-to-client messages only (JSON):

```ts
type LogEvent =
  | { type: 'job:start'; jobId: string; projectId: string; command: string }
  | { type: 'job:output'; jobId: string; stream: 'stdout' | 'stderr'; line: string }
  | { type: 'job:end'; jobId: string; status: 'success' | 'failed'; exitCode: number | null };
```

## Error format (uniform)

```json
{ "error": { "code": "INVALID_PACKAGE_NAME", "message": "Human readable message" } }
```

| Status | When                                                                   |
| ------ | ---------------------------------------------------------------------- |
| 400    | Validation failed (zod)                                                |
| 401    | Missing or wrong token                                                 |
| 403    | Disallowed `Origin` / `Host`, or a path outside the root folder        |
| 404    | Unknown project or package                                             |
| 409    | Conflict: major not confirmed, or the project is busy with another job |
| 502    | Registry unreachable                                                   |

## Rules for adding an endpoint

1. Define the schema and type in `shared` first.
2. Add the route in `server/src/routes/` as a thin layer.
3. Add route tests, **including a 401 test without a token and a 403 test with a bad Origin**.
4. Update this file.
