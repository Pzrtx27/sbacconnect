import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

let toastId = 0;
let addToast = () => {};

// Global toast trigger
export function showToast(message, type = 'info') {
  addToast({ id: ++toastId, message, type });
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/85 dark:border-emerald-900/50 dark:text-emerald-300',
  error: 'bg-red-50 border-red-200 text-red-800 dark:bg-rose-950/85 dark:border-rose-900/50 dark:text-rose-300',
  info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/85 dark:border-blue-900/50 dark:text-blue-300',
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    addToast = (toast) => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 3000);
    };
  }, []);

  return (
    <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type] || Info;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`pointer-events-auto max-w-sm w-[90%] px-4 py-3 rounded-2xl border shadow-lg backdrop-blur-md 
                flex items-center gap-3 ${colors[toast.type] || colors.info}`}
            >
              <Icon size={18} strokeWidth={2.5} />
              <span className="text-sm font-semibold flex-1">{toast.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="p-0.5 rounded-full hover:bg-black/5"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
