import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { LEAVE_ATTACHMENT_AFTER_DAYS } from '../utils/leavePolicy';

/* เงื่อนไขของระบบที่ผู้ดูแลตั้งไว้ (ตาราง school_settings ใน 53_admin_console.sql)
 *
 * ทุกคนที่ล็อกอินอ่านได้ เพราะฟอร์มใบลาของนักเรียนต้องรู้ว่ากติกากี่วัน
 * ไม่มีอะไรเป็นความลับ มีแต่กติกาที่ประกาศให้ทุกคนรู้อยู่แล้ว
 *
 * ถ้าอ่านไม่ได้ (ยังไม่ได้รัน migration หรือเน็ตหลุด) จะคืนค่าสำรองจาก leavePolicy.js
 * แทนการทำให้ฟอร์มใบลาใช้ไม่ได้ทั้งใบ — กติกาที่ผิดไปหนึ่งวันยังดีกว่าลาไม่ได้เลย
 * และ ready บอกว่าค่าที่ถืออยู่มาจากฐานข้อมูลจริงหรือเป็นค่าสำรอง
 */
export function useSchoolSettings() {
  const [settings, setSettings] = useState({
    schoolName: '',
    attachmentAfterDays: LEAVE_ATTACHMENT_AFTER_DAYS,
    countWeekends: true,
    ready: false,
  });

  useEffect(() => {
    let alive = true;

    supabase
      .from('school_settings')
      .select('school_name, leave_attachment_after_days, leave_count_weekends')
      .eq('id', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) {
          console.warn('[settings] อ่านเงื่อนไขระบบไม่ได้ ใช้ค่าสำรองแทน:', error?.message || 'ไม่มีข้อมูล');
          return;
        }
        setSettings({
          schoolName: data.school_name || '',
          attachmentAfterDays: Number(data.leave_attachment_after_days),
          countWeekends: data.leave_count_weekends !== false,
          ready: true,
        });
      });

    return () => { alive = false; };
  }, []);

  return settings;
}

export default useSchoolSettings;
