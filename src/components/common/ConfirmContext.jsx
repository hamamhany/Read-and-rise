import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const ConfirmContext = createContext();

export const ConfirmProvider = ({ children }) => {
  const [confirmState, setConfirmState] = useState({
    isOpen: false, title: '', message: '', onConfirm: null, onCancel: null
  });
  const [promptState, setPromptState] = useState({
    isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null, onCancel: null
  });

  const showConfirm = (title, message) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true, title, message,
        onConfirm: () => {
          setConfirmState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
          resolve(true);
        },
        onCancel: () => {
          setConfirmState({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
          resolve(false);
        }
      });
    });
  };

  const showPrompt = (title, message, defaultValue = '') => {
    return new Promise((resolve) => {
      setPromptState({
        isOpen: true, title, message, defaultValue,
        onConfirm: (value) => {
          setPromptState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null, onCancel: null });
          resolve(value);
        },
        onCancel: () => {
          setPromptState({ isOpen: false, title: '', message: '', defaultValue: '', onConfirm: null, onCancel: null });
          resolve(null);
        }
      });
    });
  };

  return (
    <ConfirmContext.Provider value={{ confirm: showConfirm, prompt: showPrompt }}>
      {children}

      {confirmState.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-gray-700 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">{confirmState.title}</h3>
            <p className="text-gray-300 mb-4 whitespace-pre-line text-sm leading-relaxed">{confirmState.message}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={confirmState.onCancel} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition">إلغاء</button>
              <button onClick={confirmState.onConfirm} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white text-sm font-bold transition">تأكيد</button>
            </div>
          </div>
        </div>
      )}

      {promptState.isOpen && (
        <PromptInner
          title={promptState.title}
          message={promptState.message}
          defaultValue={promptState.defaultValue}
          onConfirm={promptState.onConfirm}
          onCancel={promptState.onCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
};

const PromptInner = ({ title, message, defaultValue, onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-gray-700 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        {message && <p className="text-gray-300 mb-3 text-sm">{message}</p>}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 mb-4 text-sm text-right"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm(value);
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm transition">إلغاء</button>
          <button onClick={() => onConfirm(value)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-bold transition">تأكيد</button>
        </div>
      </div>
    </div>
  );
};

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  return ctx.confirm;
};

export const usePrompt = () => {
  const ctx = useContext(ConfirmContext);
  return ctx.prompt;
};