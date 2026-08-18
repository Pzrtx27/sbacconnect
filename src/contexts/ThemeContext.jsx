import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'sbac_theme';

/** อ่านค่าธีมเริ่มต้น: ค่าที่ผู้ใช้เคยเลือก > การตั้งค่าของเครื่อง > light
 *  ห่อ try/catch เพราะ localStorage อาจถูกบล็อกในโหมดไม่ระบุตัวตน/iOS private */
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    // ให้ UI ของเบราว์เซอร์ (scrollbar, ช่องกรอกข้อมูล) เข้ากับธีมด้วย
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}

export default ThemeContext;
