// src/hooks/useDynamicBackground.js
import { useEffect } from 'react';
import { getStoredTheme } from '../utils/theme';

export const useDynamicBackground = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes logoPulseSoft {
        0% { transform: scale(1); opacity: 0.12; }
        50% { transform: scale(1.04); opacity: 0.18; }
        100% { transform: scale(1); opacity: 0.12; }
      }
      .animate-logo-bg {
        animation: logoPulseSoft 6s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);

    const darkGradients = [
      'linear-gradient(135deg, #0f172a, #1e1b4b, #311042)',
      'linear-gradient(135deg, #090d16, #111827, #1f2937)',
      'linear-gradient(135deg, #020617, #0f172a, #1e293b)',
      'linear-gradient(135deg, #070a13, #161224, #281432)'
    ];

    const lightGradients = [
      'linear-gradient(135deg, #f4f9fd, #e0f2fe, #f8fafc)',
      'linear-gradient(135deg, #ffffff, #f0fdf4, #eff6ff)',
      'linear-gradient(135deg, #f8fafc, #e0f2fe, #f1f5f9)',
      'linear-gradient(135deg, #ffffff, #f4f9fd, #fdf4ff)'
    ];

    let currentIndex = 0;
    let interval = null;

    const applyBg = () => {
      const theme = getStoredTheme();
      const gradients = theme === 'light' ? lightGradients : darkGradients;
      document.body.style.background = gradients[currentIndex % gradients.length];
      document.body.style.transition = 'background 4s ease-in-out';
    };

    const startInterval = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        currentIndex++;
        applyBg();
      }, 7000);
    };

    const handleThemeChange = () => {
      currentIndex = 0;
      applyBg();
    };

    applyBg();
    startInterval();

    window.addEventListener('theme-change', handleThemeChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('theme-change', handleThemeChange);
      document.body.style.background = '';
      document.body.style.transition = '';
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []);
};