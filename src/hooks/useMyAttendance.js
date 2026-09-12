import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useRealtimeTable } from './useRealtimeTable';
import { notEnabledMessage, logSetupHint, CONTACT } from '../utils/setupNotice';

/* ประวัติการเช็คชื่อเข้าแถวของนักเรียนเอง (50_my_attendance_history.sql)

   ครูบันทึกทุกวันและนักเรียนได้แจ้งเตือนรายวันอยู่แล้ว แต่ไม่เคยมีที่ไหน
   ให้เจ้าตัวดูย้อนหลังได้ว่าเทอมนี้ขาดไปกี่วัน ซึ่งเป็นตัวเลขที่มีผลกับการจบ

   อ่านผ่าน RPC ไม่ใช่ select ตารางตรง ๆ เพื่อให้การนับสรุปอยู่ฝั่ง DB ที่เดียว
   (policy เปิดให้อ่านของตัวเองได้อยู่แล้ว แต่ถ้านับฝั่งเว็บ ตัวเลขจะผูกกับ
   จำนวนแถวที่ดึงมา ไม่ใช่ทั้งหมดที่มีจริง) */

const EMPTY = { total: 0, present: 0, late: 0, absent: 0, leave: 0 };

export const ATTENDANCE_LABELS = {
  present: 'มา',
  late: 'สาย',
  absent: 'ขาด',
  leave: 'ลา',
};

export function useMyAttendance(enabled = true) {
  const [days, setDays] = useState([]);
  const [summary, setSummary] = useState(EMPTY);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;

    const { data, error: rpcError } = await supabase.rpc('my_attendance_history', { p_limit: 60 });

    if (rpcError) {
      logSetupHint('ประวัติการเช็คชื่อ', '50_my_attendance_history.sql');
      setError('SETUP');
      setDays([]);
      setSummary(EMPTY);
      setLoading(false);
      return;
    }

    if (!data?.ok) {
      setError(data?.error || 'UNKNOWN');
      setDays([]);
      setSummary(EMPTY);
      setLoading(false);
      return;
    }

    setError(null);
    setDays(data.days || []);
    setSummary({ ...EMPTY, ...(data.summary || {}) });
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  // ครูกดบันทึกตอนเช้า หน้านักเรียนที่เปิดค้างไว้ต้องขยับตาม
  useRealtimeTable({ table: 'attendance_homeroom', onChange: load, enabled });

  return { days, summary, loading, error, reload: load };
}

export const attendanceErrorText = (code) =>
  code === 'SETUP'
    ? notEnabledMessage('ประวัติการเช็คชื่อ', CONTACT.academic)
    : 'ยังดูประวัติการเช็คชื่อไม่ได้ในตอนนี้';
