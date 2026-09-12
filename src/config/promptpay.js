/* ตั้งค่าบัญชีพร้อมเพย์สำหรับหน้าเติมเงิน (QR + แนบสลิป) — ดูวิธีตั้งค่าใน .env.example

   สำคัญ: ต้องเป็นเบอร์พร้อมเพย์/เลขบัตรประชาชนของ "บัญชีการเงินจริงของวิทยาลัย" เท่านั้น
   ห้ามปล่อยเป็นค่าตัวอย่างไปขึ้นโปรดักชัน ไม่งั้นเงินที่นักเรียนโอนจะไปเข้าบัญชีผิด
   ก่อนเปิดใช้จริง ให้สแกนทดสอบด้วยแอปธนาคารตัวเองก่อนว่าขึ้นชื่อบัญชีถูกต้อง */

import { buildPromptPayPayload } from '../utils/promptpay';

export const PROMPTPAY_ID = import.meta.env.VITE_PROMPTPAY_ID || '';
export const PROMPTPAY_ACCOUNT_NAME = import.meta.env.VITE_PROMPTPAY_ACCOUNT_NAME || '';

export const isPromptPayConfigured = Boolean(PROMPTPAY_ID);

/** จำนวนหลักของเลขที่ตั้งไว้ — เอาไว้บอกในข้อความว่าตอนนี้มีกี่หลัก
 *  ไม่โชว์ตัวเลขเอง เพราะเลขที่ผิดอยู่แล้วไม่มีประโยชน์ให้ใครอ่าน */
export const PROMPTPAY_ID_DIGITS = String(PROMPTPAY_ID).replace(/\D/g, '').length;

/** ตั้งค่าไว้แล้ว "และ" เลขอยู่ในรูปแบบที่สร้าง QR ได้จริง
 *
 *  ต้องแยกจาก isPromptPayConfigured เพราะสองอย่างนี้พังคนละแบบและแก้คนละที่:
 *    ไม่ได้ตั้งค่า      -> ยังไม่มีใครกรอก VITE_PROMPTPAY_ID
 *    ตั้งแล้วแต่ไม่ถูก  -> กรอกแล้วแต่เลขไม่ครบ/ผิดรูปแบบ (เช่นเบอร์มือถือ 9 หลัก)
 *
 *  ของเดิมหน้าเว็บเช็คแค่ "มีค่าไหม" แล้วถ้าสร้าง QR ไม่ได้ก็ขึ้นข้อความว่า
 *  "ยังไม่ได้ตั้งค่าบัญชีพร้อมเพย์" เหมือนกันหมด คนอ่านจึงไปไล่หาที่ไฟล์ .env
 *  ทั้งที่กรอกไว้แล้ว ปัญหาจริงคือเลขขาดไปหนึ่งหลัก */
export const isPromptPayIdValid = Boolean(buildPromptPayPayload(PROMPTPAY_ID));
