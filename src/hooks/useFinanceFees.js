import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import { useRealtimeTable } from './useRealtimeTable';
import { notEnabledMessage, CONTACT } from '../utils/setupNotice';

/* ฝั่งฝ่ายการเงินของระบบค่าธรรมเนียม (43_student_fees.sql + 44_finance_console.sql)

   ก่อนหน้านี้งานการเงินทั้งหมดทำผ่าน SQL Editor: ออกบิลก็ select create_class_fees(...)
   ยืนยันการจ่ายก็ select set_fee_status(id, 'paid') ซึ่งแปลว่าคนที่ทำงานนี้จริง
   ต้องเปิด Supabase เป็นและพิมพ์ id บิลเองไม่ให้ผิด — ใช้จริงไม่ได้

   ทุกอย่างยังผ่าน RPC เหมือนเดิม ไม่มีตัวไหน select ตาราง student_fees ตรง ๆ
   เพราะชื่อนักเรียนอยู่ในตาราง users ที่ RLS กันไว้ (บทเรียนเดิมจาก 38_my_class_info) */

const EMPTY_SUMMARY = {
  pending_count: 0,
  pending_satang: 0,
  unpaid_count: 0,
  unpaid_satang: 0,
  overdue_count: 0,
  paid_satang: 0,
};

export const financeErrorMessage = (code) =>
  ({
    SETUP: notEnabledMessage('ค่าเทอมและค่าธรรมเนียม', CONTACT.admin),
    FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์จัดการค่าธรรมเนียม — ต้องเป็นฝ่ายการเงิน (cashier) หรือแอดมิน',
    NOT_FOUND: 'ไม่พบรายการนี้ — อาจถูกแก้ไปแล้วจากอีกเครื่อง ลองโหลดใหม่',
    BAD_STATUS: 'สถานะไม่ถูกต้อง',
    BAD_AMOUNT: 'กรอกจำนวนเงินมากกว่า 0',
    BAD_TITLE: 'กรุณาระบุชื่อรายการ',
    NO_STUDENTS: 'ยังไม่ได้เลือกนักเรียนสักคน',
    NOT_A_STUDENT: 'บัญชีนี้ไม่ใช่นักเรียน',
  })[code] || 'ทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

/** คิวงาน: รายการค่าธรรมเนียมตามสถานะ + ยอดรวมทั้งระบบ */
export function useFinanceFees(status = null, classRoomId = null) {
  const [fees, setFees] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('list_student_fees', {
      p_status: status,
      p_class_room_id: classRoomId,
    });

    if (rpcError) {
      console.error('[finance] โหลดรายการค่าธรรมเนียมไม่สำเร็จ (รัน supabase/migrations/44_finance_console.sql แล้วหรือยัง):', rpcError);
      setError('SETUP');
      setLoading(false);
      return;
    }

    if (!data?.ok) {
      setError(data?.error || 'UNKNOWN');
      setFees([]);
      setLoading(false);
      return;
    }

    setError(null);
    setFees(data.fees || []);
    setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
    setLoading(false);
  }, [status, classRoomId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // นักเรียนกดแจ้งโอนตอนไหนก็ได้ คิวต้องขึ้นเองโดยการเงินไม่ต้องกดรีเฟรช
  useRealtimeTable({ table: 'student_fees', onChange: load });

  /** ยืนยัน/ตีกลับ/ยกเว้น — นักเรียนได้แจ้งเตือนทันทีจากฝั่ง DB */
  const setFeeStatus = useCallback(
    async (feeId, nextStatus, note = null) => {
      setSavingId(feeId);
      const { data, error: rpcError } = await supabase.rpc('set_fee_status', {
        p_fee_id: feeId,
        p_status: nextStatus,
        p_note: note,
      });
      setSavingId(null);

      if (rpcError) {
        console.error('[finance] ปรับสถานะไม่สำเร็จ:', rpcError);
        return { ok: false, error: 'SETUP' };
      }
      if (!data?.ok) return { ok: false, error: data?.error || 'UNKNOWN' };

      await load();
      return data;
    },
    [load],
  );

  return { fees, summary, loading, error, setFeeStatus, savingId, reload: load };
}

/** หน้าออกบิล: รายชื่อห้อง -> รายชื่อนักเรียนในห้อง -> ออกบิลให้คนที่เลือก */
export function useFeeIssuing() {
  const [classRooms, setClassRooms] = useState([]);
  const [classRoomId, setClassRoomId] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState(null);

  /* ชื่อรายการ + เทอมที่กำลังจะออกบิล ใช้ถาม DB ว่าใครมีบิลใบนี้อยู่แล้ว
     เก็บเป็น state แยกเพราะหน้าจอเป็นคนถือช่องกรอก ไม่ใช่ hook */
  const [feeKey, setFeeKey] = useState({ term: null, title: null });

  useEffect(() => {
    let alive = true;

    supabase.rpc('list_class_rooms').then(({ data, error: rpcError }) => {
      if (!alive) return;

      if (rpcError) {
        console.error('[finance] โหลดรายชื่อห้องไม่สำเร็จ:', rpcError);
        setError('SETUP');
        setLoadingRooms(false);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      setClassRooms(rows);
      setClassRoomId((prev) => prev ?? rows[0]?.id ?? null);
      setLoadingRooms(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  const loadStudents = useCallback(async () => {
    if (!classRoomId) return;

    setLoadingStudents(true);
    const { data, error: rpcError } = await supabase.rpc('list_fee_class_students', {
      p_class_room_id: classRoomId,
      /* ส่งชื่อรายการกับเทอมไปด้วย เพื่อให้ DB บอกกลับมาได้ว่าใครมีบิลใบนี้อยู่แล้ว
         และอยู่ในสถานะไหน (existing_status) — หน้าจอจะได้ไม่ติ๊กคนที่จ่ายไปแล้ว
         ของเดิมส่งแต่รหัสห้อง หน้าจอจึงไม่มีทางรู้ แล้วติ๊กมาให้ทุกคน */
      p_term: feeKey.term || null,
      p_title: feeKey.title || null,
    });

    if (rpcError) {
      console.error('[finance] โหลดรายชื่อนักเรียนไม่สำเร็จ:', rpcError);
      setError('SETUP');
      setStudents([]);
      setLoadingStudents(false);
      return;
    }

    if (!data?.ok) {
      setError(data?.error || 'UNKNOWN');
      setStudents([]);
      setLoadingStudents(false);
      return;
    }

    setError(null);
    setStudents(data.students || []);
    setLoadingStudents(false);
  }, [classRoomId, feeKey.term, feeKey.title]);

  /* หน่วงก่อนยิง เพราะ title ผูกกับช่องที่ผู้ใช้พิมพ์ทีละตัวอักษร
     และคืน cleanup ทุกครั้ง — สลับห้องเร็ว ๆ สองครั้ง คำตอบของห้องแรกที่มาช้ากว่า
     จะได้ไม่เขียนทับรายชื่อของห้องที่สอง ซึ่งสังเกตไม่ได้เลยเพราะหัวห้องเปลี่ยนไปแล้ว */
  useEffect(() => {
    const handle = setTimeout(loadStudents, 300);
    return () => clearTimeout(handle);
  }, [loadStudents]);

  const issue = useCallback(
    async ({ studentIds, title, amountSatang, term, dueDate }) => {
      setIssuing(true);
      const { data, error: rpcError } = await supabase.rpc('create_fees_for_students', {
        p_student_ids: studentIds,
        p_title: title,
        p_amount_satang: amountSatang,
        p_term: term,
        p_due_date: dueDate || null,
      });
      setIssuing(false);

      if (rpcError) {
        console.error('[finance] ออกบิลไม่สำเร็จ:', rpcError);
        return { ok: false, error: 'SETUP' };
      }
      if (!data?.ok) return { ok: false, error: data?.error || 'UNKNOWN' };

      await loadStudents();
      return data;
    },
    [loadStudents],
  );

  return {
    classRooms,
    classRoomId,
    setClassRoomId,
    students,
    loading: loadingRooms || loadingStudents,
    issuing,
    error,
    issue,
    setFeeKey,
    reloadStudents: loadStudents,
  };
}
