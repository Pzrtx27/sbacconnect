/* ============================================================
   Firebase — ปิดการใช้งานถาวร
   ============================================================
   ระบบทั้งหมดย้ายไป Supabase แล้ว (ดู src/config/supabase.js)

   เหตุผลที่ต้อง "ปิด" ไม่ใช่แค่ "เลิกใช้":
   โปรเจกต์เดิม project-992c3 ไม่ได้อยู่ในบัญชี Google ของเรา
   จึงเข้าไปตั้ง security rules ไม่ได้ และ rules ปัจจุบันเปิดให้
   ใครก็ได้บนอินเทอร์เน็ต อ่าน/แก้/ลบ ข้อมูลได้ทั้งหมด

   ถ้าปล่อยให้ไฟล์นี้ยังต่อกับโปรเจกต์นั้น โค้ดที่เหลือ (เช่นฟีเจอร์
   นำเข้ารายชื่อใน AcademicDashboard) จะเขียนชื่อ-นามสกุลจริงของ
   นักเรียนขึ้นไปที่นั่นได้อีก ซึ่งเท่ากับเปิดเผยข้อมูลสู่สาธารณะ

   จึงเปลี่ยนเป็น stub ที่โยน error ทันทีเมื่อมีใครเรียกใช้
   — ให้พังแบบเห็นชัด ดีกว่ารั่วแบบเงียบ ๆ
   ============================================================ */

const DISABLED_MESSAGE =
  'ระบบนี้ย้ายไปใช้ Supabase แล้ว การเชื่อมต่อ Firebase ถูกปิดเพื่อความปลอดภัย ' +
  '(โปรเจกต์เดิมไม่ได้อยู่ในบัญชีของเราและเปิดข้อมูลสู่สาธารณะ)';

function disabled() {
  throw new Error(`[firebase] ${DISABLED_MESSAGE}`);
}

/** Proxy ที่ดักทุกการเรียกใช้ ไม่ว่าจะ .collection(), .doc() หรืออะไรก็ตาม */
const guard = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'then' || prop === Symbol.toStringTag) return undefined; // กัน await เผลอ ๆ
      disabled();
    },
    apply: disabled,
  }
);

export const db = guard;
export const auth = guard;
export const isFirebaseDisabled = true;
export const firebaseDisabledMessage = DISABLED_MESSAGE;

export default guard;
