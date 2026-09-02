/* ตรวจไฟล์สลิปโอนเงินก่อนอัปโหลด ทำสามชั้น:
     1) ขนาดไฟล์ ไม่เกิน 5MB
     2) "magic bytes" ไบต์แรกสุดของไฟล์จริง ไม่ใช่แค่ดูนามสกุล/MIME ที่เบราว์เซอร์รายงาน
        (นามสกุล/MIME เปลี่ยนปลอมได้ง่ายมาก แค่เปลี่ยนชื่อไฟล์ .exe เป็น .jpg เบราว์เซอร์ก็เชื่อ
        magic bytes คือไบต์จริงในไฟล์ที่โปรแกรมทั่วไปแก้ไม่ได้โดยไม่ทำให้ไฟล์เสีย จึงเชื่อได้กว่า)
     3) ไฟล์ต้องไม่ว่างเปล่า

   ชื่อไฟล์ที่จะอัปโหลดจริงมาจาก anonymousFileName() เท่านั้น — ไม่ใช้ชื่อไฟล์เดิม
   ของผู้ใช้แม้แต่ส่วนเดียว ทั้งเพื่อความเป็นนิรนาม (ชื่อ-นามสกุลเดิมอาจหลุดไปอยู่ใน path)
   และกันชื่อชนกันเวลาหลายคนอัปโหลดพร้อมกัน */

export const MAX_SLIP_BYTES = 5 * 1024 * 1024; // 5MB

// รองรับเฉพาะ JPG และ PNG ตามที่ระบบเติมเงินต้องการ
const SIGNATURES = [
  { ext: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** อ่านไบต์แรกของไฟล์แล้วเทียบกับ signature ของ JPEG/PNG จริง
 *  คืน { ext, mime } เมื่อเป็นไฟล์รูปจริง หรือ null เมื่อไม่ใช่ */
export async function sniffImageSignature(file) {
  const maxLen = Math.max(...SIGNATURES.map((s) => s.bytes.length));
  const head = new Uint8Array(await file.slice(0, maxLen).arrayBuffer());
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((b, i) => head[i] === b)) {
      return { ext: sig.ext, mime: sig.mime };
    }
  }
  return null;
}

/** ตรวจไฟล์สลิปแบบครบชุด คืน { ok: true, ext, mime } หรือ { ok: false, error } */
export async function validateSlipFile(file) {
  if (!file) return { ok: false, error: 'NO_FILE' };
  if (file.size <= 0) return { ok: false, error: 'EMPTY_FILE' };
  if (file.size > MAX_SLIP_BYTES) return { ok: false, error: 'TOO_LARGE' };

  const sig = await sniffImageSignature(file);
  if (!sig) return { ok: false, error: 'NOT_IMAGE' };

  return { ok: true, ext: sig.ext, mime: sig.mime };
}

/** ชื่อไฟล์นิรนามที่ไม่ซ้ำกัน: <timestamp>-<เลขสุ่ม>.<นามสกุลจริงที่ตรวจได้>
 *  ใช้ crypto.getRandomValues (สุ่มปลอดภัยกว่า Math.random) พร้อม fallback
 *  เผื่อเบราว์เซอร์เก่า/ไม่ใช่ secure context (ดูเหตุผลเดียวกับ utils/crypto.js) */
/** sha256 ของไฟล์สลิป — ใช้เป็นลายนิ้วมือกันเอาสลิปใบเดิมมาเติมเงินซ้ำ
 *
 *  แฮชจากไบต์ของไฟล์ตรง ๆ ไม่ใช่จากชื่อไฟล์ (ชื่อเปลี่ยนได้ง่าย ๆ)
 *  ฝั่ง DB ตั้ง unique ไว้ทั้งตาราง สลิปใบเดียวจึงใช้ได้ครั้งเดียวทั้งระบบ
 *
 *  crypto.subtle ใช้ได้เฉพาะ secure context (https หรือ localhost)
 *  ถ้าเปิดผ่าน http://192.168.x.x จะไม่มี ต้องบอกผู้ใช้ให้ชัดว่าเพราะอะไร
 *  ไม่ใช่ปล่อยให้ error ดิบ ๆ เด้งมา */
export async function sha256File(file) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SLIP_HASH_UNSUPPORTED');
  }
  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function anonymousFileName(ext) {
  const rand = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(6)))
        .map((b) => b.toString(36).padStart(2, '0'))
        .join('')
    : Math.random().toString(36).slice(2, 14);
  return `${Date.now()}-${rand}.${ext}`;
}

/** แปลงรหัส error จาก validateSlipFile ให้เป็นข้อความอ่านง่าย */
export function slipErrorText(error) {
  switch (error) {
    case 'NO_FILE':
      return 'กรุณาเลือกรูปสลิปก่อน';
    case 'EMPTY_FILE':
      return 'ไฟล์นี้ว่างเปล่า กรุณาเลือกไฟล์ใหม่';
    case 'TOO_LARGE':
      return 'ไฟล์ใหญ่เกินไป (จำกัดไม่เกิน 5MB)';
    case 'NOT_IMAGE':
      return 'ไฟล์นี้ไม่ใช่รูปภาพ JPG/PNG จริง กรุณาถ่ายหรือเลือกรูปสลิปใหม่';
    default:
      return 'ไฟล์ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
  }
}
