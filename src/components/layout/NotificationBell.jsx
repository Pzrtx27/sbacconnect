import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotifications } from '../../hooks/useNotifications';
import Modal from '../ui/Modal';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  return `${day} วันที่แล้ว`;
}

/* กระดิ่งแจ้งเตือน — วางไว้ใน Header ใช้ร่วมกันทุก role ที่ล็อกอินอยู่
   ข้อมูลมาจาก useNotifications (โหลด + ฟังเรียลไทม์) ตัวนี้ทำหน้าที่แสดงผลอย่างเดียว */
export default function NotificationBell() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={unreadCount > 0 ? `การแจ้งเตือน มี ${unreadCount} รายการที่ยังไม่อ่าน` : 'การแจ้งเตือน'}
        className={`relative p-2.5 rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center transition-all duration-300 ${
          isDark ? 'hover:bg-white/10 text-content-secondary' : 'hover:bg-slate-100 text-ink-secondary'
        }`}
      >
        <Bell size={20} strokeWidth={2} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-rose text-white text-[9px] font-extrabold flex items-center justify-center"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="การแจ้งเตือน"
        footer={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="w-full text-center text-xs font-bold text-brand py-2"
            >
              ทำเครื่องหมายว่าอ่านทั้งหมดแล้ว
            </button>
          ) : null
        }
      >
        {notifications.length === 0 ? (
          <div className="text-center py-10">
            <Bell
              size={32}
              className={`mx-auto mb-2 ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}
              aria-hidden="true"
            />
            <p className={`text-sm font-bold ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
              ยังไม่มีการแจ้งเตือน
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                    n.is_read
                      ? isDark
                        ? 'bg-white/[0.02] border-white/5'
                        : 'bg-slate-50/50 border-slate-100'
                      : isDark
                      ? 'bg-sbac-blue/10 border-sbac-blue-light/30'
                      : 'bg-sbac-blue-50 border-sbac-blue/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                      {n.title}
                    </span>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-accent-rose shrink-0 mt-1" aria-hidden="true" />
                    )}
                  </div>
                  <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                    {n.body}
                  </p>
                  <span className={`text-[9px] font-semibold mt-1.5 block ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
                    {timeAgo(n.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
