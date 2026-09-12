import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { showToast } from '../components/ui/Toast';

/* ประวัติการตัด/เพิ่มคะแนน — ใช้ RPC list_behavior_logs (21_behavior_crud_and_academic.sql)
   role teacher เห็นเฉพาะรายการที่ตัวเองบันทึก, role academic/sysadmin เห็นของทุกคน (DB กรองให้แล้ว)

   studentUserId: ระบุเพื่อกรองดูประวัติของนักเรียนคนเดียว (เช่นตอนเลือกนักเรียนในฟอร์มตัดคะแนน)
   ปล่อยว่าง = "ประวัติของฉัน" (ครู) หรือ "รายการทั้งหมด" (ฝ่ายวิชาการ/แอดมิน) */
let channelSeq = 0;

export function useBehaviorLogs(studentUserId = null) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_behavior_logs', {
      p_student_user_id: studentUserId,
      p_limit: 100,
    });

    if (error) {
      console.error('[behavior] โหลดประวัติไม่สำเร็จ:', error);
      setLoading(false);
      return;
    }
    setLogs(data?.ok ? data.logs || [] : []);
    setLoading(false);
  }, [studentUserId]);

  useEffect(() => {
    setLoading(true);
    load();

    channelSeq += 1;
    const channel = supabase
      .channel(`behavior-logs-watch-${channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'behavior_logs' }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const updateLog = useCallback(
    async (logId, { categoryId, reason, points, actionType, editReason }) => {
      const { data, error } = await supabase.rpc('update_behavior_log', {
        p_log_id: logId,
        p_category_id: categoryId,
        p_reason: reason,
        p_points: points,
        p_action_type: actionType,
        p_edit_reason: editReason || null,
      });

      if (error || !data?.ok) {
        const messages = {
          FORBIDDEN: 'ไม่มีสิทธิ์แก้ไขรายการนี้',
          NOT_FOUND: 'ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)',
          INVALID_POINTS: 'กรุณาระบุคะแนนที่ถูกต้อง',
          REASON_REQUIRED: 'กรุณาระบุเหตุผล',
        };
        showToast(messages[data?.error] || 'แก้ไขไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
        return false;
      }

      showToast('แก้ไขรายการสำเร็จ — แจ้งเตือนนักเรียนแล้ว', 'success');
      load();
      return true;
    },
    [load]
  );

  const deleteLog = useCallback(
    async (logId, reason) => {
      const { data, error } = await supabase.rpc('delete_behavior_log', {
        p_log_id: logId,
        p_reason: reason || null,
      });

      if (error || !data?.ok) {
        const messages = {
          FORBIDDEN: 'ไม่มีสิทธิ์ลบรายการนี้',
          NOT_FOUND: 'ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)',
        };
        showToast(messages[data?.error] || 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
        return false;
      }

      showToast('ลบรายการสำเร็จ — แจ้งเตือนนักเรียนแล้ว', 'success');
      load();
      return true;
    },
    [load]
  );

  return { logs, loading, reload: load, updateLog, deleteLog };
}

export default useBehaviorLogs;
