import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import { EVENT_COLUMNS, toEvent } from '../utils/events';

/* ดึงกิจกรรมจากตาราง events พร้อมฟังการเปลี่ยนแปลงแบบเรียลไทม์

   ทำไมต้อง realtime: ฝ่ายวิชาการเพิ่มกิจกรรมแล้วต้องขึ้นบนเครื่องนักเรียนทันที
   ไม่ต้องรอให้ปิดแอปเปิดใหม่ — เป็นข้อที่แผนระบุไว้ในโมดูล A

   RLS กรองให้แล้วว่าใครเห็นอะไร (นักเรียนเห็นเฉพาะ is_published)
   ฝั่งนี้จึงไม่ต้องใส่เงื่อนไขสิทธิ์ซ้ำ */

/** ชื่อ channel ต้องไม่ซ้ำกันระหว่าง component
 *  ถ้าตั้งชื่อเดียวกันแล้วสองหน้าเปิดพร้อมกัน อันหลังจะแย่ง channel อันแรกไป */
let channelSeq = 0;

function useEventSubscription(onChange) {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    channelSeq += 1;
    const channel = supabase
      .channel(`events-watch-${channelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => handlerRef.current?.()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

/** กิจกรรมในช่วงเวลาหนึ่ง — ใช้กับหน้าปฏิทินรายเดือน
 *  from/to เป็น ISO string (ดู monthRange ใน utils/events.js) */
export function useEventsInRange(from, to, { includeDrafts = false } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    let query = supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .gte('start_at', from)
      .lt('start_at', to)
      .order('start_at', { ascending: true });

    // ฝ่ายวิชาการเท่านั้นที่ RLS ยอมให้เห็นฉบับร่าง หน้าอื่นกรองทิ้งไปเลย
    if (!includeDrafts) query = query.eq('is_published', true);

    const { data, error: err } = await query;

    if (err) {
      console.error('[events] โหลดกิจกรรมไม่สำเร็จ:', err);
      setError(err);
    } else {
      setError(null);
      setEvents((data || []).map(toEvent));
    }
    setLoading(false);
  }, [from, to, includeDrafts]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load().finally(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
  }, [load]);

  useEventSubscription(load);

  return { events, loading, error, reload: load };
}

/** กิจกรรมที่กำลังจะมาถึง — ใช้กับการ์ดหน้าแรก */
export function useUpcomingEvents(limit = 3) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // เทียบกับต้นวันนี้ ไม่ใช่ now() — กิจกรรมที่เพิ่งจบไปเมื่อเช้ายังควรอยู่ในการ์ดจนหมดวัน
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .eq('is_published', true)
      .gte('start_at', startOfToday.toISOString())
      .order('start_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[events] โหลดกิจกรรมที่กำลังจะมาถึงไม่สำเร็จ:', error);
    } else {
      setEvents((data || []).map(toEvent));
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  useEventSubscription(load);

  return { events, loading, reload: load };
}

/* ---------------------------------------------------------------
   รายชื่อห้องเรียน — ใช้กับ dropdown "กิจกรรมนี้ของห้องไหน"
   และใช้แปลง class_room_id กลับเป็นชื่อห้องตอนแสดงผล
   --------------------------------------------------------------- */

// ห้องเรียนแทบไม่เปลี่ยนเลยตลอดภาคเรียน โหลดครั้งเดียวพอ
// เก็บเป็น promise ไม่ใช่ผลลัพธ์ เพราะถ้าสองคอมโพเนนต์ mount พร้อมกัน
// จะได้ใช้ request เดียวกัน ไม่ยิงซ้ำสองรอบ
let classRoomsPromise = null;

export function useClassRooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    classRoomsPromise ||= supabase.rpc('list_class_rooms').then(({ data, error }) => {
      if (error) {
        console.error('[events] โหลดรายชื่อห้องเรียนไม่สำเร็จ:', error);
        classRoomsPromise = null; // ให้ลองใหม่ได้ในการ mount ครั้งถัดไป
        return [];
      }
      return data || [];
    });

    classRoomsPromise.then((list) => {
      if (!alive) return;
      setRooms(list);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  /** id -> "ปวช.3 ห้อง 6" ; null/ไม่รู้จัก -> null */
  const labelOf = useCallback(
    (id) => {
      if (id === null || id === undefined) return null;
      // eslint-disable-next-line eqeqeq -- id จาก DB อาจเป็น number แต่ค่าจาก <select> เป็น string
      return rooms.find((r) => r.id == id)?.label ?? null;
    },
    [rooms]
  );

  return { rooms, loading, labelOf };
}
