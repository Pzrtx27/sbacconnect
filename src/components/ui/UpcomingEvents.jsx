import { useTheme } from '../../contexts/ThemeContext';
import { CalendarClock, MapPin, RefreshCw } from 'lucide-react';
import { useUpcomingEvents } from '../../hooks/useEvents';
import { DOT_COLORS, EVENT_TYPE_LABELS, eventTimeText, thaiShortDate } from '../../utils/events';

/* การ์ด "กิจกรรมที่กำลังจะมาถึง" บนหน้าแรก (โมดูล A ในแผน)

   ทำไมต้องมีทั้งการ์ดนี้และปฏิทินเต็ม:
   ปฏิทินตอบคำถาม "เดือนนี้มีอะไรบ้าง" แต่คำถามที่นักเรียนถามจริง ๆ ตอนเปิดแอปคือ
   "แล้วเรื่องต่อไปที่ฉันต้องรู้คืออะไร" — ต้องเห็นได้โดยไม่ต้องกดอะไรเลย */

/** วันนี้ / พรุ่งนี้ / อีก n วัน — อ่านแล้วรู้ระยะเวลาทันที ไม่ต้องนับวันเอง */
function relativeDayText(date) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfEvent = new Date(date);
  startOfEvent.setHours(0, 0, 0, 0);

  const days = Math.round((startOfEvent - startOfToday) / 86400000);
  if (days <= 0) return 'วันนี้';
  if (days === 1) return 'พรุ่งนี้';
  if (days <= 7) return `อีก ${days} วัน`;
  return thaiShortDate(date);
}

export default function UpcomingEvents({ limit = 3 }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { events, loading } = useUpcomingEvents(limit);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';

  // ไม่มีกิจกรรมข้างหน้าเลย = ไม่ต้องเอาการ์ดว่างมากินพื้นที่หน้าแรก
  if (!loading && events.length === 0) return null;

  return (
    <section
      aria-label="กิจกรรมที่กำลังจะมาถึง"
      className={`rounded-3xl border p-4 transition-colors duration-300 ${
        isDark ? 'bg-white/[0.06] backdrop-blur-2xl border-white/10' : 'bg-surface-card shadow-card border-slate-100'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-xl shrink-0 text-brand ${isDark ? 'bg-sbac-blue/30' : 'bg-sbac-blue/10'}`}>
          {loading ? (
            <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <CalendarClock size={16} aria-hidden="true" />
          )}
        </div>
        <h3 className={`text-sm font-extrabold ${textPrimary}`}>กิจกรรมที่กำลังจะมาถึง</h3>
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: limit }).map((_, i) => (
            <div
              key={i}
              className={`h-12 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}
            />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {events.map((evt) => (
            <li
              key={evt.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
              }`}
            >
              <div
                className={`w-1 self-stretch min-h-[36px] rounded-full shrink-0 ${DOT_COLORS[evt.color] || 'bg-blue-500'}`}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-xs font-extrabold leading-snug ${textPrimary}`}>{evt.title}</span>
                  <span className="text-[10px] font-extrabold text-brand shrink-0 whitespace-nowrap">
                    {relativeDayText(evt.start)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[10px] font-semibold text-content-muted">
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold ${isDark ? 'bg-white/10' : 'bg-surface-card'}`}
                  >
                    {EVENT_TYPE_LABELS[evt.type] || evt.type}
                  </span>
                  <span>{eventTimeText(evt)}</span>
                  {evt.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin size={10} aria-hidden="true" /> {evt.location}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
