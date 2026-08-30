/* ปฏิทินกิจกรรม — ตัวแปลงระหว่างแถวในตาราง events กับสิ่งที่หน้าจอต้องใช้
   ตารางอยู่ใน supabase/migrations/10_events.sql

   เดิมข้อมูลกิจกรรมถูก hard-code ไว้ใน AcademicCalendar.jsx ฝ่ายวิชาการแก้เองไม่ได้
   ตอนนี้ย้ายมาอยู่ใน DB แล้ว ไฟล์นี้เก็บ "ความรู้เรื่องรูปแบบข้อมูล" ไว้ที่เดียว
   จะได้ไม่ต้องเขียนตรรกะแปลงวันที่ซ้ำในทุกหน้าที่แสดงกิจกรรม */

export const EVENT_CATEGORIES = ['activity', 'holiday', 'exam', 'academic', 'deadline'];

export const EVENT_TYPE_LABELS = {
  activity: 'กิจกรรม',
  holiday: 'วันหยุด',
  exam: 'สอบ',
  academic: 'วิชาการ',
  deadline: 'กำหนดส่งงาน',
};

/** สีที่ DB ยอมรับ — ต้องตรงกับ constraint events_color_valid ใน 10_events.sql */
export const EVENT_COLORS = ['emerald', 'blue', 'red', 'rose', 'amber', 'orange', 'violet'];

/** สีเริ่มต้นของแต่ละหมวด ใช้ตอนฝ่ายวิชาการสร้างกิจกรรมใหม่แล้วยังไม่เลือกสีเอง */
export const DEFAULT_COLOR_BY_CATEGORY = {
  activity: 'emerald',
  holiday: 'red',
  exam: 'rose',
  academic: 'blue',
  deadline: 'orange',
};

export const DOT_COLORS = {
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  violet: 'bg-violet-500',
};

export const BADGE_COLORS = {
  emerald: { light: 'bg-emerald-50 text-emerald-800 border-emerald-200', dark: 'bg-emerald-900/30 text-emerald-300 border-emerald-800/40' },
  blue: { light: 'bg-blue-50 text-blue-800 border-blue-200', dark: 'bg-blue-900/30 text-blue-300 border-blue-800/40' },
  red: { light: 'bg-red-50 text-red-800 border-red-200', dark: 'bg-red-900/30 text-red-300 border-red-800/40' },
  rose: { light: 'bg-rose-50 text-rose-800 border-rose-200', dark: 'bg-rose-900/30 text-rose-300 border-rose-800/40' },
  amber: { light: 'bg-amber-50 text-amber-900 border-amber-200', dark: 'bg-amber-900/30 text-amber-300 border-amber-800/40' },
  orange: { light: 'bg-orange-50 text-orange-900 border-orange-200', dark: 'bg-orange-900/30 text-orange-300 border-orange-800/40' },
  violet: { light: 'bg-violet-50 text-violet-800 border-violet-200', dark: 'bg-violet-900/30 text-violet-300 border-violet-800/40' },
};

export const MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const MONTH_NAMES_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/** คอลัมน์ที่ทุกหน้าดึงเหมือนกัน — เขียนที่เดียวจะได้ไม่ลืมบางคอลัมน์ในบางหน้า */
export const EVENT_COLUMNS =
  'id, title, description, location, start_at, end_at, all_day, category, color, is_published, class_room_id';

export const DAY_NAMES_FULL = [
  'อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์',
];

/** แถวจาก DB -> object ที่หน้าจอใช้ (แปลง string เป็น Date ให้เรียบร้อยตั้งแต่ต้นทาง) */
export function toEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    location: row.location || '',
    start: new Date(row.start_at),
    end: row.end_at ? new Date(row.end_at) : null,
    allDay: Boolean(row.all_day),
    type: row.category,
    color: row.color,
    isPublished: row.is_published !== false,
    // null = กิจกรรมของทั้งวิทยาลัย, มีค่า = ของห้องนั้นห้องเดียว
    classRoomId: row.class_room_id ?? null,
  };
}

const hhmm = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** ข้อความเวลาที่แสดงในการ์ด
 *  แยกเคสตามหมวดเพราะความหมายไม่เหมือนกัน:
 *    วันหยุด    -> "หยุดราชการ"
 *    กำหนดส่ง   -> "ก่อน 16:30 น." (มีแค่เส้นตาย ไม่ใช่ช่วงเวลา)
 *    ที่เหลือ    -> "08:30 - 10:30" */
export function eventTimeText(evt) {
  if (evt.type === 'holiday') return 'หยุดราชการ';
  if (evt.allDay) return 'ทั้งวัน';
  if (evt.type === 'deadline') return `ก่อน ${hhmm(evt.start)} น.`;
  if (evt.end) return `${hhmm(evt.start)} - ${hhmm(evt.end)}`;
  return `${hhmm(evt.start)} น.`;
}

/** วันที่แบบไทยสั้น ๆ เช่น "28 ส.ค. 2569" */
export function thaiShortDate(date) {
  return `${date.getDate()} ${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getFullYear() + 543}`;
}

/** จัดกิจกรรมลงช่องวันของเดือนที่กำลังดู -> { 1: [evt], 7: [evt, evt] }
 *  ทำตรงนี้ครั้งเดียวแล้วให้ตารางปฏิทินอ่าน แทนที่จะ filter ใหม่ทุกช่อง 30 กว่ารอบ */
export function groupByDayOfMonth(events, year, month) {
  const map = {};
  for (const evt of events) {
    if (evt.start.getFullYear() !== year || evt.start.getMonth() !== month) continue;
    const day = evt.start.getDate();
    (map[day] ||= []).push(evt);
  }
  // เรียงตามเวลาในแต่ละวัน กิจกรรมเช้ามาก่อนบ่าย
  for (const day of Object.keys(map)) map[day].sort((a, b) => a.start - b.start);
  return map;
}

/** ขอบเขตเดือนสำหรับ query — คืนเป็น ISO string ที่ Supabase ใช้เทียบกับ timestamptz ได้
 *  เผื่อขอบไว้ข้างละ 1 วัน กันกิจกรรมที่คร่อมเที่ยงคืนหล่นหายเพราะ timezone */
export function monthRange(year, month) {
  return {
    from: new Date(year, month, 1, 0, 0, 0).toISOString(),
    to: new Date(year, month + 1, 1, 0, 0, 0).toISOString(),
  };
}

/** สร้างรายการวันที่ของกิจกรรมที่เกิดซ้ำทุกสัปดาห์
 *
 *  ใช้ตอนฝ่ายวิชาการบันทึกอะไรที่วนทุกสัปดาห์ เช่น "รด. ของ ปวช.3/6 ทุกวันจันทร์"
 *
 *  ทำไมแตกเป็นแถวจริง ๆ แทนที่จะเก็บ "กฎการซ้ำ" ไว้แถวเดียว:
 *    ของจริงมีข้อยกเว้นเสมอ — สัปดาห์ที่ตรงกับวันหยุดก็ไม่มีเรียน
 *    ถ้าเก็บเป็นกฎ พอจะยกเลิกอาทิตย์เดียวต้องไปทำระบบ "ข้อยกเว้น" เพิ่มอีกชั้น
 *    แตกเป็นแถวแล้วลบทิ้งทีละอันจบเลย และโค้ดส่วนที่เหลือไม่ต้องรู้เรื่องการซ้ำเลยสักบรรทัด
 *
 *  วันในสัปดาห์เอามาจากวันที่เริ่มเอง ไม่ต้องให้ผู้ใช้เลือกซ้ำอีกรอบ
 */
export function weeklyOccurrences(startAt, endAt, untilDate, maxCount = 60) {
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;

  const until = new Date(untilDate);
  until.setHours(23, 59, 59, 999); // นับวันสุดท้ายรวมด้วย

  // จำระยะเวลาของกิจกรรมไว้ แล้วบวกกลับให้ทุกครั้งที่ซ้ำ เวลาเริ่ม-จบจะได้เท่ากันทุกสัปดาห์
  const durationMs = end ? end.getTime() - start.getTime() : null;

  const out = [];
  const cursor = new Date(start);

  while (cursor <= until && out.length < maxCount) {
    out.push({
      start: new Date(cursor),
      end: durationMs === null ? null : new Date(cursor.getTime() + durationMs),
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  return out;
}

/** ค่าใน <input type="datetime-local"> ต้องเป็นเวลาท้องถิ่นไม่มี timezone
 *  toISOString() ใช้ไม่ได้เพราะมันแปลงเป็น UTC ทำให้เวลาเพี้ยนไป 7 ชั่วโมง */
export function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** เหมือนข้างบนแต่สำหรับ <input type="date"> (ไม่มีเวลา) */
export function toLocalDateValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
