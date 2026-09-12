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

  /* ต้องแยกเป็นสองชั้นจริง ๆ ไม่ใช่เลือกมาชั้นเดียวแล้วจบ
     ของเดิมเขียนว่า  const photo = src ? { src, alt } : menuPhoto(shape)
     ซึ่งแปลว่าถ้าสินค้ามี image_url อยู่ รูปประจำทรงจะไม่ถูกพิจารณาอีกเลย
     พอ image_url นั้นโหลดไม่ขึ้น (ลิงก์เสีย โดนลบ โดนบล็อก hotlink)
     ช่องนั้นกระโดดข้ามชั้นที่ 2 ไปที่ไอคอนเส้นทันที

     ขัดกับลำดับที่คอมเมนต์ข้างบนประกาศไว้เอง (image_url -> รูปประจำทรง -> ไอคอน)
     และเป็นทางเดียวที่โค้ดชุดนี้จะกลับไปหน้าตาแบบไอคอนเส้นทั้งหน้าได้
     ทั้งที่ไฟล์ใน public/menu/ ครบและเสิร์ฟได้ปกติ */
  const remote = src ? { src, alt } : null;
  const local = menuPhoto(shape);

  const [remoteBroken, setRemoteBroken] = useState(false);
  const [localBroken, setLocalBroken] = useState(false);

  const photo = (!remoteBroken && remote) || (!localBroken && local) || null;
  const usingRemote = photo === remote;

  /* รีเซ็ตเมื่อสลับไปสินค้าตัวอื่น ไม่งั้นช่องที่เคยโหลดรูปพังไว้
     จะติดสถานะพังต่อไปแม้ React เอา DOM ช่องเดิมไปใช้กับสินค้าใหม่ */
  useEffect(() => {
    setRemoteBroken(false);
    setLocalBroken(false);
  }, [remote?.src, local?.src]);

  if (!photo) {
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
        /* key บังคับให้ React สร้าง <img> ใหม่เมื่อสลับจากรูปของร้านไปรูปประจำทรง
           ถ้าใช้ element เดิม เบราว์เซอร์บางตัวไม่ยิง onload/onError รอบใหม่ให้ */
        key={photo.src}
        src={photo.src}
        alt={alt || photo.alt || ''}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        draggable="false"
        onError={() => (usingRemote ? setRemoteBroken(true) : setLocalBroken(true))}
      />
    </div>
  );
}
