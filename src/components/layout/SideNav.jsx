import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { navItemsFor, isNavItemActive } from './navConfig';
import logo from '../../assets/sbac_logo.png';

/* แถบนำทางด้านซ้าย ใช้เฉพาะบนจอคอม (>=1280px)
   ต่ำกว่านั้นซ่อนไว้แล้วใช้ BottomNav แทน

   ทำไมเดสก์ท็อปไม่ใช้แถบล่าง:
   แถบล่างมีไว้ให้นิ้วโป้งเอื้อมถึงตอนถือมือถือ บนคอมไม่มีนิ้วโป้ง มีเมาส์
   และการเอาแถบไปแปะขอบล่างจอ 1080px คือบังคับให้สายตาวิ่งลงไปสุดจอทุกครั้งที่จะเปลี่ยนหน้า
   แถบซ้ายอยู่ในเส้นทางสายตาปกติ และมีที่พอจะโชว์ข้อความกำกับไอคอนได้เต็ม ๆ */

export default function SideNav() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = theme === 'dark';

  if (!user) return null;

  const items = navItemsFor(user.role);

  /* ต้อง await — เหตุผลเดียวกับใน BottomNav.jsx */
  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav
      aria-label="เมนูหลัก"
      className={`hidden xl:flex fixed inset-y-0 left-0 z-50 w-64 flex-col border-r transition-colors duration-300 ${
        isDark ? 'bg-surface-dark-elev border-white/10' : 'bg-surface-card border-border'
      }`}
    >
      {/* แบรนด์ */}
      <div className={`flex items-center gap-3 px-5 py-5 border-b ${isDark ? 'border-white/10' : 'border-border'}`}>
        <img src={logo} alt="" className="w-9 h-9 rounded-xl object-contain" />
        <div className="min-w-0">
          <div className={`text-sm font-black tracking-wide ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            SBAC CONNECT
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-content-muted truncate">
            {user.name || 'ผู้ใช้งาน'}
          </div>
        </div>
      </div>

      {/* เมนู */}
      <ul className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const isActive = isNavItemActive(item, location.pathname);
          const Icon = item.icon;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => navigate(item.path)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-bold transition-colors ${
                  isActive
                    ? isDark
                      ? 'bg-sbac-blue/20 text-brand'
                      : 'bg-sbac-blue/10 text-brand'
                    : isDark
                    ? 'text-content-secondary hover:bg-white/5'
                    : 'text-ink-secondary hover:bg-slate-50'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>

      {/* ออกจากระบบ แยกไว้ล่างสุด ห่างจากเมนูอื่น กันกดพลาด */}
      <div className={`px-3 py-4 border-t ${isDark ? 'border-white/10' : 'border-border'}`}>
        <button
          type="button"
          onClick={handleLogout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-bold text-accent-rose transition-colors ${
            isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
          }`}
        >
          <LogOut size={20} strokeWidth={1.8} aria-hidden="true" />
          ออกจากระบบ
        </button>
      </div>
    </nav>
  );
}
