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
    if (isLite() || document.hidden) return;
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
      } else if (counted > 30 && total / counted > 26) {
        setLite(true, true);
      }
    };
    requestAnimationFrame(loop);
  }, delay);
}

export function initPerfMode() {
  if (typeof window === 'undefined') return;
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);

  try {
    const p = new URLSearchParams(window.location.search).get('fx');
    if (p === 'full' || p === 'lite') localStorage.setItem(KEY, p);
  } catch (e) { /* لا شيء */ }

  let forced = null;
  try { forced = localStorage.getItem(KEY); } catch (e) { /* لا شيء */ }
  if (forced === 'lite') { setLite(true); return; }
  if (forced === 'full') { setLite(false); return; }

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