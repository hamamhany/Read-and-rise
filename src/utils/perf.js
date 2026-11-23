// src/utils/perf.js
// ⚡ وضع الأداء: يكتشف الأجهزة الضعيفة تلقائياً ويشغّل "الوضع الخفيف" (html.fx-lite)
// - للإجبار على الوضع الكامل (للعرض أمام الحكام على جهاز قوي):  أضف ?fx=full إلى الرابط
// - للإجبار على الوضع الخفيف:  ?fx=lite
const KEY = 'fx_mode';

const root = () => document.documentElement;
export const isLite = () => root().classList.contains('fx-lite');

function setLite(on, remember = false) {
  const r = root();
  if (r.classList.contains('fx-lite') === on) return;
  r.classList.toggle('fx-lite', on);
  if (remember) {
    try { sessionStorage.setItem('fx_auto_lite', '1'); } catch (e) { /* لا شيء */ }
  }
  window.dispatchEvent(new CustomEvent('fx-mode-change', { detail: on ? 'lite' : 'full' }));
}

// يقيس سلاسة الرسم؛ إذا كانت أقل من ~38 إطار/ثانية يتحول للوضع الخفيف
function probe(delay) {
  setTimeout(() => {
    if (isLite() || document.hidden || getPerfMode() !== 'auto') return;
    let n = 0;
    let last = performance.now();
    let total = 0;
    let counted = 0;
    const loop = (t) => {
      if (document.hidden) return;
      const dt = t - last;
      last = t;
      if (n > 0 && dt < 250) { total += dt; counted++; }
      n++;
      if (n <= 70) {
        requestAnimationFrame(loop);
      } else if (counted > 30 && total / counted > 26 && getPerfMode() === 'auto') {
        setLite(true, true);
      }
    };
    requestAnimationFrame(loop);
  }, delay);
}

// الاختيار المحفوظ للمستخدم: 'auto' (تلقائي) | 'full' (قوي) | 'lite' (خفيف)
export function getPerfMode() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'full' || v === 'lite' ? v : 'auto';
  } catch (e) { return 'auto'; }
}

// الكشف التلقائي حسب قوة الجهاز
function detectAuto() {
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const cores = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  const conn = navigator.connection || {};
  let autoLite = false;
  try { autoLite = sessionStorage.getItem('fx_auto_lite') === '1'; } catch (e) { /* لا شيء */ }

  const weak =
    autoLite ||
    conn.saveData ||
    mq('(prefers-reduced-motion: reduce)') ||
    cores <= 4 ||
    mem <= 4 ||
    mq('(max-width: 820px)') ||
    mq('(pointer: coarse)');

  if (weak) { setLite(true); return; }

  setLite(false);
  probe(2600);
  probe(9000);
}

// يغيّر الوضع فوراً (بدون إعادة تحميل) ويحفظ اختيار المستخدم
export function setPerfMode(mode) {
  try {
    if (mode === 'full' || mode === 'lite') localStorage.setItem(KEY, mode);
    else localStorage.removeItem(KEY);
    // عند اختيار وضع جديد نمسح نتيجة القياس القديمة ليبدأ القياس من جديد
    sessionStorage.removeItem('fx_auto_lite');
  } catch (e) { /* لا شيء */ }

  if (mode === 'lite') setLite(true);
  else if (mode === 'full') setLite(false);
  else detectAuto();

  window.dispatchEvent(new CustomEvent('fx-mode-change', { detail: isLite() ? 'lite' : 'full' }));
  window.dispatchEvent(new CustomEvent('fx-pref-change', { detail: getPerfMode() }));
}

export function initPerfMode() {
  if (typeof window === 'undefined') return;

  try {
    const p = new URLSearchParams(window.location.search).get('fx');
    if (p === 'full' || p === 'lite') localStorage.setItem(KEY, p);
  } catch (e) { /* لا شيء */ }

  const mode = getPerfMode();
  if (mode === 'lite') { setLite(true); return; }
  if (mode === 'full') { setLite(false); return; }
  detectAuto();
}