/* ตัวช่วยเรื่องคะแนนระหว่างภาค — ใช้ร่วมกันทั้งฝั่งนักเรียนและฝั่งอาจารย์

   แยกออกมาจาก StudentHome.jsx เพราะตอนนี้มีสี่จอที่ต้องตัดเกรด/ระบายสีด้วยเกณฑ์เดียวกัน
   (สรุปรายวิชาของนักเรียน, รายละเอียด T1-T5, สมุดคะแนนของครู, และการ์ดสรุปในหน้าแรก)
   ถ้าปล่อยให้ต่างจอต่างคำนวณ วันหนึ่งจะมีจอที่บอกว่า 79% เป็น "ดี" อีกจอบอก "ปานกลาง" */

/** เปอร์เซ็นต์ของคะแนนที่ทำได้ — กันหารศูนย์ตอนวิชายังไม่ได้ตั้งคะแนนเต็ม
 *  บีบไว้ที่ 0-100 เสมอ เพราะแถบความคืบหน้าใช้ค่านี้เป็น width โดยตรง
 *  ค่าที่เกิน 100 จะทำให้แถบล้นออกนอกกรอบการ์ด */
export function scorePercent(score, maxScore) {
  const max = Number(maxScore) || 0;
  if (max <= 0) return 0;
  const pct = ((Number(score) || 0) / max) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** จัดระดับคะแนนเป็น 4 เฉด — ใช้ทั้งกับวงกลมสรุปและแถบคะแนนรายวิชา */
export function getScoreTier(pct) {
  if (pct >= 85) return { label: 'ดีเยี่ยม', emoji: '🌟', bar: 'bg-emerald-500', text: 'text-accent-emerald', chip: 'bg-emerald-500/10' };
  if (pct >= 70) return { label: 'ดี', emoji: '👍', bar: 'bg-sbac-blue', text: 'text-brand', chip: 'bg-sbac-blue/10' };
  if (pct >= 50) return { label: 'ปานกลาง', emoji: '📘', bar: 'bg-amber-500', text: 'text-accent-amber', chip: 'bg-amber-500/10' };
  return { label: 'ควรพัฒนา', emoji: '💪', bar: 'bg-rose-500', text: 'text-accent-rose', chip: 'bg-rose-500/10' };
}

/* ตารางเกรดมาตรฐาน — ใช้แปลงคะแนนรวม 0-100 เป็นเกรดในโมดัล "ผลการเรียน"
   ของเดิมเกรดถูกเขียนตายไว้ในโค้ดทีละวิชา (A, B+, A, B+, ...) ไม่ได้มาจากคะแนนจริงเลย
   นักเรียนที่ได้ 30 คะแนนกับ 95 คะแนนจึงเห็น A เท่ากันทั้งคู่ */
const GRADE_TABLE = [
  { min: 80, grade: '4',  label: 'A',  point: 4.0 },
  { min: 75, grade: '3.5', label: 'B+', point: 3.5 },
  { min: 70, grade: '3',  label: 'B',  point: 3.0 },
  { min: 65, grade: '2.5', label: 'C+', point: 2.5 },
  { min: 60, grade: '2',  label: 'C',  point: 2.0 },
  { min: 55, grade: '1.5', label: 'D+', point: 1.5 },
  { min: 50, grade: '1',  label: 'D',  point: 1.0 },
  { min: 0,  grade: '0',  label: 'F',  point: 0.0 },
];

/** คะแนนเต็ม 100 -> เกรด
 *  คืน label ('A') กับ point (4.0) พร้อมสีที่ใช้กับชิปเกรด */
export function toGrade(score, maxScore) {
  const pct = scorePercent(score, maxScore);
  const row = GRADE_TABLE.find((g) => pct >= g.min) || GRADE_TABLE[GRADE_TABLE.length - 1];
  const tier = getScoreTier(pct);
  return { ...row, pct, color: tier.text, chip: tier.chip };
}

/** วิชานี้ "ประกาศคะแนนแล้ว" หรือยัง
 *
 *  ต้องดูสองอย่าง ไม่ใช่แค่คะแนนเต็ม:
 *    max_score > 0     -> อาจารย์ตั้งหัวข้อคะแนนไว้แล้ว
 *    graded_count > 0  -> และกรอกคะแนนของนักเรียนคนนี้แล้วอย่างน้อยหนึ่งหัวข้อ
 *
 *  ข้อหลังขาดไม่ได้ เพราะ seed ของ 40_gradebook.sql ใส่โครง T1-T5 (เต็ม 100)
 *  ให้ทุกวิชาตั้งแต่วินาทีที่รัน migration ทั้งที่ยังไม่มีใครกรอกคะแนนสักช่อง
 *  ถ้าดูแค่คะแนนเต็ม วิชาที่ยังไม่เริ่มกรอกจะนับเป็น 0/100 = F ทุกวิชาทั้งวิทยาลัย
 *  แล้วนักเรียนเปิดหน้าแรกมาเจอ "GPA 0.00" ในวันที่ครูยังไม่ได้เริ่มตรวจงานด้วยซ้ำ */
export function isAnnounced(subject) {
  return Number(subject?.max_score) > 0 && Number(subject?.graded_count || 0) > 0;
}

/** เกรดเฉลี่ยถ่วงน้ำหนักด้วยหน่วยกิต
 *  นับเฉพาะวิชาที่ประกาศคะแนนแล้วจริง ๆ (ดู isAnnounced)
 *  วิชาที่ยังไม่ประกาศถ้านับด้วยจะกลายเป็น F ทุกตัว
 *  แล้วลาก GPA ลงทั้งเทอมโดยไม่มีความผิดของใคร */
export function calcGpa(subjects) {
  const graded = (subjects || []).filter(isAnnounced);
  if (graded.length === 0) return null;

  const totals = graded.reduce(
    (acc, s) => {
      const credits = Number(s.credits) || 0;
      const { point } = toGrade(s.score, s.max_score);
      return { points: acc.points + point * credits, credits: acc.credits + credits };
    },
    { points: 0, credits: 0 }
  );

  if (totals.credits === 0) return null;
  return Math.round((totals.points / totals.credits) * 100) / 100;
}

/** 8 -> '8', 8.5 -> '8.5', 8.00 -> '8'
 *  คะแนนเก็บมาเป็น numeric จาก Postgres ซึ่ง supabase-js ส่งกลับมาเป็น string บ้าง number บ้าง
 *  ("8.00" กับ 8) ถ้าเอาไปต่อสตริงตรง ๆ นักเรียนจะเห็น "8.00/10" ปนกับ "9/10" ในตารางเดียวกัน */
export function fmtScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return String(Math.round(n * 100) / 100);
}

/** ผลรวมคะแนนของทั้งชุดวิชา — ใช้กับการ์ดสรุปวงกลม */
export function sumScores(subjects) {
  return (subjects || []).reduce(
    (acc, s) => ({
      score: acc.score + (Number(s.score) || 0),
      max: acc.max + (Number(s.max_score) || 0),
    }),
    { score: 0, max: 0 }
  );
}

/** ข้อความอธิบาย error ที่ RPC ฝั่งคะแนนส่งกลับมา
 *  รวมไว้ที่เดียวเพราะทั้งฟอร์มกรอกทีละช่อง ปุ่มบวก/ลบ และการบันทึกทั้งห้อง
 *  คุยกับฟังก์ชันชุดเดียวกันและเจอ error ชุดเดียวกัน */
export const SCORE_ERROR_MESSAGES = {
  FORBIDDEN: 'ไม่มีสิทธิ์แก้คะแนนวิชานี้',
  ITEM_NOT_FOUND: 'ไม่พบหัวข้อคะแนนนี้ (อาจถูกลบไปแล้ว)',
  SUBJECT_NOT_FOUND: 'ไม่พบรายวิชานี้',
  PARENT_ITEM_NOT_GRADABLE: 'หัวข้อหลักเป็นยอดรวมของหัวข้อย่อย ให้กรอกที่หัวข้อย่อยแทน',
  STUDENT_NOT_IN_CLASS: 'นักเรียนคนนี้ไม่ได้อยู่ห้องเดียวกับรายวิชา',
  SCORE_NEGATIVE: 'คะแนนติดลบไม่ได้',
  SCORE_OVER_MAX: 'คะแนนเกินคะแนนเต็มของหัวข้อนี้',
  INVALID_DELTA: 'ระบุจำนวนคะแนนที่จะเพิ่มหรือตัด',
  INVALID_MAX_SCORE: 'คะแนนเต็มต้องอยู่ระหว่าง 0 ถึง 1000',
  CODE_REQUIRED: 'กรุณาระบุรหัสหัวข้อ เช่น T1 หรือ T1.1',
  CODE_DUPLICATE: 'มีหัวข้อรหัสนี้ในวิชานี้อยู่แล้ว',
  SUBJECT_REQUIRED: 'ไม่พบรายวิชาที่จะเพิ่มหัวข้อ',
  NAME_REQUIRED: 'กรุณาระบุชื่อรายวิชา',
  CLASS_REQUIRED: 'กรุณาเลือกห้องเรียน',
  SUBJECT_DUPLICATE: 'ห้องนี้มีรายวิชาชื่อนี้ในภาคเรียนนี้แล้ว',
  ALREADY_HAS_ITEMS: 'วิชานี้มีหัวข้อคะแนนอยู่แล้ว',
  NOT_A_STUDENT: 'บัญชีนี้ไม่ได้เป็นนักเรียน จึงไม่มีคะแนนระหว่างภาค',
  NO_CLASSROOM: 'บัญชีของคุณยังไม่ได้ถูกจัดเข้าห้องเรียน กรุณาติดต่อฝ่ายวิชาการ',
};

export function scoreErrorMessage(code, fallback = 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง') {
  return SCORE_ERROR_MESSAGES[code] || fallback;
}
