import { createContext, useContext, useState, useCallback, useRef } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const resolveRef = useRef(null);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfirmDialog({
        title: options.title || 'Confirm Action',
        message: options.message || 'Are you sure?',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        danger: options.danger !== false,
      });
    });
  }, []);

  const handleConfirm = () => {
    resolveRef.current?.(true);
    setConfirmDialog(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setConfirmDialog(null);
  };

  return (
    <AppContext.Provider value={{ toasts, addToast, removeToast, confirm }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={`pointer-events-auto toast-enter flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border min-w-[280px] max-w-[400px] cursor-pointer
              ${toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-700 text-emerald-200' :
                toast.type === 'error' ? 'bg-red-900/90 border-red-700 text-red-200' :
                toast.type === 'warning' ? 'bg-amber-900/90 border-amber-700 text-amber-200' :
                'bg-slate-800 border-slate-600 text-slate-200'}`}
          >
            <span className="text-lg">
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : toast.type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <p className="text-sm font-medium flex-1">{toast.message}</p>
          </div>
        ))}
      </div>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="modal-content bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-4 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${confirmDialog.danger ? 'bg-red-500/20' : 'bg-indigo-500/20'}`}>
                <span className={`text-xl ${confirmDialog.danger ? 'text-red-400' : 'text-indigo-400'}`}>
                  {confirmDialog.danger ? '⚠️' : '?'}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{confirmDialog.title}</h3>
                <p className="text-sm text-slate-400 mt-1">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button className="btn btn-secondary" onClick={handleCancel}>
                {confirmDialog.cancelText}
              </button>
              <button
                className={`btn ${confirmDialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleConfirm}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
