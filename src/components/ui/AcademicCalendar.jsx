import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Calendar, ChevronLeft, ChevronRight, X, MapPin, Clock as ClockIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Academic events for July 2569 (2026)
const JULY_EVENTS = {
  2: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
  3: [{ title: 'ประชุมฝ่ายวิชาการ', type: 'academic', time: '09:00 - 12:00', location: 'ห้องประชุม อาคาร 1', color: 'blue' }],
  7: [{ title: 'ส่งงานโครงงานกลุ่ม', type: 'deadline', time: 'ก่อน 16:00', location: 'ห้อง 1406', color: 'amber' }],
  9: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
  10: [{ title: 'กิจกรรมวันสถาปนา', type: 'activity', time: '08:00 - 12:00', location: 'หอประชุม', color: 'violet' }],
  13: [{ title: 'วันอาสาฬหบูชา', type: 'holiday', time: 'หยุดราชการ', location: '', color: 'red' }],
  14: [{ title: 'วันเข้าพรรษา', type: 'holiday', time: 'หยุดราชการ', location: '', color: 'red' }],
  16: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
  18: [{ title: 'สอบกลางภาค - การสร้างเกมคอมพิวเตอร์', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1409', color: 'rose' }],
  19: [{ title: 'สอบกลางภาค - English for Project Work', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1503', color: 'rose' }],
  21: [{ title: 'สอบกลางภาค - ทักษะดิจิทัล', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1509', color: 'rose' }],
  22: [{ title: 'สอบกลางภาค - การซ่อมบำรุงคอมพิวเตอร์', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1401', color: 'rose' }],
  23: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
  24: [{ title: 'สอบกลางภาค - การออกแบบกราฟิกพื้นฐาน', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1406', color: 'rose' }],
  28: [{ title: 'วันเฉลิมพระชนมพรรษา ร.10', type: 'holiday', time: 'หยุดราชการ', location: '', color: 'red' }],
  30: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
};

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const EVENT_TYPE_LABELS = {
  activity: 'กิจกรรม',
  holiday: 'วันหยุด',
  exam: 'สอบ',
  academic: 'วิชาการ',
  deadline: 'กำหนดส่ง',
};

const DOT_COLORS = {
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
};

const BADGE_COLORS = {
  emerald: { light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dark: 'bg-emerald-900/30 text-emerald-400 border-emerald-800/40' },
  blue: { light: 'bg-blue-50 text-blue-700 border-blue-200', dark: 'bg-blue-900/30 text-blue-400 border-blue-800/40' },
  red: { light: 'bg-red-50 text-red-700 border-red-200', dark: 'bg-red-900/30 text-red-400 border-red-800/40' },
  rose: { light: 'bg-rose-50 text-rose-700 border-rose-200', dark: 'bg-rose-900/30 text-rose-400 border-rose-800/40' },
  amber: { light: 'bg-amber-50 text-amber-700 border-amber-200', dark: 'bg-amber-900/30 text-amber-400 border-amber-800/40' },
  violet: { light: 'bg-violet-50 text-violet-700 border-violet-200', dark: 'bg-violet-900/30 text-violet-400 border-violet-800/40' },
};

export default function AcademicCalendar() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [selectedDate, setSelectedDate] = useState(null);

  // July 2026 starts on Wednesday (dayIndex = 3)
  const year = 2026;
  const month = 6; // 0-indexed: 6 = July
  const daysInMonth = 31;
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 3 = Wednesday

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const currentDay = isCurrentMonth ? today.getDate() : -1;

  // Build calendar grid
  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null); // Empty cells before 1st
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-slate-400' : 'text-ink-muted';

  const selectedEvents = selectedDate ? (JULY_EVENTS[selectedDate] || []) : [];

  return (
    <div className="space-y-3">
      {/* Calendar Card */}
      <div className={`rounded-3xl border p-4 transition-colors duration-300 ${
        isDark ? 'bg-white/[0.06] backdrop-blur-2xl border-white/10' : 'bg-white shadow-card border-slate-100'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${isDark ? 'bg-sbac-blue/20' : 'bg-sbac-blue/10'}`}>
              <Calendar size={18} className="text-sbac-blue" />
            </div>
            <div>
              <h3 className={`text-sm font-extrabold ${textPrimary}`}>ปฏิทินฝ่ายวิชาการ</h3>
              <p className={`text-[10px] font-semibold ${textMuted}`}>กรกฎาคม 2569</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-[9px] font-bold px-2 py-1 rounded-lg ${
              isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-ink-muted'
            }`}>
              ภาคเรียนที่ 1/2569
            </span>
          </div>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((name, i) => (
            <div
              key={name}
              className={`text-center text-[10px] font-bold py-1 ${
                i === 0 || i === 6
                  ? 'text-sbac-red/70'
                  : textMuted
              }`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }

            const events = JULY_EVENTS[day] || [];
            const hasEvents = events.length > 0;
            const isToday = day === currentDay;
            const isSelected = day === selectedDate;
            const isWeekend = (idx % 7 === 0) || (idx % 7 === 6);
            const isHoliday = events.some(e => e.type === 'holiday');

            return (
              <button
                key={day}
                onClick={() => hasEvents ? setSelectedDate(isSelected ? null : day) : null}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 ${
                  hasEvents ? 'cursor-pointer active:scale-90' : 'cursor-default'
                } ${
                  isSelected
                    ? 'bg-sbac-blue text-white shadow-button scale-105'
                    : isToday
                    ? isDark
                      ? 'bg-sbac-blue/20 text-sbac-blue-light ring-1 ring-sbac-blue/40'
                      : 'bg-sbac-blue/10 text-sbac-blue ring-1 ring-sbac-blue/30'
                    : isHoliday
                    ? isDark
                      ? 'text-red-400 bg-red-900/20'
                      : 'text-red-600 bg-red-50'
                    : isWeekend
                    ? isDark ? 'text-slate-500' : 'text-slate-400'
                    : isDark ? 'text-slate-300 hover:bg-white/5' : 'text-ink hover:bg-slate-50'
                }`}
              >
                <span className={`text-xs font-bold leading-none ${isSelected ? 'text-white' : ''}`}>
                  {day}
                </span>
                {/* Event dots */}
                {hasEvents && !isSelected && (
                  <div className="flex gap-0.5 mt-0.5">
                    {events.slice(0, 3).map((evt, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full ${DOT_COLORS[evt.color] || 'bg-blue-500'}`}
                      />
                    ))}
                  </div>
                )}
                {isSelected && hasEvents && (
                  <div className="flex gap-0.5 mt-0.5">
                    {events.slice(0, 3).map((_, i) => (
                      <div key={i} className="w-1 h-1 rounded-full bg-white/70" />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className={`flex flex-wrap gap-3 mt-3 pt-3 border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
          {[
            { label: 'รด.', color: 'bg-emerald-500' },
            { label: 'สอบ', color: 'bg-rose-500' },
            { label: 'วันหยุด', color: 'bg-red-500' },
            { label: 'กิจกรรม', color: 'bg-violet-500' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${item.color}`} />
              <span className={`text-[9px] font-bold ${textMuted}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Event Detail Popup */}
      <AnimatePresence>
        {selectedDate && selectedEvents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={`rounded-2xl border p-4 transition-colors duration-300 ${
              isDark ? 'bg-white/[0.06] backdrop-blur-2xl border-white/10' : 'bg-white shadow-card border-slate-100'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-extrabold ${textPrimary}`}>
                📅 {selectedDate} กรกฎาคม 2569
              </span>
              <button
                onClick={() => setSelectedDate(null)}
                className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
              >
                <X size={14} className={textMuted} />
              </button>
            </div>

            <div className="space-y-2.5">
              {selectedEvents.map((evt, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                    BADGE_COLORS[evt.color]
                      ? isDark
                        ? BADGE_COLORS[evt.color].dark
                        : BADGE_COLORS[evt.color].light
                      : isDark
                      ? 'bg-white/5 border-white/10'
                      : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <div className={`w-1 h-full min-h-[40px] rounded-full ${DOT_COLORS[evt.color] || 'bg-blue-500'}`} />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold">{evt.title}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                        isDark ? 'bg-white/10' : 'bg-white/60'
                      }`}>
                        {EVENT_TYPE_LABELS[evt.type] || evt.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[10px] font-semibold opacity-80">
                        <ClockIcon size={10} /> {evt.time}
                      </span>
                      {evt.location && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold opacity-80">
                          <MapPin size={10} /> {evt.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
