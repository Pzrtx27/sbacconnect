/* แปลงระหว่างรหัสนักเรียน/บุคลากรที่ใช้ล็อกอิน (school ID) กับ Firebase Auth uid จริง
   นักเรียน = user_{id}, บุคลากร (teacher/academic/barista) = {id} ตรงๆ
   ต้องใช้ค่าเดียวกันนี้ทั้งฝั่ง api/login.js (ตอน mint custom token), AuthContext.jsx,
   firestore.rules (request.auth.uid), และทุกที่ที่เขียน/เทียบ student_id ใน coffee_orders */

export function usersDocIdFor(role, schoolId) {
  return role === 'student' ? `user_${schoolId}` : schoolId;
}

export function schoolIdFromUid(uid) {
  return uid.startsWith('user_') ? uid.slice('user_'.length) : uid;
}
