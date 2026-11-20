import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'warning' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-border-strong bg-surface text-text hover:bg-surface-raised',
  /** For actions that can break something (a major update). */
  warning: 'border border-warning bg-surface text-warning hover:bg-surface-raised',
  ghost: 'text-text-muted hover:bg-surface-raised hover:text-text',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** A plain button. Always type="button" unless told otherwise, so it never submits by accident. */
export function Button({ variant = 'secondary', className = '', type, ...props }: ButtonProps) {
  return (
    <button
      type={type === 'submit' ? 'submit' : 'button'}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
