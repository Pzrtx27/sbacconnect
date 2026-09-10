import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';

/* ข้อมูลห้องเรียนของตัวเอง — ระดับชั้น ห้อง และชื่อครูที่ปรึกษา
   (RPC my_class_info() ใน 38_my_class_info.sql)

   ทำไมต้องเป็น RPC ไม่ใช่ select ธรรมดา:
     ชื่อครูอยู่ในตาราง users ซึ่ง policy users_self_select ให้อ่านได้เฉพาะแถวของตัวเอง
     นักเรียน join ไปหาชื่อครูตรง ๆ จะได้ null เสมอ ไม่ใช่เพราะไม่มีข้อมูล แต่เพราะ RLS กัน

   ทำไมไม่ไปรวมไว้ใน loadProfile() ของ AuthContext:
     migration ในโปรเจกต์นี้ถูกรันด้วยมือใน Supabase SQL Editor
     ถ้า RPC ตัวนี้ยังไม่ถูกรัน แล้วเราไปวางไว้ในเส้นทางล็อกอิน คนทั้งวิทยาลัยจะล็อกอินไม่ได้
     แยกออกมาเป็น hook ของหน้าแรก แย่ที่สุดคือแถบ "ครูที่ปรึกษา" ไม่ขึ้น ส่วนที่เหลือใช้ได้ปกติ */
export function useMyClassInfo(enabled = true) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_class_info');
    if (error) {
      // ยังไม่ได้รัน 38_my_class_info.sql ก็จะมาตกที่นี่ — บอกให้ชัดว่าต้องทำอะไรต่อ
      console.error('[class-info] อ่านข้อมูลห้องเรียนไม่สำเร็จ (รัน supabase/migrations/38_my_class_info.sql แล้วหรือยัง):', error);
      return null;
    }
    return data?.ok ? data : null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setInfo(null);
      setLoading(false);
      return undefined;
    }

    let alive = true;
    setLoading(true);
    load().then((data) => {
      if (!alive) return;
      setInfo(data);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [enabled, load]);

  return { info, loading };
}

export default useMyClassInfo;
