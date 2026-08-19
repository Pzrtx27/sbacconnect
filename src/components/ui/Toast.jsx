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
  success: 'bg-emerald-50 border-emerald-200 text-accent-emerald dark:bg-emerald-950/85 dark:border-emerald-900/50 dark:text-accent-emerald',
  error: 'bg-red-50 border-red-200 text-accent-rose dark:bg-rose-950/85 dark:border-rose-900/50 dark:text-accent-rose',
  info: 'bg-blue-50 border-blue-200 text-brand dark:bg-blue-950/85 dark:border-blue-900/50 dark:text-brand',
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    addToast = (toast) => {
      setToasts(prev => [...prev, toast]);
      // error ค้างนานกว่า เพราะมักเป็นข้อความยาวที่ต้องอ่านแล้วตัดสินใจ
      // (เช่น "ยอดเงินคงเหลือไม่พอ ขาดอีก X บาท") 3 วิ อ่านไม่ทัน
      const ms = toast.type === 'error' ? 6000 : 3000;
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, ms);
    };
  }, []);

  return (
    /* aria-live: ให้ screen reader อ่านข้อความแจ้งเตือนออกมาเอง
       ไม่งั้นคนที่ใช้ screen reader จะไม่รู้เลยว่าสั่งซื้อสำเร็จหรือเงินไม่พอ */
    <div
      className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
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
              <Icon size={18} strokeWidth={2.5} aria-hidden="true" />
              <span className="text-sm font-semibold flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                aria-label="ปิดการแจ้งเตือน"
                /* -m-2 + p-2 = ขยายพื้นที่กดเป็น ~33px โดยหน้าตาไม่เปลี่ยน
                   ของเดิม 17px เล็กกว่าเกณฑ์ WCAG 2.5.8 (24px) และกดยากบนมือถือ */
                className="-m-2 p-2 rounded-full transition-colors hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
