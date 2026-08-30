import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

/* กล่องยืนยันในหน้าเว็บ ใช้แทน window.confirm()

   ทำไมต้องเลิกใช้ window.confirm:
     กล่องของเบราว์เซอร์เด้งมาจากแถบบนสุดของหน้าต่าง หน้าตาเป็นของ Chrome
     ไม่ใช่ของแอป มีคำว่า localhost:5173 ติดมาด้วย และบางเบราว์เซอร์บนมือถือ
     ก็ซ่อนมันไว้หลังการตั้งค่า "บล็อกป๊อปอัป" จนผู้ใช้กดลบแล้วเหมือนไม่มีอะไรเกิดขึ้น
     ที่สำคัญคือมันบล็อกทั้ง thread ทำให้แอนิเมชันทุกอย่างค้างระหว่างรอคำตอบ

   ตัวนี้เป็น dialog จริง (role="dialog" + aria-modal) ปิดด้วย Esc ได้
   โฟกัสวิ่งเข้ากล่องตอนเปิดและกลับไปที่ปุ่มเดิมตอนปิด และล็อกไม่ให้พื้นหลังเลื่อน

   ใช้ผ่าน useConfirm() ด้านล่าง จะได้เขียนแบบ await เหมือน window.confirm เดิม */

function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const confirmRef = useRef(null);
  const panelRef = useRef(null);

  // Esc = ยกเลิก และล็อกไม่ให้พื้นหลังเลื่อนขณะกล่องเปิดอยู่
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
        return;
      }
      // กัก Tab ไว้ในกล่อง ไม่ให้หลุดไปโฟกัสของข้างหลัง
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll('button:not([disabled])');
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    // โฟกัสปุ่มยืนยันหลังกล่องขึ้นจอแล้ว
    const raf = requestAnimationFrame(() => confirmRef.current?.focus());

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, busy, onCancel]);

  const accent = danger ? 'text-accent-rose' : 'text-brand';
  const confirmBtn = danger
    ? 'bg-accent-rose hover:brightness-110 text-white'
    : 'bg-sbac-blue hover:bg-sbac-navy text-white';

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => !busy && onCancel()}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[81] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className={`pointer-events-auto w-full max-w-sm rounded-3xl border shadow-glass-lg p-6 space-y-4 ${
                isDark
                  ? 'bg-surface-dark-elev border-white/10 text-white'
                  : 'bg-surface-card border-border text-ink'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-2xl shrink-0 ${
                    danger
                      ? isDark ? 'bg-rose-500/15' : 'bg-rose-500/10'
                      : isDark ? 'bg-sbac-blue/20' : 'bg-sbac-blue/10'
                  } ${accent}`}
                  aria-hidden="true"
                >
                  <AlertTriangle size={20} />
                </div>

                <div className="min-w-0 space-y-1">
                  <h2 id="confirm-title" className="text-base font-extrabold leading-snug">
                    {title}
                  </h2>
                  <p id="confirm-message" className="text-xs font-semibold leading-relaxed text-content-secondary">
                    {message}
                  </p>
                  {detail && (
                    <p className="text-[11px] font-semibold leading-relaxed text-content-muted">
                      {detail}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={busy}
                  className={`flex-1 font-extrabold py-3 rounded-2xl text-xs border-2 transition-all active:scale-95 disabled:opacity-50 ${
                    isDark
                      ? 'border-white/20 text-slate-200 hover:bg-white/10'
                      : 'border-border text-ink-secondary hover:bg-slate-50'
                  }`}
                >
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  ref={confirmRef}
                  onClick={onConfirm}
                  disabled={busy}
                  className={`flex-1 font-extrabold py-3 rounded-2xl text-xs transition-all active:scale-95 disabled:opacity-60 ${confirmBtn}`}
                >
                  {busy ? 'กำลังทำรายการ...' : confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** ใช้แบบเดียวกับ window.confirm แต่เป็นกล่องในหน้าเว็บ
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   ...
 *   if (!(await confirm({ title: 'ลบกิจกรรม', message: '...', danger: true }))) return;
 *   ...
 *   return (<>{confirmDialog}  ...</>);
 *
 * คืน Promise<boolean> เหมือนเดิม โค้ดที่เรียกจึงแทบไม่ต้องแก้โครงสร้าง
 */
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const settle = useCallback((answer) => {
    resolverRef.current?.(answer);
    resolverRef.current = null;
    setState(null);
  }, []);

  const confirm = useCallback((options) => {
    // ถ้ามีกล่องค้างอยู่ ให้ตอบ false ไปก่อน กัน promise ค้างไม่มีวันจบ
    resolverRef.current?.(false);
    setState(options);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const confirmDialog = (
    <ConfirmDialog
      open={state !== null}
      {...(state || {})}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
}

export default ConfirmDialog;
