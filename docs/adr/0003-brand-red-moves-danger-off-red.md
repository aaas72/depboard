# 0003: A red brand, so danger moves off red

- Status: accepted; its status colors are superseded by [0004](0004-standard-status-colors-and-words.md)
- Date: 2026-11-22

## Context

The owner chose the identity palette: three neutral grays (`#525252`, `#414141`, `#313131`) and one
red, `#CA3E47`, as the main color. Until now red meant danger in DepBoard: a major update (`M`) and
high or critical vulnerabilities. With a red brand, the "Update" button would read as a warning and the
logo would blend with the danger badges, and color is how the matrix speaks.

Options: keep red for danger and use the brand red only for the logo; make red the main color and accept
the clash; or make red the main color and move danger to other colors. The owner chose the last.

## Decision

- **Brand:** `#CA3E47` as is for the logo, the favicon, and primary buttons (`brand` token; white text,
  4.9:1). For text, links, selection, and focus a lighter variant (`accent`, `#F59EA3`), readable on the
  grays.
- **Neutrals:** the three grays as they are (surface `#313131`, raised `#414141`, borders `#525252`).
  The UI is dark only (the light theme was removed on 2026-11-22).
- **How far behind:** green (patch) → yellow (minor) → **orange** (major). Still a familiar
  traffic-light order, and the letters P / m / M carry the meaning without color.
- **How dangerous:** slate (low) → brown (moderate) → **purple** (high) → **deep purple with a ring**
  (critical). The shield icon and the letters L / Mo / H / C carry the meaning without color.
- Every text and badge pair was checked for WCAG AA. The orange, purple, and
  slate badges take dark text, because white on them falls below 4.5:1.

## Consequences

- This departs from the original concept document (green / yellow / red for patch / minor / major).
  The legend under the matrix spells out every color, so the new scale is learnable on first sight.
- Red now means "DepBoard" and "act here", never "danger". New UI must not use red for warnings:
  use `warning` (orange) instead.
- Tokens live in `packages/web/src/styles/index.css`; components still use token names only.
