/* หน้าเริ่มต้นของแต่ละบทบาท — แหล่งความจริงเดียวของทั้งแอป
 *
 * ทำไมต้องแยกไฟล์: เดิมแผนที่นี้ถูกก๊อปไว้สองที่ (App.jsx กับ LoginPage.jsx)
 * โดยที่ LoginPage เขียนคอมเมนต์กำกับไว้เองว่า "ต้องตรงกับ HOME_BY_ROLE ใน App.jsx"
 * แล้วมันก็ไม่ตรง — สำเนาใน LoginPage ขาด sysadmin และขาดกติกาเจ้าหน้าที่การเงิน
 *
 * ผลจริงที่เกิดจากความไม่ตรงนั้น: บัญชีที่มีแค่ role cashier ล็อกอินเสร็จ
 * LoginPage ส่งไป /barista (เพราะ AuthContext ยุบ cashier เป็นชื่อ 'barista')
 * แล้วเจอจอ "บัญชีนี้ไม่มีสิทธิ์ดูคิวหน้าร้าน" โดยไม่มีเมนูอะไรให้กดต่อเลย
 * ส่วน homeFor() ใน App.jsx ที่จัดการเคสนี้ถูกอยู่แล้ว ช่วยได้เฉพาะตอนเข้า '/'
 * หรือ path ที่ไม่รู้จัก — แต่ /barista เป็น route ที่มีจริง จึงไม่เข้าเงื่อนไขนั้น
 *
 * ห้ามก๊อปแผนที่นี้ไปไว้ที่อื่นอีก ให้ import จากไฟล์นี้เท่านั้น
 */

/** sysadmin ต้องมีในนี้ด้วย: AuthContext เลือก role นี้เป็นอันดับแรกถ้ามี
 *  ถ้าไม่ระบุไว้ จะตกไปที่ '/home' ซึ่ง ProtectedRoute อนุญาตแค่ student
 *  แล้วเด้งกลับมา homeFor() = '/home' อีก กลายเป็นวนไม่จบ */
export const HOME_BY_ROLE = {
  student: '/home',
  teacher: '/teacher',
  academic: '/academic',
  barista: '/barista',
  sysadmin: '/academic',
};

export const normalizeRole = (user) => (user?.role || 'student').toLowerCase().trim();

/* บทบาทที่ "มีบ้านของตัวเองอยู่แล้ว" — ถ้าถือ role พวกนี้อยู่ ไม่ต้องลากไปหน้าการเงิน
   แม้จะมี cashier ติดมาด้วย เพราะงานหลักที่เปิดแอปมาทำคืองานของบทบาทนั้น */
const ROLES_WITH_OWN_HOME = ['pos', 'sysadmin', 'teacher', 'academic'];

/** หน้าแรกหลังล็อกอิน
 *
 *  เคสพิเศษ: บัญชีที่มี role 'cashier' และไม่มีบทบาทอื่นที่มีบ้านของตัวเอง
 *  คือเจ้าหน้าที่การเงินล้วน ไม่ใช่คนชงกาแฟ ต้องลงที่ /finance
 *
 *  AuthContext ยุบทั้ง cashier และ pos เป็น role เดียวชื่อ 'barista' (ดู loadProfile)
 *  ซึ่งตอนนั้นถูกแล้วเพราะยังไม่มีหน้าการเงินให้ไป — พอมี /finance แล้ว
 *  การส่งเจ้าหน้าที่การเงินไปลงคิวร้านกาแฟทุกครั้งที่ล็อกอินกลายเป็นเรื่องแปลก
 *
 *  ของเดิมกันแค่ pos กับ sysadmin ไม่ได้กัน teacher/academic
 *  แต่ AuthContext เลือก dbRole ตามลำดับ sysadmin > academic > teacher > pos > cashier
 *  ครูที่ช่วยงานการเงินด้วย (roles = ['teacher','cashier']) จึงได้ role = 'teacher'
 *  แล้วโดน homeFor ลากไป /finance ทุกครั้งที่ล็อกอิน ทั้งที่บ้านจริงคือ /teacher
 *  คนกลุ่มนี้มีอยู่จริง — FinanceRoute กับ DevelopmentDashboard เขียนถึงไว้เอง
 */
export const homeFor = (user) => {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('cashier') && !roles.some((r) => ROLES_WITH_OWN_HOME.includes(r))) {
    return '/finance';
  }
  return HOME_BY_ROLE[normalizeRole(user)] || '/home';
};
