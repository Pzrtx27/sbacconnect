import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useMyOrders } from '../../contexts/OrdersContext';

/* กล่องเด้ง "เครื่องดื่มพร้อมแล้ว" — โผล่ทันทีที่บาริสต้ากดเสร็จ ไม่ว่าอยู่หน้าไหนในแอป

   ตัวนี้ทำหน้าที่แค่ "สะกิดตอนนั้น" เท่านั้น
   ส่วนที่บอกว่ายังมีของรออยู่แบบไม่หายไปไหน คือการ์ดสีเขียวในหน้าสถานะการสั่งซื้อ
   กับตัวเลขบนแถบเมนู — สองอย่างนั้นอยู่ต่อจนกว่าจะกด "รับแล้ว"
   ป๊อปอัปอย่างเดียวไม่พอ เพราะคนที่ไม่ได้เปิดแอปค้างไว้จะไม่มีวันเห็นมัน

   ไม่ปิดตัวเองอัตโนมัติ ต้องกดปิด — ของที่ต้องลุกไปรับไม่ควรหายไปเองใน 3 วินาที */

export default function OrderAlerts() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { alertQueue, dismissAlert, markPickedUp } = useMyOrders();

  const current = alertQueue[0] || null;
  if (!current) return null;

  return createPortal(
    <ReadyDialog
      order={current}
      isDark={isDark}
      remaining={alertQueue.length - 1}
      onClose={dismissAlert}
      onPickedUp={() => {
        markPickedUp(current.id);
        dismissAlert();
      }}
    />,
    document.body
  );
}

function ReadyDialog({ order, isDark, remaining, onClose, onPickedUp }) {
  const closeRef = useRef(null);
  /* เหมือน ReadyCard: เครื่องที่เปิด "ลดการเคลื่อนไหว" อาจไม่เล่นแอนิเมชัน
     กล่องที่เริ่มด้วย opacity 0 จะกลายเป็นกล่องล่องหน — เตือนแล้วแต่ไม่มีใครเห็น */
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    closeRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-6"
      >
        <motion.div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="order-ready-title"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 340 }}
          onClick={(e) => e.stopPropagation()}
          className={`relative w-full max-w-sm rounded-3xl border shadow-glass-lg overflow-hidden text-center transition-colors duration-300 ${
            isDark ? 'bg-neutral-900 border-white/10' : 'bg-surface-card border-slate-100'
          }`}
        >
          <div className="px-7 pt-9 pb-7 space-y-4">
            <motion.div
              initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { delay: 0.08, type: 'spring', damping: 12, stiffness: 260 }
              }
              className="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-accent-emerald"
              aria-hidden="true"
            >
              <Check size={32} strokeWidth={3} />
            </motion.div>

            <div className="space-y-1">
              <h2
                id="order-ready-title"
                className={`text-xl font-black ${isDark ? 'text-white' : 'text-sbac-navy'}`}
              >
                เครื่องดื่มพร้อมแล้ว ☕
              </h2>
              <p className={`text-xs font-semibold ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
                ยื่นรหัสนี้ที่เคาน์เตอร์เพื่อรับเครื่องดื่ม
              </p>
            </div>

            {/* รหัสรับของคือสิ่งเดียวที่ต้องใช้จริงตอนเดินไปที่เคาน์เตอร์ — ให้ใหญ่ที่สุดในกล่อง
                tabular-nums กันตัวเลขขยับตอนอ่านเทียบกับจอบาริสต้า */}
            <div
              className={`rounded-2xl border py-4 transition-colors duration-300 ${
                isDark ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-accent-emerald block">
                รหัสรับของ
              </span>
              <span
                className={`text-5xl font-black tracking-tight tabular-nums block mt-1 ${
                  isDark ? 'text-white' : 'text-sbac-navy'
                }`}
              >
                #{order.pickup_code}
              </span>
            </div>

            {/* สองปุ่มแยกกันชัด ๆ เพราะมันคนละความหมาย:
                "ไว้ก่อน" = ยังไม่ได้ไปรับ ให้การ์ดสีเขียวค้างอยู่ในหน้าสถานะต่อ
                "รับแล้ว" = จบเรื่องใบนี้ เอาออกจากหน้าจอกับตัวเลขบนแถบเมนู */}
            <div className="space-y-2">
              <button
                type="button"
                ref={closeRef}
                onClick={onClose}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black py-3.5 rounded-2xl text-sm shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
              >
                รับทราบ — เดี๋ยวไปรับ
              </button>
              <button
                type="button"
                onClick={onPickedUp}
                className={`w-full font-bold py-2.5 rounded-2xl text-xs transition-colors ${
                  isDark
                    ? 'text-content-secondary hover:bg-white/5'
                    : 'text-ink-muted hover:bg-slate-100'
                }`}
              >
                รับเครื่องดื่มแล้ว
              </button>
            </div>

            {remaining > 0 && (
              <p className={`text-[11px] font-bold ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
                ยังมีอีก {remaining} ใบที่พร้อมรับ
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
