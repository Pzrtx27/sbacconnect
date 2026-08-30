import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

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

  /* ทำไมต้องมีตัวกันตรงนี้:
     ทั้งแอปมีคลาส transition-colors duration-300 อยู่ร้อยกว่าจุด และบางจุดซ้อนอยู่
     ใต้ backdrop-blur (header, แถบล่าง, การ์ดกระจก) พอสลับคลาส .dark ที่ <html>
     เบราว์เซอร์ต้องไล่ transition สีของทุก element พร้อมกัน 300ms
     และต้องคำนวณ blur ใหม่ทุกเฟรมระหว่างนั้น
     กดสลับรัว ๆ = งานพวกนี้ทับกันไปเรื่อย ๆ จนเมนหลักตัน = ที่เห็นว่า "ค้าง"

     วิธีแก้: ระหว่างสลับธีม ปิด transition ทั้งหน้าไว้ก่อน (คลาส theme-switching
     ใน index.css) ให้สีเปลี่ยนทันทีในเฟรมเดียว แล้วค่อยเปิดคืน
     ผลคือสลับกี่ครั้งก็ไม่สะสมงาน และรู้สึกเร็วขึ้นด้วย */
  const switchingRef = useRef(false);
  const timerRef = useRef(null);

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

  // เก็บกวาด timer ถ้า component ถูก unmount กลางคัน
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const applyTheme = useCallback((next) => {
    // กดซ้ำระหว่างที่ยังสลับไม่เสร็จ = ไม่ต้องทำอะไร กันงานซ้อน
    if (switchingRef.current) return;
    switchingRef.current = true;

    const root = document.documentElement;
    root.classList.add('theme-switching');

    setTheme(next);

    /* รอให้เบราว์เซอร์วาดสีใหม่เสร็จก่อนค่อยเปิด transition คืน
       ใช้ rAF ซ้อนสองชั้น: ชั้นแรกคือเฟรมที่ React ยัง commit ไม่เสร็จ
       ชั้นที่สองคือเฟรมที่สีใหม่ถูกวาดลงจอแล้วจริง ๆ */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
        // หน่วงสั้น ๆ ก่อนรับคำสั่งถัดไป กันการกดรัวจนเครื่องช้าตามไม่ทัน
        timerRef.current = setTimeout(() => {
          switchingRef.current = false;
        }, 80);
      });
    });
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: applyTheme }}>
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
