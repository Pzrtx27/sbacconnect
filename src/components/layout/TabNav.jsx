import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';

/* แถบแท็บที่ใช้ซอยหน้ายาว ๆ ออกเป็นหมวด

   ทำไมต้องมี: หน้าฝ่ายวิชาการเดิมเป็นหน้าเดียวยาว 7 หมวดรวด บนมือถือคือ
   เลื่อนผ่านฟอร์มตารางสอน ตัวอัปโหลด Excel และตารางพรีวิว กว่าจะถึงใบลาที่รออนุมัติ
   ซึ่งเป็นงานที่ต้องทำทุกวัน — ของที่ใช้บ่อยที่สุดดันอยู่ล่างสุด

   เรื่องคีย์บอร์ด: ทำตาม WAI-ARIA tabs pattern คือลูกศรซ้าย/ขวาย้ายแท็บ
   Home/End ไปหัว-ท้าย และมีแค่แท็บที่เลือกอยู่ที่ tabIndex=0 (roving tabindex)
   คนกด Tab จึงข้ามทั้งแถบไปที่เนื้อหาเลย ไม่ต้องกดผ่านทุกแท็บก่อน
*/
export default function TabNav({ tabs, active, onChange, ariaLabel = 'หมวดการจัดการ' }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const refs = useRef({});
  const listRef = useRef(null);

  /* บนจอ 375px แท็บ 5 อันกินที่เกินความกว้างอยู่ราว 216px คือมีสองแท็บที่มองไม่เห็นเลย
     ถ้าไม่มีอะไรบอก ผู้ใช้บนมือถือจะไม่รู้ด้วยซ้ำว่ามีแท็บ "กิจกรรม" กับ "นำเข้าข้อมูล" อยู่
     จึงเฟดขอบด้านที่ยังเลื่อนต่อได้ ให้เห็นว่าเนื้อหาถูกตัด ไม่ใช่จบแค่นั้น */
  const [edges, setEdges] = useState({ start: false, end: false });

  const syncEdges = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 4, end: el.scrollLeft < max - 4 });
  }, []);

  useLayoutEffect(() => {
    syncEdges();
    const el = listRef.current;
    if (!el) return undefined;
    // ResizeObserver จับตอนหมุนจอ/ย่อหน้าต่าง ซึ่ง scroll event ไม่ยิง
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncEdges, tabs.length]);

  /* เลื่อนแท็บที่เลือกอยู่เข้ามาในจอ — สำคัญตอนเข้าหน้าครั้งแรกโดยที่แท็บนั้นอยู่นอกจอ
     block: 'nearest' กันไม่ให้หน้าทั้งหน้ากระโดดตาม */
  useEffect(() => {
    refs.current[active]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    syncEdges();
  }, [active, syncEdges]);

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
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        onScroll={syncEdges}
        className="flex gap-1.5 overflow-x-auto scrollbar-hide"
        /* เฟดเฉพาะฝั่งที่ยังเลื่อนต่อได้ ใช้ mask แทนการวาง gradient ทับ
           เพราะ gradient ทับต้องรู้สีพื้นหลังที่แน่นอน ซึ่งเปลี่ยนตามธีม */
        style={{
          maskImage: edges.start || edges.end
            ? `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'} 0, #000 24px, #000 calc(100% - 24px), ${edges.end ? 'transparent' : '#000'} 100%)`
            : undefined,
          WebkitMaskImage: edges.start || edges.end
            ? `linear-gradient(to right, ${edges.start ? 'transparent' : '#000'} 0, #000 24px, #000 calc(100% - 24px), ${edges.end ? 'transparent' : '#000'} 100%)`
            : undefined,
        }}
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
              /* min-h 44px = ขนาดพื้นที่กดขั้นต่ำบนมือถือ (เท่ากับ BottomNav) */
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
