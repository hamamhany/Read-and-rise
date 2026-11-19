import React, { useEffect } from 'react';

export const ChoiceModal = ({ isOpen, onClose, onSelect, title, options }) => {
  // إغلاق بزر Esc
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700 shadow-2xl">
        <h3 className="text-2xl font-bold text-white text-center mb-6">{title}</h3>
        <div className="space-y-3">
          {options.map((opt, i) => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              style={{ animationDelay: `${0.12 + i * 0.07}s` }}
              className="fx-stagger w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-white font-medium text-lg transition border border-gray-600 hover:border-purple-400 flex items-center justify-center gap-2"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-gray-400 hover:text-white transition text-sm"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
};