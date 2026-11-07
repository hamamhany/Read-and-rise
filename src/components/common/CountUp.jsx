import React, { useState, useEffect, useRef } from 'react';

const CountUp = ({ value, duration = 3000 }) => {
  const [display, setDisplay] = useState(0);
  const startRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!value || value <= 0) {
      setDisplay(0);
      return;
    }
    startRef.current = null;
    const animate = (now) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.floor(value * progress));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return <>{display}</>;
};

export default CountUp;