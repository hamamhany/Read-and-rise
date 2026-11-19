// src/components/common/EffectsLayer.jsx
// ✨ طبقة المؤثرات: شاشة بداية + خلفية حية + جزيئات + توهّج المؤشر + شريط التمرير + تموّج الأزرار + إمالة 3D
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isLite } from '../../utils/perf';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const getSplashMs = () => (isLite() ? 1200 : 1900);

/* ---------------------------------------------------------
   شاشة البداية (تُرسم خارج #root حتى لا تتأثر بالثيم)
   --------------------------------------------------------- */
const Splash = () => {
  const [phase, setPhase] = useState(() => (prefersReducedMotion() ? 'gone' : 'show'));

  useEffect(() => {
    const root = document.documentElement;
    if (phase === 'gone') {
      root.classList.remove('fx-wait');
      return;
    }
    const ms = getSplashMs();
    const t1 = setTimeout(() => {
      setPhase('leaving');
      root.classList.remove('fx-wait'); // يبدأ ظهور واجهة التطبيق بحركاتها
    }, ms);
    const t2 = setTimeout(() => setPhase('gone'), ms + 800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'gone') return null;

  return createPortal(
    <div className={`fx-splash ${phase === 'leaving' ? 'leaving' : ''}`} dir="rtl" aria-hidden="true">
      <div className="fx-splash-logo-wrap">
        <span className="fx-splash-ring" />
        <img
          className="fx-splash-logo"
          src="/images/logo.png"
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </div>
      <h1 className="fx-splash-title"> المنصة الإلكترونية </h1>
      <p className="fx-splash-sub">اقرآ وارتق</p>
      <div className="fx-splash-bar"><i /></div>
    </div>,
    document.body
  );
};

/* ---------------------------------------------------------
   الطبقة الرئيسية
   --------------------------------------------------------- */
const EffectsLayer = () => {
  const canvasRef = useRef(null);
  const glowRef = useRef(null);
  const progressRef = useRef(null);
  const pointer = useRef({ x: -9999, y: -9999 });

  // ⚡ الوضع الخفيف: بدون جزيئات ولا توهّج مؤشر (للأجهزة الضعيفة)
  const [lite, setLiteState] = useState(isLite());
  useEffect(() => {
    const onMode = (e) => setLiteState(e.detail === 'lite');
    window.addEventListener('fx-mode-change', onMode);
    return () => window.removeEventListener('fx-mode-change', onMode);
  }, []);

  /* ✦ الجزيئات المترابطة التي تتفاعل مع المؤشر */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (lite || !canvas || prefersReducedMotion()) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    let parts = [];

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.max(14, Math.min(38, Math.floor((w * h) / 34000)));
      parts = Array.from({ length: target }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1 + Math.random() * 1.8
      }));
    };

    let lastT = 0;
    const step = (t) => {
      if (!running) return;
      // نحدّد الرسم بـ 30 إطار/ثانية لتخفيف الحمل
      if (t - lastT < 33) { raf = requestAnimationFrame(step); return; }
      lastT = t;
      ctx.clearRect(0, 0, w, h);
      const light = document.documentElement.classList.contains('theme-light');
      const rgb = light ? '79,70,229' : '196,181,253';
      const linkDist = 130;
      const { x: mx, y: my } = pointer.current;

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];

        // ابتعاد لطيف عن المؤشر
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < 140 * 140 && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = (140 - d) / 140;
          p.x += (dx / d) * f * 1.6;
          p.y += (dy / d) * f * 1.6;
        }

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${light ? 0.35 : 0.55})`;
        ctx.fill();

        for (let j = i + 1; j < parts.length; j++) {
          const q = parts[j];
          const ax = p.x - q.x;
          const ay = p.y - q.y;
          const dist = ax * ax + ay * ay;
          if (dist < linkDist * linkDist) {
            const a = (1 - Math.sqrt(dist) / linkDist) * (light ? 0.18 : 0.25);
            ctx.strokeStyle = `rgba(${rgb},${a})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(step);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(step);
      }
    };

    build();
    raf = requestAnimationFrame(step);
    window.addEventListener('resize', build);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', build);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [lite]);

  /* ✦ المؤشر: توهّج + إمالة 3D للبطاقات التي عليها data-fx-tilt */
  useEffect(() => {
    const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine || lite) return undefined;

    let raf = 0;
    let tiltEl = null;
    const glow = glowRef.current;

    const resetTilt = (el) => {
      if (!el) return;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };

    const onMove = (e) => {
      pointer.current.x = e.clientX;
      pointer.current.y = e.clientY;

      if (glow && !raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          glow.style.transform = `translate3d(${pointer.current.x}px, ${pointer.current.y}px, 0)`;
          glow.classList.add('on');
        });
      }

      const el = e.target && e.target.closest ? e.target.closest('[data-fx-tilt]') : null;
      if (tiltEl && tiltEl !== el) {
        resetTilt(tiltEl);
        tiltEl = null;
      }
      if (!el) return;
      tiltEl = el;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--ry', `${(px * 8).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-py * 8).toFixed(2)}deg`);
    };

    const onLeave = () => {
      pointer.current.x = -9999;
      pointer.current.y = -9999;
      if (glow) glow.classList.remove('on');
      resetTilt(tiltEl);
      tiltEl = null;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [lite]);

  /* ✦ شريط تقدّم التمرير */
  useEffect(() => {
    const bar = progressRef.current;
    if (!bar) return undefined;
    const update = () => {
      const d = document.documentElement;
      const max = d.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = `scaleX(${p})`;
      bar.style.opacity = p > 0.01 ? '1' : '0';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  /* ✦ تموّج الضغط على أي زر (لا يغيّر الأزرار نفسها) */
  useEffect(() => {
    if (prefersReducedMotion()) return undefined;

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const btn = e.target && e.target.closest ? e.target.closest('button, .btn-primary, [role="button"]') : null;
      if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;

      const r = btn.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || r.width > 700) return;
      const cs = window.getComputedStyle(btn);

      const host = document.createElement('span');
      host.className = 'fx-ripple-host';
      Object.assign(host.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        borderRadius: cs.borderRadius,
        color: cs.color
      });

      const size = Math.max(r.width, r.height) * 2.2;
      const dot = document.createElement('span');
      dot.className = 'fx-ripple';
      Object.assign(dot.style, {
        width: `${size}px`,
        height: `${size}px`,
        left: `${e.clientX - r.left - size / 2}px`,
        top: `${e.clientY - r.top - size / 2}px`
      });

      host.appendChild(dot);
      document.body.appendChild(host);
      setTimeout(() => host.remove(), 700);
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  return (
    <>
      <Splash />
      <div className="fx-progress" ref={progressRef} aria-hidden="true" />
      <div className="fx-bg" aria-hidden="true">
        <div className="fx-blob b1" />
        <div className="fx-blob b2" />
        <div className="fx-blob b3" />
        <div className="fx-grid" />
        {!lite && <canvas className="fx-canvas" ref={canvasRef} />}
      </div>
      {!lite && <div className="fx-cursor-glow" ref={glowRef} aria-hidden="true" />}
    </>
  );
};

export default EffectsLayer;