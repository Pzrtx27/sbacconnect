import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

/* หมวดหมู่ความผิด/ความดีสำเร็จรูป (ตาราง behavior_categories, 20_behavior_and_notifications.sql)
   ใช้ร่วมกัน 3 จุด: ฟอร์มตัดคะแนนของครู, wizard ของฝ่ายวิชาการ, และโมดัลแก้ไขรายการ
   แทบไม่เปลี่ยนเลยระหว่างวัน โหลดครั้งเดียวพอ (แนวเดียวกับ useClassRooms ใน useEvents.js) */
let categoriesPromise = null;

export function useBehaviorCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    categoriesPromise ||= supabase
      .from('behavior_categories')
      .select('id, code, action_type, label, default_points, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('[behavior] โหลดหมวดหมู่ไม่สำเร็จ:', error);
          categoriesPromise = null;
          return [];
        }
        return data || [];
      });

    categoriesPromise.then((list) => {
      if (!alive) return;
      setCategories(list);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  const byActionType = (actionType) => categories.filter((c) => c.action_type === actionType);

  return { categories, byActionType, loading };
}

export default useBehaviorCategories;
