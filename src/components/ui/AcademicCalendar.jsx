import { useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Calendar, ChevronLeft, ChevronRight, X, MapPin, Clock as ClockIcon, CalendarCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ============================================================
   ปฏิทินฝ่ายวิชาการ
   โครงสร้างข้อมูล: ACADEMIC_EVENTS[ปี ค.ศ.][เดือน 0-11][วันที่] = [event, ...]
   เดิมใช้ตัวแปรเดียว (JULY_EVENTS) ทำให้กดเปลี่ยนเดือนแล้วยังโชว์
   กิจกรรมของเดือน ก.ค. ตลอด — แก้โดยแยกข้อมูลตามปี/เดือน
   ============================================================ */
const ACADEMIC_EVENTS = {
  2026: {
    // ---------- กรกฎาคม 2569 ----------
    6: {
      2: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      3: [{ title: 'ประชุมฝ่ายวิชาการ', type: 'academic', time: '09:00 - 12:00', location: 'ห้องประชุม อาคาร 1', color: 'blue' }],
      7: [{ title: 'ส่งงานโครงงานกลุ่ม', type: 'deadline', time: 'ก่อน 16:00', location: 'ห้อง 1406', color: 'orange' }],
      9: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      10: [{ title: 'กิจกรรมวันสถาปนา', type: 'activity', time: '08:00 - 12:00', location: 'หอประชุม', color: 'violet' }],
      13: [{ title: 'วันอาสาฬหบูชา', type: 'holiday', time: 'หยุดราชการ', location: '', color: 'red' }],
      14: [{ title: 'วันเข้าพรรษา', type: 'holiday', time: 'หยุดราชการ', location: '', color: 'red' }],
      16: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      18: [{ title: 'สอบกลางภาค - การสร้างเกมคอมพิวเตอร์', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1409', color: 'rose' }],
      19: [
        { title: 'ส่งโปรเจค 50%', type: 'deadline', time: 'ก่อน 16:30 น.', location: 'ห้อง 1503 / ส่งระบบออนไลน์', color: 'orange' },
        { title: 'สอบกลางภาค - English for Project Work', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1503', color: 'rose' },
      ],
      21: [{ title: 'สอบกลางภาค - ทักษะดิจิทัล', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1509', color: 'rose' }],
      22: [{ title: 'สอบกลางภาค - การซ่อมบำรุงคอมพิวเตอร์', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1401', color: 'rose' }],
      23: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      24: [{ title: 'สอบกลางภาค - การออกแบบกราฟิกพื้นฐาน', type: 'exam', time: '08:30 - 10:30', location: 'ห้อง 1406', color: 'rose' }],
      28: [{ title: 'วันเฉลิมพระชนมพรรษา ร.10', type: 'holiday', time: 'หยุดราชการ', location: '', color: 'red' }],
      30: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
    },

    // ---------- สิงหาคม 2569 ----------
    7: {
      3: [{ title: 'ประชุมฝ่ายวิชาการ', type: 'academic', time: '09:00 - 12:00', location: 'ห้องประชุม อาคาร 1', color: 'blue' }],
      6: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      12: [{ title: 'วันแม่แห่งชาติ', type: 'holiday', time: 'หยุดราชการ', location: '', color: 'red' }],
      13: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      14: [{ title: 'ส่งโปรเจค 75%', type: 'deadline', time: 'ก่อน 16:30 น.', location: 'ห้อง 1503 / ส่งระบบออนไลน์', color: 'orange' }],
      18: [{ title: 'กิจกรรมสัปดาห์วิทยาศาสตร์', type: 'activity', time: '08:00 - 15:00', location: 'หอประชุม', color: 'violet' }],
      20: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      21: [{ title: 'ส่งงานรายวิชาทักษะดิจิทัล', type: 'deadline', time: 'ก่อน 16:00', location: 'ห้อง 1509', color: 'orange' }],
      27: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      31: [{ title: 'ประกาศตารางสอบปลายภาค', type: 'academic', time: 'ทั้งวัน', location: 'บอร์ดฝ่ายวิชาการ / แอป', color: 'blue' }],
    },

    // ---------- กันยายน 2569 ----------
    8: {
      3: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      10: [{ title: 'รด. (ROTC)', type: 'activity', time: '13:00 - 16:00', location: 'สนามกีฬา', color: 'emerald' }],
      11: [{ title: 'ส่งโปรเจคฉบับสมบูรณ์ 100%', type: 'deadline', time: 'ก่อน 16:30 น.', location: 'ห้อง 1503', color: 'orange' }],
      21: [{ title: 'สอบปลายภาค - วันแรก', type: 'exam', time: '08:30 - 15:30', location: 'ตามผังห้องสอบ', color: 'rose' }],
      22: [{ title: 'สอบปลายภาค', type: 'exam', time: '08:30 - 15:30', location: 'ตามผังห้องสอบ', color: 'rose' }],
      23: [{ title: 'สอบปลายภาค', type: 'exam', time: '08:30 - 15:30', location: 'ตามผังห้องสอบ', color: 'rose' }],
      24: [{ title: 'สอบปลายภาค - วันสุดท้าย', type: 'exam', time: '08:30 - 15:30', location: 'ตามผังห้องสอบ', color: 'rose' }],
      30: [{ title: 'ประกาศผลการเรียน', type: 'academic', time: 'ทั้งวัน', location: 'แอป SBAC Connect', color: 'blue' }],
    },
  },
};

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DAY_NAMES_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const EVENT_TYPE_LABELS = {
  activity: 'กิจกรรม',
  holiday: 'วันหยุด',
  exam: 'สอบ',
  academic: 'วิชาการ',
  deadline: 'กำหนดส่งงาน',
};

const DOT_COLORS = {
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  violet: 'bg-violet-500',
};

const BADGE_COLORS = {
  emerald: { light: 'bg-emerald-50 text-emerald-800 border-emerald-200', dark: 'bg-emerald-900/30 text-emerald-300 border-emerald-800/40' },
  blue: { light: 'bg-blue-50 text-blue-800 border-blue-200', dark: 'bg-blue-900/30 text-blue-300 border-blue-800/40' },
  red: { light: 'bg-red-50 text-red-800 border-red-200', dark: 'bg-red-900/30 text-red-300 border-red-800/40' },
  rose: { light: 'bg-rose-50 text-rose-800 border-rose-200', dark: 'bg-rose-900/30 text-rose-300 border-rose-800/40' },
  amber: { light: 'bg-amber-50 text-amber-900 border-amber-200', dark: 'bg-amber-900/30 text-amber-300 border-amber-800/40' },
  orange: { light: 'bg-orange-50 text-orange-900 border-orange-200', dark: 'bg-orange-900/30 text-orange-300 border-orange-800/40' },
  violet: { light: 'bg-violet-50 text-violet-800 border-violet-200', dark: 'bg-violet-900/30 text-violet-300 border-violet-800/40' },
};

/** ภาคเรียนตามเดือน: พ.ค.–ก.ย. = ภาคเรียนที่ 1, ต.ค.–เม.ย. = ภาคเรียนที่ 2 */
function getSemesterLabel(year, month) {
  const buddhistYear = year + 543;
  if (month >= 4 && month <= 8) return `1/${buddhistYear}`;
  if (month >= 9) return `2/${buddhistYear}`;
  return `2/${buddhistYear - 1}`;
}

export default function AcademicCalendar() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const today = useMemo(() => new Date(), []);

  // เปิดที่เดือนปัจจุบันจริง ๆ ไม่ใช่ hardcode เดือนกรกฎาคม
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);

  // ดึงเฉพาะกิจกรรมของ "เดือนที่กำลังดู" — จุดที่เป็นบั๊กเดิม
  const monthEvents = ACADEMIC_EVENTS[viewYear]?.[viewMonth] || {};

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const isViewingCurrentMonth =
    today.getFullYear() === viewYear && today.getMonth() === viewMonth;
  const currentDay = isViewingCurrentMonth ? today.getDate() : -1;

  const calendarDays = useMemo(() => {
    const cells = [];
    for (let i = 0; i < firstDayOfWeek; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
    return cells;
  }, [firstDayOfWeek, daysInMonth]);

  const eventCount = useMemo(
    () => Object.values(monthEvents).reduce((sum, list) => sum + list.length, 0),
    [monthEvents]
  );

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = 'text-content-muted';

  const selectedEvents = selectedDate ? monthEvents[selectedDate] || [] : [];

  /** เลื่อนเดือนพร้อมข้ามปีให้ถูกต้อง (เดิม ธ.ค. -> ม.ค. ปีเดิม) */
  const shiftMonth = (delta) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setSelectedDate(null);
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(today.getDate());
  };

  const navBtn = `p-2 rounded-xl border transition-all active:scale-95 text-content-secondary ${
    isDark
      ? 'bg-white/5 border-white/10 hover:bg-white/10'
      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
  }`;

  return (
    <div className="space-y-3">
      {/* Calendar Card */}
      <section
        aria-label="ปฏิทินฝ่ายวิชาการ"
        className={`rounded-3xl border p-4 transition-colors duration-300 ${
          isDark ? 'bg-white/[0.06] backdrop-blur-2xl border-white/10' : 'bg-white shadow-card border-slate-100'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 text-brand ${isDark ? 'bg-sbac-blue/30' : 'bg-sbac-blue/10'}`}>
              <Calendar size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm font-extrabold truncate ${textPrimary}`}>ปฏิทินฝ่ายวิชาการ</h3>
              <p className="text-[11px] font-bold text-content-secondary" aria-live="polite">
                {MONTH_NAMES[viewMonth]} {viewYear + 543}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className={navBtn}
              aria-label={`เดือนก่อนหน้า (${MONTH_NAMES[(viewMonth + 11) % 12]})`}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className={navBtn}
              aria-label={`เดือนถัดไป (${MONTH_NAMES[(viewMonth + 1) % 12]})`}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goToToday}
              disabled={isViewingCurrentMonth}
              className={`${navBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
              aria-label="กลับไปเดือนปัจจุบัน"
              title="วันนี้"
            >
              <CalendarCheck size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* แถบภาคเรียน + จำนวนกิจกรรม */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg text-content-secondary ${
              isDark ? 'bg-white/10' : 'bg-slate-100'
            }`}
          >
            ภาคเรียน {getSemesterLabel(viewYear, viewMonth)}
          </span>
          <span className={`text-[10px] font-bold ${textMuted}`}>
            {eventCount > 0 ? `${eventCount} กิจกรรมในเดือนนี้` : 'ไม่มีกิจกรรมในเดือนนี้'}
          </span>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((name, i) => (
            <abbr
              key={name}
              title={`วัน${DAY_NAMES_FULL[i]}`}
              className={`no-underline text-center text-[10px] font-bold py-1 ${
                i === 0 || i === 6 ? 'text-accent-rose' : textMuted
              }`}
            >
              {name}
            </abbr>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="aspect-square" aria-hidden="true" />;
            }

            const events = monthEvents[day] || [];
            const hasEvents = events.length > 0;
            const isToday = day === currentDay;
            const isSelected = day === selectedDate;
            const isWeekend = idx % 7 === 0 || idx % 7 === 6;
            const isHoliday = events.some((e) => e.type === 'holiday');

            const label = hasEvents
              ? `${day} ${MONTH_NAMES[viewMonth]} — ${events.length} กิจกรรม: ${events.map((e) => e.title).join(', ')}`
              : `${day} ${MONTH_NAMES[viewMonth]} — ไม่มีกิจกรรม`;

            return (
              <button
                key={day}
                type="button"
                /* ทุกวันกดได้ ไม่ใช่เฉพาะวันที่มีกิจกรรม (เดิมกดวันว่างไม่ได้เลย
                   ทำให้รู้สึกเหมือนปฏิทินค้าง) วันว่างจะแสดงว่าไม่มีกิจกรรม */
                onClick={() => setSelectedDate(isSelected ? null : day)}
                aria-label={label}
                aria-pressed={isSelected}
                aria-current={isToday ? 'date' : undefined}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all duration-200 cursor-pointer active:scale-90 ${
                  isSelected
                    ? 'bg-sbac-blue text-white shadow-button scale-105'
                    : isToday
                    ? `text-brand font-extrabold ring-1 ${isDark ? 'bg-sbac-blue/25 ring-sbac-blue/50' : 'bg-sbac-blue/10 ring-sbac-blue/40'}`
                    : isHoliday
                    ? `text-accent-rose ${isDark ? 'bg-red-900/20' : 'bg-red-50'}`
                    : isWeekend
                    ? `${textMuted} ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`
                    : `text-content ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`
                }`}
              >
                <span className={`text-xs font-bold leading-none ${isSelected ? 'text-white' : ''}`}>
                  {day}
                </span>

                {hasEvents && (
                  <div className="flex gap-0.5 mt-0.5" aria-hidden="true">
                    {events.slice(0, 3).map((evt, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full ${
                          isSelected ? 'bg-white/80' : DOT_COLORS[evt.color] || 'bg-blue-500'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className={`flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
          {[
            { label: 'กิจกรรม/รด.', color: 'bg-emerald-500' },
            { label: 'สอบ', color: 'bg-rose-500' },
            { label: 'วันหยุด', color: 'bg-red-500' },
            { label: 'กิจกรรมพิเศษ', color: 'bg-violet-500' },
            { label: 'กำหนดส่งงาน', color: 'bg-orange-500' },
            { label: 'วิชาการ', color: 'bg-blue-500' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${item.color}`} aria-hidden="true" />
              <span className={`text-[10px] font-bold ${textMuted}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Event Detail Panel */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div
            key={`${viewYear}-${viewMonth}-${selectedDate}`}
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
                {selectedDate} {MONTH_NAMES[viewMonth]} {viewYear + 543}
              </span>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                aria-label="ปิดรายละเอียดกิจกรรม"
                className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
              >
                <X size={14} className={textMuted} aria-hidden="true" />
              </button>
            </div>

            {selectedEvents.length === 0 ? (
              <p className={`text-[11px] font-semibold py-2 ${textMuted}`}>ไม่มีกิจกรรมในวันนี้</p>
            ) : (
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
                    <div
                      className={`w-1 self-stretch min-h-[40px] rounded-full ${DOT_COLORS[evt.color] || 'bg-blue-500'}`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-xs font-extrabold">{evt.title}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isDark ? 'bg-white/10' : 'bg-white/70'}`}>
                          {EVENT_TYPE_LABELS[evt.type] || evt.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1 text-[10px] font-semibold">
                          <ClockIcon size={10} aria-hidden="true" /> {evt.time}
                        </span>
                        {evt.location && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold">
                            <MapPin size={10} aria-hidden="true" /> {evt.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
