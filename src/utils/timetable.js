import { supabase } from '../config/supabase';
import {
  fetchTimetableForClass,
  isSheetConfigured,
  TIMETABLE_TAB_GID_BY_CLASS,
  TIMETABLE_POLL_INTERVAL_MS,
} from '../config/sheets';

/* ============================================================
   ตารางสอน — ของสองอายุที่จงใจแยกที่เก็บกัน

     ตารางประจำเทอม (วิชา/ครู/ห้อง)  -> Google Sheet เป็นต้นฉบับ อ่านสดผ่าน csv
     สอนแทนรายวัน                    -> ตาราง substitutions ใน Supabase (31_substitutions.sql)

   ทำไมไม่เก็บรวมกันเหมือนเดิม:
     ของเดิม (25_timetables.sql) ยัดธง is_substituted ไว้บนแถวตารางประจำเทอม
     ซึ่ง key เป็น (class_id, day, period) โดย day คือชื่อวัน ไม่มีวันที่
     สั่งสอนแทนวันจันทร์ครั้งเดียวจึงกลายเป็น "ทุกวันจันทร์ตลอดไป"
     ทั้งที่ครูลาแค่วันเดียว — เป็นสถานะค้างที่ต้องมีคนจำมากดยกเลิกเอง

     พอผูกกับ sub_date ที่เป็นวันที่จริง หน้าเว็บดึงเฉพาะแถวของวันนั้น
     พ้นวันแล้วก็ไม่ถูกดึงมาแสดงอีก หมดอายุเองโดยไม่ต้องมีใครทำอะไร

   ทำไมตารางประจำเทอมกลับไปอ่านจากชีต:
     ต้นฉบับที่ฝ่ายวิชาการแก้จริงคือชีต การก๊อปเข้า DB แล้วให้แก้ได้สองที่
     แปลว่ามีสองความจริงที่ไม่ตรงกันได้ ตัดปัญหาด้วยการมีต้นฉบับเดียว
     แก้ในชีต -> เว็บเห็นเองใน TIMETABLE_POLL_INTERVAL_MS ไม่ต้องกดนำเข้า
   ============================================================ */

/** m3_6 -> ปวช.3/6
 *
 *  ที่นี่คือที่เดียวที่แปลงรหัสห้องเป็นข้อความ เดิมเขียนซ้ำอยู่สองไฟล์แล้วเพี้ยนกัน
 *  SBAC เป็นวิทยาลัยเทคโนโลยี ระดับชั้นจึงเป็น ปวช. ไม่ใช่ ม. อย่างที่โค้ดเดิมแปลง
 *  (ตัว m ในรหัสมาจากรูปแบบ class_id เดิม ไม่ได้แปลว่ามัธยม) */
export function classLabel(classId) {
  const m = String(classId || '').match(/^m(\d+)_(\d+)$/);
  return m ? `ปวช.${m[1]}/${m[2]}` : String(classId || '');
}

/** ลำดับวันที่ใช้แสดงผล — เรียงตามวันเรียนจริง ไม่ใช่เรียงตามตัวอักษร */
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const DAY_LABELS = {
  Monday: 'จันทร์',
  Tuesday: 'อังคาร',
  Wednesday: 'พุธ',
  Thursday: 'พฤหัสบดี',
  Friday: 'ศุกร์',
  Saturday: 'เสาร์',
  Sunday: 'อาทิตย์',
};

/** ชื่อวันแบบสั้นสำหรับปุ่มแคบ ๆ
 *
 *  ห้ามย่อด้วย slice() เด็ดขาด — ภาษาไทยนับสระบน/ล่างเป็นตัวอักษรแยกใน JS
 *  'จันทร์'.slice(0,2) จึงได้ 'จั' และ 'อังคาร' ได้ 'อั' ซึ่งอ่านไม่รู้เรื่อง
 *  (โค้ดเดิมทำแบบนั้นอยู่จริง) ย่อเองทีละคำจึงถูกต้องกว่าและอ่านง่ายกว่า */
export const DAY_LABELS_SHORT = {
  Monday: 'จันทร์',
  Tuesday: 'อังคาร',
  Wednesday: 'พุธ',
  Thursday: 'พฤหัส',
  Friday: 'ศุกร์',
  Saturday: 'เสาร์',
  Sunday: 'อาทิตย์',
};

/** คาบที่ฟอร์มฝั่งวิชาการให้เลือกได้ — 1-8 ครอบคลุมตารางจริงทั้งสองห้อง
 *  (m3_6 มีถึงคาบ 8 ในวันพฤหัส/ศุกร์) */
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export const PERIOD_TIMES = {
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

/* ตารางสอนจริง ภาคเรียน 1/2569 — ทำหน้าที่เป็นข้อมูลตัวอย่าง/สำรอง
   ก่อนตั้งค่า Google Sheet (ดู src/config/sheets.js) เมื่อเชื่อมชีตแล้ว
   ข้อมูลจากชีตจะเขียนทับส่วนนี้ตาม class_id ของนักเรียนแต่ละคน */
export const SEED_TIMETABLE_BY_CLASS = {
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

/* ============================================================
   ตารางประจำเทอม — อ่านจาก Google Sheet
   ============================================================ */

/** ห้องที่เปิดให้จัดการ = ห้องที่ตั้งค่าแท็บชีตไว้แล้ว
 *
 *  ของเดิมอ่านรายชื่อห้องจากตาราง timetables ใน DB ซึ่งตอนนี้เลิกใช้แล้ว
 *  แหล่งความจริงใหม่คือ TIMETABLE_TAB_GID_BY_CLASS — เพิ่มห้องใหม่ = เพิ่ม gid ที่นั่น
 *  เรียงตามระดับชั้นแล้วเลขห้อง ไม่ใช่เรียงตามตัวอักษร (ไม่งั้น m3_10 มาก่อน m3_4) */
export function listClassIds() {
  return Object.keys(TIMETABLE_TAB_GID_BY_CLASS)
    .filter((id) => isSheetConfigured(id))
    .sort((a, b) => {
      const [, la, ra] = a.match(/^m(\d+)_(\d+)$/) || [];
      const [, lb, rb] = b.match(/^m(\d+)_(\d+)$/) || [];
      if (!la || !lb) return a.localeCompare(b);
      return Number(la) - Number(lb) || Number(ra) - Number(rb);
    });
}

/** อ่านตารางประจำเทอมของห้องหนึ่ง
 *
 *  คืน { timetable, source } โดย source บอกตรง ๆ ว่าข้อมูลมาจากไหน
 *  'sheet' = ของจริงจากชีต / 'seed' = ตัวอย่างสำรองในโค้ด / 'error' = ต่อชีตไม่ได้
 *
 *  ไม่ throw — ทุกหน้าที่เรียกต้องมีตารางแสดงได้เสมอ ไม่งั้นครูลาแล้วเน็ตโรงเรียนช้า
 *  นักเรียนจะเปิดมาเจอหน้าเปล่าแทนที่จะเจอตารางเดิม ซึ่งแย่กว่าเห็นข้อมูลเก่า */
export async function fetchBaseTimetable(classId) {
  const seed = SEED_TIMETABLE_BY_CLASS[classId] || {};

  if (!isSheetConfigured(classId)) return { timetable: seed, source: 'seed' };

  try {
    const data = await fetchTimetableForClass(classId);
    if (data && Object.keys(data).length > 0) return { timetable: data, source: 'sheet' };
    return { timetable: seed, source: 'seed' };
  } catch (err) {
    console.warn('[timetable] อ่านตารางจาก Google Sheet ไม่สำเร็จ ใช้ข้อมูลสำรองแทน:', err);
    return { timetable: seed, source: 'error' };
  }
}

/* ============================================================
   วันที่ — ตรึงเขตเวลาไทยไว้ ไม่พึ่งนาฬิกาเครื่องผู้ใช้
   ============================================================
   ถ้าใครตั้งเครื่องเป็นเขตเวลาอื่น (หรือเปิดจากต่างประเทศ) "วันนี้" ต้องยังหมายถึง
   วันนี้ที่นนทบุรี ไม่งั้นครูอาจเห็นตารางสอนแทนของเมื่อวานหรือพรุ่งนี้ */

export const SCHOOL_TIMEZONE = 'Asia/Bangkok';

const WEEKDAY_KEYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** วันนี้ตามเวลาไทย รูปแบบ 'YYYY-MM-DD'
 *  ใช้ locale en-CA เพราะให้ผลเป็น ISO พอดี ไม่ต้องมาต่อสตริงเอง */
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIMEZONE }).format(new Date());
}

/* 'YYYY-MM-DD' -> Date ที่เที่ยงวัน UTC
   เจตนา: เลี่ยงปัญหาคลาสสิกที่ new Date('2026-09-07') ถูกตีความเป็นเที่ยงคืน UTC
   แล้วพอ .getDay() ตามเวลาเครื่องที่อยู่คนละฝั่งของเส้นวันที่ ก็เพี้ยนไปหนึ่งวัน
   ตรึงที่เที่ยงวันแล้วอ่านค่าแบบ UTC จึงปลอดภัยทุกเขตเวลา */
function toSafeDate(dateISO) {
  return new Date(`${dateISO}T12:00:00Z`);
}

/** 'YYYY-MM-DD' -> 'Monday' | 'Tuesday' | ... (key เดียวกับที่ตารางสอนใช้) */
export function weekdayKeyOf(dateISO) {
  if (!dateISO) return '';
  return WEEKDAY_KEYS[toSafeDate(dateISO).getUTCDay()] || '';
}

/** true เมื่อวันนั้นเป็นจันทร์–ศุกร์
 *  ใช้เตือนในหน้าวิชาการเท่านั้น ไม่ได้ห้ามบันทึก เผื่อมีเรียนชดเชยวันเสาร์ */
export function isSchoolDay(dateISO) {
  const day = toSafeDate(dateISO).getUTCDay();
  return day >= 1 && day <= 5;
}

/** บวก/ลบวัน คืนเป็น 'YYYY-MM-DD' */
export function addDaysISO(dateISO, days) {
  const d = toSafeDate(dateISO);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** '2026-09-07' -> '7 ก.ย. 2569' (พ.ศ. เพราะ locale th-TH ใช้ปฏิทินพุทธเป็นค่าเริ่มต้น)
 *  บังคับ timeZone: 'UTC' ให้เข้าคู่กับ toSafeDate จะได้ไม่เลื่อนวัน */
export function formatThaiDate(dateISO) {
  if (!dateISO) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(toSafeDate(dateISO));
}

/** ป้ายที่คนอ่านแล้วรู้ทันทีว่าวันไหน โดยไม่ต้องเทียบปฏิทิน */
export function describeDate(dateISO) {
  const today = todayISO();
  if (dateISO === today) return 'วันนี้';
  if (dateISO === addDaysISO(today, 1)) return 'พรุ่งนี้';
  if (dateISO === addDaysISO(today, -1)) return 'เมื่อวาน';
  return `${DAY_LABELS[weekdayKeyOf(dateISO)] ? `${DAY_LABELS[weekdayKeyOf(dateISO)]} ` : ''}${formatThaiDate(dateISO)}`;
}

/* ============================================================
   สอนแทนรายวัน — Supabase
   ============================================================ */

const SUB_COLUMNS =
  'id, class_id, sub_date, period, subject, original_teacher, substitute_teacher, substitute_room, note, updated_at';

/** สอนแทนของห้องหนึ่ง ในช่วงวันที่ [from, to] (ไม่ส่ง to = วันเดียว)
 *  คืน [] เมื่อมีปัญหา — ตารางต้องแสดงได้แม้ต่อ Supabase ไม่ติด */
export async function fetchSubstitutions(classId, from, to = from) {
  if (!classId || !from) return [];

  const { data, error } = await supabase
    .from('substitutions')
    .select(SUB_COLUMNS)
    .eq('class_id', classId)
    .gte('sub_date', from)
    .lte('sub_date', to)
    .order('sub_date', { ascending: true })
    .order('period', { ascending: true });

  if (error) {
    console.error('[substitutions] ดึงข้อมูลสอนแทนไม่สำเร็จ:', error);
    return [];
  }
  return data || [];
}

/** สอนแทนของทุกห้องในวันเดียว — ใช้ในหน้าครู */
export async function fetchSubstitutionsForDate(dateISO) {
  if (!dateISO) return [];

  const { data, error } = await supabase
    .from('substitutions')
    .select(SUB_COLUMNS)
    .eq('sub_date', dateISO)
    .order('period', { ascending: true });

  if (error) {
    console.error('[substitutions] ดึงรายการสอนแทนรายวันไม่สำเร็จ:', error);
    return [];
  }
  return data || [];
}

/** บันทึกสอนแทน 1 คาบ ของ 1 วัน
 *
 *  upsert บน (class_id, sub_date, period) ตาม unique constraint ในไฟล์ 31
 *  ตั้งซ้ำคาบเดิมวันเดิม = แก้ของเดิม ไม่ใช่เพิ่มแถวใหม่ */
export async function saveSubstitution({
  classId, date, period,
  subject = '', originalTeacher = '', substituteTeacher = '',
  substituteRoom = '', note = '',
}) {
  const { data: auth } = await supabase.auth.getUser();

  const { error } = await supabase.from('substitutions').upsert(
    {
      class_id: classId,
      sub_date: date,
      period,
      subject,
      original_teacher: originalTeacher,
      substitute_teacher: substituteTeacher,
      substitute_room: substituteRoom,
      note,
      created_by: auth?.user?.id ?? null,
    },
    { onConflict: 'class_id,sub_date,period' }
  );

  if (error) throw error;
}

/** ยกเลิกสอนแทนของคาบนั้นในวันนั้น — ลบแถวทิ้ง ไม่ใช่ตั้งธงเป็น false
 *
 *  "ไม่มีแถว" = "ไม่มีสอนแทน" อยู่แล้ว การเก็บแถวที่ปิดธงไว้จะสร้างสองสถานะ
 *  ที่ต้องคอยแยกว่าอันไหนคือของจริง ซึ่งเป็นต้นเหตุของบั๊กเดิมพอดี */
export async function clearSubstitution(classId, date, period) {
  const { error } = await supabase
    .from('substitutions')
    .delete()
    .eq('class_id', classId)
    .eq('sub_date', date)
    .eq('period', period);

  if (error) throw error;
}

/** ติดตามการสั่งสอนแทนของห้องนี้แบบ realtime
 *
 *  เฉพาะสอนแทนที่ต้อง realtime — ครูลากะทันหันตอนคาบกำลังจะเริ่มคือเคสจริง
 *  ส่วนตารางประจำเทอมเปลี่ยนปีละสองครั้ง poll จากชีตก็พอ
 *
 *  กรองที่ฝั่ง server ด้วย class_id ไม่ใช่รับทุกห้องมาแล้วค่อยกรองในเบราว์เซอร์
 *  onChange ไม่รับ payload — ให้ผู้เรียกโหลดชุดใหม่เองทั้งก้อน เพราะ merge
 *  ทีละแถวแล้วพลาดจะได้ตารางผิดแบบเงียบ ๆ ซึ่งแย่กว่าโหลดใหม่ (วันหนึ่งไม่กี่แถว)
 *
 *  คืนฟังก์ชันยกเลิก ต้องเรียกตอน unmount ไม่งั้น channel ค้างสะสม */
export function subscribeSubstitutions(classId, onChange) {
  if (!classId) return () => {};

  const channel = supabase
    .channel(`substitutions-${classId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'substitutions', filter: `class_id=eq.${classId}` },
      () => onChange()
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/** วางสอนแทนทับตารางฐาน — เฉพาะวันของ dateISO เท่านั้น
 *
 *  รับ subs ที่เป็นของวันเดียว (ผู้เรียกกรองมาแล้ว) แล้วแตะเฉพาะคอลัมน์วันนั้น
 *  วันอื่นในสัปดาห์ไม่ถูกแตะเลย — จุดนี้คือที่ทำให้ "1 วัน" เป็นจริงตอนแสดงผล
 *
 *  ไม่แก้ของเดิมในที่ (immutable) เพราะ SEED_TIMETABLE_BY_CLASS เป็น object
 *  ระดับโมดูลที่ใช้ร่วมกันทุกหน้า เขียนทับตรง ๆ แล้วตารางจะเพี้ยนค้างข้ามหน้า */
export function applySubstitutions(timetable, subs, dateISO) {
  if (!subs || subs.length === 0) return timetable;

  const dayKey = weekdayKeyOf(dateISO);
  if (!dayKey) return timetable;

  const dayPeriods = { ...(timetable?.[dayKey] || {}) };

  for (const sub of subs) {
    const base = dayPeriods[sub.period] || { subject: '', teacher: '', room: '' };
    dayPeriods[sub.period] = {
      ...base,
      // ค่าที่ฝ่ายวิชาการกรอกชนะตารางฐาน แต่ถ้าเว้นว่างไว้ก็ใช้ของเดิม
      subject: sub.subject || base.subject,
      teacher: sub.original_teacher || base.teacher,
      is_substituted: true,
      substitute_teacher: sub.substitute_teacher || '',
      substitute_room: sub.substitute_room || '',
      sub_date: sub.sub_date,
      sub_note: sub.note || '',
    };
  }

  return { ...timetable, [dayKey]: dayPeriods };
}

export { isSheetConfigured, TIMETABLE_POLL_INTERVAL_MS };
