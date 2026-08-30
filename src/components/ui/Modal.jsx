import { AnimatePresence, motion } from 'framer-motion';
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

  /* บนมือถือเป็น bottom sheet: เลื่อนขึ้นจากขอบล่าง สูงตายตัว 70vh ทุกอัน
     บนคอมเป็น dialog กลางจอ: สูงตามเนื้อหา สูงสุด 80vh กว้างขึ้นเป็น 2xl
     ที่ต้องแยก เพราะ bottom sheet เป็นภาษาของการใช้นิ้วโป้ง บนจอ 1080px
     กล่องแคบ ๆ แปะก้นจอโดยมีเนื้อหาแค่สี่บรรทัด เหลือที่ว่างครึ่งจอ ดูเหมือนหลุด */
  const isDesktop = useIsDesktop();

  return (
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
            initial={isDesktop ? { opacity: 0, scale: 0.97 } : { y: '100%' }}
            animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.97 } : { y: '100%' }}
            transition={
              isDesktop
                ? { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
                : { type: 'spring', damping: 30, stiffness: 400 }
            }
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
              <div className="relative px-6 py-5 overflow-y-auto flex-1 xl:px-7">{children}</div>

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
    </AnimatePresence>
  );
}
