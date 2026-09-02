import { supabase } from '../config/supabase';
import { fetchTimetableForClass, isSheetConfigured } from '../config/sheets';

/* ============================================================
   ชั้นข้อมูลของตารางสอน — ใช้ร่วมกันทั้งหน้าวิชาการและหน้านักเรียน

   ก่อนหน้านี้สองหน้านี้ไม่เคยคุยกันเลย:
     ฝ่ายวิชาการ -> เขียนลง Firestore (ที่ปิดไปแล้ว กดแล้ว error)
     นักเรียน    -> อ่านจาก Google Sheet ผ่าน URL csv สาธารณะ (อ่านได้อย่างเดียว)
   ต่อให้ฟอร์มฝั่งวิชาการทำงานได้ ผลก็ไม่มีทางไปโผล่ที่นักเรียนอยู่ดี

   ตอนนี้ทั้งคู่ใช้ตาราง timetables ใน Supabase (25_timetables.sql)
   และ subscribe realtime ตัวเดียวกัน — วิชาการกดบันทึก นักเรียนเห็นทันที
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

/** คาบที่ฟอร์มฝั่งวิชาการให้เลือกได้ — 1-8 ครอบคลุมตารางจริงทั้งสองห้อง
 *  (m3_6 มีถึงคาบ 8 ในวันพฤหัส/ศุกร์) */
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

const EMPTY_SLOT = {
  subject: '',
  teacher: '',
  room: '',
  is_substituted: false,
  substitute_teacher: '',
  substitute_room: '',
};

/** แถวจาก DB -> รูปทรงที่หน้าเว็บใช้มาตั้งแต่แรก
 *  คงคีย์เดิมไว้ทุกตัว เพื่อไม่ต้องไล่แก้ StudentTimetable ทั้งไฟล์ */
function rowToSlot(row) {
  return {
    subject: row.subject || '',
    teacher: row.teacher || '',
    room: row.room || '',
    is_substituted: Boolean(row.is_substituted),
    substitute_teacher: row.substitute_teacher || '',
    substitute_room: row.substitute_room || '',
  };
}

/** รายการแถว -> { Monday: { 1: {...} } } */
export function rowsToTimetable(rows = []) {
  const timetable = {};
  for (const row of rows) {
    const day = row.day;
    const period = Number(row.period);
    if (!day || !period) continue;
    if (!timetable[day]) timetable[day] = {};
    timetable[day][period] = rowToSlot(row);
  }
  return timetable;
}

/** อ่านตารางสอนทั้งห้อง
 *  คืน { Monday: { 1: {...} }, ... } — ว่างเปล่าถ้ายังไม่มีข้อมูลห้องนี้ */
export async function fetchTimetable(classId) {
  if (!classId) return {};

  const { data, error } = await supabase
    .from('timetables')
    .select('day, period, subject, teacher, room, is_substituted, substitute_teacher, substitute_room')
    .eq('class_id', classId)
    .order('period', { ascending: true });

  if (error) throw error;
  return rowsToTimetable(data || []);
}

/** รายชื่อห้องที่มีตารางสอนอยู่จริงในฐานข้อมูล
 *
 *  ที่ต้องอ่านจาก DB ไม่ใช่เขียนรายชื่อห้องไว้ในโค้ด:
 *  ของเดิมหน้าวิชาการมี dropdown 20 ห้อง (ปวช.1/1 ถึง ปวช.3/12) ทั้งที่มีข้อมูลจริงแค่สองห้อง
 *  เลือกห้องที่เหลือไปก็เจอตารางว่างโดยไม่มีคำอธิบาย เหมือนระบบพัง
 *  ทั้งที่จริงคือห้องนั้นยังไม่เคยมีใครใส่ตาราง
 *
 *  เรียงตามระดับชั้นแล้วเลขห้อง ไม่ใช่เรียงตามตัวอักษร (ไม่งั้น m3_10 มาก่อน m3_4) */
export async function fetchClassIds() {
  const { data, error } = await supabase
    .from('timetables')
    .select('class_id');

  if (error) throw error;

  const ids = [...new Set((data || []).map((r) => r.class_id))];

  return ids.sort((a, b) => {
    const [, la, ra] = a.match(/^m(\d+)_(\d+)$/) || [];
    const [, lb, rb] = b.match(/^m(\d+)_(\d+)$/) || [];
    if (!la || !lb) return a.localeCompare(b);
    return Number(la) - Number(lb) || Number(ra) - Number(rb);
  });
}

/** ติดตามการแก้ไขตารางของห้องนี้แบบ realtime
 *
 *  กรองที่ฝั่ง server ด้วย filter class_id — ไม่ใช่รับทุกห้องมาแล้วค่อยกรองในเบราว์เซอร์
 *  ห้องอื่นแก้ตารางกันทั้งวัน เครื่องนักเรียนก็ไม่ต้องตื่นมาทำงานเปล่า
 *
 *  onChange รับตารางก้อนใหม่ทั้งห้อง (ไม่ใช่ patch ทีละแถว) เพราะการ merge
 *  แถวเดียวเข้าโครงซ้อนสองชั้นแล้วพลาด จะกลายเป็นตารางที่ผิดแบบเงียบ ๆ
 *  ซึ่งแย่กว่าโหลดใหม่ทั้งห้อง — ตารางห้องหนึ่งมีไม่ถึง 40 แถว
 *
 *  คืนฟังก์ชันสำหรับยกเลิก ต้องเรียกตอน unmount ไม่งั้น channel ค้างสะสม */
export function subscribeTimetable(classId, onChange) {
  if (!classId) return () => {};

  const channel = supabase
    .channel(`timetable-${classId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'timetables', filter: `class_id=eq.${classId}` },
      async () => {
        try {
          onChange(await fetchTimetable(classId));
        } catch (err) {
          console.error('[timetable] โหลดตารางใหม่หลังมีการแก้ไขไม่สำเร็จ:', err);
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/** บันทึกคาบเดียว (ฝ่ายวิชาการเท่านั้น — RLS เป็นคนกัน ไม่ใช่หน้าเว็บ)
 *
 *  ใช้ upsert บน (class_id, day, period) ที่มี unique constraint อยู่
 *  กดบันทึกซ้ำหรือสองคนกดพร้อมกันก็ได้แถวเดียว ไม่เกิดคาบซ้อน */
export async function saveSlot(classId, day, period, fields) {
  const { data: auth } = await supabase.auth.getUser();

  const { error } = await supabase.from('timetables').upsert(
    {
      class_id: classId,
      day,
      period,
      subject: fields.subject ?? '',
      teacher: fields.teacher ?? '',
      room: fields.room ?? '',
      is_substituted: Boolean(fields.is_substituted),
      substitute_teacher: fields.substitute_teacher ?? '',
      substitute_room: fields.substitute_room ?? '',
      updated_at: new Date().toISOString(),
      updated_by: auth?.user?.id ?? null,
    },
    { onConflict: 'class_id,day,period' }
  );

  if (error) throw error;
}

/** ยกเลิกการสอนแทนของคาบนั้น กลับไปเป็นครูเดิม
 *  ล้างชื่อครูแทน/ห้องแทนด้วย ไม่ใช่แค่ปิดธง — ไม่งั้นรอบหน้าที่สั่งสอนแทน
 *  ฟอร์มจะเด้งชื่อครูคนเก่าขึ้นมาเองโดยไม่มีใครพิมพ์ */
export async function clearSubstitution(classId, day, period) {
  const { error } = await supabase
    .from('timetables')
    .update({
      is_substituted: false,
      substitute_teacher: '',
      substitute_room: '',
      updated_at: new Date().toISOString(),
    })
    .eq('class_id', classId)
    .eq('day', day)
    .eq('period', period);

  if (error) throw error;
}

export { isSheetConfigured };

/** ดูดตารางทั้งเทอมจาก Google Sheet เข้ามาทับใน Supabase
 *
 *  ทำไมต้องมี: ต้นเทอมตารางเปลี่ยนทั้งใบ การกรอกทีละคาบในฟอร์ม 35 คาบ x หลายห้อง
 *  คือความทรมาน — วางทับในชีตแล้วกดปุ่มเดียวจบเร็วกว่ามาก
 *  ส่วนการสั่งสอนแทนระหว่างเทอมค่อยใช้ฟอร์มทีละคาบ ซึ่งชีตทำไม่ได้เพราะอ่านได้อย่างเดียว
 *
 *  คืนจำนวนคาบที่นำเข้า */
export async function importFromSheet(classId) {
  if (!isSheetConfigured(classId)) {
    throw new Error('ห้องนี้ยังไม่ได้ตั้งค่า gid ของแท็บใน src/config/sheets.js');
  }

  const sheet = await fetchTimetableForClass(classId);
  if (!sheet) throw new Error('อ่านข้อมูลจากชีตไม่ได้');

  const { data: auth } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const rows = [];

  for (const [day, periods] of Object.entries(sheet)) {
    for (const [period, slot] of Object.entries(periods)) {
      rows.push({
        class_id: classId,
        day,
        period: Number(period),
        ...EMPTY_SLOT,
        ...slot,
        updated_at: now,
        updated_by: auth?.user?.id ?? null,
      });
    }
  }

  if (rows.length === 0) throw new Error('ชีตแท็บนี้ไม่มีข้อมูล');

  const { error } = await supabase
    .from('timetables')
    .upsert(rows, { onConflict: 'class_id,day,period' });

  if (error) throw error;
  return rows.length;
}
