import type { ReactNode } from 'react';

/** A non-blocking notice: the page stays usable around it. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-notice-border bg-notice px-3 py-2 text-sm"
    >
      <span aria-hidden="true">⚠</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
