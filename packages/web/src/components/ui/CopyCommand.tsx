import { useState } from 'react';
import { t } from '../../lib/i18n.js';

/** A command shown in monospace with a copy button. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(command).then(
      () => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 1500);
      },
      () => {
        // Clipboard blocked: the command is still visible and selectable.
      },
    );
  };

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface-sunken ps-2 font-mono text-sm">
      <code className="truncate select-all">{command}</code>
      <button
        type="button"
        onClick={copy}
        className="rounded-e-md px-2 py-1 font-sans text-xs text-text-muted hover:bg-surface-raised hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span aria-live="polite">{copied ? t('action.copied') : t('action.copy')}</span>
      </button>
    </span>
  );
}
