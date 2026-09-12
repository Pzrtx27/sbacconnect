/* ตั้งค่าบัญชีพร้อมเพย์สำหรับหน้าเติมเงิน (QR + แนบสลิป) — ดูวิธีตั้งค่าใน .env.example

   สำคัญ: ต้องเป็นเบอร์พร้อมเพย์/เลขบัตรประชาชนของ "บัญชีการเงินจริงของวิทยาลัย" เท่านั้น
   ห้ามปล่อยเป็นค่าตัวอย่างไปขึ้นโปรดักชัน ไม่งั้นเงินที่นักเรียนโอนจะไปเข้าบัญชีผิด
   ก่อนเปิดใช้จริง ให้สแกนทดสอบด้วยแอปธนาคารตัวเองก่อนว่าขึ้นชื่อบัญชีถูกต้อง */

export const PROMPTPAY_ID = import.meta.env.VITE_PROMPTPAY_ID || '';
export const PROMPTPAY_ACCOUNT_NAME = import.meta.env.VITE_PROMPTPAY_ACCOUNT_NAME || '';

export const isPromptPayConfigured = Boolean(PROMPTPAY_ID);
