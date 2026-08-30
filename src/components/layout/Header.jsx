import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import { shellWidthClass } from '../../utils/layout';
import NotificationBell from './NotificationBell';

export default function Header({ title = 'SBAC CONNECT', subtitle = 'Smart Campus • Access • Care' }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-40 w-full">
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
              <p className={`text-[10px] font-semibold tracking-wider uppercase transition-colors duration-300 ${
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
