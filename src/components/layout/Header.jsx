import { useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import { shellWidthClass } from '../../utils/layout';
import NotificationBell from './NotificationBell';

export default function Header({ title = 'SBAC CONNECT', subtitle = 'Smart Campus • Access • Care' }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const headerRef = useRef(null);

  /* บอกความสูงจริงของแถบนี้ออกไปเป็นตัวแปร --app-header-h

     ทำไมต้องมี: แถบนี้เป็น sticky top-0 z-40 และมีของอื่นที่ sticky ใต้มันอีก
     (แถบแท็บของหน้าฝ่ายวิชาการ, รางปฏิทินของหน้าแรกนักเรียน)
     ถ้าของพวกนั้นตั้ง top-0 เหมือนกัน มันจะเลื่อนขึ้นไปหยุดที่ขอบบนสุดของจอ
     ซึ่งเป็นที่ของแถบนี้ แล้วมุดหายไปข้างหลังเพราะ z-index ต่ำกว่า
     เลื่อนหน้าลงไปนิดเดียวแถบแท็บก็หายไปทั้งแถบ

     ทำไมไม่ hardcode ตัวเลข: ความสูงขึ้นกับฟอนต์ที่โหลดได้จริงและขนาดตัวอักษร
     ของเครื่องผู้ใช้ ค่าที่เดาไว้จะผิดทันทีที่มีอย่างใดอย่างหนึ่งเปลี่ยน
     (ของเดิมหน้าแรกนักเรียนเดาไว้ที่ xl:top-24 = 96px ซึ่งห่างจากของจริงเกือบ 30px)
     วัดเอาแล้วเขียนลง :root จบเรื่อง */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;

    const publish = () => {
      document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`);
    };
    publish();

    const ro = new ResizeObserver(publish);
    ro.observe(el);

    return () => {
      ro.disconnect();
      // หน้าบาริสต้าไม่มีแถบนี้ ถ้าไม่คืนค่าเป็น 0 ของที่ sticky จะเว้นที่ให้แถบที่ไม่มีอยู่
      document.documentElement.style.setProperty('--app-header-h', '0px');
    };
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 w-full">
      <div className={`backdrop-blur-xl border-b transition-colors duration-300 ${
        isDark 
          ? 'bg-surface-dark/90 border-white/10 text-white' 
          : 'bg-surface-card/90 border-border/50 text-sbac-navy'
      }`}>
        <div className={`${shellWidthClass(user?.role)} mx-auto px-4 py-3 flex items-center justify-between`}>
          <div>
            <h1 className={`text-lg font-extrabold tracking-wide transition-colors duration-300 ${
              isDark ? 'text-white' : 'text-sbac-navy'
            }`}>{title}</h1>
            {subtitle && (
              <p className={`text-[11px] font-semibold transition-colors duration-300 ${
                isDark ? 'text-content-secondary' : 'text-content-muted'
              }`}>{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* แจ้งเตือนในระบบ — เห็นทันทีที่มีรายการใหม่ผ่าน Supabase Realtime */}
            {user && <NotificationBell />}

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              /* min 44x44 = ขนาดพื้นที่กดขั้นต่ำบนมือถือ */
              className={`p-2.5 rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center transition-all duration-300 ${
                isDark
                  ? 'hover:bg-white/10 text-accent-amber'
                  : 'hover:bg-slate-100 text-ink-secondary'
              }`}
              aria-label={isDark ? 'สลับเป็นธีมสว่าง' : 'สลับเป็นธีมมืด'}
              aria-pressed={isDark}
              id="header-theme-toggle"
            >
              {isDark ? <Sun size={20} strokeWidth={2} aria-hidden="true" /> : <Moon size={20} strokeWidth={2} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
