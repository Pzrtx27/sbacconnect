import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Calendar, Coffee, ShoppingCart, History, Settings, LogOut } from 'lucide-react';

const navConfigs = {
  student: [
    { id: 'home', path: '/home', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
    { id: 'coffee', path: '/coffee', icon: Coffee, label: 'กาแฟ' },
    { id: 'orders', path: '/orders', icon: ShoppingCart, label: 'คำสั่งซื้อ' },
  ],
  teacher: [
    { id: 'home', path: '/teacher', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
    { id: 'coffee', path: '/coffee', icon: Coffee, label: 'กาแฟ' },
    { id: 'orders', path: '/orders', icon: ShoppingCart, label: 'คำสั่งซื้อ' },
  ],
  academic: [
    { id: 'home', path: '/academic', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
    { id: 'manage', path: '/academic', icon: Settings, label: 'จัดการ' },
  ],
  barista: [
    { id: 'barista', path: '/barista', icon: Coffee, label: 'ร้านกาแฟ' },
  ],
};

export default function BottomNav() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = theme === 'dark';

  if (!user) return null;

  const roleKey = (user.role || 'student').toLowerCase().trim();
  const items = navConfigs[roleKey] || navConfigs.student;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 w-full">
      <div className={`backdrop-blur-xl border-t shadow-nav safe-bottom transition-colors duration-300 ${
        isDark
          ? 'bg-surface-dark-elev/95 border-white/10 text-white'
          : 'bg-white/95 border-border'
      }`}>
        <div className="max-w-md mx-auto flex items-center justify-around px-2 pt-2 pb-1">
            {items.map((item) => {
              const isActive = location.pathname === item.path || 
                (item.path !== '/' && item.path !== '/home' && item.path !== '/teacher' && item.path !== '/academic' && location.pathname.startsWith(item.path));
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
