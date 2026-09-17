/* กติกาการแนบเอกสารใบลา

   ข้อกำหนดจากวิทยาลัย: ลา "เกิน" 5 วัน ต้องแนบใบรับรอง/ใบลาเป็นไฟล์หรือรูป
   คำว่าเกินคือมากกว่า ไม่ใช่ตั้งแต่ — ลา 5 วันพอดียังไม่ต้องแนบ ลา 6 วันถึงต้อง

   ตัวเลข 5 ในไฟล์นี้เป็นเพียง "ค่าสำรอง" ที่ใช้ตอนอ่านค่าจากฐานข้อมูลไม่ได้
   ค่าจริงมาจากตาราง school_settings ซึ่งหน้า Admin แก้ได้ (ดู useSchoolSettings)
   ทุกฟังก์ชันจึงรับ afterDays และ countWeekends เข้ามาแทนค่าเริ่มต้นได้หมด */

export const LEAVE_ATTACHMENT_AFTER_DAYS = 5;

/** ขนาดไฟล์แนบสูงสุด — 5 MB พอสำหรับรูปถ่ายใบรับรองแพทย์จากมือถือ */
export const LEAVE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 86400000;

/** จำนวนวันลา นับรวมวันเริ่มและวันสิ้นสุด (ลาวันเดียว = 1 วัน)
 *
 *  นับเป็นวันปฏิทิน ไม่หักเสาร์-อาทิตย์และวันหยุดพิเศษ
 *  เพราะปฏิทินวันหยุดของวิทยาลัยยังไม่ได้อยู่ในระบบ ถ้าหักเองจะได้ตัวเลข
 *  ที่ไม่ตรงกับที่ครูนับในใบลาจริง ซึ่งอันตรายกว่าการนับเกินไปเล็กน้อย
 *
 *  คิดด้วย UTC ล้วน ไม่แตะ timezone ของเครื่อง — ถ้าใช้ new Date('2569-01-01')
 *  เครื่องที่ตั้งโซนอื่นจะได้วันเคลื่อนไปหนึ่งวัน แล้วกติกาแนบไฟล์จะเพี้ยนตาม */
export function leaveDays(startDate, endDate, countWeekends = true) {
  const start = String(startDate || '');
  const end = String(endDate || '') || start;

  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return 0;

  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);

  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  if (last < first) return 0;

  // เพดานกันช่วงวันที่ยาวผิดปกติ (พิมพ์ปีผิดเป็น 2669) ไม่ให้วนลูปค้างหน้าจอ
  if (last - first > 365 * ONE_DAY_MS) return 0;

  if (countWeekends) return Math.round((last - first) / ONE_DAY_MS) + 1;

  let days = 0;
  for (let time = first; time <= last; time += ONE_DAY_MS) {
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

/** ใบลาช่วงนี้ต้องแนบเอกสารไหม */
export function needsAttachment(startDate, endDate, afterDays = LEAVE_ATTACHMENT_AFTER_DAYS, countWeekends = true) {
  return leaveDays(startDate, endDate, countWeekends) > Number(afterDays);
}

/** ตรวจไฟล์ที่ผู้ใช้เลือก — คืนข้อความผิดพลาด หรือ '' ถ้าผ่าน
 *
 *  ตรวจฝั่งหน้าเว็บอย่างเดียวเพราะรุ่นสาธิตนี้ไม่ได้อัปโหลดไฟล์ไปไหนจริง
 *  ถ้าวันหนึ่งต่อกับ Supabase Storage ต้องตรวจซ้ำฝั่งเซิร์ฟเวอร์ด้วยเสมอ
 *  ชนิดไฟล์ที่เบราว์เซอร์แจ้งมาปลอมได้ */
export function validateAttachment(file) {
  if (!file) return '';
  if (!ALLOWED_TYPES.includes(file.type)) return 'แนบได้เฉพาะไฟล์ PDF, JPG, PNG หรือ WebP';
  if (file.size === 0) return 'ไฟล์นี้ว่างเปล่า กรุณาเลือกไฟล์ใหม่';
  if (file.size > LEAVE_ATTACHMENT_MAX_BYTES) return 'ไฟล์ต้องมีขนาดไม่เกิน 5 MB';
  return '';
}

/** ข้อความบอกสถานะการแนบไฟล์ใต้ฟอร์ม — ให้นักเรียนรู้ล่วงหน้าว่าต้องแนบหรือยัง */
export function attachmentHint(startDate, endDate, afterDays = LEAVE_ATTACHMENT_AFTER_DAYS, countWeekends = true) {
  const days = leaveDays(startDate, endDate, countWeekends);
  if (days === 0) return `ลาเกิน ${afterDays} วันต้องแนบเอกสารประกอบ`;
  if (days > Number(afterDays)) return `ลา ${days} วัน — เกิน ${afterDays} วัน ต้องแนบเอกสารประกอบ`;
  return `ลา ${days} วัน — ไม่เกิน ${afterDays} วัน จะแนบเอกสารหรือไม่ก็ได้`;
}
