import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { showToast } from '../components/ui/Toast';

/* ใบลา — RPC list_leave_requests กรองสิทธิ์ให้อัตโนมัติฝั่ง DB แล้ว (22_leave_requests.sql):
   นักเรียนเห็นของตัวเอง, ครูประจำชั้นเห็นของนักเรียนในห้องตน, ฝ่ายวิชาการ/แอดมินเห็นทั้งหมด
   statusFilter: null = ทั้งหมดที่เห็นสิทธิ์, หรือระบุ 'pending_teacher' / 'pending_academic' ฯลฯ */
let channelSeq = 0;

export function useLeaveRequests(statusFilter = null) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_leave_requests', {
      p_status_filter: statusFilter,
      p_limit: 100,
    });

    if (error) {
      console.error('[leave] โหลดใบลาไม่สำเร็จ:', error);
      setLoading(false);
      return;
    }
    setRequests(data?.ok ? data.requests || [] : []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    load();

    channelSeq += 1;
    const channel = supabase
      .channel(`leave-requests-watch-${channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const submit = useCallback(
    async ({ leaveType, startDate, endDate, reason }) => {
      const { data, error } = await supabase.rpc('submit_leave_request', {
        p_leave_type: leaveType,
        p_start_date: startDate,
        p_end_date: endDate || null,
        p_reason: reason,
      });

      if (error || !data?.ok) {
        const messages = {
          STUDENT_ONLY: 'บัญชีนี้ไม่ใช่บัญชีนักเรียน',
          INVALID_TYPE: 'ประเภทการลาไม่ถูกต้อง',
          START_DATE_REQUIRED: 'กรุณาเลือกวันที่เริ่มลา',
          REASON_REQUIRED: 'กรุณาระบุเหตุผลการลา',
        };
        showToast(messages[data?.error] || 'ยื่นใบลาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
        return null;
      }

      showToast('ยื่นใบลาเรียบร้อยแล้ว — รอครูประจำชั้นอนุมัติ', 'success');
      load();
      return data.id;
    },
    [load]
  );

  const decide = useCallback(
    async (rpcName, id, approve, reason) => {
      const { data, error } = await supabase.rpc(rpcName, {
        p_id: id,
        p_approve: approve,
        p_reason: reason || null,
      });

      if (error || !data?.ok) {
        const messages = {
          FORBIDDEN: 'ไม่มีสิทธิ์ดำเนินการรายการนี้',
          NOT_FOUND: 'ไม่พบใบลานี้',
          ALREADY_REVIEWED: 'ใบลานี้ถูกดำเนินการไปแล้ว',
        };
        showToast(messages[data?.error] || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
        return false;
      }

      showToast(approve ? 'อนุมัติสำเร็จ — แจ้งเตือนนักเรียนแล้ว' : 'ปฏิเสธคำขอแล้ว — แจ้งเตือนนักเรียนแล้ว', 'success');
      load();
      return true;
    },
    [load]
  );

  const teacherDecide = useCallback((id, approve, reason) => decide('teacher_decide_leave_request', id, approve, reason), [decide]);
  const academicDecide = useCallback((id, approve, reason) => decide('academic_decide_leave_request', id, approve, reason), [decide]);

  return { requests, loading, reload: load, submit, teacherDecide, academicDecide };
}

export default useLeaveRequests;
