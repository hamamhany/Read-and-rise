import React from 'react';

export const ChoiceModal = ({ isOpen, onClose, onSelect, title, options }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700 shadow-2xl">
        <h3 className="text-2xl font-bold text-white text-center mb-6">{title}</h3>
        <div className="space-y-3">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-white font-medium text-lg transition border border-gray-600 flex items-center justify-center gap-2"
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