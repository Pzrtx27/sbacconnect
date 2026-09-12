import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabase';
import { useRealtimeTable } from './useRealtimeTable';

/* ค่าเทอม/ค่าธรรมเนียมของตัวเอง (43_student_fees.sql)

   ของเดิมโมดัล "รายการค้างชำระ" ในหน้านักเรียนเขียนตายตัวว่า 0 THB และ
   "ชำระแล้ว" ทั้งสามบรรทัด ไม่ว่าคนนั้นจะค้างจริงหรือไม่ — ค้างจริงก็ไม่มีใครรู้

   ระบบนี้ไม่ตัดเงินอัตโนมัติ: นักเรียนสแกน QR พร้อมเพย์โอนเอง แล้วกดแจ้งว่าโอนแล้ว
   ฝ่ายการเงินเช็คเงินเข้าบัญชีจริงก่อนกดยืนยัน สถานะจึงเดินเป็น
   unpaid -> pending -> paid และทุกขั้นมีแจ้งเตือนเด้งหาเจ้าตัว

   ฟังการเปลี่ยนแปลงแบบเรียลไทม์ด้วย เพราะตอนการเงินกดยืนยัน นักเรียนมักเปิดหน้านี้
   ค้างรออยู่ — ต้องเห็นเปลี่ยนเป็น "ชำระแล้ว" เองโดยไม่ต้องรีเฟรช */

export const FEE_STATUS_LABELS = {
  unpaid: 'ค้างชำระ',
  pending: 'รอการเงินตรวจสอบ',
  paid: 'ชำระแล้ว',
  waived: 'ยกเว้น',
};

export const feeErrorMessage = (code) =>
  ({
    SETUP: 'ยังไม่ได้ติดตั้งระบบค่าธรรมเนียมในฐานข้อมูล (รัน supabase/migrations/43_student_fees.sql)',
    NOT_FOUND: 'ไม่พบรายการนี้ กรุณาปิดแล้วเปิดใหม่อีกครั้ง',
    ALREADY_PENDING: 'รายการนี้แจ้งชำระไปแล้ว กำลังรอฝ่ายการเงินตรวจสอบ',
    ALREADY_PAID: 'รายการนี้ชำระเรียบร้อยแล้ว',
    ALREADY_WAIVED: 'รายการนี้ได้รับการยกเว้นแล้ว',
  })[code] || 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

export function useStudentFees(enabled = true) {
  const [fees, setFees] = useState([]);
  const [outstandingSatang, setOutstandingSatang] = useState(0);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [reportingId, setReportingId] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc('my_fees');

    if (rpcError) {
      // ยังไม่ได้รัน 43_student_fees.sql ก็จะมาตกที่นี่ — บอกให้ชัดว่าต้องทำอะไรต่อ
      console.error('[fees] โหลดรายการค้างชำระไม่สำเร็จ (รัน supabase/migrations/43_student_fees.sql แล้วหรือยัง):', rpcError);
      setError('SETUP');
      setLoading(false);
      return;
    }

    setError(null);
    setFees(data?.fees || []);
    setOutstandingSatang(data?.outstanding_satang || 0);
    setUnpaidCount(data?.unpaid_count || 0);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [enabled, load]);

  /* ฟังทั้งตารางไม่กรองรายคน — RLS (student_fees_read) ส่งมาให้เฉพาะแถวของตัวเอง
     อยู่แล้ว คนอื่นจะไม่ได้ payload ตั้งแต่ต้น (เหตุผลเดียวกับ useMyScoreSummary) */
  useRealtimeTable({ table: 'student_fees', onChange: load, enabled });

  /** นักเรียนกด "แจ้งชำระเงินแล้ว" หลังสแกน QR โอนเสร็จ — ไม่แตะยอดเงินใด ๆ */
  const reportTransfer = useCallback(
    async (feeId) => {
      setReportingId(feeId);
      const { data, error: rpcError } = await supabase.rpc('report_fee_transfer', { p_fee_id: feeId });
      setReportingId(null);

      if (rpcError) {
        console.error('[fees] แจ้งชำระเงินไม่สำเร็จ:', rpcError);
        return { ok: false, error: 'SETUP' };
      }
      if (!data?.ok) return { ok: false, error: data?.error || 'UNKNOWN' };

      await load();
      return data;
    },
    [load],
  );

  const summary = useMemo(
    () => ({
      outstandingSatang,
      unpaidCount,
      // รอการเงินตรวจอยู่กี่รายการ — ใช้บอกนักเรียนว่า "แจ้งไปแล้ว ไม่ต้องโอนซ้ำ"
      pendingCount: fees.filter((f) => f.status === 'pending').length,
      overdueCount: fees.filter((f) => f.is_overdue).length,
      hasOutstanding: outstandingSatang > 0,
    }),
    [fees, outstandingSatang, unpaidCount],
  );

  return { fees, loading, error, reportTransfer, reportingId, summary, reload: load };
}

export default useStudentFees;
