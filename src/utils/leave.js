/* ป้ายกำกับ/สีของสถานะใบลา — ใช้ร่วมกันทุกหน้า (นักเรียน/ครู/ฝ่ายวิชาการ)
   ต้องตรงกับ constraint leave_requests_status_valid ใน 22_leave_requests.sql เป๊ะ */

/* เหลือสองประเภทตามที่วิทยาลัยใช้จริง — ลาป่วย กับ ลากิจ
   'activity' และ 'other' ถูกถอดออกจากฟอร์ม แต่ constraint ฝั่ง DB ยังรับอยู่
   ใบลาเก่าที่เคยเลือกสองแบบนั้นจึงยังอ่านได้ปกติ (LeaveRequestList ถอยไปใช้ค่าดิบ
   เมื่อไม่เจอคีย์ในนี้) ถ้าจะปิดถาวรต้องแก้ leave_requests_type_valid ใน 22 ด้วย */
export const LEAVE_TYPE_LABELS = {
  sick: { label: '🏥 ลาป่วย', desc: 'ป่วย ไม่สบาย' },
  personal: { label: '📋 ลากิจ', desc: 'ธุระส่วนตัว' },
};

export const LEAVE_STATUS_TEXT = {
  pending_teacher: 'รอครูประจำชั้นอนุมัติ',
  pending_academic: 'รอฝ่ายวิชาการอนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected_by_teacher: 'ครูประจำชั้นไม่อนุมัติ',
  rejected_by_academic: 'ฝ่ายวิชาการไม่อนุมัติ',
};

export const LEAVE_STATUS_COLOR = {
  pending_teacher: 'bg-amber-500/10 text-accent-amber border-amber-500/20',
  pending_academic: 'bg-amber-500/10 text-accent-amber border-amber-500/20',
  approved: 'bg-emerald-500/10 text-accent-emerald border-emerald-500/20',
  rejected_by_teacher: 'bg-rose-500/10 text-accent-rose border-rose-500/20',
  rejected_by_academic: 'bg-rose-500/10 text-accent-rose border-rose-500/20',
};
