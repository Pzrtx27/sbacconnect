import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { navItemsFor, isNavItemActive } from './navConfig';

export default function BottomNav() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = theme === 'dark';

  if (!user) return null;

  const items = navItemsFor(user.role);

  /* ต้อง await: logout() เคลียร์ user หลัง signOut() คืนค่าแล้วเท่านั้น
     ถ้า navigate ก่อน LoginRoute จะยังเห็น user ค้างอยู่แล้วเด้งกลับหน้าเดิมให้เห็นแวบหนึ่ง */
  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  // แถบล่างเป็นของมือถือ บนคอม (>=1280px) ซ่อนไว้แล้วใช้ SideNav แทน
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 w-full xl:hidden">
      <div className={`backdrop-blur-xl border-t shadow-nav safe-bottom transition-colors duration-300 ${
        isDark
          ? 'bg-surface-dark-elev/95 border-white/10 text-white'
          : 'bg-surface-card/95 border-border'
      }`}>
        <div className="max-w-md mx-auto flex items-center justify-around px-2 pt-2 pb-1">
            {items.map((item) => {
              const isActive = isNavItemActive(item, location.pathname);
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  type="button"
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  /* min-h 44px = ขนาดพื้นที่กดขั้นต่ำตามแนวทาง mobile accessibility */
                  className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-w-[60px] min-h-[52px] rounded-2xl transition-all duration-200"
                >
                  <div className={`p-1.5 rounded-xl transition-all duration-300 ${
                    isActive 
                      ? isDark ? 'bg-sbac-blue/20' : 'bg-sbac-blue/10' 
                      : 'bg-transparent'
                  }`}>
                    <Icon 
                      size={22} 
                      strokeWidth={isActive ? 2.5 : 1.8}
                      aria-hidden="true"
                      className={`transition-colors duration-200 ${isActive ? 'text-brand' : 'text-content-muted'}`}
                    />
                  </div>
                  <span className={`text-[10px] font-bold transition-colors duration-200 ${
                    isActive ? 'text-brand' : 'text-content-muted'
                  }`}>
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 w-5 h-1 rounded-full bg-brand" 
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              );
            })}

            {/* Logout button — ใช้สีเต็ม ไม่ใส่ opacity เพื่อให้ contrast ผ่าน AA */}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="ออกจากระบบ"
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-3 min-w-[60px] min-h-[52px] rounded-2xl transition-all duration-200"
            >
              <div className="p-1.5 rounded-xl">
                <LogOut size={22} strokeWidth={1.8} className="text-accent-rose" aria-hidden="true" />
              </div>
              <span className="text-[10px] font-bold text-accent-rose">ออก</span>
            </button>
        </div>
      </div>
    </nav>
  );
}
