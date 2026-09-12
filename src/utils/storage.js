/* localStorage อ่าน/เขียนแบบ JSON พร้อม fallback เมื่อ parse ไม่ได้หรือถูกบล็อก
   (เช่น private mode / storage เต็ม) เพื่อไม่ให้แอปพัง */

export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[storage] อ่านค่า "${key}" ไม่สำเร็จ ใช้ค่าเริ่มต้นแทน`, e);
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[storage] บันทึกค่า "${key}" ไม่สำเร็จ`, e);
    return false;
  }
}
