import { useEffect, useState } from 'react';
import { getStoredTheme, setTheme } from '../../utils/theme';

// هل هناك نافذة منبثقة أو شاشة كاملة مفتوحة الآن؟ (طبقة ثابتة تغطي الشاشة)
function hasOpenOverlay() {
  const els = document.querySelectorAll('.fixed.inset-0, .zoom-meeting-modal');
  for (const el of els) {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const z = parseInt(cs.zIndex, 10);
    // الطبقات الخلفية الدائمة (z-index منخفض) لا تُعدّ نافذة
    if (!Number.isNaN(z) && z >= 40) return true;
  }
  return false;
}

export default function ThemeToggle() {
  const [theme, setLocalTheme] = useState(getStoredTheme());
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onChange = (e) => setLocalTheme(e.detail);
    window.addEventListener('theme-change', onChange);
    return () => window.removeEventListener('theme-change', onChange);
  }, []);

  // إخفاء الزر في الشاشات الفرعية: أي رابط غير الرئيسي، أو عند فتح نافذة منبثقة
  useEffect(() => {
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const path = window.location.pathname.replace(/\/+$/, '');
        const onSubPage = path !== '';
        setHidden(onSubPage || hasOpenOverlay());
      });
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', check);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('popstate', check);
    };
  }, []);

  if (hidden) return null;

  const isLight = theme === 'light';

  return (
    <button
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      title={isLight ? 'الوضع الليلي 🌙' : 'ثيم الشمس ☀️'}
      aria-label="تبديل الثيم"
      className="theme-toggle-btn fixed bottom-5 left-5 z-[9999] w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110 active:scale-95"
      style={{
        background: isLight
          ? 'linear-gradient(135deg, #38bdf8, #0ea5e9)'
          : 'linear-gradient(135deg, #1e293b, #0f172a)',
        color: isLight ? '#ffffff' : '#fbbf24',
        border: isLight ? '2px solid #0ea5e9' : '2px solid #334155',
      }}
    >
      {isLight ? (
        // شمس
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ) : (
        // قمر
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}