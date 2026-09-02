import { useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotifications } from '../../hooks/useNotifications';
import Modal from '../ui/Modal';
import { useConfirm } from '../ui/ConfirmDialog';
import { showToast } from '../ui/Toast';

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
  const { notifications, unreadCount, markRead, markAllRead, remove, removeAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const handleRemoveAll = async () => {
    const ok = await confirm({
      title: 'ลบการแจ้งเตือนทั้งหมด?',
      message: `จะลบทั้งหมด ${notifications.length} รายการ รวมรายการที่ยังไม่ได้อ่านด้วย`,
      detail: 'ลบแล้วเรียกคืนไม่ได้ แต่ข้อมูลต้นทาง (ใบลา ใบแจ้งซ่อม คะแนน) ยังอยู่ครบตามเดิม',
      confirmLabel: 'ลบทั้งหมด',
      danger: true,
    });
    if (!ok) return;
    if (await removeAll()) showToast('ลบการแจ้งเตือนทั้งหมดแล้ว', 'success');
    else showToast('ลบไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
  };

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
          notifications.length > 0 ? (
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex-1 min-h-[44px] text-center text-xs font-bold text-brand rounded-xl hover:bg-sbac-blue/10 transition-colors"
                >
                  อ่านทั้งหมดแล้ว
                </button>
              )}
              <button
                type="button"
                onClick={handleRemoveAll}
                className={`min-h-[44px] px-4 text-xs font-bold text-accent-rose rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors ${
                  unreadCount > 0 ? '' : 'flex-1'
                } ${isDark ? 'hover:bg-rose-500/10' : 'hover:bg-rose-500/10'}`}
              >
                <Trash2 size={14} aria-hidden="true" />
                ลบทั้งหมด
              </button>
            </div>
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
              /* ปุ่มลบเป็นพี่น้องกับปุ่มอ่าน ไม่ใช่ปุ่มซ้อนในปุ่ม
                 <button> ซ้อนใน <button> เป็น HTML ที่ไม่ถูกต้อง เบราว์เซอร์จะแยกคลิกไม่ออก
                 กรอบและพื้นหลังจึงย้ายมาอยู่ที่ <li> แทน */
              <li
                key={n.id}
                className={`flex items-stretch gap-1 rounded-2xl border overflow-hidden transition-all ${
                  n.is_read
                    ? isDark
                      ? 'bg-white/[0.02] border-white/5'
                      : 'bg-slate-50/50 border-slate-100'
                    : isDark
                    ? 'bg-sbac-blue/10 border-sbac-blue-light/30'
                    : 'bg-sbac-blue-50 border-sbac-blue/20'
                }`}
              >
                <button
                  type="button"
                  onClick={() => !n.is_read && markRead(n.id)}
                  className="flex-1 min-w-0 text-left p-3.5"
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

                {/* ลบทีละใบไม่ถามยืนยัน — เป็นการกระทำเล็กและกู้คืนได้ด้วยการรอแจ้งเตือนใหม่
                    ที่ต้องถามคือปุ่มลบทั้งหมดด้านล่าง ซึ่งกวาดทีเดียวหมด
                    ป้ายบอกชื่อรายการด้วย เพราะ screen reader อ่านปุ่มแยกจากบริบท */}
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  aria-label={`ลบการแจ้งเตือน ${n.title}`}
                  className={`shrink-0 w-11 flex items-center justify-center transition-colors ${
                    isDark
                      ? 'text-content-muted hover:text-accent-rose hover:bg-white/5'
                      : 'text-ink-muted hover:text-accent-rose hover:bg-slate-100'
                  }`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {confirmDialog}
    </>
  );
}
