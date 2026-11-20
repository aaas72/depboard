export type Theme = 'system' | 'light' | 'dark';

const THEME_KEY = 'depboard.theme';
const ORDER: readonly Theme[] = ['system', 'light', 'dark'];

/** The saved choice, or "system" (follow prefers-color-scheme). */
export function storedTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Applies a theme to <html data-theme> (see styles/index.css) and remembers it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    if (theme === 'system') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not saved, but still applied for this visit.
  }
}

export function nextTheme(theme: Theme): Theme {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? 'system';
}
