# UI / UX

> The main screen is the **matrix**, because it is the whole idea. Judge every design decision by one question:
> can the developer see the differences between their projects **at a glance**?
>
> The UI exists to deliver the first-run "aha moment" (see "The core" in `CLAUDE.md`):
> within seconds of launch, the user should read a sentence like _"react is used at 3 different versions"_ and think "I had no idea."

## Stack

React 18+, Vite, Tailwind CSS, TanStack Table with `@tanstack/react-virtual` for large matrices.
For server data, TanStack Query is recommended (caching, refetching, loading states). For local UI state, use `useState` / `useReducer`.
Don't add a global state library (Redux, etc.) unless there's a real need.

## First run

- The app **opens directly on the matrix**. No welcome page, onboarding, project list, or dashboard in front of it.
- While scanning, show progress inline ("Scanning 23 projects…") and render the matrix progressively: rows appear as registry data arrives, never behind a full-screen spinner.
- The **drift strip** (below) is the first thing the eye lands on.
- The header shows which root folder(s) were scanned (e.g. "~/projects · 23 projects"), so it's obvious that only that folder was scanned, not the whole machine.
- **One project found:** render it, with a friendly banner: "Found 1 project. DepBoard shines when comparing several. Run `npx depboard ..` to include its siblings." (with a copy button).
- **No projects found:** an empty state naming the scanned folder, plus the existing common folders as copyable commands ("Try `npx depboard ~/projects`").

## Drift strip (top of the matrix)

A horizontal strip of short, plain-English insight sentences, ranked by impact. Each one is clickable and filters the matrix to the rows and projects involved.

| Insight              | Example sentence                                                | Phase |
| -------------------- | --------------------------------------------------------------- | ----- |
| Version drift        | **react** is used at **3 different versions** across 7 projects | MVP   |
| Major lag            | **typescript** is a major version behind in 5 projects          | MVP   |
| Vulnerability spread | **lodash** has a known vulnerability in **4 projects**          | MVP   |

- The server computes the insights (`insights` in `GET /api/matrix`, see [api.md](api.md)). The UI only renders them.
- Show 5 headlines by default (`pickHeadlines`: one per package, at most 3 of one kind), with a "Show all" link for the full ranked list.
- A folded family reads as one sentence ("`@angular/*` (8 packages) are …"), and expands to list its packages.
- Each sentence must stay readable as a **screenshot**: bold package name and number, no jargon, no truncation at 1280px width.
- When there's no drift, say so plainly: "All 12 projects agree on every shared package. 🎉" (an honest result is still a result).

## Screens

### 1. Matrix (main screen, default route `/`)

- The first column is sticky: package name. The second column is also sticky: "Latest". After that, one column per project.
- Project column headers stay fixed while scrolling vertically. Each shows the project name and a package-manager icon.
- **An empty cell** means the project doesn't use the package. It renders completely empty: no dash, no symbol.
- **A filled cell** shows the installed version plus an update-type badge, and a **vulnerability marker** (shield icon + severity letter: L / Mo / H / C) when the version has a known advisory.
  The vulnerability marker is visually separate from the update-type badge: one answers "how old?", the other "how dangerous?".
- **Virtualize** rows and columns. The matrix must stay smooth with 500 packages × 30 projects.
- Clicking a cell opens a **side drawer** with the current version, latest version, update type, advisories (title, severity, link), changelog link, and an "Update" button.
  When an advisory exists, the drawer suggests the lowest version that fixes it, if one is known.
- Top bar: search (package or project name), an "Outdated only" toggle, and a "Rescan" button.
- Default sort: high/critical vulnerabilities first, then packages with drift (most distinct versions), then most outdated (major, minor, patch), then alphabetical.
- **Version-drift highlight:** in a row where projects use different versions, cells with different versions are visibly distinguishable (e.g. a subtle distinct tint or underline per version group), separate from the update-type badge.

### 2. Overview (secondary)

Stat cards: number of projects, number of unique packages, how many are outdated (split into patch / minor / major), and vulnerabilities by severity.
Clicking a card opens the matrix with the matching filter. This is a secondary screen reached from the nav, never the landing page.

### 3. Project

Lists one project's packages, split into `dependencies` and `devDependencies`, with multi-select and an "Update selected" button.
The page itself ships in the MVP. Multi-select comes in Phase 2.

### 4. Activity log

Shows live install output over WebSocket in a monospace font, with each job's status (running / success / failed) and duration.
It opens automatically as a bottom panel when an update starts.

## Color and meaning

| Type       | Color          | Glyph | Meaning                            |
| ---------- | -------------- | ----- | ---------------------------------- |
| up to date | gray / neutral | `✓`   | No update                          |
| patch      | green          | `P`   | Usually safe                       |
| minor      | yellow / amber | `m`   | New features, should be compatible |
| major      | red            | `M`   | Possible breaking changes          |
| unknown    | striped gray   | `?`   | Data fetch failed                  |

Vulnerability severity uses its own scale (shield icon + letter), never the update-type colors:
`low` (L) · `moderate` (Mo) · `high` (H) · `critical` (C, strongest emphasis).

- **Color alone never carries meaning:** every badge has a letter or icon for color-blind users, plus a full `aria-label` ("major update available: 18.3.1 → 19.1.0").
- Define colors as tokens in `tailwind.config` (`update-patch`, `update-minor`, …). No hex values inside components.
- Contrast must meet at least WCAG AA in both dark and light themes.

## Binding design decisions

1. **Confirm before any major update:** a dialog shows **the exact command that will run** (from `commands[].display` in the API) and the changelog link.
   The confirm button uses a warning color, and focus defaults to "Cancel".
2. **Dark and light themes:** follow `prefers-color-scheme` by default, with a toggle saved in `localStorage`.
3. **RTL-ready:** use Tailwind logical utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) instead of `ml` / `mr` / `left` / `right`.
   All strings go through a simple i18n layer from day one, even while English is the only language.
4. **Keyboard:** arrow keys move around the matrix, `Enter` opens a cell, `/` focuses search, `Esc` closes the drawer.
5. **Clear empty and error states:** see the single-project and no-project cases under "First run". A registry or advisory failure shows a non-blocking alert.
6. **No distracting motion:** keep transitions short (150ms or less) and respect `prefers-reduced-motion`.

## Code layout

```
packages/web/src/
├── app/            # routing, providers
├── features/
│   ├── matrix/     # MatrixTable, MatrixCell, CellDrawer, DriftStrip, useMatrix
│   ├── overview/
│   ├── project/
│   └── activity/   # useLogStream (WebSocket)
├── components/ui/  # generic: Badge, Button, Dialog, Drawer
├── lib/            # api client (attaches the token), i18n, format
└── styles/
```

- Organize by **feature**, not by file type.
- `components/ui` components know nothing about the domain.
- All network calls go through `lib/api.ts`.
