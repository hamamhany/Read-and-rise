import React, { createContext, useContext, useState } from 'react';

const ConfirmContext = createContext();

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null
  });

  const showConfirm = (title, message) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          setState({ ...state, isOpen: false });
          resolve(true);
        },
        onCancel: () => {
          setState({ ...state, isOpen: false });
          resolve(false);
        }
      });
    });
  };

  return (
    <ConfirmContext.Provider value={showConfirm}>
      {children}
      {state.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-2">{state.title}</h3>
            <p className="text-gray-300 mb-4">{state.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={state.onCancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                إلغاء
              </button>
              <button
                onClick={state.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext);