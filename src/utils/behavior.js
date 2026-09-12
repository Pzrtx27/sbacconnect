/* ประกอบ "รายการที่จะบันทึก" ของฟอร์มตัด/เพิ่มคะแนนพฤติกรรม

   แยกออกมาจาก TeacherHome.jsx เพราะเป็นตรรกะล้วน ๆ ที่มีเคสมุมอยู่หลายอัน
   (preset ที่หายไป, การสลับฝั่งตัดคะแนน/ความดี, รายการที่พิมพ์เอง, คะแนนที่ปรับเอง)
   อยู่ในไฟล์เดียวกับ JSX แล้วทดสอบแยกไม่ได้เลย */

/** รวมรายการที่ครูเลือกไว้ให้เป็นชุดเดียวพร้อมบันทึก
 *
 *  @param {string[]} selectedIds        id ของ preset ตามลำดับที่กด (ลำดับนี้คือลำดับที่แสดงและที่บันทึก)
 *  @param {object[]} categories         หมวดหมู่ของฝั่งที่เลือกอยู่ (behavior_categories ที่ action_type ตรงกัน)
 *  @param {object}   pointsById         คะแนนที่ครูปรับเอง { [categoryId]: '3' } ไม่มีคีย์ = ใช้ default_points
 *  @param {string}   customReason       เหตุผลที่พิมพ์เอง (ว่าง = ไม่มีรายการนี้)
 *  @param {string}   customPoints       คะแนนของรายการที่พิมพ์เอง
 *  @returns {{key: string, categoryId: string|null, label: string, points: string}[]}
 *
 *  preset ที่หา id ไม่เจอจะถูกตัดทิ้งเงียบ ๆ — เกิดได้จริงเมื่อฝ่ายวิชาการปิดหมวดหมู่นั้น
 *  ระหว่างที่ครูเปิดฟอร์มค้างไว้ หรือมี id ของอีกฝั่งค้างอยู่ตอนสลับตัดคะแนน/ความดี
 *  ปล่อยผ่านไปจะกลายเป็นการยิง RPC ด้วย reason ว่าง ซึ่ง DB ตีกลับเป็น REASON_REQUIRED */
export function buildBehaviorEntries(selectedIds, categories, pointsById, customReason, customPoints) {
  const list = Array.isArray(categories) ? categories : [];

  const presetEntries = (Array.isArray(selectedIds) ? selectedIds : [])
    .map((id) => list.find((cat) => cat.id === id))
    .filter(Boolean)
    .map((cat) => ({
      key: cat.id,
      categoryId: cat.id,
      label: cat.label,
      points: pointsById?.[cat.id] ?? String(cat.default_points),
    }));

  const reason = String(customReason || '').trim();
  if (!reason) return presetEntries;

  return [...presetEntries, { key: 'custom', categoryId: null, label: reason, points: customPoints }];
}

/** รวมคะแนนของทุกรายการ — ค่าที่พิมพ์ไม่เป็นตัวเลขนับเป็น 0 ไม่ใช่ NaN
 *  ไม่งั้นช่องที่ครูลบเลขออกชั่วคราวจะทำให้ยอดรวมทั้งกล่องกลายเป็น NaN */
export function sumBehaviorPoints(entries) {
  return (entries || []).reduce((sum, entry) => sum + (Math.round(Number(entry.points)) || 0), 0);
}
