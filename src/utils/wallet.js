import { supabase } from '../config/supabase';

/* ============================================================
   ประวัติเงินเข้า-ออก และเวลาเข้าโรงเรียน

   ทั้งคู่อ่านผ่าน RPC ที่กรองด้วย app_current_user_id() ฝั่ง DB
   ไม่มีพารามิเตอร์ user_id ให้ส่ง จึงขอดูของคนอื่นไม่ได้แม้ยิง API ตรง
   (26_wallet_history.sql / 27_gate_logs.sql)
   ============================================================ */

/** ชื่อไทย + ไอคอนของแต่ละประเภทรายการ
 *  kind มาจาก DB: topup_cash / topup_qr / adjust / purchase */
const KIND_LABEL = {
  topup_cash: 'เติมเงินสด',
  topup_qr: 'เติมเงินผ่าน QR',
  topup: 'เติมเงิน',
  adjust: 'เจ้าหน้าที่ปรับยอด',
  purchase: 'ซื้อสินค้า',
};

export function walletKindLabel(kind, direction) {
  if (KIND_LABEL[kind]) return KIND_LABEL[kind];
  // kind ที่ยังไม่รู้จัก อย่างน้อยบอกทิศทางให้ถูก ดีกว่าโชว์ค่าดิบจาก DB
  return direction === 'out' ? 'รายการหักเงิน' : 'รายการเพิ่มเงิน';
}

/** ประวัติกระเป๋าเงินของตัวเอง ใหม่สุดก่อน */
export async function fetchWalletHistory(limit = 50) {
  const { data, error } = await supabase.rpc('my_wallet_history', { p_limit: limit });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** ประวัติเวลาเข้าโรงเรียนของตัวเอง ใหม่สุดก่อน
 *  ไม่มีขาออก — ของจริงไม่มีใครแตะบัตรตอนกลับบ้าน (ดูเหตุผลใน 27_gate_logs.sql) */
export async function fetchGateLogs(limit = 14) {
  const { data, error } = await supabase.rpc('my_gate_logs', { p_limit: limit });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/* ---------- ตัวช่วยแสดงผล ---------- */

const TH = 'th-TH';

/** 2569-09-02T07:42:00Z -> "07:42 น." */
export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleTimeString(TH, { hour: '2-digit', minute: '2-digit' })} น.`;
}

/** วันแบบอ่านง่าย — วันนี้/เมื่อวานบอกเป็นคำ เพราะเป็นสองวันที่คนดูบ่อยที่สุด
 *  ที่เหลือใช้วันที่เต็มพร้อมชื่อวัน จะได้รู้ว่าเป็นวันเรียนหรือวันหยุด */
export function formatDayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

  if (diffDays === 0) return 'วันนี้';
  if (diffDays === 1) return 'เมื่อวาน';

  return d.toLocaleDateString(TH, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** จัดรายการเป็นกลุ่มตามวัน เพื่อให้มีหัวข้อคั่นแทนรายการยาวพรืด */
export function groupByDay(items, getIso) {
  const groups = [];
  for (const item of items) {
    const iso = getIso(item);
    const key = iso ? new Date(iso).toDateString() : 'unknown';
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: formatDayLabel(iso), items: [item] });
  }
  return groups;
}

/** สตางค์ -> "+120.00" / "-45.50" พร้อมเครื่องหมายเสมอ
 *  คิดด้วย integer ล้วนแล้วค่อยใส่จุด กันทศนิยมลอยตัวสะสม */
export function formatSignedBaht(satang) {
  const n = Math.trunc(Number(satang) || 0);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100).toLocaleString(TH)}.${String(abs % 100).padStart(2, '0')}`;
}
