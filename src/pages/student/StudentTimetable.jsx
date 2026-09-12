import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import PageHeader from '../../components/layout/PageHeader';
import { useMyClassInfo } from '../../hooks/useMyClassInfo';
import { Calendar, AlertCircle, CalendarClock, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  fetchBaseTimetable,
  fetchTeacherTimetable,
  hasTeacherTimetable,
  fetchSubstitutions,
  applySubstitutions,
  subscribeSubstitutions,
  listClassIds,
  classLabel,
  timetableTitle,
  todayISO,
  addDaysISO,
  nextSchoolDay,
  isSchoolDay,
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

  /* โหมด "ตารางสอนของฉัน" สำหรับครูที่ตั้งแท็บชีตส่วนตัวไว้แล้ว (ดู TIMETABLE_TAB_GID_BY_TEACHER)

     ของเดิมครูไม่มี class_id จึงตกไปที่ค่า fallback 'm3_6' แล้วเห็นตารางของห้องนั้น
     ทั้งที่ไม่ได้เกี่ยวกับตัวเองเลย — โหมดนี้อ่านจากแท็บของครูคนนั้นแทน

     กันนักเรียนไว้ที่เงื่อนไข role ด้วยอีกชั้น ถึงแม้นักเรียนจะไม่มีทางมี key ในแผนที่นั้นอยู่แล้ว
     (ไม่มี teacher_code และอีเมลก็ไม่ได้ถูกใส่ไว้) — ฝั่งนักเรียนต้องไม่เปลี่ยนอะไรเลยแม้แต่นิดเดียว */
  const isStudentRole = (user?.role || 'student').toLowerCase().trim() === 'student';
  const isTeacherRole = (user?.role || '').toLowerCase().trim() === 'teacher';

  /* ครูต้องอยู่โหมด "ตารางสอนของฉัน" เสมอ ไม่ใช่เฉพาะคนที่ตั้งชีตไว้แล้ว
   *
   * ของเดิม teacherMode ผูกกับ hasTeacherTimetable() ครูที่ยังไม่ได้ตั้งชีต
   * จึงตกไปเส้นทางของนักเรียน แล้ว viewClassId ใช้ค่า fallback 'm3_6'
   * ผลคือเปิด "ตารางสอนของฉัน" มาเห็นตารางของห้อง ปวช.3/6 พร้อมบรรทัด
   * "อาจารย์ที่ปรึกษา: อ.ปิยะนุช" ทั้งที่ไม่ได้เกี่ยวกับตัวเองเลย
   * และไม่มีอะไรบอกว่านี่ไม่ใช่ของเขา — ผิดแบบเงียบ ๆ ซึ่งแย่กว่าไม่มีข้อมูล
   *
   * fetchTeacherTimetable() มีทางออก source: 'unset' รองรับไว้แล้ว
   * แต่เดิมเข้าไม่ถึงเพราะด่านนี้กันไว้ก่อน กลายเป็นโค้ดตาย
   *
   * ฝ่ายวิชาการ/แอดมินไม่เข้าโหมดนี้ เพราะหน้าที่ของเขาคือไล่ดูตารางของห้องต่าง ๆ */
  const teacherMode = isTeacherRole || (!isStudentRole && !isAcademic && hasTeacherTimetable(user));

  const [viewClassId, setViewClassId] = useState(initialClassId);
  const [classIds, setClassIds] = useState([]);

  const [baseTimetable, setBaseTimetable] = useState({});
  const [source, setSource] = useState('loading'); // 'loading' | 'sheet' | 'seed' | 'error'
  const [lastUpdated, setLastUpdated] = useState('');
  const [today, setToday] = useState(todayISO());
  const [subs, setSubs] = useState([]);
  /* วันที่ที่กำลังดูอยู่ — ค่าเริ่มต้นคือวันนี้ หน้านี้จึงเปิดมาเหมือนเดิมทุกประการ
     ที่ต้องมีตัวนี้: ตารางเป็นแม่แบบรายสัปดาห์ที่มีแต่ชื่อวัน คนเปิดดูจึงเห็นได้แค่
     "วันพุธเรียนอะไร" แต่ไม่มีทางดูว่า "พุธที่ 17 มีสอนแทนไหม" เพราะสอนแทนผูกกับวันที่จริง
     ของเดิมวางทับให้เฉพาะวันนี้วันเดียว วันอื่นต้องรอให้ถึงวันนั้นถึงจะเห็น */
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const stamp = () =>
    setLastUpdated(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));

  /* โหลดแยกเป็นสองชุด ไม่ใช่ก้อนเดียวเหมือนเดิม เพราะสองอย่างนี้เปลี่ยนคนละจังหวะ:
       ตารางประจำเทอม  เปลี่ยนตาม "ห้อง" อย่างเดียว (ปีละสองครั้ง)
       สอนแทนรายวัน    เปลี่ยนตาม "ห้อง + ช่วงวันที่ที่กำลังดู" และเร่งด่วนกว่ามาก

     ถ้ารวมไว้ก้อนเดียว การกดเปลี่ยนวันที่ในปฏิทินจะลากให้ไปโหลด CSV ของชีตใหม่ทุกครั้ง
     สถานะเด้งกลับเป็น "กำลังโหลด..." และตารางว่างแวบหนึ่งทั้งที่ตารางเทอมไม่ได้เปลี่ยนเลย */
  const loadBase = useCallback(async () => {
    /* คำนวณ "วันนี้" ใหม่ทุกรอบ ไม่ใช่ครั้งเดียวตอน mount
       ถ้าใครเปิดแอปค้างข้ามเที่ยงคืน ตารางต้องเลื่อนตามวันจริง ไม่ค้างที่เมื่อวาน */
    setToday(todayISO());

    const { timetable, source: nextSource } = teacherMode
      ? await fetchTeacherTimetable(user)
      : await fetchBaseTimetable(viewClassId);
    setBaseTimetable(timetable);
    setSource(nextSource);
    stamp();
  }, [viewClassId, teacherMode, user]);

  /* ช่วงที่ดึงต้องครอบทั้งสองอย่าง: วันที่ที่ผู้ใช้เลือกอยู่ (ย้อนหลังหรือล่วงหน้าก็ได้)
     และ 7 วันข้างหน้าที่การ์ด "ประกาศล่วงหน้า" ใช้ — คำสั่งเดียวจบ ไม่ต้องยิงสองรอบ */
  const loadSubs = useCallback(async () => {
    /* สอนแทนผูกกับ "ห้อง" (substitutions.class_id) ไม่ได้ผูกกับครู
       โหมดตารางของครูจึงไม่มีห้องให้ถาม — ถามไปก็ได้ของห้อง m3_6 ที่ไม่เกี่ยวกัน
       ดีกว่าไม่ถามแล้วบอกตรง ๆ ว่าตารางนี้เป็นตารางประจำเทอมล้วน (ดูหมายเหตุท้ายหน้า) */
    if (teacherMode) {
      setSubs([]);
      return;
    }

    const t = todayISO();
    const upcomingEnd = addDaysISO(t, UPCOMING_DAYS);
    const from = selectedDate < t ? selectedDate : t;
    const to = selectedDate > upcomingEnd ? selectedDate : upcomingEnd;

    setSubs(await fetchSubstitutions(viewClassId, from, to));
  }, [viewClassId, selectedDate, teacherMode]);

  useEffect(() => {
    setSource('loading');
    loadBase();
    const interval = setInterval(loadBase, TIMETABLE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadBase]);

  useEffect(() => {
    loadSubs();
    const interval = setInterval(loadSubs, TIMETABLE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadSubs]);

  /* ฝ่ายวิชาการสั่งสอนแทนแล้วนักเรียนต้องเห็นทันที ไม่ต้องรอรอบ poll ถัดไป

     ยิงผ่าน ref เพื่อให้ช่องสัญญาณผูกกับ "ห้อง" อย่างเดียว
     ถ้าใส่ loadSubs เป็น dependency ตรง ๆ การกดเปลี่ยนวันที่แต่ละครั้งจะปิด-เปิด
     ช่อง realtime ใหม่ทุกครั้ง ซึ่งไม่จำเป็นและมีจังหวะที่ไม่มีใครฟังอยู่ */
  const loadSubsRef = useRef(loadSubs);
  loadSubsRef.current = loadSubs;
  useEffect(() => subscribeSubstitutions(viewClassId, () => loadSubsRef.current()), [viewClassId]);

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

  /* วางสอนแทนของ "วันที่ที่เลือก" ทับตารางฐาน — แถววันอื่นไม่ถูกแตะ

     ของเดิมผูกกับวันนี้ตายตัว ด้วยเหตุผลว่าตารางเป็นแม่แบบรายสัปดาห์
     ถ้าทาสีช่องพุธไว้ล่วงหน้าจะแยกไม่ออกว่าพุธไหน — ซึ่งจริงตอนที่ยังไม่มีปฏิทิน
     พอมีตัวเลือกวันที่แล้ว หน้าเว็บบอกได้ตรง ๆ ว่ากำลังดูวันไหนอยู่ (ดูแถบวันที่และป้ายในแถว)
     เงื่อนไขที่เคยกันไว้จึงหมดไป และกลายเป็นความสามารถที่คนขอมาแทน

     ค่าเริ่มต้น selectedDate = วันนี้ ทุกอย่างจึงเหมือนเดิมถ้าไม่ไปแตะปฏิทิน */
  const selectedSubs = subs.filter((s) => s.sub_date === selectedDate);
  const upcomingSubs = subs.filter((s) => s.sub_date > today);
  const timetable = applySubstitutions(baseTimetable, selectedSubs, selectedDate);
  const todayKey = weekdayKeyOf(today);
  const selectedKey = weekdayKeyOf(selectedDate);
  const isToday = selectedDate === today;

  /* คาบของวันที่เลือก เรียงตามลำดับคาบ — ใช้ในการ์ดสรุปด้านบนตาราง
     บนมือถือตารางทั้งผืนต้องเลื่อนแนวนอนกว่าจะเห็นคาบท้าย ๆ (ดูภาพที่ผู้ใช้ส่งมา)
     การ์ดนี้จึงเป็นทางอ่าน "วันเดียว" แบบเลื่อนลงอย่างเดียว ไม่ต้องเลื่อนข้าง */
  const selectedPeriods = (() => {
    const dayPeriods = (selectedKey && timetable?.[selectedKey]) || {};
    return Object.keys(dayPeriods)
      .map(Number)
      .filter((p) => dayPeriods[p]?.subject)
      .sort((a, b) => a - b)
      .map((p) => ({ period: p, ...dayPeriods[p] }));
  })();

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
    /* สองสถานะนี้มีเฉพาะโหมดตารางของครู — ฝั่งห้องเรียนมีข้อมูลตัวอย่างรองรับอยู่แล้ว
       จึงไม่มีทางว่างเปล่า ส่วนตารางของครูเดาแทนให้ไม่ได้ ต้องบอกตรง ๆ ว่ายังไม่มี */
    unset: { label: 'ยังไม่ได้ผูกแท็บตารางของครูคนนี้', dot: 'bg-amber-500', tone: isDark ? 'bg-amber-950/30 text-accent-amber' : 'bg-amber-50 text-accent-amber' },
    empty: { label: 'แท็บนี้ยังไม่มีข้อมูล', dot: 'bg-amber-500', tone: isDark ? 'bg-amber-950/30 text-accent-amber' : 'bg-amber-50 text-accent-amber' },
  };
  /* ครูที่ปรึกษาของห้องตัวเอง — ดึงจากฐานข้อมูล (my_class_info)
     ADVISOR_BY_CLASS ด้านบนเป็นค่าที่เขียนไว้ตายตัวตั้งแต่ยังไม่มีข้อมูลใน DB
     ครอบแค่สองห้อง และไม่มีอะไรทำให้มันตามการเปลี่ยนครูประจำชั้นในระบบ
     จึงเหลือไว้เป็นทางถอยสำหรับห้องอื่นที่ฝ่ายวิชาการเปิดดูเท่านั้น */
  const { info: classInfo } = useMyClassInfo();
  const advisorName =
    (viewClassId === myClassId && classInfo?.advisor_name) ||
    ADVISOR_BY_CLASS[viewClassId] ||
    'ยังไม่ระบุ';

  const status = STATUS[source] || STATUS.loading;

  return (
    /* ไม่ใส่ READING_WIDTH ที่หน้านี้ — ของเดิมคุมไว้ที่ 896px ทั้งที่ตารางข้างล่าง
       ขอขั้นต่ำ 900px อยู่แล้ว คือบีบจนต้องเลื่อนแนวนอนตั้งแต่ยังไม่ทันมีอะไร
       แล้วยังไม่ได้จัดกลาง จอ 1600px จึงเหลือที่ว่างเป็นแถบใหญ่ข้างขวาข้างเดียว
       หน้านี้เป็นตารางแปดคาบ ไม่ใช่ข้อความเรียงลงมา ยิ่งกว้างยิ่งอ่านง่าย
       จึงใช้ความกว้างของเปลือกเต็ม ๆ ตามกติกาเดียวกับหน้าฝ่ายวิชาการ (ดู utils/layout.js) */
    <div className="space-y-6">
      {/* นักเรียนเรียกว่า "ตารางเรียน" ครู/ฝ่ายวิชาการเรียกว่า "ตารางสอน"
          หน้าเดียวกัน คนละคำตามบทบาทของคนเปิดดู (ดู timetableTitle ใน utils/timetable.js) */}
      <PageHeader icon={Calendar} title={timetableTitle(user?.role)}>
        {/* aria-live ให้ screen reader ประกาศเองตอนตารางถูกแก้ระหว่างเปิดหน้าอยู่
            ไม่งั้นคนที่มองไม่เห็นจะไม่รู้เลยว่าคาบเปลี่ยนไปแล้ว */}
        <span
          aria-live="polite"
          className={`text-xs font-bold flex items-center gap-1 px-3 py-1 rounded-full transition-colors duration-300 ${status.tone}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </PageHeader>

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
                  <span className={`ml-1.5 text-[11px] font-bold ${selected ? 'text-white/70' : 'text-content-muted'}`}>
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
        {/* บนมือถือยังเป็นบรรทัด "ป้าย ...... ค่า" เหมือนเดิม
            แต่บนจอกว้าง justify-between จะดันค่าไปติดขอบขวาห่างจากป้ายครึ่งจอ
            จนต้องกวาดตาหาว่าค่าไหนคู่กับป้ายไหน — xl จึงเปลี่ยนเป็นสามคอลัมน์
            ป้ายอยู่บน ค่าอยู่ล่าง ซึ่งใช้ที่ว่างที่เพิ่มมาแทนที่จะปล่อยเป็นช่องโหว่กลางการ์ด */}
        <div className="space-y-2 xl:space-y-0 xl:grid xl:grid-cols-3 xl:gap-6">
          {/* โหมดตารางของครูไม่มี "ห้อง" ให้พูดถึง — ตารางนี้เป็นของคน ไม่ใช่ของห้อง
              ถ้าปล่อยให้ขึ้น "ปวช.3/6" ค้างไว้ ครูจะเข้าใจว่ากำลังดูตารางของห้องนั้นอยู่

              ส่วนฝั่งนักเรียน/วิชาการ แสดงห้องที่กำลังดูอยู่ ไม่ใช่ห้องของคนที่ล็อกอิน
              ไม่งั้นฝ่ายวิชาการกดดูห้อง 3/4 แล้วบรรทัดนี้ยังขึ้น 3/6 ค้างอยู่ */}
          <div className="flex justify-between gap-3 xl:flex-col xl:justify-start xl:gap-0.5">
            <span className={isDark ? 'text-content-secondary' : 'text-ink-muted'}>
              {teacherMode ? 'ตารางของ' : 'ระดับชั้น / ห้อง'}
            </span>
            <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
              {teacherMode ? (user?.name || '—') : classLabel(viewClassId)}
            </span>
          </div>
          <div className="flex justify-between gap-3 xl:flex-col xl:justify-start xl:gap-0.5">
            <span className={isDark ? 'text-content-secondary' : 'text-ink-muted'}>
              {teacherMode ? 'รหัสครู / แผนก' : 'อาจารย์ที่ปรึกษา'}
            </span>
            <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
              {teacherMode
                ? [user?.teacher_code, user?.department].filter(Boolean).join(' · ') || '—'
                : advisorName}
            </span>
          </div>
          <div className="flex justify-between gap-3 xl:flex-col xl:justify-start xl:gap-0.5">
            <span className={isDark ? 'text-content-secondary' : 'text-ink-muted'}>ปีการศึกษา</span>
            <span className={`font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
              1/2569
            </span>
          </div>
        </div>
        <div className={`text-[11px] border-t pt-2 flex justify-between transition-colors duration-300 ${isDark ? 'text-content-secondary border-white/10' : 'text-ink-muted border-slate-200/50'
          }`}>
          <span>{lastUpdated ? `อัปเดตล่าสุด: ${lastUpdated} น.` : 'กำลังเชื่อมต่อ...'}</span>
          <span className={source === 'sheet' ? 'text-accent-emerald font-bold' : 'text-content-muted font-bold'}>
            {source === 'sheet' ? '● Connected' : '○ Offline'}
          </span>
        </div>
      </div>

      {/* ครูที่ยังไม่ได้ผูกตารางสอนของตัวเอง
          ต้องบอกตรง ๆ ว่ายังไม่มี ไม่ใช่โชว์ตารางของห้องอื่นให้เข้าใจผิด
          และต้องบอกด้วยว่าไปให้ใครทำ ไม่ใช่ปล่อยให้เจอทางตัน */}
      {source === 'unset' && (
        <div
          role="status"
          className={`rounded-2xl border p-4 space-y-1.5 transition-colors duration-300 ${
            isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'
          }`}
        >
          <p className={`text-xs font-extrabold ${isDark ? 'text-accent-amber' : 'text-amber-700'}`}>
            ยังไม่ได้ผูกตารางสอนของคุณ
          </p>
          <p className={`text-[12px] font-semibold leading-relaxed ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
            บัญชีนี้ยังไม่มีตารางสอนส่วนตัวในระบบ จึงยังไม่มีอะไรให้แสดง
            แจ้งฝ่ายวิชาการให้เพิ่มตารางสอนของคุณเข้าระบบก่อน
          </p>
        </div>
      )}

      {/* ประกาศสอนแทนล่วงหน้า — ของวันถัดไป ไม่ใช่วันนี้
          แยกเป็นการ์ดเพราะตารางด้านล่างเป็นแม่แบบรายสัปดาห์ ไม่ผูกกับสัปดาห์ใดสัปดาห์หนึ่ง
          ถ้าเอาไปแต้มในช่อง นักเรียนจะแยกไม่ออกว่าเป็นของพุธไหน */}
      {upcomingSubs.length > 0 && (
        <div className={`rounded-2xl border p-4 space-y-2 transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
          }`}>
          <span className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            <CalendarClock size={16} className="text-accent-amber" />
            สอนแทนที่ประกาศไว้ล่วงหน้า
          </span>
          {upcomingSubs.map((sub) => (
            <div
              key={sub.id}
              className={`flex items-start gap-2 text-[12px] font-semibold leading-relaxed ${isDark ? 'text-content-secondary' : 'text-ink-secondary'
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

      {/* เลือกวันที่ + คาบของวันนั้น
          ใช้ input type="date" ของเบราว์เซอร์ตรง ๆ ไม่เขียนปฏิทินเอง
          เพราะของเบราว์เซอร์รองรับทั้งแป้นพิมพ์ screen reader และปฏิทินบนมือถือมาแล้ว
          ปุ่มลูกศรเป็นทางลัดสำหรับ "วันถัดไป/ก่อนหน้า" ซึ่งเป็นการกดที่เจอบ่อยสุด */}
      <div className={`rounded-3xl border p-4 space-y-4 transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
        }`}>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="timetable-date"
            className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-sbac-navy'}`}
          >
            <CalendarDays size={16} className="text-brand" />
            ดูตารางวันที่
          </label>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedDate(nextSchoolDay(selectedDate, -1))}
              aria-label="วันเรียนก่อนหน้า"
              className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-colors active:scale-95 ${isDark
                ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                }`}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>

            {/* [color-scheme:dark] ทำให้ปฏิทินของเบราว์เซอร์เป็นธีมมืดตาม
                ไม่งั้นกดแล้วได้ป๊อปอัปสีขาวจ้าทับหน้าจอมืด */}
            <input
              id="timetable-date"
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className={`min-h-[44px] px-3 rounded-xl border text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-sbac-blue/30 ${isDark
                ? 'bg-black border-neutral-800 text-white [color-scheme:dark]'
                : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
            />

            <button
              type="button"
              onClick={() => setSelectedDate(nextSchoolDay(selectedDate, 1))}
              aria-label="วันเรียนถัดไป"
              className={`w-11 h-11 flex items-center justify-center rounded-xl border transition-colors active:scale-95 ${isDark
                ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                }`}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          {/* ปุ่มกลับวันนี้โผล่เฉพาะตอนที่ไม่ได้อยู่ที่วันนี้ — ปุ่มที่กดแล้วไม่เกิดอะไรไม่ควรมี */}
          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="min-h-[44px] px-3 rounded-xl text-xs font-extrabold text-brand hover:underline"
            >
              กลับไปวันนี้
            </button>
          )}

          {/* บอกวันที่ที่กำลังดูเป็นตัวหนังสือ ไม่ใช่ให้ไปอ่านเอาเองจากช่อง input
              aria-live ให้ screen reader ประกาศตอนกดลูกศรเปลี่ยนวัน */}
          <span
            aria-live="polite"
            className={`text-xs font-extrabold px-3 py-1 rounded-full ${isToday
              ? (isDark ? 'bg-sbac-blue/20 text-brand' : 'bg-sbac-blue-50 text-brand')
              : (isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-secondary')
              }`}
          >
            {describeDate(selectedDate)}
          </span>
        </div>

        {/* สรุปคาบของวันที่เลือก — อ่านได้โดยไม่ต้องเลื่อนตารางแนวนอนบนมือถือ */}
        {selectedPeriods.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {selectedPeriods.map((slot) => (
              <div
                key={slot.period}
                className={`rounded-2xl border p-3 space-y-1.5 transition-colors duration-300 ${slot.is_substituted
                  ? (isDark ? 'bg-rose-950/30 border-rose-800/60' : 'bg-rose-50 border-rose-300')
                  : (isDark ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-100')
                  }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-brand">คาบ {slot.period}</span>
                  <span className={`text-[10px] font-bold ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
                    {PERIOD_TIMES[slot.period] || ''}
                  </span>
                </div>

                {slot.is_substituted && (
                  <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-accent-rose text-white">
                    <CalendarClock size={9} aria-hidden="true" />
                    สอนแทน
                  </div>
                )}

                <div className={`text-xs font-bold leading-snug ${slot.is_substituted
                  ? 'text-accent-rose'
                  : (isDark ? 'text-white' : 'text-sbac-navy')
                  }`}>
                  {slot.subject}
                </div>

                {(slot.teacher || slot.substitute_teacher) && (
                  <div className={`text-[10px] font-semibold leading-tight ${isDark ? 'text-slate-200' : 'text-ink-secondary'}`}>
                    {slot.is_substituted ? (
                      <>
                        <span className="block font-extrabold text-accent-rose">
                          สอนโดย {slot.substitute_teacher || 'ยังไม่ระบุ'}
                        </span>
                        {slot.teacher && (
                          <span className={`block ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
                            แทน {slot.teacher}
                          </span>
                        )}
                      </>
                    ) : (
                      <>สอนโดย {slot.teacher}</>
                    )}
                  </div>
                )}

                {(slot.room || slot.substitute_room) && (
                  <div className={`text-[9px] font-bold inline-block px-1.5 py-0.5 rounded ${slot.is_substituted
                    ? (isDark ? 'bg-rose-900/40 text-accent-rose' : 'bg-rose-100 text-accent-rose')
                    : (isDark ? 'bg-white/15 text-slate-200' : 'bg-slate-100 text-ink-secondary')
                    }`}>
                    {slot.is_substituted && slot.substitute_room && slot.substitute_room !== slot.room ? (
                      <>
                        <span className="line-through opacity-60">{slot.room}</span>
                        {' → '}
                        {slot.substitute_room}
                      </>
                    ) : (
                      slot.substitute_room || slot.room
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={`text-xs font-semibold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
            {/* แยกสองกรณีให้ชัด: วันหยุดคือ "ไม่มีคาบอยู่แล้ว" ส่วนวันเรียนที่ว่างเปล่า
                แปลว่าตารางยังไม่ถูกกรอกเข้าระบบ ซึ่งเป็นคนละเรื่องและต้องไปตามคนละทาง */}
            {!isSchoolDay(selectedDate)
              ? `${describeDate(selectedDate)} เป็นวันหยุด ไม่มีคาบเรียนตามตารางปกติ`
              : teacherMode
              ? `วัน${DAYS_TH[selectedKey] || ''}ไม่มีคาบสอนในตารางของคุณ`
              : `ยังไม่มีตารางของวัน${DAYS_TH[selectedKey] || ''}สำหรับห้อง ${classLabel(viewClassId)} ในระบบ`}
          </p>
        )}
      </div>

      {/* Grid Timetable */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100 shadow-sm'
        }`}>
        <div className="overflow-x-auto scrollbar-hide">
          <table className={`w-full border-collapse text-left min-w-[900px] transition-colors duration-300 ${isDark ? 'divide-white/10' : 'divide-slate-100'
            }`}>
            <thead>
              <tr className={`border-b transition-colors duration-300 ${isDark ? 'bg-white/10 border-white/10' : 'bg-slate-50 border-slate-100'
                }`}>
                <th className={`p-3 text-xs font-bold w-16 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
                  }`}>วัน</th>
                {visiblePeriods.map(p => (
                  <th key={p} className={`p-3 text-xs font-bold text-center transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
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
                /* แถวของวันที่เลือกคือแถวเดียวที่มีสอนแทนวางทับอยู่ ต้องดูออกว่าเป็นแถวไหน
                   ไม่งั้นคนเลือกวันพุธที่ 17 แล้วเห็นช่องแดงโผล่ในแถวพุธ จะนึกว่าพุธไหนก็ได้ */
                const isSelectedRow = day === selectedKey;
                return (
                  <tr
                    key={day}
                    className={`transition-colors duration-200 ${isSelectedRow
                      ? (isDark ? 'bg-sbac-blue/10' : 'bg-sbac-blue-50/60')
                      : (isDark ? 'hover:bg-white/10' : 'hover:bg-slate-50/50')
                      }`}
                  >
                    <td className={`p-3 text-xs font-bold transition-colors duration-300 ${isDark ? 'text-white bg-white/10' : 'text-sbac-navy bg-slate-50/30'
                      }`}>
                      {DAYS_TH[day] || day}
                      {/* ป้ายบอก "วันที่ที่กำลังดู" มาก่อน ส่วน "วันนี้" ขึ้นเฉพาะตอนที่เป็นคนละแถวกัน
                          จะได้ไม่มีสองป้ายซ้อนกันในช่องกว้าง 64px ตอนที่ทั้งสองอย่างเป็นแถวเดียวกัน */}
                      {isSelectedRow && (
                        <span className="block text-[8px] font-bold text-brand mt-0.5 leading-tight">
                          {isToday ? 'วันนี้' : formatThaiDate(selectedDate)}
                        </span>
                      )}
                      {day === todayKey && !isSelectedRow && (
                        <span className={`block text-[8px] font-bold mt-0.5 ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
                          วันนี้
                        </span>
                      )}
                    </td>
                    {visiblePeriods.map(p => {
                      const period = (periods && typeof periods === 'object' && periods[p]) || { subject: '', teacher: '', room: '' };
                      const isSubstituted = Boolean(period.is_substituted);
                    return (
                      <td
                        key={p}
                        /* ไม่ใช้ animate-pulse — ของเดิมช่องกระพริบไม่หยุดตลอดเวลาที่เปิดหน้าอยู่
                           กวนสายตาและอ่านยากกว่าเดิม ใช้กรอบแดงหนา + ป้ายซึ่งบอกชัดกว่าและอยู่นิ่ง */
                        className={`p-2.5 text-center align-top transition-colors duration-300 ${isSubstituted
                          ? (isDark ? 'bg-rose-950/30 border-2 border-rose-800/60' : 'bg-rose-50 border-2 border-rose-300')
                          : period.subject === 'พักกลางวัน'
                            ? (isDark ? 'bg-white/5 text-content-muted' : 'bg-slate-50/70 text-ink-muted')
                            : ''
                          }`}
                      >
                        {period.subject ? (
                          <div className="space-y-1">
                            {/* ป้ายมาก่อนชื่อวิชา เพราะเป็นสิ่งที่ต้องเห็นก่อนว่าคาบนี้เปลี่ยน */}
                            {isSubstituted && (
                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-accent-rose text-white">
                                <CalendarClock size={8} aria-hidden="true" />
                                สอนแทน
                              </div>
                            )}

                            <div className={`text-xs font-bold ${isSubstituted
                              ? 'text-accent-rose'
                              : (isDark ? 'text-white' : 'text-sbac-navy')
                              }`}>
                              {period.subject}
                            </div>

                            {/* บอกให้ครบว่าใครสอน และเดิมใครควรสอน
                               ของเดิมพอสั่งสอนแทนแล้วชื่อครูเดิมหายไปเลย นักเรียนจึงไม่รู้ว่า
                               คาบนี้เปลี่ยนจากใคร และถ้าจำผิดว่าครูคนนี้สอนอยู่แล้วก็ไม่มีอะไรบอก */}
                            {(period.teacher || period.substitute_teacher) && (
                              <div className={`text-[9px] font-semibold leading-tight ${isDark ? 'text-slate-200' : 'text-ink-secondary'}`}>
                                {isSubstituted ? (
                                  <>
                                    <span className="block font-extrabold text-accent-rose">
                                      สอนโดย {period.substitute_teacher || 'ยังไม่ระบุ'}
                                    </span>
                                    {period.teacher && (
                                      <span className={`block ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
                                        แทน {period.teacher}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>สอนโดย {period.teacher}</>
                                )}
                              </div>
                            )}

                            {/* ห้องเปลี่ยน = โชว์ทั้งห้องเดิมและห้องใหม่ ไม่ใช่ทับเงียบ ๆ
                               นักเรียนที่เดินไปห้องเดิมตามความเคยชินจะได้เห็นว่าย้ายไปไหน */}
                            {(period.room || period.substitute_room) && (
                              <div className={`text-[8px] font-bold inline-block px-1.5 py-0.5 rounded ${isSubstituted
                                ? (isDark ? 'bg-rose-900/40 text-accent-rose' : 'bg-rose-100 text-accent-rose')
                                : (isDark ? 'bg-white/15 text-slate-200' : 'bg-slate-100 text-ink-secondary')
                                }`}>
                                {isSubstituted && period.substitute_room && period.substitute_room !== period.room ? (
                                  <>
                                    <span className="line-through opacity-60">{period.room}</span>
                                    {' → '}
                                    {period.substitute_room}
                                  </>
                                ) : (
                                  period.substitute_room || period.room
                                )}
                              </div>
                            )}
                            {/* ย้ำว่าเป็นของวันนี้วันเดียว จะได้ไม่เข้าใจว่าเปลี่ยนครูถาวร */}
                            {isSubstituted && (
                              <div className="text-[8px] font-extrabold text-accent-rose">เฉพาะวันนี้</div>
                            )}
                          </div>
                        ) : (
                          <span className={`text-[11px] font-bold transition-colors duration-300 ${isDark ? 'text-content-muted' : 'text-content-secondary'
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
        {/* โหมดตารางของครูไม่มีชั้นสอนแทนวางทับ (สอนแทนผูกกับห้อง ไม่ได้ผูกกับครู)
            จึงห้ามใช้หมายเหตุก้อนเดียวกัน ไม่งั้นครูจะรอดูช่องแดงที่ไม่มีวันขึ้น */}
        {teacherMode ? (
          <p className={`text-[11px] leading-relaxed transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-muted'
            }`}>
            <strong>หมายเหตุ:</strong> ตารางนี้เป็นตารางสอนประจำเทอมของคุณ อ่านสดจากแท็บ Google Sheet ของคุณเอง
            แก้ในชีตแล้วหน้านี้เปลี่ยนตามเองภายใน 20 วินาที ไม่ต้องรีเฟรช
            <strong> ยังไม่รวมการสั่งสอนแทน</strong> เพราะระบบสอนแทนผูกกับห้องเรียน ไม่ได้ผูกกับตัวครู
            — คาบที่ฝ่ายวิชาการสั่งให้ไปสอนแทนดูได้ที่หน้าหลักของครู
          </p>
        ) : (
        <p className={`text-[11px] leading-relaxed transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-muted'
          }`}>
          <strong>หมายเหตุ:</strong> ช่องที่มีป้าย <span className="font-extrabold text-accent-rose">สอนแทน</span> และกรอบสีแดง
          คือคาบที่ฝ่ายวิชาการสั่งครูสอนแทนหรือย้ายห้องไว้ ในช่องบอกทั้งครูที่มาสอนแทนและครูเดิม
          ถ้าย้ายห้องจะขึ้นเป็น ห้องเดิม → ห้องใหม่
          {/* ต้องเป็นวันที่ที่เลือก ไม่ใช่วันนี้ — ตั้งแต่มีปฏิทิน ช่องแดงในตารางคือของวันที่เลือกไว้
              ถ้ายังเขียนว่า "วันนี้" ค้างไว้ คนเลือกดูวันอื่นจะอ่านแล้วเข้าใจผิดทันที */}
          <strong> เฉพาะวันที่ {formatThaiDate(selectedDate)} ที่เลือกไว้ด้านบนเท่านั้น</strong> — วันอื่นในตารางยังเป็นตารางปกติ
          เปลี่ยนวันที่แล้วช่องสอนแทนจะเปลี่ยนตามวันนั้นให้เอง
          สั่งสอนแทนเมื่อไหร่หน้านี้เปลี่ยนตามทันทีโดยไม่ต้องรีเฟรช ส่วนตารางประจำเทอมอ่านจาก Google Sheet
        </p>
        )}
      </div>
    </div>
  );
}
