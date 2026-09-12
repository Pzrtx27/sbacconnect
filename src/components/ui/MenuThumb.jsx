import { useEffect, useState } from 'react';
import { drinkShapeFor, drinkTone } from '../../utils/orders';
import { menuPhoto } from '../../utils/menuPhotos';
import DrinkIcon from './DrinkIcon';

/* รูปเมนูหนึ่งช่อง — ใช้ทุกที่ที่ต้องโชว์ว่า "รายการนี้คือของอะไร"
   (การ์ดเมนู, รายการในออเดอร์, ประวัติการสั่ง, คิวของบาริสต้า)

   ลำดับการเลือกภาพ:
     1. image_url ของสินค้าใน DB  — ร้านอัปรูปของตัวเองทับได้เสมอ อันนี้ชนะทุกอย่าง
     2. รูปถ่ายประจำทรงภาชนะ       — public/menu/ ดู utils/menuPhotos.js
     3. ไอคอนเส้น DrinkIcon        — ทรงที่ยังไม่มีรูป หรือรูปโหลดไม่ขึ้น

   ข้อ 3 ไม่ใช่ของตกค้าง แต่เป็นตาข่ายรับ: ถ้าเน็ตตึงหรือใครลบไฟล์ในโฟลเดอร์ทิ้ง
   ช่องนี้ต้องยังบอกได้ว่าเป็นเครื่องดื่มหรือของว่าง ไม่ใช่กลายเป็นสี่เหลี่ยมเปล่า

   ขนาดไม่ได้ fix ไว้ในนี้ ส่งมาทาง className (w-16 h-16 rounded-2xl ฯลฯ)
   เพราะแต่ละหน้าใช้คนละขนาดกันอยู่แล้ว และอยากให้เห็นขนาดจริงตรงที่เรียกใช้ */
export default function MenuThumb({
  name = '',
  category = '',
  shape: shapeProp,
  src = null,
  className = 'w-16 h-16 rounded-2xl',
  iconSize = 32,
  alt = '',
}) {
  const shape = shapeProp || drinkShapeFor(name, category);
  const photo = src ? { src, alt } : menuPhoto(shape);
  const [broken, setBroken] = useState(false);

  /* รีเซ็ตเมื่อสลับไปสินค้าตัวอื่น ไม่งั้นช่องที่เคยโหลดรูปพังไว้
     จะติดสถานะพังต่อไปแม้ React เอา DOM ช่องเดิมไปใช้กับสินค้าใหม่ */
  useEffect(() => setBroken(false), [photo?.src]);

  if (!photo || broken) {
    const tone = drinkTone(shape);
    return (
      <div className={`${className} shrink-0 flex items-center justify-center ${tone.tile} ${tone.icon}`}>
        <DrinkIcon shape={shape} size={iconSize} />
      </div>
    );
  }

  return (
    <div className={`${className} shrink-0 overflow-hidden bg-slate-200 dark:bg-white/10`}>
      <img
        src={photo.src}
        alt={alt || photo.alt || ''}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        draggable="false"
        onError={() => setBroken(true)}
      />
    </div>
  );
}
