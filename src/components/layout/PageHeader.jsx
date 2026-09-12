import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { toneClass } from '../ui/iconTones';

/* หัวข้อหน้า — ใช้ให้เหมือนกันทุกหน้าในเปลือกแอป

   ก่อนหน้านี้แต่ละหน้าเขียนหัวข้อของตัวเอง แล้วค่อย ๆ เพี้ยนกันไปคนละทาง:
     ตารางสอน / Academic Panel   ไอคอนเปล่า 24px สีน้ำเงิน
     สถานะการสั่งซื้อ / ประวัติ    ไอคอน 18px ในกรอบสี่เหลี่ยมมนพื้นส้มจาง
     SBAC Coffee                 แบบเดียวกับข้างบน แต่ยัดอยู่ในกล่องมีเส้นขอบอีกชั้น
   ทั้งสามแบบอยู่ตำแหน่งเดียวกันของหน้า ทำหน้าที่เดียวกัน แต่ดูเป็นคนละแอป

   เลือกแบบ "ไอคอนในกรอบมน" เป็นมาตรฐาน เพราะกรอบสีทำให้แต่ละหน้าจำได้จากสี
   โดยที่โครงและระยะยังเท่ากันหมด

   tone = สีของกรอบไอคอน ผูกกับ semantic token ที่ผ่าน contrast มาแล้ว
   ห้ามใส่คลาสสีดิบ ๆ เข้ามาเอง ไม่งั้นจะกลับไปเพี้ยนกันอีก */

export default function PageHeader({
  icon: Icon,
  title,
  tone = 'brand',
  backTo,
  backLabel,
  children,
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      {backTo && (
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${
            isDark ? 'text-content-secondary hover:text-white' : 'text-ink-muted hover:text-sbac-navy'
          }`}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {backLabel || 'ย้อนกลับ'}
        </button>
      )}

      <div className="flex justify-between items-center gap-3">
        <h2
          className={`text-xl font-extrabold flex items-center gap-2 min-w-0 transition-colors duration-300 ${
            isDark ? 'text-white' : 'text-sbac-navy'
          }`}
        >
          {Icon && (
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClass(tone)}`}
            >
              <Icon size={18} aria-hidden="true" />
            </span>
          )}
          <span className="truncate">{title}</span>
        </h2>

        {/* ช่องขวา — ป้ายสถานะ ปุ่มลัด หรือยอดเงิน แล้วแต่หน้า */}
        {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
      </div>
    </div>
  );
}
