import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export default function Header({ title = 'SBAC CONNECT', subtitle = 'Smart Campus • Access • Care' }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-40">
      <div className="max-w-lg mx-auto">
        <div className={`backdrop-blur-xl border-b px-5 py-3 transition-colors duration-300 ${
          isDark 
            ? 'bg-slate-900/90 border-white/5' 
            : 'bg-white/90 border-border/50'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-lg font-extrabold tracking-wide transition-colors duration-300 ${
                isDark ? 'text-white' : 'text-sbac-navy'
              }`}>{title}</h1>
              {subtitle && (
                <p className={`text-[10px] font-semibold tracking-wider uppercase transition-colors duration-300 ${
                  isDark ? 'text-slate-400' : 'text-ink-muted'
                }`}>{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {/* Theme Toggle */}
              <button 
                onClick={toggleTheme}
                className={`p-2 rounded-xl transition-all duration-300 ${
                  isDark 
                    ? 'hover:bg-white/10 text-amber-400' 
                    : 'hover:bg-slate-50 text-ink-secondary'
                }`}
                aria-label="สลับธีม"
                id="header-theme-toggle"
              >
                {isDark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
              </button>

            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
