# UI guidelines

The rules behind DepBoard's interface. Every visible change is reviewed against them.

> The question behind every decision: **can a developer see the differences between their projects
> at a glance?** Within seconds of launch they should read a sentence like _"react is used at 3
> different major versions"_ and think "I had no idea."

## Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◎ DepBoard              [ 📁 ~/projects · 7 projects ]        [search] [Rescan] │  header
├──────────────────────────────────────────────────────────────────────────────┤
│ What's hiding in your projects   🛡 7 vulnerable  ↳ 6 different versions  🕓 5 │  findings
│ ┌ Known vulnerabilities (7) ┐ ┌ Different versions (6) ┐ ┌ Majors behind (5) ┐ │
│ │ lodash has 4 known …      │ │ react is used at 3 …    │ │ react is up to 3 … │ │
├──────────────────────────────────────────────────────────┬───────────────────┤
│ PACKAGE        LATEST   admin   api    blog   portal …    │                   │
│ react  ↳ 3 versions 19.3.1  17.0.2 ↑major  18.3.1 ↑major │   Details          │  matrix +
│ lodash         4.18.1   4.17.20 ↑minor 🛡high …          │   (reserved)       │  drawer
├──────────────────────────────────────────────────────────┤                   │
│ How far behind: ✓ ↑patch ↑minor ↑major ?   How dangerous: 🛡low … │            │  legend
└──────────────────────────────────────────────────────────┴───────────────────┘
```

- **The matrix is the first screen.** No welcome page, project list, or dashboard in front of it.
- **The header** names exactly what was scanned, centered, so nobody wonders whether DepBoard read
  the whole disk. Paths inside the home folder show as `~/…`, keeping usernames out of screenshots.
- **The findings** sit above the matrix: one column per kind, the top two of each, "Show all" for the
  rest. Each finding narrows the matrix to its package and projects.
- **The drawer's space is reserved** on screens 1024 px and wider, so opening a cell never moves or
  covers the matrix.
- **The page never scrolls.** Header, findings, and legend stay put; the matrix and the drawer scroll
  inside their own areas.

## The matrix

- One row per package, one column per project. The package and "Latest" columns stay in place while
  scrolling sideways; the project headers stay in place while scrolling down.
- Rows and columns are virtualized: 500 packages × 30 projects must scroll at 60 fps.
- **No grid lines.** Rows alternate two grays (`#313131` / `#414141`); the header sits on a darker
  band.
- **An empty cell** means the project doesn't use the package, and shows nothing at all.
- **A filled cell** shows the version and up to two badges: how far behind, and how dangerous.
- **Version drift** is said in words next to the package name (`↳ 3 versions`) and shown by colored
  underlines: the same color marks the same major version.
- **Versions in italics** are estimates: the package isn't installed, so the version comes from the
  range in `package.json`.
- Default order: high and critical vulnerabilities first, then drift, then the most outdated, then
  by name.

## Badges and colors

Status colors follow the conventions developers already know
([ADR 0004](adr/0004-standard-status-colors-and-words.md)). A badge always carries a word or a symbol,
so color is never the only signal.

| How far behind | Badge     | Color        |     | How dangerous | Badge        | Color                 |
| -------------- | --------- | ------------ | --- | ------------- | ------------ | --------------------- |
| up to date     | `✓`       | gray         |     | low           | `🛡 low`      | gray                  |
| patch          | `↑ patch` | green        |     | moderate      | `🛡 moderate` | yellow                |
| minor          | `↑ minor` | yellow       |     | high          | `🛡 high`     | orange                |
| major          | `↑ major` | red          |     | critical      | `🛡 critical` | dark red, with a ring |
| unknown        | `?`       | striped gray |     |               |              |                       |

- **Brand:** grays `#313131` · `#414141` · `#525252` and the red `#CA3E47`, for the logo and primary
  buttons. The UI is dark only.
- **Clickable text looks clickable:** links and text buttons use the `link` utility, pink and always
  underlined. Matrix cells show their version in pink but without the underline, which is reserved
  for drift.
- **Tokens only.** Colors are defined once in `packages/web/src/styles/index.css`; components never
  use raw colors. Every text and badge pair meets WCAG AA contrast.

## Behavior

- **Updates show the exact command first.** A major update opens a confirmation dialog with the
  command; its confirm button uses the warning color and focus starts on "Cancel".
- **One look for every Update button.** A major update is marked by its badge, the `…` in the label,
  and the dialog, not by a different button.
- **Honest states.** One project found: a hint to include its siblings. Nothing found: suggestions of
  folders that exist. Registry or advisory failures: a notice, never a silent gap. No drift: say so.
- **Keyboard:** arrows move through the matrix, `Enter` opens a cell, `Home`/`End` and
  `PageUp`/`PageDown` jump, `/` focuses search, `Esc` closes the drawer and returns focus.
- **Accessible:** every filled cell has a full spoken label ("react in api: 18.3.1, major update
  available: 18.3.1 → 19.1.0"). Motion stays under 150 ms and respects `prefers-reduced-motion`.
- **Ready for other languages:** every string goes through `t()`, and layout uses logical properties
  (`ms-*`, `ps-*`, `start-*`), so right-to-left languages can follow.

## Code layout

```
packages/web/src/
├── app/            routing and the top-level screen
├── features/
│   ├── matrix/     grid, findings strip, drawer, update flow
│   ├── project/    one project's packages
│   └── activity/   live update output
├── components/ui/  generic pieces: Button, Alert, ConfirmDialog, icons
├── lib/            API client (adds the token), i18n, routing, paths
└── styles/         design tokens
```

Organize by feature. `components/ui` knows nothing about packages or projects. All network calls go
through `lib/api.ts`.
