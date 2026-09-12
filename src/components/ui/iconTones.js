/* สีกรอบไอคอน — แหล่งเดียวของทั้งแอป
 *
 * PageHeader ตั้งชุดนี้ขึ้นมาก่อน พร้อมคอมเมนต์เตือนไว้เองว่า
 * "ห้ามใส่คลาสสีดิบ ๆ เข้ามาเอง ไม่งั้นจะกลับไปเพี้ยนกันอีก"
 * พอ Modal ต้องใช้ชุดเดียวกัน การก๊อปตารางไปไว้อีกไฟล์ก็คือการเริ่มเพี้ยนรอบใหม่
 * จึงย้ายออกมาไว้ตรงกลาง แล้วให้ทั้งสองที่ import จากที่นี่
 *
 * ทุกค่าผูกกับ semantic token ที่ผ่าน contrast มาแล้ว
 */
export const ICON_TONES = {
  brand: 'bg-sbac-blue/10 text-brand',
  amber: 'bg-amber-500/10 text-accent-amber',
  emerald: 'bg-emerald-500/10 text-accent-emerald',
  rose: 'bg-rose-500/10 text-accent-rose',
  violet: 'bg-violet-500/10 text-accent-violet',
  cyan: 'bg-cyan-500/10 text-accent-cyan',
};

export const toneClass = (tone) => ICON_TONES[tone] || ICON_TONES.brand;
