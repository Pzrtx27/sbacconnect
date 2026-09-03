import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Calendar, AlertCircle, CalendarClock } from 'lucide-react';
import {
  fetchBaseTimetable,
  fetchSubstitutions,
  applySubstitutions,
  subscribeSubstitutions,
  listClassIds,
  classLabel,
  todayISO,
  addDaysISO,
  weekdayKeyOf,
  describeDate,
  formatThaiDate,
  TIMETABLE_POLL_INTERVAL_MS,
} from '../../utils/timetable';

/* ตารางที่เห็นในหน้านี้ประกอบจากสองชั้น:
     1. ตารางประจำเทอม — อ่านสดจาก Google Sheet (ต้นฉบับที่ฝ่ายวิชาการแก้จริง)
     2. สอนแทนรายวัน   — จาก Supabase ผูกกับ "วันที่" ไม่ใช่ชื่อวัน

   ชั้นที่ 2 วางทับเฉพาะคอลัมน์ของ "วันนี้" เท่านั้น จงใจไม่แตะวันอื่น
   เพราะสอนแทนคือการเปลี่ยนตัวชั่วคราววันเดียว ไม่ใช่การย้ายครูประจำวิชา
   ถ้าไปทาสีทั้งคอลัมน์วันจันทร์ นักเรียนจะเข้าใจผิดว่าจันทร์หน้าก็ยังเป็นครูคนนี้ */

/** ดึงสอนแทนล่วงหน้ากี่วัน — พอให้เห็นของสัปดาห์นี้ ไม่ยาวจนรายการรก */
const UPCOMING_DAYS = 7;

const DAYS_TH = {
  Monday: 'จันทร์',
  Tuesday: 'อังคาร',
  Wednesday: 'พุธ',
  Thursday: 'พฤหัสฯ',
  Friday: 'ศุกร์'
};

/* ครูที่ปรึกษาแต่ละห้อง ยังไม่มีตารางใน DB จึงเขียนไว้ที่นี่ก่อน
   ห้องที่ไม่อยู่ในรายการจะขึ้น "ยังไม่ระบุ" แทนการเดาชื่อครูมั่ว ๆ
   ซึ่งของเดิมทำอยู่ (ห้องไหนที่ไม่ใช่ 3/4 ถูกยัดชื่อ อ.ปิยะนุช ให้หมด) */
const ADVISOR_BY_CLASS = {
  m3_4: 'อ.ธีรวัฒน์ สุทธิธรรมฐากูร',
  m3_6: 'อ.ปิยะนุช พูลศิริ',
};

/* คาบทั้งหมดที่โรงเรียนมี ใช้เป็นเพดานเท่านั้น
   ตารางจริงจะแสดงเฉพาะคาบที่มีวิชาอยู่จริง (ดู visiblePeriods ด้านล่าง)
   ของเดิมโชว์ครบ 11 คาบตายตัว ทำให้คาบ 9-11 เป็นช่องขีดกลางเปล่า ๆ ทุกวัน
   กินความกว้างไปเปล่า ๆ สามคอลัมน์ และดันให้ต้องเลื่อนตารางแนวนอนโดยไม่จำเป็น */
const ALL_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const PERIOD_TIMES = {
  1: '08:30-09:30',
  2: '09:30-10:30',
  3: '10:30-11:30',
  4: '11:30-12:30',
  5: '12:30-13:30',
  6: '13:30-14:00',
  7: '14:00-14:50',
  8: '14:50-15:40',
  9: '15:40-16:30',
  10: '16:30-17:20',
  11: '17:20-18:10',
};

export default function StudentTimetable() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  /* ฝ่ายวิชาการไม่มี student_profile จึงไม่มี class_id เป็นของตัวเอง
     ต้องแยกกับกรณีนักเรียน ไม่งั้นค่า fallback 'm3_6' จะถูกติดป้ายว่า "ห้องฉัน"
     ให้คนที่ไม่ได้อยู่ห้องนั้น */
  const myClassId = user?.class_id || '';
  const initialClassId = myClassId || 'm3_6';

  /* สลับดูห้องอื่นได้เฉพาะฝ่ายวิชาการ ไว้เช็คว่าที่เพิ่งแก้ไปขึ้นจริงไหม
     โดยไม่ต้องออกจากหน้านี้ไปเปิดหน้าจัดการอีกที
     นักเรียนกับครูเห็นแค่ห้องตัวเองเหมือนเดิม — ไม่ใช่เรื่องความลับ
     (RLS เปิดให้อ่านได้ทุกคนอยู่แล้ว) แต่เป็นปุ่มที่ไม่มีเหตุผลให้นักเรียนต้องใช้ */
  const isAcademic = (user?.role || '').toLowerCase().trim() === 'academic';

  const [viewClassId, setViewClassId] = useState(initialClassId);
  const [classIds, setClassIds] = useState([]);

  const [baseTimetable, setBaseTimetable] = useState({});
  const [source, setSource] = useState('loading'); // 'loading' | 'sheet' | 'seed' | 'error'
  const [lastUpdated, setLastUpdated] = useState('');
  const [today, setToday] = useState(todayISO());
  const [subs, setSubs] = useState([]);

  const stamp = () =>
    setLastUpdated(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));

  /* ตารางประจำเทอม: poll จากชีตทุก TIMETABLE_POLL_INTERVAL_MS
     สอนแทน: ดึงพร้อมกัน และมี realtime แยกอีกชั้น (ดู effect ถัดไป)
     ที่แยกจังหวะกันเพราะสองอย่างนี้เร่งด่วนไม่เท่ากัน — ตารางเทอมเปลี่ยนปีละสองครั้ง
     ส่วนสอนแทนเกิดตอนครูลากะทันหันก่อนคาบเริ่ม ช้าไปนาทีเดียวก็สายแล้ว

     คำนวณ "วันนี้" ใหม่ทุกรอบ ไม่ใช่ครั้งเดียวตอน mount
     ถ้าใครเปิดแอปค้างข้ามเที่ยงคืน ตารางต้องเลื่อนตามวันจริง ไม่ค้างที่เมื่อวาน */
  const load = useCallback(async () => {
    const t = todayISO();
    setToday(t);

    const { timetable, source: nextSource } = await fetchBaseTimetable(viewClassId);
    setBaseTimetable(timetable);
    setSource(nextSource);

    // ดึงล่วงหน้า 7 วัน เพื่อให้เห็นประกาศสอนแทนที่ตั้งไว้ล่วงหน้าด้วย
    setSubs(await fetchSubstitutions(viewClassId, t, addDaysISO(t, UPCOMING_DAYS)));
    stamp();
  }, [viewClassId]);

  useEffect(() => {
    setSource('loading');
    load();
    const interval = setInterval(load, TIMETABLE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  /* ฝ่ายวิชาการสั่งสอนแทนแล้วนักเรียนต้องเห็นทันที ไม่ต้องรอรอบ poll ถัดไป */
  useEffect(() => subscribeSubstitutions(viewClassId, load), [viewClassId, load]);

  /* รายชื่อห้องที่ผูกกับชีตแล้ว — ปุ่มสลับห้องสร้างจากอันนี้
     อ่านจาก config ตรง ๆ ไม่ต้องยิง DB จึงไม่มีสถานะโหลด/ล้มเหลวให้จัดการ */
  useEffect(() => {
    if (!isAcademic) return; // นักเรียนไม่มีปุ่มสลับ จึงไม่ต้องคำนวณ
    const ids = listClassIds();
    setClassIds(ids);
    // ฝ่ายวิชาการไม่มีห้องของตัวเอง ถ้าห้องที่เปิดมาไม่มีข้อมูลให้เด้งไปห้องแรกที่มี
    if (!myClassId && ids.length > 0 && !ids.includes(viewClassId)) setViewClassId(ids[0]);
    // เจตนาเช็ค viewClassId แค่ตอนโหลดครั้งแรก ไม่ใช่ทุกครั้งที่กดสลับห้อง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAcademic]);

  /* วางสอนแทนของ "วันนี้" ทับตารางฐาน — คอลัมน์วันอื่นไม่ถูกแตะ
     ส่วนของวันถัดไปแยกไปแสดงเป็นการ์ดประกาศ ไม่เอามาแต้มในตาราง
     เพราะตารางเป็นแม่แบบรายสัปดาห์ ไม่ได้ผูกกับสัปดาห์ใดสัปดาห์หนึ่ง
     ทาสีช่องพุธไว้ล่วงหน้าจะแยกไม่ออกว่าพุธไหน */
  const todaySubs = subs.filter((s) => s.sub_date === today);
  const upcomingSubs = subs.filter((s) => s.sub_date > today);
  const timetable = applySubstitutions(baseTimetable, todaySubs, today);
  const todayKey = weekdayKeyOf(today);

  /* แสดงเฉพาะคาบที่มีวิชาจริงสักวันหนึ่ง
     ห้อง 3/4 เลิกคาบ 6 ส่วน 3/6 มีถึงคาบ 8 — ตารางจึงกว้างไม่เท่ากันตามจริง
     ไม่ใช่ลากยาวถึงคาบ 11 เปล่า ๆ ทั้งสองห้อง
     ถ้ายังไม่มีข้อมูลเลย ใช้ 1-8 ไว้ก่อนไม่ให้หัวตารางหาย */
  const visiblePeriods = (() => {
    const used = new Set();
    for (const periods of Object.values(timetable)) {
      for (const p of Object.keys(periods)) used.add(Number(p));
    }
    if (used.size === 0) return ALL_PERIODS.slice(0, 8);
    const max = Math.max(...used);
    return ALL_PERIODS.filter((p) => p <= max);
  })();

  const STATUS = {
    loading: { label: 'กำลังโหลด...', dot: 'bg-slate-400', tone: isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-secondary' },
    sheet: { label: 'อัปเดตสด', dot: 'bg-emerald-500 animate-pulse', tone: isDark ? 'bg-emerald-950/30 text-accent-emerald' : 'bg-emerald-50 text-accent-emerald' },
    seed: { label: 'ตัวอย่าง (ห้องนี้ยังไม่ผูกกับชีต)', dot: 'bg-amber-500', tone: isDark ? 'bg-amber-950/30 text-accent-amber' : 'bg-amber-50 text-accent-amber' },
    error: { label: 'อ่านชีตไม่สำเร็จ', dot: 'bg-rose-500', tone: isDark ? 'bg-rose-950/30 text-accent-rose' : 'bg-rose-50 text-accent-rose' },
  };
  const status = STATUS[source] || STATUS.loading;

  return (
    <div className="space-y-6 xl:max-w-4xl">
      <div className="flex justify-between items-center">
        <h2 className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
          }`}>
          <Calendar size={24} className="text-brand" />
          ตารางสอน
        </h2>
        {/* aria-live ให้ screen reader ประกาศเองตอนตารางถูกแก้ระหว่างเปิดหน้าอยู่
            ไม่งั้นคนที่มองไม่เห็นจะไม่รู้เลยว่าคาบเปลี่ยนไปแล้ว */}
        <span
          aria-live="polite"
          className={`text-xs font-bold flex items-center gap-1 px-3 py-1 rounded-full transition-colors duration-300 ${status.tone}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {/* สลับดูตารางห้องอื่น — เฉพาะฝ่ายวิชาการ และเฉพาะเมื่อมีมากกว่าหนึ่งห้อง
          ปุ่มเดียวที่กดแล้วไม่มีอะไรให้เลือกคือปุ่มที่ไม่ควรมี */}
      {isAcademic && classIds.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-bold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
            ดูตารางห้อง
          </span>
          {classIds.map((id) => {
            const selected = viewClassId === id;
            const mine = id === myClassId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setViewClassId(id)}
                aria-pressed={selected}
                className={`min-h-[44px] px-4 rounded-xl text-sm font-extrabold border transition-all active:scale-95 ${
                  selected
                    ? 'bg-sbac-blue text-white border-sbac-blue shadow-button'
                    : isDark
                      ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                      : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                }`}
              >
                {classLabel(id)}
                {/* ป้ายนี้ขึ้นเฉพาะคนที่มีห้องของตัวเองจริง ๆ (ฝ่ายวิชาการไม่มี) */}
                {mine && myClassId && (
                  <span className={`ml-1.5 text-[10px] font-bold ${selected ? 'text-white/70' : 'text-content-muted'}`}>
                    ห้องฉัน
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Meta details */}
      <div className={`p-4 rounded-2xl border space-y-2 text-sm font-semibold transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10 text-slate-200' : 'bg-slate-50 border-slate-100 text-ink-secondary'
        }`}>
        {/* แสดงห้องที่กำลังดูอยู่ ไม่ใช่ห้องของคนที่ล็อกอิน
            ไม่งั้นฝ่ายวิชาการกดดูห้อง 3/4 แล้วบรรทัดนี้ยังขึ้น 3/6 ค้างอยู่ */}
        <div className="flex justify-between">
          <span className={isDark ? 'text-content-secondary' : 'text-ink-muted'}>ระดับชั้น / ห้อง</span>
          <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            {classLabel(viewClassId)}
            {viewClassId === myClassId && user?.branch ? ` (${user.branch})` : ''}
          </span>
        </div>
        <div className="flex justify-between">
          <span className={isDark ? 'text-content-secondary' : 'text-ink-muted'}>อาจารย์ที่ปรึกษา</span>
          <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            {ADVISOR_BY_CLASS[viewClassId] || 'ยังไม่ระบุ'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className={isDark ? 'text-content-secondary' : 'text-ink-muted'}>ปีการศึกษา</span>
          <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            1/2569
          </span>
        </div>
        <div className={`text-[10px] border-t pt-2 flex justify-between transition-colors duration-300 ${isDark ? 'text-content-secondary border-white/10' : 'text-ink-muted border-slate-200/50'
          }`}>
          <span>{lastUpdated ? `อัปเดตล่าสุด: ${lastUpdated} น.` : 'กำลังเชื่อมต่อ...'}</span>
          <span className={source === 'sheet' ? 'text-accent-emerald font-bold' : 'text-content-muted font-bold'}>
            {source === 'sheet' ? '● Connected' : '○ Offline'}
          </span>
        </div>
      </div>

      {/* ประกาศสอนแทนล่วงหน้า — ของวันถัดไป ไม่ใช่วันนี้
          แยกเป็นการ์ดเพราะตารางด้านล่างเป็นแม่แบบรายสัปดาห์ ไม่ผูกกับสัปดาห์ใดสัปดาห์หนึ่ง
          ถ้าเอาไปแต้มในช่อง นักเรียนจะแยกไม่ออกว่าเป็นของพุธไหน */}
      {upcomingSubs.length > 0 && (
        <div className={`rounded-2xl border p-4 space-y-2 transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
          }`}>
          <span className={`text-xs font-extrabold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            <CalendarClock size={16} className="text-accent-amber" />
            สอนแทนที่ประกาศไว้ล่วงหน้า
          </span>
          {upcomingSubs.map((sub) => (
            <div
              key={sub.id}
              className={`flex items-start gap-2 text-[11px] font-semibold leading-relaxed ${isDark ? 'text-content-secondary' : 'text-ink-secondary'
                }`}
            >
              <span className="text-accent-amber font-extrabold shrink-0">
                {describeDate(sub.sub_date)}
              </span>
              <span className="min-w-0">
                คาบ {sub.period} · {sub.subject || 'ไม่ระบุวิชา'} — สอนแทนโดย {sub.substitute_teacher || 'รอประกาศ'}
                {sub.substitute_room ? ` (ย้ายไปห้อง ${sub.substitute_room})` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Grid Timetable */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100 shadow-sm'
        }`}>
        <div className="overflow-x-auto scrollbar-hide">
          <table className={`w-full border-collapse text-left min-w-[900px] transition-colors duration-300 ${isDark ? 'divide-white/10' : 'divide-slate-100'
            }`}>
            <thead>
              <tr className={`border-b transition-colors duration-300 ${isDark ? 'bg-white/10 border-white/10' : 'bg-slate-50 border-slate-100'
                }`}>
                <th className={`p-3 text-xs font-extrabold w-16 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
                  }`}>วัน</th>
                {visiblePeriods.map(p => (
                  <th key={p} className={`p-3 text-xs font-extrabold text-center transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
                    }`}>
                    คาบ {p}
                    <span className={`block text-[8px] font-normal mt-0.5 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-muted'
                      }`}>
                      {PERIOD_TIMES[p]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y transition-colors duration-300 ${isDark ? 'divide-white/10' : 'divide-slate-100'
              }`}>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => {
                const periods = (timetable && typeof timetable === 'object' && timetable[day]) || {};
                return (
                  <tr key={day} className={`transition-colors duration-200 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-50/50'
                    }`}>
                    <td className={`p-3 text-xs font-extrabold transition-colors duration-300 ${isDark ? 'text-white bg-white/10' : 'text-sbac-navy bg-slate-50/30'
                      }`}>
                      {DAYS_TH[day] || day}
                      {day === todayKey && (
                        <span className="block text-[8px] font-bold text-brand mt-0.5">วันนี้</span>
                      )}
                    </td>
                    {visiblePeriods.map(p => {
                      const period = (periods && typeof periods === 'object' && periods[p]) || { subject: '', teacher: '', room: '' };
                      const isSubstituted = Boolean(period.is_substituted);
                    return (
                      <td
                        key={p}
                        className={`p-2.5 text-center transition-all duration-300 ${isSubstituted
                          ? (isDark ? 'bg-rose-950/30 border border-rose-900/40 animate-pulse' : 'bg-rose-50 border border-rose-100 animate-pulse')
                          : period.subject === 'พักกลางวัน'
                            ? (isDark ? 'bg-white/5 text-content-muted' : 'bg-slate-50/70 text-ink-muted')
                            : ''
                          }`}
                      >
                        {period.subject ? (
                          <div className="space-y-0.5 animate-fade-in">
                            <div className={`text-xs font-extrabold transition-colors duration-300 ${isSubstituted
                              ? (isDark ? 'text-accent-rose' : 'text-accent-rose')
                              : (isDark ? 'text-white' : 'text-sbac-navy')
                              }`}>
                              {period.subject}
                            </div>
                            {period.teacher && (
                              <div className={`text-[9px] font-semibold transition-colors duration-300 ${isDark ? 'text-slate-200' : 'text-ink-secondary'
                                }`}>
                                {isSubstituted ? `สอนแทน: ${period.substitute_teacher || period.teacher}` : period.teacher}
                              </div>
                            )}
                            {period.room && (
                              <div className={`text-[8px] font-bold inline-block px-1.5 py-0.5 rounded transition-colors duration-300 ${isSubstituted
                                ? (isDark ? 'bg-rose-900/40 text-accent-rose' : 'bg-rose-100 text-accent-rose')
                                : (isDark ? 'bg-white/15 text-slate-200' : 'bg-slate-100 text-ink-secondary')
                                }`}>
                                {isSubstituted && period.substitute_room ? period.substitute_room : period.room}
                              </div>
                            )}
                            {/* ย้ำว่าเป็นของวันนี้วันเดียว จะได้ไม่เข้าใจว่าเปลี่ยนครูถาวร */}
                            {isSubstituted && (
                              <div className="text-[8px] font-extrabold text-accent-rose">เฉพาะวันนี้</div>
                            )}
                          </div>
                        ) : (
                          <span className={`text-[10px] font-bold transition-colors duration-300 ${isDark ? 'text-content-muted' : 'text-content-secondary'
                            }`}>-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>

      <div className={`flex gap-2 items-start p-3 rounded-2xl border transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
        }`}>
        <AlertCircle className="text-accent-rose flex-shrink-0 mt-0.5" size={16} />
        <p className={`text-[10px] leading-relaxed transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-muted'
          }`}>
          <strong>หมายเหตุ:</strong> ช่องแถบสีแดงกระพริบคือคาบที่ฝ่ายวิชาการสั่งครูสอนแทนหรือย้ายห้องไว้
          <strong> เฉพาะวันที่ {formatThaiDate(today)} เท่านั้น</strong> — สัปดาห์ถัดไปตารางจะกลับเป็นปกติเอง
          สั่งสอนแทนเมื่อไหร่หน้านี้เปลี่ยนตามทันทีโดยไม่ต้องรีเฟรช ส่วนตารางประจำเทอมอ่านจาก Google Sheet
        </p>
      </div>
    </div>
  );
}
