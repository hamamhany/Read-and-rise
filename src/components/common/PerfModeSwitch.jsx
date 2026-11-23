import { useEffect, useRef, useState } from 'react';
import { FaTachometerAlt } from 'react-icons/fa';
import { getPerfMode, setPerfMode, isLite } from '../../utils/perf';

// هل هناك نافذة منبثقة أو شاشة كاملة مفتوحة الآن؟
function hasOpenOverlay() {
  const els = document.querySelectorAll('.fixed.inset-0, .zoom-meeting-modal');
  for (const el of els) {
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const z = parseInt(cs.zIndex, 10);
    if (!Number.isNaN(z) && z >= 40) return true;
  }
  return false;
}

const OPTIONS = [
  { value: 'auto', title: 'تلقائي', desc: 'يختار الموقع الأنسب حسب قوة جهازك' },
  { value: 'full', title: 'قوي', desc: 'كل الرسوميات والبطاقات ثلاثية الأبعاد' },
  { value: 'lite', title: 'خفيف', desc: 'نسخة مبسطة وسريعة للأجهزة الضعيفة' }
];

export default function PerfModeSwitch() {
  const [mode, setMode] = useState(getPerfMode());
  const [lite, setLite] = useState(isLite());
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onMode = (e) => setLite(e.detail === 'lite');
    const onPref = (e) => setMode(e.detail);
    window.addEventListener('fx-mode-change', onMode);
    window.addEventListener('fx-pref-change', onPref);
    return () => {
      window.removeEventListener('fx-mode-change', onMode);
      window.removeEventListener('fx-pref-change', onPref);
    };
  }, []);

  // نفس منطق إخفاء زر الثيم: يظهر في الشاشة الرئيسية فقط وعند عدم وجود نافذة مفتوحة
  useEffect(() => {
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const path = window.location.pathname.replace(/\/+$/, '');
        setHidden(path !== '' || hasOpenOverlay());
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

  // إغلاق القائمة عند الضغط خارجها
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  if (hidden) return null;

  const choose = (value) => {
    setPerfMode(value);
    setMode(value);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="fixed bottom-5 left-[5.25rem] z-[9999]" dir="rtl">
      {open && (
        <div className="absolute bottom-14 left-0 w-64 rounded-2xl p-2 shadow-2xl border bg-white text-slate-900 border-slate-200 dark:bg-gray-900 dark:text-white dark:border-gray-700">
          <p className="text-xs font-bold px-2 py-1 text-slate-500 dark:text-gray-400">طريقة عرض الموقع</p>
          {OPTIONS.map((o) => {
            const active = mode === o.value;
            return (
              <button
                key={o.value}
                onClick={() => choose(o.value)}
                className={`w-full text-right px-3 py-2 rounded-xl transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className="block text-sm font-bold">
                  {o.title}{o.value === 'auto' ? ` (حالياً: ${lite ? 'خفيف' : 'قوي'})` : ''}
                </span>
                <span className={`block text-[11px] ${active ? 'text-indigo-100' : 'text-slate-500 dark:text-gray-400'}`}>
                  {o.desc}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title="طريقة عرض الموقع"
        aria-label="طريقة عرض الموقع"
        className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110 active:scale-95 text-white"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #4338ca)',
          border: '2px solid #818cf8'
        }}
      >
        <FaTachometerAlt size={20} />
      </button>
    </div>
  );
}