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

/* ป้ายสถานะแบบยาว ใช้ในหน้า "สถานะการสั่งซื้อ" ของนักเรียน
   เดิมมีอีโมจิ ⏳ ☕ ✓ ต่อท้ายสามในสี่สถานะ ซึ่งมีปัญหาสองอย่าง:
     - ป้ายพวกนี้อยู่ในกล่องที่มีสีบอกสถานะอยู่แล้ว อีโมจิจึงเป็นข้อมูลซ้ำ
     - อีโมจิถูกวาดด้วยฟอนต์ของเครื่องผู้ใช้ ป้ายจึงกว้างไม่เท่ากันในแต่ละเครื่อง
       และ 'ยกเลิกแล้ว' ที่ไม่มีอีโมจิเลยยิ่งทำให้ความกว้างไม่สม่ำเสมอ */
export const ORDER_STATUS_TEXT_LONG = {
  paid: 'รอรับออเดอร์',
  preparing: 'กำลังชงเครื่องดื่ม',
  done: 'รับเครื่องดื่มแล้ว',
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

/* ---------- รูปเมนู ----------
   products ใน DB ไม่มีคอลัมน์รูป (มีแต่ image_url ที่ยังไม่มีใครอัปโหลด)
   จึงต้องเดา "ทรงภาชนะ" จากหมวดกับชื่อเมนู แล้วให้ DrinkIcon วาดเป็นเส้นให้

   ของเดิมคืนอีโมจิ (☕ 🥛 🍵) ซึ่งมีบั๊กที่เห็นได้ในหน้าเมนูจริง:
     'ขนมปังปิ้ง' โดนกฎ n.includes('นม') ดักไปก่อน เพราะคำว่า "ขนม" มี "นม" อยู่ข้างใน
     ขนมปังจึงขึ้นเป็นแก้วนม 🥛 มาตลอด
   ตัวนี้ดูหมวด (category) ก่อนเสมอ แล้วค่อยไล่คำในชื่อตามลำดับที่ควบคุมไว้
   โดย 'ขนมปัง' อยู่บนสุด จะได้ไม่โดน 'นม' ดักอีก */

const CATEGORY_ALIASES = {
  coffee: 'coffee',
  espresso: 'coffee',
  กาแฟ: 'coffee',
  tea: 'tea',
  ชา: 'tea',
  milk: 'milk',
  นม: 'milk',
  soda: 'soda',
  soft_drink: 'soda',
  โซดา: 'soda',
  น้ำอัดลม: 'soda',
  snack: 'snack',
  bakery: 'snack',
  food: 'snack',
  ขนม: 'snack',
  เบเกอรี่: 'snack',
  ของว่าง: 'snack',
};

/** หมวดจาก DB -> หมวดมาตรฐานของหน้าเว็บ (null = ไม่รู้จัก ให้ไปเดาจากชื่อแทน) */
function normalizeCategory(category) {
  const key = String(category || '').trim().toLowerCase();
  return CATEGORY_ALIASES[key] || null;
}

/** ป้ายหัวข้อหมวดในหน้าเมนู
 *  DB เก็บหมวดเป็น 'coffee' / 'snack' / 'tea' ซึ่งไม่ควรโผล่ให้ผู้ใช้เห็นดิบ ๆ
 *  หมวดที่ยังไม่รู้จักคืนค่าเดิมกลับไป ร้านตั้งชื่อหมวดเป็นภาษาไทยเองก็ใช้ได้ทันที */
const CATEGORY_LABELS = {
  coffee: 'กาแฟ',
  tea: 'ชา',
  milk: 'นมและโกโก้',
  soda: 'น้ำอัดลม',
  snack: 'ของว่าง',
};

export function categoryLabel(category) {
  const norm = normalizeCategory(category);
  if (norm) return CATEGORY_LABELS[norm];
  const raw = String(category || '').trim();
  return raw || 'อื่น ๆ';
}

/* คำในชื่อเมนู -> ทรงภาชนะ เรียงจากเฉพาะไปกว้าง ตัวแรกที่แมตช์ชนะ
   'ขนมปัง' ต้องอยู่เหนือ 'นม' เสมอ ไม่งั้นเจอบั๊กเดิมอีกรอบ */
const NAME_SHAPES = [
  [['ขนมปัง', 'ปังปิ้ง', 'โทสต์', 'toast', 'bread', 'ครัวซองต์', 'croissant'], 'bread'],
  [['คุกกี้', 'cookie', 'เค้ก', 'cake', 'บราวนี่', 'brownie', 'วาฟเฟิล', 'waffle'], 'cookie'],
  [['เอสเปรสโซ', 'espresso', 'อเมริกาโน', 'americano', 'ลองแบล็ค', 'long black', 'กาแฟดำ'], 'espresso'],
  [['ชานม', 'ไข่มุก', 'boba', 'bubble', 'ชาไทย', 'ชาเย็น'], 'bubble'],
  [['มัทฉะ', 'matcha', 'ชาเขียว', 'green tea'], 'matcha'],
  [['โกโก้', 'cocoa', 'ช็อกโก', 'ช็อคโก', 'chocolate', 'มอคค่า', 'mocha'], 'cocoa'],
  [['ลาเต้', 'latte', 'คาปูชิโน', 'cappuccino', 'นมสด', 'มัคคิอาโต', 'macchiato'], 'latte'],
  [['เป๊ปซี่', 'pepsi', 'โค้ก', 'coke', 'โซดา', 'soda', 'น้ำอัดลม', 'สไปรท์', 'sprite'], 'soda'],
  [['ชา', 'tea'], 'tea'],
  [['นม', 'milk'], 'latte'],
  [['กาแฟ', 'coffee'], 'cup'],
];

/** ทรงเริ่มต้นของแต่ละหมวด ใช้ตอนชื่อเมนูไม่บอกอะไรเลย เช่น "เมนูพิเศษประจำวัน" */
const CATEGORY_SHAPES = {
  coffee: 'cup',
  tea: 'tea',
  milk: 'latte',
  soda: 'soda',
  snack: 'cookie',
};

/**
 * เลือกทรงภาชนะให้เมนูหนึ่งรายการ
 * คืนคีย์ที่ <DrinkIcon shape="..."> รู้จัก (ดู components/ui/DrinkIcon.jsx)
 */
export function drinkShapeFor(name = '', category = '') {
  const cat = normalizeCategory(category);
  const n = String(name).toLowerCase();

  /* ของกินไม่ใช่เครื่องดื่ม ตัดจบที่หมวดเลย ไม่ต้องไปเสี่ยงกับคำในชื่อ
     (ชื่อขนมมีคำว่า "ชา" หรือ "นม" ปนได้ตลอด เช่น "ขนมปังชาไทย") */
  if (cat === 'snack') {
    for (const [keys, shape] of NAME_SHAPES.slice(0, 2)) {
      if (keys.some((k) => n.includes(k))) return shape;
    }
    return 'cookie';
  }

  for (const [keys, shape] of NAME_SHAPES) {
    if (keys.some((k) => n.includes(k))) return shape;
  }

  return CATEGORY_SHAPES[cat] || 'cup';
}

/* โทนสีของแต่ละทรง — ให้กริดเมนูอ่านเป็น "ระบบ" ไม่ใช่ช่องสีเดียวกันเรียงกันสิบช่อง
   ใช้ token ของแอป (accent-*) ที่ผ่าน AA ทั้งสองธีมอยู่แล้ว ไม่ตั้งสีดิบเอง
   เพราะพอสลับธีมแล้วคู่คอนทราสต์จะหลุดทันที */
const SHAPE_TONES = {
  espresso: { icon: 'text-accent-amber',   tile: 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/25' },
  cup:      { icon: 'text-accent-amber',   tile: 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/25' },
  cocoa:    { icon: 'text-accent-amber',   tile: 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/25' },
  bread:    { icon: 'text-accent-amber',   tile: 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/25' },
  cookie:   { icon: 'text-accent-amber',   tile: 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/25' },
  latte:    { icon: 'text-accent-cyan',    tile: 'bg-cyan-500/10 ring-1 ring-inset ring-cyan-500/25' },
  matcha:   { icon: 'text-accent-emerald', tile: 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25' },
  tea:      { icon: 'text-accent-emerald', tile: 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25' },
  bubble:   { icon: 'text-accent-violet',  tile: 'bg-violet-500/10 ring-1 ring-inset ring-violet-500/25' },
  soda:     { icon: 'text-accent-rose',    tile: 'bg-rose-500/10 ring-1 ring-inset ring-rose-500/25' },
};

export function drinkTone(shape) {
  return SHAPE_TONES[shape] || SHAPE_TONES.cup;
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
