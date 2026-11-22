# 0004: Standard status colors, and words instead of letters

- Status: accepted (supersedes the status colors of [0003](0003-brand-red-moves-danger-off-red.md))
- Date: 2026-11-22

## Context

ADR 0003 moved danger off red because red became the brand: major updates turned orange and
vulnerability severity purple, with one-letter badges (`P` `m` `M`, `L` `Mo` `H` `C`). Looking at the
result, the owner found the symbols unclear: `m` and `M` differ only by case, `Mo` is not a known
abbreviation, and purple for danger is no convention anyone brings with them. A badge should be
understood without the legend.

## Decision

- **Words, not letters.** Update badges read `↑ patch`, `↑ minor`, `↑ major` (a check mark when up to
  date, `?` when unknown). Vulnerability badges read the severity as `npm audit` and GitHub Advisories
  print it: a shield and `low`, `moderate`, `high`, or `critical`.
- **Standard colors.** How far behind follows `ncu` and most tools: green, yellow, red. How dangerous
  follows `npm audit` and GitHub: gray, yellow, orange, dark red (critical gets a light ring so its edge
  shows on the gray rows). Red means danger again.
- **The brand red stays the brand:** the logo, the favicon, and primary buttons. Links and clickable text
  use the lighter pink `accent`, which is not a status color.
- Matrix columns widen from 136 to 196 px to fit a version and two worded badges.

## Consequences

- A cell reads on its own: "4.17.20 ↑ minor high" needs no legend. The legend still lists every badge.
- Red appears both as the brand (primary button, logo) and as danger (major, critical). The badges
  always carry a word and sit next to a version, so they don't read as decoration, and the brand red
  is never used on a status.
- Wider columns mean fewer projects fit on screen before scrolling horizontally. The reserved drawer
  column and the column virtualizer keep this smooth.
- Every pair was rechecked for WCAG AA on the dark rows.
