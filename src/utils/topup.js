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
/** แปลรหัสผิดพลาดจาก topup_qr_instant_v2 เป็นข้อความที่บอกทางแก้ได้
 *  ทุกตัวต้องตอบว่า "แล้วต้องทำยังไงต่อ" ไม่ใช่แค่บอกว่าไม่สำเร็จ */
const INSTANT_TOPUP_ERRORS = {
  SLIP_ALREADY_USED:
    'สลิปใบนี้ถูกใช้เติมเงินไปแล้ว กรุณาแนบสลิปของรายการโอนใหม่',
  SLIP_NOT_UPLOADED:
    'ไม่พบไฟล์สลิปบนระบบ กรุณาแนบรูปใหม่แล้วลองอีกครั้ง',
  SLIP_HASH_REQUIRED:
    'ตรวจสอบไฟล์สลิปไม่สำเร็จ กรุณาแนบรูปใหม่อีกครั้ง',
  SLIP_HASH_UNSUPPORTED:
    'เบราว์เซอร์นี้ตรวจไฟล์สลิปไม่ได้ กรุณาเปิดผ่าน https แล้วลองใหม่',
  INVALID_SLIP_PATH: 'ไฟล์สลิปไม่ถูกต้อง กรุณาแนบรูปใหม่',
  INVALID_AMOUNT: 'จำนวนเงินไม่ถูกต้อง',
  AMOUNT_TOO_LARGE: 'จำนวนเงินเกินเพดานต่อครั้ง',
  NOT_AUTHENTICATED: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
};

export function instantTopupErrorText(data) {
  if (data?.error === 'DAILY_LIMIT') {
    return `วันนี้เติมไปแล้ว ${data.used_baht} บาท เกินเพดาน ${data.limit_baht} บาทต่อวัน กรุณาลองใหม่พรุ่งนี้`;
  }
  return INSTANT_TOPUP_ERRORS[data?.error] || 'เติมเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
}

export function topupErrorText(err) {
  const msg = String(err?.message || err || '');
  if (INSTANT_TOPUP_ERRORS[msg]) return INSTANT_TOPUP_ERRORS[msg];
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
