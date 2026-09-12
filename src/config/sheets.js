/* ============================================================
   ตารางสอน ↔ Google Sheets (แยกแท็บต่อห้อง)
   วิธีตั้งค่า / เพิ่มห้องใหม่:
   1. สร้างแท็บ (tab) ใหม่ในชีตเดิม ตั้งชื่ออะไรก็ได้ (เช่น "ตารางสอน ช.3/6")
   2. File > Import → อัปโหลด timetable_m3_6.csv หรือ timetable_m3_4.csv (อยู่ที่ root
      ของโปรเจกต์) → เลือก "Replace current sheet" ให้ import ใส่แท็บนั้นแท็บเดียว
      (แต่ละแท็บ = ห้องเดียว ไม่ต้องมีคอลัมน์ class_id แล้ว)
   3. คลิกที่แท็บนั้น ดูเลขหลัง #gid= ใน URL แล้ววางลงใน TIMETABLE_TAB_GID_BY_CLASS ด้านล่าง
      (key คือ class_id ของนักเรียน เช่น m3_6, m3_4)
   4. Share ชีตเป็น "Anyone with the link" → Viewer (ถ้ายังไม่ได้ตั้ง)
   5. build/deploy ใหม่

   แก้ตารางสอนของห้องไหน ก็แก้ในแท็บของห้องนั้นได้เลย ไม่กระทบห้องอื่น —
   เว็บจะดึงข้อมูลใหม่ทุก TIMETABLE_POLL_INTERVAL_MS (ไม่ต้องใช้ Google Sheets API / OAuth)
   ============================================================ */

export const TIMETABLE_SHEET_ID = '1fkg-vJXDKUzLvIA4d61zr0E10S7hKEuTfRVnrHft8GM';

/** แผนที่ class_id -> gid ของแท็บ (tab) ที่เก็บตารางสอนห้องนั้นโดยเฉพาะ
 *  เพิ่มห้องใหม่ = เพิ่ม key ใหม่ตรงนี้ */
export const TIMETABLE_TAB_GID_BY_CLASS = {
  m3_4: '1057722229',
  m3_6: '1373172467',
};

export const TIMETABLE_POLL_INTERVAL_MS = 20000; // 20 วินาที

function buildCsvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${TIMETABLE_SHEET_ID}/export?format=csv&gid=${gid}`;
}

/** true เมื่อห้องนี้มี gid ตั้งค่าไว้แล้ว (ใช้ตัดสินใจว่าจะ fallback ไปข้อมูลตัวอย่างหรือไม่) */
export function isSheetConfigured(classId) {
  const gid = TIMETABLE_TAB_GID_BY_CLASS[classId];
  return Boolean(gid) && !String(gid).includes('PASTE_GID');
}

/** CSV parser ตามมาตรฐาน RFC 4180 (รองรับค่าที่มีจุลภาค/ขึ้นบรรทัดใหม่ในเครื่องหมายคำพูด)
 *  เพราะฟิลด์ subject/teacher บางแถวอาจมีจุลภาคหรือถูกพิมพ์ครอบด้วย "..." ใน Sheets */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? '').trim();
    });
    return obj;
  });
}

/** ดึงตารางสอนของห้อง classId จากแท็บของห้องนั้นโดยเฉพาะ
 *  คืนค่ารูปแบบ { Monday: { 1: {subject, teacher, room, is_substituted, ...} }, ... }
 *  คืนค่า null ถ้าห้องนี้ยังไม่ตั้งค่า gid — ให้ผู้เรียกใช้ fallback ไปข้อมูลตัวอย่างเอง */
export async function fetchTimetableForClass(classId) {
  if (!isSheetConfigured(classId)) return null;

  const url = buildCsvUrl(TIMETABLE_TAB_GID_BY_CLASS[classId]);
  const sep = url.includes('?') ? '&' : '?';
  // กัน browser/CDN cache ค้าง เพื่อให้เห็นการแก้ไขในชีตไวที่สุด
  const res = await fetch(`${url}${sep}_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`โหลดตารางสอนไม่สำเร็จ (HTTP ${res.status})`);

  const rows = parseCSV(await res.text());
  const timetable = {};

  rows.forEach((r) => {
    const day = r.day;
    const period = Number(r.period);
    if (!day || !period) return;
    if (!timetable[day]) timetable[day] = {};
    timetable[day][period] = {
      subject: r.subject || '',
      teacher: r.teacher || '',
      room: r.room || '',
      is_substituted: String(r.is_substituted).trim().toUpperCase() === 'TRUE',
      substitute_teacher: r.substitute_teacher || '',
      substitute_room: r.substitute_room || '',
    };
  });

  return timetable;
}
