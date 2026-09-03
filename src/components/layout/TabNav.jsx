import { useRef } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';

/* แถบแท็บที่ใช้ซอยหน้ายาว ๆ ออกเป็นหมวด

   ทำไมต้องมี: หน้าฝ่ายวิชาการเดิมเป็นหน้าเดียวยาว 7 หมวดรวด บนมือถือคือ
   เลื่อนผ่านฟอร์มตารางสอน ตัวอัปโหลด Excel และตารางพรีวิว กว่าจะถึงใบลาที่รออนุมัติ
   ซึ่งเป็นงานที่ต้องทำทุกวัน — ของที่ใช้บ่อยที่สุดดันอยู่ล่างสุด

   เรื่องการจัดวาง: ขึ้นบรรทัดใหม่ (flex-wrap) ไม่ใช่เลื่อนซ้ายขวา
   ของเดิมเป็น overflow-x-auto แล้วเฟดขอบบอกว่ายังเลื่อนต่อได้
   แต่บนจอ 375px แท็บ 5 อันกินที่เกินความกว้างราว 216px = สองแท็บอยู่นอกจอ
   ผู้ใช้ต้องรู้ตัวว่าต้องปัดก่อนถึงจะเจอ ซึ่งเป็นการซ่อนทางเข้าหลักของหน้า
   ยอมสูงขึ้นอีกบรรทัดดีกว่าให้คนหาเมนูไม่เจอ — แนวเดียวกับที่แก้ปุ่มลัดในแชทไปแล้ว

   เรื่องคีย์บอร์ด: ทำตาม WAI-ARIA tabs pattern คือลูกศรซ้าย/ขวาย้ายแท็บ
   Home/End ไปหัว-ท้าย และมีแค่แท็บที่เลือกอยู่ที่ tabIndex=0 (roving tabindex)
   คนกด Tab จึงข้ามทั้งแถบไปที่เนื้อหาเลย ไม่ต้องกดผ่านทุกแท็บก่อน
*/
export default function TabNav({ tabs, active, onChange, ariaLabel = 'หมวดการจัดการ' }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const refs = useRef({});

  const activeIndex = tabs.findIndex((t) => t.id === active);

  const focusTab = (index) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusTab(activeIndex + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusTab(activeIndex - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusTab(0); }
    else if (e.key === 'End') { e.preventDefault(); focusTab(tabs.length - 1); }
  };

  return (
    /* sticky ใต้ header — เปลี่ยนหมวดได้โดยไม่ต้องเลื่อนกลับขึ้นหัวหน้า
       -mx-4 px-4 ให้แถบกินเต็มขอบจอบนมือถือ แต่เนื้อหาข้างในยังตรงกับคอลัมน์หลัก */
    <div
      className={`sticky top-0 z-30 -mx-4 px-4 py-2 backdrop-blur-xl border-b transition-colors duration-300 ${
        isDark ? 'bg-surface-dark/85 border-white/10' : 'bg-surface/85 border-border'
      }`}
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-1.5"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;

          return (
            <button
              key={tab.id}
              ref={(el) => { refs.current[tab.id] = el; }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              /* min-h 44px = ขนาดพื้นที่กดขั้นต่ำบนมือถือ (เท่ากับ BottomNav)
                 shrink-0 กันไม่ให้ข้อความถูกบีบจนตัดคำ — ให้ขึ้นบรรทัดใหม่แทน */
              className={`relative shrink-0 flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-2xl
                          text-xs font-extrabold transition-colors duration-200 ${
                isActive
                  ? 'text-white'
                  : isDark
                    ? 'text-content-secondary hover:bg-white/5'
                    : 'text-ink-secondary hover:bg-slate-100'
              }`}
            >
              {/* พื้นหลังของแท็บที่เลือก วิ่งตามด้วย layoutId แทนการ fade เข้า-ออก
                  ทำให้เห็นว่า "ย้ายมาจากตรงไหน" ไม่ใช่จู่ ๆ ก็สว่างขึ้นมาอีกที่ */}
              {isActive && (
                <motion.span
                  layoutId="tabnav-active"
                  className="absolute inset-0 rounded-2xl bg-sbac-blue shadow-button"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                />
              )}

              <span className="relative flex items-center gap-1.5 whitespace-nowrap">
                <Icon size={15} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                {tab.label}

                {/* ตัวเลขงานค้าง — เหตุผลหลักที่ทำแท็บ คือให้เห็นจำนวนโดยไม่ต้องเข้าไปดู
                    ซ่อนตอนเป็น 0 เพราะป้ายว่างเปล่ารกกว่าไม่มีป้าย */}
                {tab.badge > 0 && (
                  <span
                    className={`ml-0.5 min-w-[18px] px-1 h-[18px] rounded-full text-[10px] font-extrabold
                                inline-flex items-center justify-center ${
                      isActive ? 'bg-white/25 text-white' : 'bg-accent-rose/15 text-accent-rose'
                    }`}
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
