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

/** The DepBoard mark: a lens catching the one thing that was hiding. Colored by `currentColor`. */
export function LogoMark({ className = 'size-5' }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <circle cx="21" cy="21" r="13" fill="none" stroke="currentColor" strokeWidth="5" />
      <line
        x1="31"
        y1="31"
        x2="42"
        y2="42"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <circle cx="21" cy="21" r="5" fill="currentColor" />
    </svg>
  );
}
