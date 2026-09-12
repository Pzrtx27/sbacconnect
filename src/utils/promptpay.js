/* ============================================================
   PromptPay QR payload — ตามสเปกสาธารณะ EMVCo QR Code for Payment
   Systems (Merchant/Consumer Presented Mode) ที่ธนาคารแห่งประเทศไทย
   ใช้กับ PromptPay ทุกธนาคาร

   ไฟล์นี้ "สร้างข้อความ payload" ล้วน ๆ ไม่ได้เรียก API ธนาคารใด ๆ
   ไม่ต้องมีอินเทอร์เน็ตก็สร้างได้ — เอาไปวาดเป็นภาพ QR อีกทีด้วย
   qrcode.react (ดู src/components/wallet/TopUpSlipForm.jsx)

   โครงสร้างเป็น TLV (Tag-Length-Value) เรียงต่อกัน ปิดท้ายด้วย CRC16-CCITT
   (initial 0xFFFF, polynomial 0x1021) — เป็นรูปแบบเดียวกับที่ QR โอนเงิน
   พร้อมเพย์ทุกใบใช้ ไม่ผูกกับธนาคารใดธนาคารหนึ่ง
   ============================================================ */

function tlv(id, value) {
  const v = String(value);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** เบอร์มือถือ/เลขบัตรประชาชน -> รูปแบบ proxy id ที่ PromptPay กำหนด
 *    เบอร์มือถือ 10 หลัก ขึ้นต้นด้วย 0  -> "0066" + เบอร์ 9 หลักที่เหลือ (รวม 13 หลัก)
 *    เลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก -> ใช้ตรง ๆ
 *  คืน null เมื่อรูปแบบไม่ตรงกับทั้งสองแบบ */
function normalizeProxyId(rawId) {
  const digits = String(rawId || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return { tag: '01', value: `0066${digits.slice(1)}` };
  }
  if (digits.length === 13) {
    return { tag: '02', value: digits };
  }
  return null;
}

/** สร้าง payload string สำหรับ QR พร้อมเพย์
 *    id         เบอร์พร้อมเพย์ (เช่น 0812345678) หรือเลขบัตรประชาชน/เลขผู้เสียภาษี 13 หลัก
 *    amountBaht ถ้าใส่ (> 0) จะฝังจำนวนเงินไว้ในคิวอาร์เลย แอปธนาคารจะขึ้นยอดให้อัตโนมัติ
 *               ถ้าไม่ใส่ เป็นคิวอาร์แบบคงที่ ผู้โอนกรอกจำนวนเงินเอง
 *  คืน null เมื่อ id ไม่ถูกต้อง (หน้าเว็บต้องเช็คก่อนเอาไปสร้างภาพ QR) */
export function buildPromptPayPayload(id, amountBaht) {
  const proxy = normalizeProxyId(id);
  if (!proxy) return null;

  const hasAmount = Number(amountBaht) > 0;

  const merchantAccountInfo = tlv(
    '29',
    tlv('00', 'A000000677010111') + tlv(proxy.tag, proxy.value)
  );

  const fields = [
    tlv('00', '01'), // Payload Format Indicator
    tlv('01', hasAmount ? '12' : '11'), // Point of Initiation: 12=มีจำนวนเงินฝังมาแล้ว / 11=คงที่
    merchantAccountInfo,
    tlv('53', '764'), // Transaction Currency: THB = 764
  ];

  if (hasAmount) {
    fields.push(tlv('54', Number(amountBaht).toFixed(2))); // Transaction Amount
  }

  fields.push(tlv('58', 'TH')); // Country Code

  const withoutCrc = `${fields.join('')}6304`;
  return `${withoutCrc}${crc16(withoutCrc)}`;
}
