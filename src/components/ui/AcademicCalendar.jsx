import { useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Calendar, ChevronLeft, ChevronRight, X, MapPin, Clock as ClockIcon, CalendarCheck, RefreshCw, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEventsInRange, useClassRooms } from '../../hooks/useEvents';
import {
  MONTH_NAMES,
  EVENT_TYPE_LABELS,
  DOT_COLORS,
  BADGE_COLORS,
  groupByDayOfMonth,
  monthRange,
  eventTimeText,
} from '../../utils/events';

/* ============================================================
   ปฏิทินฝ่ายวิชาการ

   เดิมกิจกรรมทั้งหมดเป็นค่าคงที่ในไฟล์นี้ (ตัวแปร ACADEMIC_EVENTS)
   ฝ่ายวิชาการจึงแก้อะไรเองไม่ได้เลย ต้องให้คนเขียนโค้ดแก้แล้ว deploy ใหม่ทุกครั้ง

   ตอนนี้อ่านจากตาราง events ใน Supabase แทน (10_events.sql)
   และ subscribe realtime ไว้ — ฝ่ายวิชาการกดบันทึกที่หน้าของเขา
   เครื่องนักเรียนที่เปิดค้างอยู่จะอัปเดตเองโดยไม่ต้องรีเฟรช
   ============================================================ */

const DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DAY_NAMES_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/* สีวันหยุดสุดสัปดาห์ ตามธรรมเนียมปฏิทินไทย: อาทิตย์แดง เสาร์ม่วง

   ของเดิมมีปัญหาสองอย่างพร้อมกัน
     1) หัวคอลัมน์ทาสีแดงทั้งเสาร์และอาทิตย์ ทั้งที่ปฏิทินไทยแยกสีสองวันนี้
     2) ตัวเลขวันที่ในช่องเสาร์-อาทิตย์ใช้ text-content-muted ซึ่งเป็นโทนที่จางที่สุด
        ในระบบ (ไว้สำหรับคำอธิบายใต้หัวข้อ) — หัวคอลัมน์จึงบอกว่า "แดง = วันหยุด"
        แต่ตัวเลขข้างล่างกลับเทาจางกว่าวันธรรมดา อ่านแล้วขัดกันเอง
        และตัวเลขวันที่คือของที่คนสแกนหาเร็วที่สุดในปฏิทิน ไม่ควรเป็นตัวที่จางที่สุด

   ใช้ token accent-* ที่ผ่าน AA ทั้งสองธีมอยู่แล้ว หัวคอลัมน์กับตัวเลขใช้สีเดียวกัน */
const WEEKEND_TEXT = {
  0: 'text-accent-rose',   // อาทิตย์
  6: 'text-accent-violet', // เสาร์
};

const WEEKEND_HOVER = {
  0: { dark: 'hover:bg-rose-500/15', light: 'hover:bg-rose-500/10' },
  6: { dark: 'hover:bg-violet-500/15', light: 'hover:bg-violet-500/10' },
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

  // ดึงเฉพาะกิจกรรมของเดือนที่กำลังดู ไม่ดึงมาทั้งตาราง
  const { from, to } = useMemo(() => monthRange(viewYear, viewMonth), [viewYear, viewMonth]);
  const { events, loading, error } = useEventsInRange(from, to);

  // ใช้ติดป้ายว่ากิจกรรมไหนเป็นของห้องไหน
  // นักเรียนจะเห็นเฉพาะของกลางกับของห้องตัวเองอยู่แล้ว (RLS กรองให้)
  // ป้ายนี้มีประโยชน์กับครูที่เห็นทุกห้อง จะได้ไม่สับสน
  const { labelOf } = useClassRooms();

  const monthEvents = useMemo(
    () => groupByDayOfMonth(events, viewYear, viewMonth),
    [events, viewYear, viewMonth]
  );

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

  const eventCount = events.length;

  /* เคยมี effect ตรงนี้ที่ล้าง selectedDate ทิ้งเมื่อเดือนนั้นไม่มีกิจกรรมเลย
     ตั้งใจไว้กันการเลือกค้างหลังลบกิจกรรมจนหมดเดือน แต่เงื่อนไขกว้างเกินไป

     ผลคือเดือนไหนที่ยังไม่มีกิจกรรม (เช่นเดือนถัด ๆ ไปที่ยังไม่ได้ลงปฏิทิน)
     พอผู้ใช้กดวัน setSelectedDate จะถูกล้างทิ้งทันทีในรอบ effect ถัดมา
     กล่องรายละเอียดจึงแวบขึ้นมาแล้วหายไป เหมือนกดแล้วไม่มีอะไรเกิดขึ้น

     ไม่ต้องมี effect นี้เลย เพราะการเปลี่ยนเดือนล้าง selectedDate อยู่แล้ว (goToMonth)
     ซึ่งเป็นกรณีเดียวที่การเลือกค้างไว้แล้วผิดจริง ส่วนการกดดูวันที่ไม่มีกิจกรรม
     แล้วเห็นข้อความ "ไม่มีกิจกรรมในวันนี้" เป็นคำตอบที่ถูกต้อง ไม่ใช่สถานะค้าง */

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

  /** ข้อความสรุปมุมขวาบน — บอกให้รู้ว่ากำลังโหลด / โหลดไม่ได้ / มีกี่กิจกรรม */
  const summaryText = loading
    ? 'กำลังโหลด...'
    : error
    ? 'โหลดกิจกรรมไม่ได้'
    : eventCount > 0
    ? `${eventCount} กิจกรรมในเดือนนี้`
    : 'ไม่มีกิจกรรมในเดือนนี้';

  return (
    <div className="space-y-3">
      {/* Calendar Card */}
      <section
        aria-label="ปฏิทินฝ่ายวิชาการ"
        className={`rounded-3xl border p-4 transition-colors duration-300 ${
          isDark ? 'bg-white/[0.06] backdrop-blur-2xl border-white/10' : 'bg-surface-card shadow-card border-slate-100'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 text-brand ${isDark ? 'bg-sbac-blue/30' : 'bg-sbac-blue/10'}`}>
              {loading ? (
                <RefreshCw size={18} className="animate-spin" aria-hidden="true" />
              ) : (
                <Calendar size={18} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className={`text-sm font-extrabold truncate ${textPrimary}`}>ปฏิทินฝ่ายวิชาการ</h3>
              <p className="text-[12px] font-bold text-content-secondary" aria-live="polite">
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
            className={`text-xs font-bold px-2.5 py-1 rounded-lg text-content-secondary ${
              isDark ? 'bg-white/10' : 'bg-slate-100'
            }`}
          >
            ภาคเรียน {getSemesterLabel(viewYear, viewMonth)}
          </span>
          <span className={`text-xs font-bold ${error ? 'text-accent-rose' : textMuted}`}>
            {summaryText}
          </span>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((name, i) => (
            <abbr
              key={name}
              title={`วัน${DAY_NAMES_FULL[i]}`}
              className={`no-underline text-center text-xs font-extrabold py-1 ${
                WEEKEND_TEXT[i] || 'text-content-secondary'
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

            const dayEvents = monthEvents[day] || [];
            const hasEvents = dayEvents.length > 0;
            const isToday = day === currentDay;
            const isSelected = day === selectedDate;
            const weekday = idx % 7;
            const weekendText = WEEKEND_TEXT[weekday];
            const isHoliday = dayEvents.some((e) => e.type === 'holiday');

            const dayTypeText = isHoliday
              ? 'วันหยุด'
              : weekday === 0
                ? 'วันอาทิตย์'
                : weekday === 6
                  ? 'วันเสาร์'
                  : null;

            const label =
              `${day} ${MONTH_NAMES[viewMonth]}` +
              (dayTypeText ? ` (${dayTypeText})` : '') +
              (hasEvents
                ? ` — ${dayEvents.length} กิจกรรม: ${dayEvents.map((e) => e.title).join(', ')}`
                : ' — ไม่มีกิจกรรม');

            /* ลำดับความสำคัญของสีในช่อง: วันนี้ > วันหยุดราชการ > เสาร์/อาทิตย์ > วันธรรมดา
               ทุกชั้นใช้ token สีตัวอักษรที่ผ่าน AA ไม่มีชั้นไหนตกไปเป็นสีจาง */
            const hover = weekendText
              ? (isDark ? WEEKEND_HOVER[weekday].dark : WEEKEND_HOVER[weekday].light)
              : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100');

            const dayTone = isToday
              /* วันนี้ต้องหาเจอทันทีที่เปิดหน้า พื้นอ่อน 12% บนการ์ดสีครีมแทบมองไม่เห็น
                 จึงเติมเส้นขอบในเข้าไปด้วย เห็นชัดขึ้นโดยไม่ต้องเพิ่มความเข้มของพื้น
                 (พื้นเข้มกว่านี้จะแย่งความเด่นไปจากช่องที่ถูกเลือกซึ่งใช้ ring สีเดียวกัน) */
              ? `text-brand ring-1 ring-inset ring-sbac-blue/35 ${isDark ? 'bg-sbac-blue/25' : 'bg-sbac-blue/12'}`
              : isHoliday
                ? `text-accent-rose ${isDark ? 'bg-rose-500/15' : 'bg-rose-500/10'}`
                : `${weekendText || 'text-content'} ${hover}`;

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
                className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 relative transition-all duration-200 cursor-pointer active:scale-90
                  ${isSelected ? 'ring-2 ring-sbac-blue ring-offset-1 ' + (isDark ? 'ring-offset-surface-dark-elev' : 'ring-offset-surface-card') : ''}
                  ${dayTone}`}
              >
                {/* tabular-nums: ปฏิทินคือตารางตัวเลข ถ้าเลข 1 แคบกว่าเลขอื่น
                    คอลัมน์จะเยื้องกันทั้งแถว — เป็นค่าเริ่มต้นของเบราว์เซอร์ที่ต้องสั่งทับ */}
                <span className="text-xs font-extrabold leading-none tabular-nums">{day}</span>

                {/* จุดกิจกรรม — สูงเท่ากันทุกช่องแม้ไม่มีกิจกรรม ตัวเลขจะได้ไม่ขยับขึ้นลง
                    ระหว่างช่องที่มีกับไม่มี ซึ่งทำให้แถวดูสั่น */}
                <div className="flex gap-[3px] h-1.5 items-center" aria-hidden="true">
                  {hasEvents &&
                    dayEvents.slice(0, 3).map((evt) => (
                      <div
                        key={evt.id}
                        className={`w-1.5 h-1.5 rounded-full ${DOT_COLORS[evt.color] || 'bg-blue-500'}`}
                      />
                    ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className={`flex flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
          {[
            { label: 'กิจกรรม', color: 'bg-emerald-500' },
            { label: 'สอบ', color: 'bg-rose-500' },
            { label: 'วันหยุด', color: 'bg-red-500' },
            { label: 'กิจกรรมพิเศษ', color: 'bg-violet-500' },
            { label: 'กำหนดส่งงาน', color: 'bg-orange-500' },
            { label: 'วิชาการ', color: 'bg-blue-500' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${item.color}`} aria-hidden="true" />
              <span className={`text-xs font-semibold ${textMuted}`}>{item.label}</span>
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
              isDark ? 'bg-white/[0.06] backdrop-blur-2xl border-white/10' : 'bg-surface-card shadow-card border-slate-100'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-bold ${textPrimary}`}>
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
              <p className={`text-[12px] font-semibold py-2 ${textMuted}`}>ไม่มีกิจกรรมในวันนี้</p>
            ) : (
              <div className="space-y-2.5">
                {selectedEvents.map((evt) => (
                  <div
                    key={evt.id}
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
                        <span className="text-xs font-bold">{evt.title}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${isDark ? 'bg-white/10' : 'bg-white/70'}`}>
                          {EVENT_TYPE_LABELS[evt.type] || evt.type}
                        </span>
                        {evt.classRoomId !== null && labelOf(evt.classRoomId) && (
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                              isDark ? 'bg-white/10' : 'bg-white/70'
                            }`}
                          >
                            <Users size={11} aria-hidden="true" />
                            {labelOf(evt.classRoomId)}
                          </span>
                        )}
                      </div>

                      {evt.description && (
                        <p className="text-xs font-semibold leading-relaxed opacity-90">
                          {evt.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1.5 text-xs font-semibold">
                          <ClockIcon size={12} aria-hidden="true" /> {eventTimeText(evt)}
                        </span>
                        {evt.location && (
                          <span className="flex items-center gap-1.5 text-xs font-semibold">
                            <MapPin size={12} aria-hidden="true" /> {evt.location}
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
