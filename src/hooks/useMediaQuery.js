import { useEffect, useState } from 'react';

/* เช็ค breakpoint จากฝั่ง JS

   ปกติงาน responsive ทำด้วยคลาส Tailwind (xl:...) ได้หมด ไม่ต้องพึ่ง JS
   แต่บางอย่างไม่ใช่ CSS เช่นทิศทางของแอนิเมชัน:
   บนมือถือโมดัลควรเลื่อนขึ้นจากขอบล่าง บนคอมควรค่อย ๆ ขยายจากกลางจอ
   ซึ่งเป็นค่าที่ต้องส่งให้ framer-motion เป็น prop ไม่ใช่คลาส */

export function useMediaQuery(query) {
  // อ่านค่าจริงตั้งแต่ render แรก ไม่งั้นจะกระพริบหนึ่งเฟรมตอนโหลด
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);

    setMatches(mql.matches); // เผื่อขนาดเปลี่ยนไปแล้วระหว่าง render แรกกับตอนนี้
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** ตรงกับ breakpoint xl ของ Tailwind ซึ่งเป็นจุดที่แอปสลับเป็น layout เดสก์ท็อป */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 1280px)');
}

export default useMediaQuery;
