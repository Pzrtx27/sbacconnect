import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Calendar, AlertCircle } from 'lucide-react';
import { fetchTimetable, subscribeTimetable, fetchClassIds } from '../../utils/timetable';

/* ตารางสอนจริง ภาคเรียน 1/2569 — ทำหน้าที่เป็นข้อมูลตัวอย่าง/สำรอง
   ก่อนตั้งค่า Google Sheet (ดู src/config/sheets.js) เมื่อเชื่อมชีตแล้ว
   ข้อมูลจากชีตจะเขียนทับส่วนนี้ตาม class_id ของนักเรียนแต่ละคน */
const SEED_TIMETABLE_BY_CLASS = {
  m3_4: {
    Monday: {
      1: { subject: 'การผลิตสื่อผสมเพื่องานการตลาด', teacher: 'อ.ธีรวัฒน์', room: '1606' },
      2: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ธีรภาพ', room: '1606' },
      3: { subject: 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', teacher: 'อ.พลศิต', room: 'สตูดิโอ' },
      4: { subject: 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', teacher: 'อ.พลศิต', room: 'สตูดิโอ' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'โฮมรูม (HR)', teacher: '', room: '' },
    },
    Tuesday: {
      1: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ธีรภาพ', room: '1406' },
      2: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ธีรภาพ', room: '1406' },
      3: { subject: 'โครงงานด้านการตลาด', teacher: 'อ.ศิริญากร', room: '1606' },
      4: { subject: 'การผลิตสื่อผสมเพื่องานการตลาด', teacher: 'อ.ธีรวัฒน์', room: '1606' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'โฮมรูม (HR)', teacher: '', room: '' },
    },
    Wednesday: {
      1: { subject: 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', teacher: 'อ.พลศิต', room: '1406' },
      2: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ธีรภาพ', room: '1407' },
      3: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ธีรภาพ', room: '1407' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'โฮมรูม (HR)', teacher: '', room: '' },
    },
    Thursday: {
      1: { subject: 'โครงงานด้านการตลาด', teacher: 'อ.ศิริญากร', room: '1606' },
      2: { subject: 'โครงงานด้านการตลาด', teacher: 'อ.ศิริญากร', room: '1606' },
      3: { subject: 'การผลิตสื่อผสมเพื่องานการตลาด', teacher: 'อ.ธีรวัฒน์', room: '1606' },
      4: { subject: 'การผลิตสื่อผสมเพื่องานการตลาด', teacher: 'อ.ธีรวัฒน์', room: '1606' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'กิจกรรมชมรม', teacher: '', room: '' },
    },
    Friday: {
      1: { subject: 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', teacher: 'อ.พลศิต', room: '1606' },
      2: { subject: 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', teacher: 'อ.พลศิต', room: '1606' },
      3: { subject: 'การผลิตสื่อผสมเพื่องานการตลาด', teacher: 'อ.ธีรวัฒน์', room: '1606' },
      4: { subject: 'การผลิตสื่อผสมเพื่องานการตลาด', teacher: 'อ.ธีรวัฒน์', room: '1606' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'โฮมรูม (HR)', teacher: '', room: '' },
    },
  },
  m3_6: {
    Monday: {
      1: { subject: 'การสร้างเกมคอมพิวเตอร์', teacher: 'อ.ธีรภาพ', room: '1503' },
      2: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ประภวิษณ์', room: '1503' },
      3: { subject: 'เทคโนโลยีการนำเข้าข้อมูลสู่ระบบคอมพิวเตอร์', teacher: 'อ.ณัฐธิดา', room: '1503' },
      4: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ประภวิษณ์', room: '1406' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'โฮมรูม (HR)', teacher: '', room: '' },
    },
    Tuesday: {
      1: { subject: 'เทคโนโลยีการนำเข้าข้อมูลสู่ระบบคอมพิวเตอร์', teacher: 'อ.ณัฐธิดา', room: '1507' },
      2: { subject: 'เทคโนโลยีการนำเข้าข้อมูลสู่ระบบคอมพิวเตอร์', teacher: 'อ.ณัฐธิดา', room: '1507' },
      3: { subject: 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', teacher: 'อ.ธีรภาพ', room: '1509' },
      4: { subject: 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', teacher: 'อ.ธีรภาพ', room: '1509' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'โฮมรูม (HR)', teacher: '', room: '' },
    },
    Wednesday: {
      1: { subject: 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', teacher: 'อ.ธีรภาพ', room: '1503' },
      2: { subject: 'เทคโนโลยีการนำเข้าข้อมูลสู่ระบบคอมพิวเตอร์', teacher: 'อ.ณัฐธิดา', room: '1503' },
      3: { subject: 'การติดตั้งระบบเครือข่ายคอมพิวเตอร์เบื้องต้น', teacher: 'อ.ทนงศักดิ์', room: '1506' },
      4: { subject: 'การติดตั้งระบบเครือข่ายคอมพิวเตอร์เบื้องต้น', teacher: 'อ.ทนงศักดิ์', room: '1506' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'โฮมรูม (HR)', teacher: '', room: '' },
    },
    Thursday: {
      1: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ประภวิษณ์', room: '1408' },
      2: { subject: 'โปรแกรมนำเสนอ', teacher: 'อ.ประภวิษณ์', room: '1408' },
      3: { subject: 'โครงงานด้านเทคโนโลยีสารสนเทศ', teacher: 'อ.ทนงศักดิ์', room: '1503' },
      4: { subject: 'โครงงานด้านเทคโนโลยีสารสนเทศ', teacher: 'อ.ทนงศักดิ์', room: '1503' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'กิจกรรมชมรม', teacher: '', room: '' },
      7: { subject: 'การสร้างเกมคอมพิวเตอร์', teacher: 'ช.3/6', room: '1509' },
      8: { subject: 'การสร้างเกมคอมพิวเตอร์', teacher: 'ช.3/6', room: '1509' },
    },
    Friday: {
      1: { subject: 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', teacher: 'อ.ธีรภาพ', room: '1408' },
      2: { subject: 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', teacher: 'อ.ธีรภาพ', room: '1408' },
      3: { subject: 'การติดตั้งระบบเครือข่ายคอมพิวเตอร์เบื้องต้น', teacher: 'อ.ทนงศักดิ์', room: '1506' },
      4: { subject: 'การติดตั้งระบบเครือข่ายคอมพิวเตอร์เบื้องต้น', teacher: 'อ.ทนงศักดิ์', room: '1506' },
      5: { subject: 'พักกลางวัน', teacher: '', room: '' },
      6: { subject: 'โฮมรูม (HR)', teacher: '', room: '' },
      7: { subject: 'การสร้างเกมคอมพิวเตอร์', teacher: 'ช.3/6', room: '1509' },
      8: { subject: 'การสร้างเกมคอมพิวเตอร์', teacher: 'ช.3/6', room: '1509' },
    },
  },
};

const DAYS_TH = {
  Monday: 'จันทร์',
  Tuesday: 'อังคาร',
  Wednesday: 'พุธ',
  Thursday: 'พฤหัสฯ',
  Friday: 'ศุกร์'
};

/** m3_6 -> ม.3/6 */
const classLabel = (id) => String(id || '').replace('m', 'ม.').replace('_', '/');

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

  const [timetable, setTimetable] = useState({});
  const [source, setSource] = useState('loading'); // 'loading' | 'live' | 'seed' | 'error'
  const [lastUpdated, setLastUpdated] = useState('');

  const stamp = () =>
    setLastUpdated(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));

  /* อ่านจากตาราง timetables ใน Supabase แล้วเปิด realtime ค้างไว้ (25_timetables.sql)
     ของเดิม poll ทั้งไฟล์ csv จาก Google Sheet ทุก 20 วินาที ซึ่งแปลว่า
     ถ้าฝ่ายวิชาการสั่งสอนแทนตอนคาบกำลังจะเริ่ม นักเรียนอาจรู้ช้าไปถึง 20 วินาที
     และชีตเขียนกลับไม่ได้ ฝ่ายวิชาการจึงไม่มีทางแก้ให้เห็นผลที่หน้านี้ได้เลย

     ตอนนี้ฝ่ายวิชาการกดบันทึก เซิร์ฟเวอร์ส่งเฉพาะแถวที่เปลี่ยนมาที่เครื่องนี้ทันที */
  const load = useCallback(async () => {
    try {
      const data = await fetchTimetable(viewClassId);
      if (Object.keys(data).length > 0) {
        setTimetable(data);
        setSource('live');
      } else {
        // ห้องนี้ยังไม่มีข้อมูลใน DB — แสดงตารางตัวอย่างไว้ก่อน และบอกตรง ๆ ว่านี่คือตัวอย่าง
        setTimetable(SEED_TIMETABLE_BY_CLASS[viewClassId] || {});
        setSource('seed');
      }
      stamp();
    } catch (err) {
      console.error('[timetable] โหลดตารางสอนไม่สำเร็จ:', err);
      setTimetable(SEED_TIMETABLE_BY_CLASS[viewClassId] || {});
      setSource('error');
    }
  }, [viewClassId]);

  useEffect(() => {
    setSource('loading');
    load();

    return subscribeTimetable(viewClassId, (next) => {
      setTimetable(next);
      setSource('live');
      stamp();
    });
  }, [viewClassId, load]);

  /* รายชื่อห้องที่มีตารางอยู่จริง — ปุ่มสลับห้องสร้างจากอันนี้
     ถ้าโหลดไม่ได้ก็ไม่เป็นไร ปุ่มสลับหายไปเฉย ๆ ตารางห้องตัวเองยังแสดงปกติ */
  useEffect(() => {
    if (!isAcademic) return undefined; // นักเรียนไม่มีปุ่มสลับ จึงไม่ต้องยิงขอรายชื่อห้อง
    let alive = true;
    fetchClassIds()
      .then((ids) => {
        if (!alive) return;
        setClassIds(ids);
        // ฝ่ายวิชาการไม่มีห้องของตัวเอง ถ้าห้องที่เปิดมาไม่มีข้อมูลให้เด้งไปห้องแรกที่มี
        if (!myClassId && ids.length > 0 && !ids.includes(viewClassId)) setViewClassId(ids[0]);
      })
      .catch((err) => console.error('[timetable] โหลดรายชื่อห้องไม่สำเร็จ:', err));
    // เจตนาเช็ค viewClassId แค่ตอนโหลดรายชื่อครั้งแรก ไม่ใช่ทุกครั้งที่กดสลับห้อง
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { alive = false; };
  }, [isAcademic]);

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
    live: { label: 'อัปเดตสด', dot: 'bg-emerald-500 animate-pulse', tone: isDark ? 'bg-emerald-950/30 text-accent-emerald' : 'bg-emerald-50 text-accent-emerald' },
    seed: { label: 'ตัวอย่าง (ห้องนี้ยังไม่มีข้อมูล)', dot: 'bg-amber-500', tone: isDark ? 'bg-amber-950/30 text-accent-amber' : 'bg-amber-50 text-accent-amber' },
    error: { label: 'เชื่อมต่อไม่สำเร็จ', dot: 'bg-rose-500', tone: isDark ? 'bg-rose-950/30 text-accent-rose' : 'bg-rose-50 text-accent-rose' },
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
            ปวช. {classLabel(viewClassId).replace('ม.', '')}
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
          <span className={source === 'live' ? 'text-accent-emerald font-bold' : 'text-content-muted font-bold'}>
            {source === 'live' ? '● Connected' : '○ Offline'}
          </span>
        </div>
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

      <div className={`flex gap-2 items-center p-3 rounded-2xl border transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
        }`}>
        <AlertCircle className="text-accent-rose flex-shrink-0" size={16} />
        <p className={`text-[10px] leading-relaxed transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-muted'
          }`}>
          <strong>หมายเหตุ:</strong> คาบเรียนแถบสีแดงกระพริบ มีการปรับเปลี่ยนการเรียนการสอน (มีอาจารย์สอนแทนหรือเปลี่ยนห้องเรียน) เมื่อฝ่ายวิชาการแก้ตาราง หน้านี้จะเปลี่ยนตามทันทีโดยไม่ต้องรีเฟรช
        </p>
      </div>
    </div>
  );
}
