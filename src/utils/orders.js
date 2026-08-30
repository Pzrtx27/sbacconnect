/* สถานะออเดอร์ตาม enum order_status ใน 01_schema.sql
   ('paid','preparing','done','cancelled')

   หมายเหตุ: ของเดิมบน Firebase มี 4 สถานะ (pending/preparing/ready/picked_up)
   แต่ schema ของ Supabase ไม่มีสถานะ "ชงเสร็จ รอมารับ" แยกออกมา
   จึงยุบเหลือ paid -> preparing -> done ตามที่ DB รองรับจริง
   ถ้าอยากได้สถานะ "รอรับของ" กลับมา ต้องเพิ่มค่าใน enum ก่อน */

export const ORDER_STATUS_TEXT = {
  paid: 'รอรับออเดอร์',
  preparing: 'กำลังชง',
  done: 'เสร็จสิ้น',
  cancelled: 'ยกเลิกแล้ว',
};

export const ORDER_STATUS_TEXT_LONG = {
  paid: 'รอรับออเดอร์ ⏳',
  preparing: 'กำลังชงเครื่องดื่ม ☕',
  done: 'รับเครื่องดื่มแล้ว ✓',
  cancelled: 'ยกเลิกแล้ว',
};

/** สถานะที่ถือว่า "ยังดำเนินการอยู่" — ใช้แยกหน้าสถานะออกจากหน้าประวัติ */
export const ACTIVE_STATUSES = ['paid', 'preparing'];

export function isActiveOrder(status) {
  return ACTIVE_STATUSES.includes(status);
}

export const ORDER_STATUS_COLOR = {
  paid: 'bg-amber-50 text-accent-amber border-amber-200 dark:bg-amber-950/20 dark:text-accent-amber dark:border-amber-900/30',
  preparing: 'bg-blue-50 text-brand border-blue-200 dark:bg-blue-950/20 dark:text-brand dark:border-blue-900/30',
  done: 'bg-emerald-50 text-accent-emerald border-emerald-200 dark:bg-emerald-950/20 dark:text-accent-emerald dark:border-emerald-900/30',
  cancelled:
    'bg-slate-100 text-content-muted border-slate-200 dark:bg-slate-800 dark:text-content-muted dark:border-slate-700',
};

/** อีโมจิของเครื่องดื่ม — products ใน DB ไม่มีคอลัมน์เก็บรูป
 *  เดาจากชื่อสินค้าเพื่อให้หน้าตายังน่าใช้เหมือนเดิม */
export function productEmoji(name = '', category = '') {
  const n = String(name).toLowerCase();
  if (n.includes('ลาเต้') || n.includes('latte') || n.includes('นม')) return '🥛';
  if (n.includes('โกโก้') || n.includes('cocoa') || n.includes('ช็อค')) return '🍫';
  if (n.includes('ชาเขียว') || n.includes('มัทฉะ')) return '🍵';
  if (n.includes('ชา') || String(category).toLowerCase() === 'tea') return '🧋';
  if (n.includes('เป๊ปซี่') || n.includes('โซดา') || n.includes('น้ำอัดลม')) return '🥤';
  if (n.includes('ขนมปัง') || String(category).toLowerCase() === 'snack') return '🍞';
  return '☕';
}

/** สร้าง idempotency key ที่ไม่ซ้ำ — กันตัดเงินซ้ำถ้าเน็ตสะดุดแล้วกดส่งใหม่ */
export function newIdempotencyKey(prefix = 'web') {
  const rand =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${rand}`;
}

/** ย่อรายการตัวเลือกให้อยู่บรรทัดเดียว เช่น "เย็น · หวานน้อย · ไข่มุก"
 *  ใช้ทั้งหน้าตะกร้า หน้าออเดอร์ของฉัน และหน้าคิวบาริสต้า จะได้อ่านเหมือนกันทุกที่ */
export function optionSummary(options = []) {
  return options.map((o) => o.name).filter(Boolean).join(' · ');
}

/** แปลงข้อความ error จาก place_order / place_order_v2 ให้เป็นภาษาคนอ่าน */
export function placeOrderErrorText(code, payload = {}) {
  switch (code) {
    case 'CARD_NOT_FOUND':
      return 'ไม่พบบัตร/รหัสนักเรียนนี้ในระบบ';
    case 'NOT_AUTHENTICATED':
      return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    case 'PRODUCT_NOT_FOUND':
      return 'มีเมนูในตะกร้าที่ร้านปิดการขายไปแล้ว กรุณาเอาออกแล้วสั่งใหม่';
    case 'INVALID_QTY':
      return `จำนวนของ "${payload.product || 'รายการนี้'}" ไม่ถูกต้อง (1-20 แก้ว)`;
    case 'INVALID_OPTION':
      return `ตัวเลือกของ "${payload.product || 'รายการนี้'}" ใช้กับเมนูนี้ไม่ได้`;
    case 'OPTION_RULE_VIOLATED':
      return `"${payload.product || 'รายการนี้'}" เลือกตัวเลือกไม่ครบหรือเกินที่กำหนด`;
    case 'TOO_MANY_ITEMS':
      return 'สั่งได้สูงสุด 20 รายการต่อหนึ่งออเดอร์';
    case 'NOTE_TOO_LONG':
      return 'หมายเหตุยาวเกินไป (ไม่เกิน 300 ตัวอักษร)';
    case 'INSUFFICIENT_FUNDS': {
      const short = Number(payload.total ?? 0) - Number(payload.balance ?? 0);
      return `ยอดเงินคงเหลือไม่พอ ขาดอีก ${(short / 100).toFixed(2)} บาท`;
    }
    case 'INVALID_ITEMS':
      return 'รายการสินค้าไม่ถูกต้อง';
    case 'DUPLICATE_IN_FLIGHT':
      return 'ระบบกำลังประมวลผลคำสั่งซื้อนี้อยู่ กรุณารอสักครู่';
    case 'FORBIDDEN':
      return 'บัญชีนี้ไม่มีสิทธิ์ทำรายการ';
    default:
      return code ? `ทำรายการไม่สำเร็จ (${code})` : 'ทำรายการไม่สำเร็จ';
  }
}

/** ข้อความ error ของงานแบบเลือกหลายรายการในหน้าบาริสต้า
 *  (pos_bulk_set_status / pos_delete_orders ใน 16_bulk_ops.sql) */
export function bulkErrorText(code, networkError) {
  if (networkError) return `ทำรายการไม่สำเร็จ: ${networkError.message}`;
  switch (code) {
    case 'FORBIDDEN':
      return 'บัญชีนี้ไม่มีสิทธิ์จัดการคิว';
    case 'NO_SELECTION':
      return 'ยังไม่ได้เลือกออเดอร์';
    case 'TOO_MANY':
      return 'เลือกได้สูงสุด 200 ใบต่อครั้ง';
    case 'NOTHING_ARCHIVABLE':
      return 'เก็บไม่ได้ ออเดอร์ที่เลือกยังทำไม่เสร็จ กดยกเลิกก่อนถึงจะเก็บได้';
    default:
      return code ? `ทำรายการไม่สำเร็จ (${code})` : 'ทำรายการไม่สำเร็จ';
  }
}
