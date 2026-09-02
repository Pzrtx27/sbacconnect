import { Home, Calendar, Coffee, ShoppingCart } from 'lucide-react';

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
  /* เดิมมี 'จัดการ' ที่ path '/academic' ซ้ำกับ 'หน้าหลัก' เป๊ะ ๆ
     เมนูสองอันไปหน้าเดียวกัน isNavItemActive จึงตอบว่า active ทั้งคู่
     ผลคือกดอันเดียวแต่สว่างสองอัน

     เอา 'จัดการ' ออกเพราะเป็นทางเข้าซ้ำ ไม่ได้พาไปไหนใหม่
     งานจัดการทั้งหมดอยู่ในแท็บของหน้า /academic อยู่แล้ว */
  academic: [
    { id: 'home', path: '/academic', icon: Home, label: 'หน้าหลัก' },
    { id: 'timetable', path: '/timetable', icon: Calendar, label: 'ตารางสอน' },
  ],
  barista: [
    { id: 'barista', path: '/barista', icon: Coffee, label: 'ร้านกาแฟ' },
  ],
};

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
