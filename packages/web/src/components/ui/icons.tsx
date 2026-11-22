/** Small inline icons. Decorative: the text or aria-label next to them carries the meaning. */

interface IconProps {
  className?: string;
}

export function ShieldIcon({ className = 'size-3' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 1 2.5 3v4.2c0 3.4 2.3 6.4 5.5 7.8 3.2-1.4 5.5-4.4 5.5-7.8V3L8 1Z" />
    </svg>
  );
}

export function SplitIcon({ className = 'size-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 3v4a3 3 0 0 0 3 3h7M3 13V3M10 7l3 3-3 3" />
    </svg>
  );
}

export function ClockIcon({ className = 'size-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  );
}

export function RefreshIcon({ className = 'size-3.5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
    </svg>
  );
}

export function ThemeIcon({ className = 'size-4' }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 1.5v10a5 5 0 0 1 0-10Z" />
    </svg>
  );
}

/**
 * The DepBoard mark: a lens over a grid of dots (your projects), catching the one that was
 * hiding. The same drawing as docs/media/logo.svg. Dots take the muted text color, the lens the
 * accent, so it follows the theme.
 */
const DOTS: readonly (readonly [number, number])[] = [
  [6, 6],
  [16, 6],
  [26, 6],
  [36, 6],
  [6, 16],
  [16, 16],
  [6, 26],
  [16, 26],
  [6, 36],
  [16, 36],
  [26, 36],
];

export function LogoMark({ className = 'size-7' }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <g className="fill-text-muted">
        {DOTS.map(([cx, cy]) => (
          <circle key={`${String(cx)}-${String(cy)}`} cx={cx} cy={cy} r="2.4" />
        ))}
      </g>
      <g className="fill-accent stroke-accent">
        <circle cx="29" cy="21" r="11" fill="none" strokeWidth="3" />
        <line x1="37" y1="29" x2="44.5" y2="36.5" strokeWidth="4" strokeLinecap="round" />
        <circle cx="29" cy="21" r="4.2" stroke="none" />
      </g>
    </svg>
  );
}
