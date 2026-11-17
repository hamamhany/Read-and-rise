const THEME_KEY = 'readandrise_theme';

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'dark';
  return localStorage.getItem(THEME_KEY) || 'dark';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const isLight = theme === 'light';
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(isLight ? 'theme-light' : 'theme-dark');
  // يفعّل/يعطّل كلاسات Tailwind من نوع dark: ليتبع الثيم المختار فقط (وليس إعداد الجهاز)
  root.classList.toggle('dark', !isLight);
  root.style.colorScheme = isLight ? 'light' : 'dark';
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('theme-change', { detail: theme }));
}

export function initTheme() {
  applyTheme(getStoredTheme());
}