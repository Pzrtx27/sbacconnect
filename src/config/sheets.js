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

/* ============================================================
   ตารางสอนส่วนตัวของครู — คนละชุดกับตารางห้อง

   ตารางห้อง (ด้านบน) ตอบคำถามว่า "ห้อง ปวช.3/6 คาบนี้เรียนอะไร"
   ส่วนชุดนี้ตอบว่า "ครูคนนี้คาบนี้ต้องไปสอนที่ไหน" ซึ่งไม่ใช่ข้อมูลชุดเดียวกัน
   ครูหนึ่งคนสอนหลายห้อง และคาบว่างของครูไม่ใช่คาบว่างของห้องใดห้องหนึ่ง

   ของเดิมครูที่เปิดหน้าตารางจะเห็นตารางของห้อง m3_6 (ค่า fallback ในหน้าเว็บ)
   ทั้งที่ไม่ได้เกี่ยวอะไรกับห้องนั้นเลย — ชุดนี้เข้ามาแทนสำหรับครูที่ตั้งค่าไว้แล้ว
   ฝั่งนักเรียนไม่แตะเลยสักบรรทัด ยังอ่านจากแท็บของห้องตัวเองเหมือนเดิม

   key ใช้ "รหัสครู" (teacher_profiles.teacher_code) หรือ "อีเมล" ก็ได้
   ใส่อันไหนก็ได้ตามที่มีในระบบ หน้าเว็บลองรหัสครูก่อนแล้วค่อยลองอีเมล

   value ใส่ได้สองแบบ:
     '123456789'                          -> แท็บในชีตเดียวกับตารางห้อง (TIMETABLE_SHEET_ID)
     { sheetId: 'abc...', gid: '12345' }  -> อยู่คนละไฟล์ชีตกันไปเลย

   วิธีหา gid: เปิดชีต -> คลิกแท็บนั้น -> ดูเลขหลัง #gid= ใน URL
   รูปแบบข้อมูลในแท็บต้องเป็นแบบเดียวกับตารางห้อง (day, period, subject, teacher, room, ...)
   คือไฟล์ timetable_m3_6_import.csv ไม่ใช่ไฟล์ตารางแบบ วัน x คาบ ที่ไว้ให้คนอ่าน

   ปล่อยว่างไว้ = ปิดฟีเจอร์ ครูจะเห็นเหมือนเดิมทุกประการ
   ============================================================ */
export const TIMETABLE_TAB_GID_BY_TEACHER = {
  /* อ.ปิยะนุช พูลศิริ — ตารางสอนส่วนตัว อยู่คนละไฟล์กับชีตตารางห้อง (อัปโหลดแยกขึ้น Drive)

     ไฟล์นี้คือ timetable_m3_6_import.xlsx ที่แปลงเป็นชีตแล้ว — รูปแบบ day/period/subject/...
     ไม่ใช่ไฟล์ timetable_m3_6_grid ซึ่งเป็นตารางแบบ วัน x คาบ ไว้ให้คนอ่าน แอปอ่านไฟล์นั้นไม่ได้
     (สองไฟล์นี้หน้าตาคล้ายกันมากเวลาเปิดใน Drive ระวังหยิบสลับกัน)

     แก้ตารางในชีตนี้ได้เลย หน้าเว็บดึงใหม่เองทุก 20 วินาที ไม่ต้อง deploy
     แต่ต้องคงสิทธิ์แชร์เป็น "ทุกคนที่มีลิงก์ = ผู้อ่าน" ไว้ตลอด ถ้าเผลอปิดเมื่อไหร่
     หน้าเว็บจะขึ้นว่าอ่านชีตไม่สำเร็จทันที เพราะดึงผ่าน CSV สาธารณะ ไม่ได้ใช้ OAuth

     ใช้ "รหัสอาจารย์" (teacher_profiles.teacher_code) เป็น key ไม่ใช่อีเมล
     เพราะรหัสอาจารย์เห็นได้ตรง ๆ บนการ์ดโปรไฟล์ในหน้าแรกของครู ("รหัสอาจารย์ T1234")
     ส่วนอีเมลมาจากชื่อผู้ใช้ที่พิมพ์ตอนล็อกอิน ซึ่งสะกดพลาดกันได้ง่าย
     (บัญชีนี้ล็อกอินด้วย techer1234 -> techer1234@sbacnon.ac.th ไม่ใช่ teacher1234)

     ชื่อที่โชว์บนหน้าจอ ("อ.ปิยะนุช พูลศิริ") มาจาก users.full_name เป็นคนละค่ากับทั้งสองอย่าง
     ใช้เป็น key ไม่ได้ ถ้าวันหลังย้ายตารางนี้ไปครูคนอื่น ต้องมาแก้ key ตรงนี้ด้วย */
  T1234: {
    sheetId: '1AlrMv_3Po1NJ-al6Ph7JE7cIIHF_hD-37cuF9SQEbp4',
    gid: '1866038390',
  },
};

export const TIMETABLE_POLL_INTERVAL_MS = 20000; // 20 วินาที

function buildCsvUrl(gid, sheetId = TIMETABLE_SHEET_ID) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

/** true เมื่อห้องนี้มี gid ตั้งค่าไว้แล้ว (ใช้ตัดสินใจว่าจะ fallback ไปข้อมูลตัวอย่างหรือไม่) */
export function isSheetConfigured(classId) {
  const gid = TIMETABLE_TAB_GID_BY_CLASS[classId];
  return Boolean(gid) && !String(gid).includes('PASTE_GID');
}

/** หา entry ของครูจาก key ที่ลองได้หลายตัว (รหัสครู -> อีเมล)
 *  คืน { sheetId, gid } ที่พร้อมใช้ หรือ null ถ้ายังไม่ได้ตั้งค่า */
export function resolveTeacherSheet(...keys) {
  for (const key of keys) {
    const raw = key ? TIMETABLE_TAB_GID_BY_TEACHER[String(key).trim()] : null;
    if (!raw) continue;

    const gid = typeof raw === 'object' ? raw.gid : raw;
    const sheetId = (typeof raw === 'object' && raw.sheetId) || TIMETABLE_SHEET_ID;

    /* ค่าที่ยังเป็นตัวอย่างให้แทน (PASTE_...) นับว่า "ยังไม่ได้ตั้งค่า"
       ไม่ใช่ "ตั้งค่าผิด" — จะได้ไม่ยิงไปที่ URL มั่ว ๆ แล้วขึ้นว่าอ่านชีตไม่สำเร็จ
       ซึ่งชี้ผิดทาง เพราะความจริงคือยังไม่ได้กรอกค่า ไม่ใช่ชีตมีปัญหา
       ต้องเช็คทั้งสองช่อง ชีตแยกไฟล์กรอกค้างที่ sheetId ส่วนแท็บในชีตเดิมค้างที่ gid */
    if (!gid || String(gid).includes('PASTE') || String(sheetId).includes('PASTE')) continue;

    return { sheetId, gid: String(gid) };
  }
  return null;
}

/** ดึงตารางสอนส่วนตัวของครู — รูปแบบผลลัพธ์เหมือน fetchTimetableForClass ทุกประการ
 *  คืน null ถ้าครูคนนี้ยังไม่ได้ตั้งค่าแท็บไว้ */
export async function fetchTimetableForTeacher(...keys) {
  const target = resolveTeacherSheet(...keys);
  if (!target) return null;

  const url = buildCsvUrl(target.gid, target.sheetId);
  const res = await fetch(`${url}&_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`โหลดตารางสอนของครูไม่สำเร็จ (HTTP ${res.status})`);

  return rowsToTimetable(parseCSV(await res.text()));
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

  return rowsToTimetable(parseCSV(await res.text()));
}

/** แถวจาก CSV -> { Monday: { 1: {subject, teacher, room, ...} }, ... }
 *  แยกออกมาเพราะตารางห้องกับตารางของครูใช้รูปแบบเดียวกันเป๊ะ ต่างแค่แท็บที่ไปดึงมา
 *
 *  ช่องที่ครูปล่อยว่างในชีตมักพิมพ์เป็นขีด '-' (คาบว่าง) ไม่ใช่เว้นว่างจริง ๆ
 *  ถ้าปล่อยผ่านไป หน้าเว็บจะนับว่าเป็นคาบที่มีวิชาชื่อ "-" แล้ววาดกล่องวิชาให้
 *  จึงตัดทิ้งตั้งแต่ตรงนี้ให้กลายเป็นคาบว่างจริง ๆ เหมือนช่องที่ไม่ได้กรอก */
export function rowsToTimetable(rows) {
  const timetable = {};

  rows.forEach((r) => {
    const day = r.day;
    const period = Number(r.period);
    if (!day || !period) return;

    const subject = (r.subject || '').trim();
    if (subject === '' || subject === '-') return;

    if (!timetable[day]) timetable[day] = {};
    timetable[day][period] = {
      subject,
      teacher: (r.teacher || '').trim() === '-' ? '' : r.teacher || '',
      room: (r.room || '').trim() === '-' ? '' : r.room || '',
      is_substituted: String(r.is_substituted).trim().toUpperCase() === 'TRUE',
      substitute_teacher: r.substitute_teacher || '',
      substitute_room: r.substitute_room || '',
    };
  });

  return timetable;
}
