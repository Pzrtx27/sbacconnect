import { Home, Calendar, Coffee, ShoppingCart, Settings } from 'lucide-react';

/* เมนูนำทาง แยกออกมาจาก BottomNav เพราะตอนนี้มีสองที่ที่ต้องใช้ชุดเดียวกัน:
     มือถือ  -> BottomNav (แถบล่าง)
     คอม     -> SideNav (แถบซ้าย)
   ถ้าปล่อยให้ต่างคนต่างถือลิสต์ วันหนึ่งเพิ่มเมนูที่เดียวลืมอีกที่แน่นอน */

const navConfigs = {
  student: [
    { id: 'home', path: '/home', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
    { id: 'coffee', path: '/coffee', icon: Coffee, label: 'กาแฟ' },
    { id: 'orders', path: '/orders', icon: ShoppingCart, label: 'คำสั่งซื้อ' },
  ],
  teacher: [
    { id: 'home', path: '/teacher', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
    { id: 'coffee', path: '/coffee', icon: Coffee, label: 'กาแฟ' },
    { id: 'orders', path: '/orders', icon: ShoppingCart, label: 'คำสั่งซื้อ' },
  ],
  academic: [
    { id: 'home', path: '/academic', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
    { id: 'manage', path: '/academic', icon: Settings, label: 'จัดการ' },
  ],
  barista: [
    { id: 'barista', path: '/barista', icon: Coffee, label: 'ร้านกาแฟ' },
  ],
};

export function navItemsFor(role) {
  const key = String(role || 'student').toLowerCase().trim();
  return navConfigs[key] || navConfigs.student;
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
