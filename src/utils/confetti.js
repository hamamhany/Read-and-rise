// src/utils/confetti.js
// 🎉 قصاصات ملونة (Confetti) بدون أي مكتبة خارجية
let canvas = null;
let ctx = null;
let parts = [];
let raf = 0;
let last = 0;
let lastToastFire = 0;

const COLORS = ['#8b5cf6', '#38bdf8', '#f472b6', '#facc15', '#34d399', '#fb923c', '#ffffff'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '100002'
  });
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function teardown() {
  cancelAnimationFrame(raf);
  raf = 0;
  window.removeEventListener('resize', resize);
  if (canvas) canvas.remove();
  canvas = null;
  ctx = null;
}

function tick(t) {
  if (!ctx) return;
  const dt = Math.min((t - last) / 16.67 || 1, 3);
  last = t;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const drag = Math.pow(p.drag, dt);
    p.vx *= drag;
    p.vy = p.vy * drag + p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.wob += p.wobSpeed * dt;
    p.life -= dt;

    if (p.life <= 0 || p.y > window.innerHeight + 40) {
      parts.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.cos(p.wob));
    ctx.fillStyle = p.color;
    if (p.shape === 'c') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }
    ctx.restore();
  }

  if (parts.length) raf = requestAnimationFrame(tick);
  else teardown();
}

/**
 * x, y: موضع الانطلاق كنسبة من الشاشة (0..1)
 * angle: اتجاه الإطلاق بالدرجات (-90 = للأعلى، 90 = للأسفل)
 */
export function fireConfetti({
  x = 0.5,
  y = 0.3,
  count = 100,
  spread = 70,
  power = 11,
  angle = -90
} = {}) {
  if (typeof document === 'undefined' || prefersReducedMotion()) return;
  ensureCanvas();

  const ox = x * window.innerWidth;
  const oy = y * window.innerHeight;
  const room = Math.max(0, 520 - parts.length);

  for (let i = 0; i < Math.min(count, room); i++) {
    const a = ((angle + (Math.random() - 0.5) * spread) * Math.PI) / 180;
    const speed = power * (0.5 + Math.random() * 0.8);
    parts.push({
      x: ox,
      y: oy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      g: 0.26,
      drag: 0.985,
      size: 6 + Math.random() * 7,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      shape: Math.random() > 0.65 ? 'c' : 'r',
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.4,
      wob: Math.random() * Math.PI * 2,
      wobSpeed: 0.1 + Math.random() * 0.25,
      life: 90 + Math.random() * 70
    });
  }

  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

/** احتفال كبير: مدفعان من الزوايا + انفجار من الوسط */
export function celebrate() {
  fireConfetti({ x: 0.08, y: 0.95, count: 90, spread: 55, power: 17, angle: -60 });
  fireConfetti({ x: 0.92, y: 0.95, count: 90, spread: 55, power: 17, angle: -120 });
  setTimeout(() => fireConfetti({ x: 0.5, y: 0.45, count: 110, spread: 360, power: 10, angle: -90 }), 250);
}

/** يجعل كل toast.success يُطلق قصاصات خفيفة من أعلى الشاشة */
export function installToastConfetti(toast) {
  if (!toast || toast.__fxPatched) return;
  const original = toast.success;
  toast.success = (...args) => {
    const now = Date.now();
    if (now - lastToastFire > 1500) {
      lastToastFire = now;
      try {
        fireConfetti({ x: 0.5, y: 0.08, count: 60, spread: 140, power: 6, angle: 90 });
      } catch (e) { /* لا شيء */ }
    }
    return original(...args);
  };
  toast.__fxPatched = true;
}

if (typeof window !== 'undefined') {
  window.fxCelebrate = celebrate;
}