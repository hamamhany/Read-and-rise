const THEME_KEY = 'readandrise_theme';

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'dark';
  return localStorage.getItem(THEME_KEY) || 'dark';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
}

export function initTheme() {
  applyTheme(getStoredTheme());
}