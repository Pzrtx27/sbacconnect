import { Home, Calendar, ShoppingCart, HeartHandshake, Receipt } from 'lucide-react';
import CoffeeCup from '../ui/icons/CoffeeCup';
import { timetableTitle } from '../../utils/timetable';

/* เมนูนำทาง แยกออกมาจาก BottomNav เพราะตอนนี้มีสองที่ที่ต้องใช้ชุดเดียวกัน:
     มือถือ  -> BottomNav (แถบล่าง)
     คอม     -> SideNav (แถบซ้าย)
   ถ้าปล่อยให้ต่างคนต่างถือลิสต์ วันหนึ่งเพิ่มเมนูที่เดียวลืมอีกที่แน่นอน */

const navConfigs = {
  student: [
    { id: 'home', path: '/home', icon: Home, label: 'หน้าหลัก' },
    /* คำในเมนูต่างกันตามบทบาท: นักเรียนเห็น "ตารางเรียน" ครู/วิชาการเห็น "ตารางสอน"
       หน้าปลายทางเป็นหน้าเดียวกัน ต่างแค่คำเรียกของคนที่เปิดดู (ดู timetableTitle) */
    { id: 'timetable', path: '/timetable', icon: Calendar, label: timetableTitle('student') },
    { id: 'coffee', path: '/coffee', icon: CoffeeCup, label: 'กาแฟ' },
    { id: 'orders', path: '/orders', icon: ShoppingCart, label: 'คำสั่งซื้อ' },
  ],
  teacher: [
    { id: 'home', path: '/teacher', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: timetableTitle('teacher') },
    { id: 'coffee', path: '/coffee', icon: CoffeeCup, label: 'กาแฟ' },
    { id: 'orders', path: '/orders', icon: ShoppingCart, label: 'คำสั่งซื้อ' },
  ],
  /* เดิมมี 'จัดการ' ที่ path '/academic' ซ้ำกับ 'หน้าหลัก' เป๊ะ ๆ
     เมนูสองอันไปหน้าเดียวกัน isNavItemActive จึงตอบว่า active ทั้งคู่
     ผลคือกดอันเดียวแต่สว่างสองอัน

     เอา 'จัดการ' ออกเพราะเป็นทางเข้าซ้ำ ไม่ได้พาไปไหนใหม่
     งานจัดการทั้งหมดอยู่ในแท็บของหน้า /academic อยู่แล้ว */
  academic: [
    { id: 'home', path: '/academic', icon: Home, label: 'หน้าหลัก' },
    { id: 'development', path: '/development', icon: HeartHandshake, label: 'ฝ่ายพัฒนา' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: timetableTitle('academic') },
  ],
  barista: [
    { id: 'barista', path: '/barista', icon: CoffeeCup, label: 'ร้านกาแฟ' },
  ],
  /* sysadmin ต้องมีเมนูของตัวเอง ไม่งั้น navItemsFor ตกไปที่เมนูนักเรียน
     แล้วแอดมินจะเห็น หน้าหลัก/ตารางเรียน/กาแฟ/คำสั่งซื้อ ซึ่งสามในสี่อัน
     กดแล้วโดน ProtectedRoute เด้งกลับ /academic ทันที */
  sysadmin: [
    { id: 'home', path: '/academic', icon: Home, label: 'หน้าหลัก' },
    { id: 'development', path: '/development', icon: HeartHandshake, label: 'ฝ่ายพัฒนา' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: timetableTitle('academic') },
  ],
};

/* เมนูฝ่ายการเงิน — ต่อท้ายให้คนที่ถือ role cashier เท่านั้น
   ไม่ได้อยู่ใน navConfigs เพราะสิทธิ์นี้ไม่ได้ผูกกับ "บทบาทหลัก" ที่ AuthContext
   เลือกมาอันเดียว แต่ผูกกับ roles ทั้งอาร์เรย์ (กติกาเดียวกับ FinanceRoute)
   คนที่เป็นทั้งฝ่ายวิชาการและเจ้าหน้าที่การเงินจึงได้เมนูนี้เพิ่มจากของเดิม */
const FINANCE_ITEM = { id: 'finance', path: '/finance', icon: Receipt, label: 'การเงิน' };

/* เตือนตอนพัฒนาถ้ามีเมนูสอง path ซ้ำกันอีก
   บั๊ก "กดอันเดียวสว่างสองอัน" มองข้ามง่ายมากเพราะหน้าที่เปิดถูกต้อง แค่ไฟติดเกิน
   ให้มันดังตั้งแต่ตอนเขียน ดีกว่ารอให้คนใช้มาบอก */
if (import.meta.env?.DEV) {
  for (const [role, items] of Object.entries(navConfigs)) {
    const paths = items.map((i) => i.path);
    const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
    if (dupes.length > 0) {
      console.warn(`[navConfig] role "${role}" มีเมนู path ซ้ำ: ${[...new Set(dupes)].join(', ')} — เมนูจะ active พร้อมกันหลายอัน`);
    }
  }
}

/** เมนูของผู้ใช้คนนี้
 *
 *  รับ user ทั้งก้อน ไม่ใช่ role เดียว เพราะบางเมนู (การเงิน) ต้องดู roles ทั้งอาร์เรย์
 *  ยังรับสตริงได้อยู่เพื่อไม่ให้ที่เรียกแบบเดิมพัง */
export function navItemsFor(userOrRole) {
  const user = typeof userOrRole === 'string' ? { role: userOrRole } : (userOrRole || {});
  const key = String(user.role || 'student').toLowerCase().trim();
  const items = navConfigs[key] || navConfigs.student;

  const roles = Array.isArray(user.roles) ? user.roles : [];
  const canManageFees = roles.some((r) => r === 'cashier' || r === 'sysadmin');

  // เปลือกเต็มจอของ barista ไม่ได้ใช้เมนูชุดนี้ (มีปุ่มของตัวเองใน BaristaDashboard)
  if (!canManageFees || key === 'barista') return items;
  if (items.some((i) => i.path === FINANCE_ITEM.path)) return items;
  return [...items, FINANCE_ITEM];
}

/** เมนูนี้คือหน้าที่กำลังเปิดอยู่ไหม
 *  หน้าแรกของแต่ละ role ต้องเทียบแบบตรงตัวเท่านั้น ไม่งั้น /home จะ active ค้าง
 *  ตอนอยู่หน้าอื่น เพราะทุก path ขึ้นต้นด้วย '/' */
export function isNavItemActive(item, pathname) {
  const exactOnly = ['/', '/home', '/teacher', '/academic'];
  if (exactOnly.includes(item.path)) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(item.path);
}

export default navConfigs;
