import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from '../contexts/AuthContext';

/* ใบแจ้งซ่อม — RPC list_repair_tickets กรองสิทธิ์ให้ฝั่ง DB แล้ว (23_repair_tickets.sql):
   ผู้แจ้งเห็นของตัวเอง, ฝ่ายวิชาการ/แอดมินเห็นทั้งหมด

   ต่างจาก useLeaveRequests ตรงที่ subscribe เฉพาะตอนมีคนใช้จริง (enabled)
   เพราะหน้าที่ต้องการคิวแบบเรียลไทม์มีแค่หน้าจัดการของฝ่ายวิชาการ
   ส่วนแชทถามเป็นครั้งคราว ไม่ต้องเปิด channel ค้างไว้ทั้งเซสชัน */

let channelSeq = 0;

export function useRepairTickets({ statusFilter = null, realtime = false } = {}) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('list_repair_tickets', {
      p_status_filter: statusFilter,
      p_limit: 100,
    });

    if (err || !data?.ok) {
      console.error('[repair] โหลดใบแจ้งซ่อมไม่สำเร็จ:', err || data?.error);
      // แยก "ดึงไม่ได้" ออกจาก "ไม่มีใบ" ให้ชัด ไม่งั้นหน้าจอจะบอกว่าไม่มีใบแจ้งซ่อม
      // ทั้งที่จริงคือเน็ตหลุด ซึ่งเป็นคนละเรื่องกันสำหรับคนที่กำลังตามเรื่องอยู่
      setError(err || new Error(data?.error || 'LIST_FAILED'));
      setLoading(false);
      return;
    }

    setError(null);
    setTickets(data.tickets || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    if (!user?.uid) {
      setTickets([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    load();

    if (!realtime) return undefined;

    channelSeq += 1;
    const channel = supabase
      .channel(`repair-tickets-watch-${channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'repair_tickets' }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.uid, load, realtime]);

  /** แจ้งซ่อม — คืนแถวจริงจาก DB (มี ticket_no ที่ DB ออกให้) หรือ { error } */
  const submit = useCallback(
    async ({ room, equipment, problem }) => {
      const { data, error: err } = await supabase.rpc('submit_repair_ticket', {
        p_room: room,
        p_equipment: equipment,
        p_problem: problem,
      });

      if (err || !data?.ok) {
        return { error: data?.error || err?.message || 'SUBMIT_FAILED' };
      }

      load();
      return { ticket: data };
    },
    [load]
  );

  /** ฝ่ายวิชาการเปลี่ยนสถานะ (RPC ปฏิเสธเองถ้าไม่มีสิทธิ์) */
  const updateStatus = useCallback(
    async (id, status, note) => {
      const { data, error: err } = await supabase.rpc('update_repair_ticket_status', {
        p_id: id,
        p_status: status,
        p_note: note || null,
      });

      if (err || !data?.ok) {
        return { error: data?.error || err?.message || 'UPDATE_FAILED' };
      }

      load();
      return { ok: true };
    },
    [load]
  );

  return { tickets, loading, error, reload: load, submit, updateStatus };
}

export default useRepairTickets;
