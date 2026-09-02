import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useIsDesktop } from '../../hooks/useMediaQuery';

/**
 * Bottom sheet ที่ใช้ร่วมกันทุกโมดัลในแอป
 *
 * สูงคงที่ 70% ของจอเสมอ (h-[70vh]) ไม่ว่าเนื้อหาจะเยอะหรือน้อย — ทุกโมดัลจึงมี
 * ขอบบนอยู่ตำแหน่งเดียวกันเป๊ะ เนื้อหาที่ยาวเกินสูง 70vh จะเลื่อนดูได้เองภายในผ่าน
 * ส่วน content (overflow-y-auto flex-1) เนื้อหาที่สั้นก็แค่เว้นที่ว่างด้านล่างแทน
 * การหดตัวสูงตามเนื้อหาแบบเดิม (เดิมใช้ min-h ทำให้แต่ละโมดัลสูงไม่เท่ากัน)
 *
 * หมายเหตุ: ตกแต่งพื้นที่ว่างด้วย radial-gradient เปล่าๆ (ไม่ใช้ filter: blur)
 * เพราะ filter: blur() บนลูกที่อยู่ใน element ที่ overflow-hidden + ถูก transform
 * (ตอน sheet เด้งขึ้น) ทำให้ Chrome/Safari บางเวอร์ชัน render เพี้ยนเป็นเส้นขาวหยักๆ
 * ระหว่างแอนิเมชัน — gradient ธรรมดาให้ความนุ่มนวลใกล้เคียงกันแต่ปลอดภัยกว่า
 */
export default function Modal({ isOpen, onClose, title, children, footer = null }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const panelRef = useRef(null);
  // อ้างถึงเฉพาะส่วนเนื้อหา เพื่อไม่ให้โฟกัสแรกไปตกที่ปุ่มปิดใน header
  const contentRef = useRef(null);
  const titleId = useId();

  /* Esc ปิด + โฟกัสวนอยู่ในกล่อง + คืนโฟกัสให้ปุ่มที่เปิดตอนปิด + ล็อกไม่ให้พื้นหลังเลื่อน
     ConfirmDialog ทำครบสี่ข้อนี้มาตั้งแต่แรก แต่ Modal ซึ่งใช้เยอะกว่ามาก
     (ตะกร้ากาแฟ กระเป๋าเงิน ฟอร์มใบลา แก้ไขคะแนน แจ้งเตือน) กลับไม่มีสักข้อ
     คนที่ใช้คีย์บอร์ดล้วนจึงเปิดโมดัลแล้ว Tab หลุดไปโดนปุ่มข้างหลังที่มองไม่เห็น */
  /* เก็บ onClose ไว้ใน ref เพราะทุกที่ที่เรียก Modal ส่งมาเป็น arrow function inline
     (23 จุดทั้งแอป เช่น onClose={() => setActiveModal(null)}) ซึ่งได้ identity ใหม่ทุก render

     ถ้าใส่ onClose ไว้ใน deps ของ effect ด้านล่าง effect จะรันใหม่ทุกครั้งที่หน้าแม่ re-render
     ซึ่งเกิดทุกตัวอักษรที่พิมพ์ในช่องค้นหาที่อยู่ในโมดัล
     รอบใหม่แต่ละรอบสั่ง focus() ตัวแรกในกล่อง = ปุ่มปิด (X) ที่อยู่ใน header
     ผลคือพิมพ์ทีเดียวโฟกัสกระโดดไปปุ่มปิดทันที พิมพ์ต่อไม่ได้เลย */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
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
    };

    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    /* โฟกัสตัวแรก "ในเนื้อหา" ไม่ใช่ตัวแรกในกล่อง
       querySelector คืน element ตามลำดับใน DOM ไม่ใช่ตามลำดับที่เขียน selector
       ปุ่มปิด (X) อยู่ใน header ซึ่งมาก่อน children เสมอ ถ้าค้นจากทั้งกล่อง
       จะได้ปุ่มปิดทุกครั้ง = เปิดโมดัลมาแล้วโฟกัสจ่ออยู่ที่ปุ่มปิด ซึ่งไม่มีใครอยากได้
       ค้นเฉพาะใน contentRef จึงได้ช่องกรอกช่องแรกจริง ๆ */
    const raf = requestAnimationFrame(() => {
      const target = contentRef.current?.querySelector(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      // ไม่มีอะไรให้โฟกัสก็โฟกัสตัวกล่องเอง เพื่อให้ Esc และ Tab trap ทำงาน
      if (target) target.focus();
      else panelRef.current?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    // เจตนาไม่ใส่ onClose ใน deps — อ่านผ่าน onCloseRef แทน (ดูเหตุผลด้านบน)
  }, [isOpen]);

  /* บนมือถือเป็น bottom sheet: เลื่อนขึ้นจากขอบล่าง สูงตายตัว 70vh ทุกอัน
     บนคอมเป็น dialog กลางจอ: สูงตามเนื้อหา สูงสุด 80vh กว้างขึ้นเป็น 2xl
     ที่ต้องแยก เพราะ bottom sheet เป็นภาษาของการใช้นิ้วโป้ง บนจอ 1080px
     กล่องแคบ ๆ แปะก้นจอโดยมีเนื้อหาแค่สี่บรรทัด เหลือที่ว่างครึ่งจอ ดูเหมือนหลุด */
  const isDesktop = useIsDesktop();

  /* ห้ามผูก "การมองเห็น" ไว้กับแอนิเมชันที่ต้องวิ่งจนจบ

     บนมือถือแผ่นโมดัลเริ่มที่ y:'100%' (อยู่ใต้จอ) แล้วค่อยเลื่อนขึ้นมา y:0
     ถ้าแอนิเมชันไม่จบ ตำแหน่งจะค้างอยู่ใต้จอ = เปิดโมดัลแล้วไม่เห็นอะไรเลย
     วัดจริงบนเครื่องที่ตั้ง prefers-reduced-motion: reduce ได้ transform ค้างที่
     translateY(457px) จากความสูง 568px คือโผล่มาแค่ขอบบนนิดเดียว

     เครื่องที่ขอลดการเคลื่อนไหวจึงต้องไม่เลื่อนตำแหน่งเลย ใช้เฟดเข้าอย่างเดียว
     ตำแหน่งอยู่ที่ปลายทางตั้งแต่เฟรมแรก ไม่มีทางค้างนอกจอไม่ว่าแอนิเมชันจะจบหรือไม่ */
  const reduceMotion = useReducedMotion();

  const sheetMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : isDesktop
      ? {
          initial: { opacity: 0, scale: 0.97 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 0.97 },
          transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
        }
      : {
          initial: { y: '100%' },
          animate: { y: 0 },
          exit: { y: '100%' },
          transition: { type: 'spring', damping: 30, stiffness: 400 },
        };

  /* ต้อง portal ออกไปที่ body ไม่ใช่ render ไว้ในตำแหน่งที่ถูกเรียก
     (ConfirmDialog ทำแบบนี้มาตั้งแต่แรก Modal ตกไปตัวเดียว)

     เหตุผล: ทุกหน้าถูกห่อด้วย PageWrapper ซึ่งเป็น motion.div ที่ animate y/scale
     element ที่มี transform จะกลายเป็น containing block ของลูกที่เป็น position:fixed
     แปลว่า bottom-0 ของแผ่นโมดัลไม่ได้หมายถึง "ก้นจอ" อีกต่อไป
     แต่หมายถึง "ก้นกล่องเนื้อหาของหน้า" ซึ่งบนหน้าที่ยาว ๆ อยู่ต่ำกว่าจอไปหลายพันพิกเซล

     วัดจริง: เลื่อนหน้าลง 600px แล้วเปิดโมดัล ได้ top 1187 / bottom 1745
     ทั้งที่จอสูง 812 คือหลุดออกนอกจอทั้งแผ่น กดกระดิ่งแล้วจึงเหมือนไม่มีอะไรเกิดขึ้น
     พอ portal ไป body แล้วไม่มีบรรพบุรุษที่มี transform อีก fixed จึงยึดกับจอตามที่ควรเป็น */
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
          />
          {/* Sheet — สูงคงที่ 70vh เท่ากันทุกโมดัล */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            {...sheetMotion}
            className="fixed bottom-0 left-0 right-0 z-[61] max-w-lg mx-auto h-[70vh]
                       xl:inset-0 xl:left-64 xl:h-auto xl:max-w-2xl xl:max-h-[80vh] xl:m-auto"
          >
            <div
              className={`relative overflow-hidden rounded-t-3xl shadow-glass-lg h-full flex flex-col safe-bottom transition-colors duration-300
                          xl:rounded-3xl xl:h-auto xl:max-h-[80vh] xl:border ${
                isDark
                  ? 'bg-neutral-900 border-t border-white/10 text-white xl:border-white/10'
                  : 'bg-surface-card xl:border-border'
              }`}
            >
              {/* ลูกเล่นตกแต่ง: ไล่เฉดสีจางๆ มุมล่าง กันไม่ให้พื้นที่ว่างดูจืดตอนเนื้อหาน้อย
                  (ตั้งใจไม่ใช้ filter: blur — ดูหมายเหตุด้านบน) */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-56"
                style={{
                  background: isDark
                    ? 'radial-gradient(120% 100% at 85% 100%, rgba(26,60,200,0.16) 0%, transparent 60%), radial-gradient(80% 80% at 10% 100%, rgba(200,16,46,0.10) 0%, transparent 60%)'
                    : 'radial-gradient(120% 100% at 85% 100%, rgba(26,60,200,0.08) 0%, transparent 60%), radial-gradient(80% 80% at 10% 100%, rgba(200,16,46,0.05) 0%, transparent 60%)',
                }}
              />

              {/* Handle — สื่อว่า "ลากได้" ซึ่งเป็นท่าของมือถือ บนคอมซ่อนไว้ */}
              <div className="relative flex justify-center pt-3 pb-1 shrink-0 xl:hidden">
                <div
                  className={`w-10 h-1 rounded-full transition-colors duration-300 ${
                    isDark ? 'bg-zinc-600' : 'bg-slate-200'
                  }`}
                />
              </div>

              {/* Header */}
              <div className="relative flex items-center justify-between px-6 py-3 shrink-0 xl:pt-5 xl:px-7">
                <h2
                  id={titleId}
                  className={`text-lg xl:text-xl font-extrabold transition-colors duration-300 ${
                    isDark ? 'text-white' : 'text-sbac-navy'
                  }`}
                >
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="ปิด"
                  className={`p-2 rounded-xl transition-colors ${
                    isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                  }`}
                >
                  <X size={20} className={isDark ? 'text-content-secondary' : 'text-ink-muted'} aria-hidden="true" />
                </button>
              </div>

              {/* เส้นแบ่งบางๆ ใต้หัวข้อ แทนความว่างเปล่าทึบๆ ระหว่าง header กับเนื้อหา */}
              <div
                className={`relative h-px shrink-0 mx-6 xl:mx-7 ${
                  isDark ? 'bg-gradient-to-r from-white/10 via-white/5 to-transparent' : 'bg-gradient-to-r from-slate-100 via-slate-100 to-transparent'
                }`}
              />

              {/* Content — เติมพื้นที่ที่เหลือเสมอ (flex-1) และ scroll เองเมื่อเนื้อหายาวเกิน 70vh */}
              <div ref={contentRef} className="relative px-6 py-5 overflow-y-auto flex-1 xl:px-7">{children}</div>

              {/* footer อยู่ "นอก" พื้นที่ scroll จึงตรึงติดก้น sheet เสมอ
                  ที่ต้องมี: บนมือถือ 375x812 sheet สูง 568px หักหัว-ท้ายเหลือที่อ่านราว 428px
                  แต่หน้าเลือกตัวเลือกกาแฟมีเนื้อหาราว 830px — ปุ่มยืนยันเลยตกไปอยู่ใต้ขอบจอ
                  ผู้ใช้เปิดมาเห็นแต่ตัวเลือก ไม่เห็นทางกดจบ ซึ่งคือทั้ง funnel ของหน้านั้น */}
              {footer && (
                <div
                  className={`relative shrink-0 px-6 pt-3 pb-5 border-t xl:px-7 ${
                    isDark ? 'border-white/10 bg-neutral-900' : 'border-border bg-surface-card'
                  }`}
                >
                  {footer}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
