/* แปลงระหว่างสิ่งที่นักเรียนพิมพ์ กับรูปแบบที่ Supabase / ตารางสอนต้องการ */

/** โดเมนอีเมลของวิทยาลัย — ต้องตรงกับที่ 06_seed_real.sql ใช้สร้างแถวใน users */
export const EMAIL_DOMAIN = 'sbacnon.ac.th';

/** ชื่อผู้ใช้ -> อีเมลเต็มสำหรับ Supabase Auth
 *  รองรับทั้ง "Somchai", "somchai" และ "somchai@sbacnon.ac.th"
 *  ทำเป็นตัวพิมพ์เล็กเสมอ เพราะ users.email ใน DB เก็บเป็นตัวเล็กทั้งหมด */
export function toEmail(input) {
  const cleaned = String(input || '').trim().toLowerCase();
  if (!cleaned) return '';
  if (cleaned.includes('@')) return cleaned;
  return `${cleaned}@${EMAIL_DOMAIN}`;
}

/** class_rooms (level='ปวช.3', room_no='6') -> 'm3_6'
 *  ตารางสอนใน src/config/sheets.js ใช้รหัสรูปแบบนี้เป็น key
 *  ดึงเฉพาะตัวเลขจาก level เพราะ level อาจเป็น 'ปวช.3' หรือ 'ม.4' ก็ได้ */
export function toClassId(level, roomNo) {
  if (!level || !roomNo) return '';
  const levelDigits = String(level).match(/\d+/)?.[0];
  const roomDigits = String(roomNo).match(/\d+/)?.[0];
  if (!levelDigits || !roomDigits) return '';
  return `m${levelDigits}_${roomDigits}`;
}

/** สตางค์ -> บาท แบบทศนิยม 2 ตำแหน่ง (ใช้ตอนแสดงผลเท่านั้น)
 *  คำนวณด้วย integer ล้วน กันปัญหาทศนิยมลอยตัวสะสม */
export function formatBaht(satang) {
  const n = Math.trunc(Number(satang) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100).toLocaleString('th-TH')}.${String(abs % 100).padStart(2, '0')}`;
}
