import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import { useAuth } from '../contexts/AuthContext';
import { showToast } from '../components/ui/Toast';

/* กล่องแจ้งเตือนในระบบ — โหลดรายการที่มีอยู่ + ฟังของใหม่แบบเรียลไทม์ผ่าน
   Supabase Realtime (ดูตาราง notifications ใน 20_behavior_and_notifications.sql)

   ทำไมต้องกัน "first load" ไม่ให้ toast ขึ้น: ตอนโหลดครั้งแรก payload เก่าทุกใบจะไม่ผ่าน
   ช่องทาง realtime อยู่แล้ว (แค่ query ปกติ) แต่กันไว้อีกชั้นเผื่อ subscribe ทันก่อน query
   เสร็จ ไม่งั้นแจ้งเตือนเก่าที่เพิ่งโหลดจะเด้ง toast ซ้อนตอนเปิดหน้าเว็บ */

const SELECT = 'id, type, title, body, data, is_read, created_at';

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const firstLoadDone = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[notifications] โหลดการแจ้งเตือนไม่สำเร็จ:', error);
    } else {
      setNotifications(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    firstLoadDone.current = false;
    setLoading(true);
    load().then(() => {
      firstLoadDone.current = true;
    });

    // filter ตาม user_id ที่ subscription — ลดทราฟฟิกที่ไม่จำเป็นเท่านั้น
    // ตัวที่กันสิทธิ์จริงคือ RLS (notifications_read_own) ฝั่ง DB
    const channel = supabase
      .channel(`notifications-${user.uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.uid}` },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev]);
          if (firstLoadDone.current) {
            showToast(payload.new.title, 'info');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.uid, load]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
    if (error) console.error('[notifications] mark_notification_read ล้มเหลว:', error);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const { error } = await supabase.rpc('mark_all_notifications_read');
    if (error) console.error('[notifications] mark_all_notifications_read ล้มเหลว:', error);
  }, []);

  /* ลบแบบมองเห็นผลทันที (optimistic) แล้วค่อยยิงไปที่ DB
     ถ้าล้มเหลวค่อยดึงรายการใหม่ทั้งชุดเพื่อคืนสภาพให้ตรงกับของจริง
     ไม่เก็บสำเนาไว้ใส่กลับเอง เพราะระหว่างนั้นอาจมีแจ้งเตือนใหม่เข้ามาทาง realtime
     การโหลดใหม่จึงถูกต้องกว่าการย้อนสถานะเดิม */
  const remove = useCallback(async (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const { data, error } = await supabase.rpc('delete_notification', { p_id: id });
    if (error || !data?.ok) {
      console.error('[notifications] delete_notification ล้มเหลว:', error || data?.error);
      load();
      return false;
    }
    return true;
  }, [load]);

  const removeAll = useCallback(async () => {
    setNotifications([]);
    const { data, error } = await supabase.rpc('delete_all_notifications', { p_only_read: false });
    if (error || !data?.ok) {
      console.error('[notifications] delete_all_notifications ล้มเหลว:', error || data?.error);
      load();
      return false;
    }
    return true;
  }, [load]);

  return { notifications, loading, unreadCount, markRead, markAllRead, remove, removeAll, reload: load };
}

export default useNotifications;
