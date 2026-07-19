import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Calendar, Coffee, ShoppingCart, Settings, LogOut } from 'lucide-react';

const navConfigs = {
  student: [
    { id: 'home', path: '/', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
    { id: 'coffee', path: '/coffee', icon: Coffee, label: 'กาแฟ' },
    { id: 'orders', path: '/orders', icon: ShoppingCart, label: 'คำสั่งซื้อ' },
  ],
  teacher: [
    { id: 'home', path: '/', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
    { id: 'coffee', path: '/coffee', icon: Coffee, label: 'กาแฟ' },
    { id: 'orders', path: '/orders', icon: ShoppingCart, label: 'คำสั่งซื้อ' },
  ],
  academic: [
    { id: 'home', path: '/', icon: Home, label: 'หน้าหลัก' },
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

  const items = navConfigs[user.role] || navConfigs.student;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      <div className="max-w-lg mx-auto">
        <div className={`backdrop-blur-xl border-t shadow-nav safe-bottom transition-colors duration-300 ${
          isDark 
            ? 'bg-slate-900/95 border-white/5' 
            : 'bg-white/95 border-border'
        }`}>
          <div className="flex items-center justify-around px-2 pt-2 pb-1">
            {items.map((item) => {
              const isActive = location.pathname === item.path || 
                (item.path !== '/' && location.pathname.startsWith(item.path));
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  className="relative flex flex-col items-center gap-0.5 py-1 px-3 min-w-[60px] transition-all duration-200"
                >
                  <div className={`p-1.5 rounded-xl transition-all duration-300 ${
                    isActive 
                      ? 'bg-sbac-blue/10' 
                      : 'bg-transparent'
                  }`}>
                    <Icon 
                      size={22} 
                      strokeWidth={isActive ? 2.5 : 1.8}
                      className={`transition-colors duration-200 ${
                        isActive 
                          ? 'text-sbac-blue' 
                          : isDark ? 'text-slate-400' : 'text-ink-muted'
                      }`} 
                    />
                  </div>
                  <span className={`text-[10px] font-bold transition-colors duration-200 ${
                    isActive 
                      ? 'text-sbac-blue' 
                      : isDark ? 'text-slate-400' : 'text-ink-muted'
                  }`}>
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute -bottom-1 w-5 h-1 rounded-full bg-sbac-blue"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </button>
              );
            })}

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-[60px]"
            >
              <div className="p-1.5 rounded-xl">
                <LogOut size={22} strokeWidth={1.8} className="text-sbac-red/70" />
              </div>
              <span className="text-[10px] font-bold text-sbac-red/70">ออก</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
