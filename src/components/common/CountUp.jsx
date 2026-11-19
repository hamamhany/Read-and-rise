import React, { useState, useEffect, useRef } from 'react';

// تباطؤ سلس في النهاية (Ease Out Expo)
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

const CountUp = ({ value, duration = 2200 }) => {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const fromRef = useRef(0); // آخر قيمة معروضة، حتى يكمل العدّاد من مكانه عند التحديث

  useEffect(() => {
    if (!value || value <= 0) {
      fromRef.current = 0;
      setDisplay(0);
      return undefined;
    }

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      fromRef.current = value;
      setDisplay(Math.floor(value));
      return undefined;
    }

    const from = fromRef.current;
    let start = null;

    const animate = (now) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      const current = from + (value - from) * easeOutExpo(progress);
      fromRef.current = current;
      setDisplay(Math.floor(current));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{display}</span>;
};

export default CountUp;