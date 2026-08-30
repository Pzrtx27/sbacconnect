/* ข้อความ/สีของสถานะคำขอเติมเงิน (topup_requests.status ใน 18_topup_requests.sql)
   แยกออกมาจากตัวฟอร์ม เผื่อมีหน้าอื่นอยากโชว์สถานะเดียวกัน (เช่นหน้าประวัติ) ในอนาคต */

export const TOPUP_STATUS_TEXT = {
  pending: 'รอตรวจสอบ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
};

export const TOPUP_STATUS_COLOR = {
  pending:
    'bg-amber-50 text-accent-amber border-amber-200 dark:bg-amber-950/20 dark:text-accent-amber dark:border-amber-900/30',
  approved:
    'bg-emerald-50 text-accent-emerald border-emerald-200 dark:bg-emerald-950/20 dark:text-accent-emerald dark:border-emerald-900/30',
  rejected:
    'bg-rose-50 text-accent-rose border-rose-200 dark:bg-rose-950/20 dark:text-accent-rose dark:border-rose-900/30',
};

/** แปลงข้อความ error จากการอัปโหลด/ส่งคำขอเติมเงินให้เป็นภาษาคนอ่าน */
export function topupErrorText(err) {
  const msg = String(err?.message || err || '');
  if (/exceeded the maximum allowed size|too large/i.test(msg)) {
    return 'ไฟล์ใหญ่เกินไป (จำกัดไม่เกิน 5MB)';
  }
  if (/row-level security|permission denied|RLS/i.test(msg)) {
    return 'ไม่มีสิทธิ์ทำรายการนี้ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง';
  }
  if (/JWT|session/i.test(msg)) {
    return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  }
  return msg ? `ส่งคำขอไม่สำเร็จ: ${msg}` : 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
}
