import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../config/supabase';

/* ฟังการเปลี่ยนแปลงของตารางแบบเรียลไทม์ พร้อม "ตาข่ายรองรับ" เมื่อเรียลไทม์ใช้ไม่ได้

   ทำไมต้องมีตาข่ายรองรับ:
     postgres_changes จะเงียบสนิทถ้าตารางยังไม่ถูกเพิ่มเข้า publication
     supabase_realtime หรือ RLS ไม่ยอมให้ผู้ฟังคนนั้นอ่านแถวนั้น (ดู 34_realtime_orders.sql)
     ที่แย่กว่านั้นคือมันไม่ error — หน้าเว็บดูปกติทุกอย่าง แค่ข้อมูลไม่ขยับ
     ซึ่งเป็นอาการเดิมของแอปนี้: บาริสต้ากดเสร็จแล้ว แต่จอนักเรียนค้างจนกดรีเฟรชเอง

     ที่นี่จึงถามซ้ำตามเวลาเสมอ แต่ปรับความถี่ตามสถานะการเชื่อมต่อจริง
       ต่อติด    -> ถามนาน ๆ ที (แค่กันหลุดเงียบ) เพราะ event มาเองอยู่แล้ว
       ต่อไม่ติด -> ถามถี่ขึ้น เพื่อให้หน้าจอยังอัปเดตเองโดยผู้ใช้ไม่ต้องรู้ว่ามีอะไรพัง
     ผลคือถึงยังไม่ได้รัน SQL ไฟล์ 18 หน้าจอก็อัปเดตเองภายในไม่กี่วินาที

   ค่า live ที่คืนออกไปคือสถานะการเชื่อมต่อ "จริง" ไม่ใช่จุดเขียวปลอม ๆ
   หน้าจอจะได้บอกผู้ใช้ตรง ๆ ว่าตอนนี้สดหรือกำลังไล่ถามอยู่ */

let channelSeq = 0;

/* ห่อฟังก์ชันดึงข้อมูลไม่ให้ทำงานทับกันเอง

   ตอนนี้มีตั้งสี่ทางที่สั่งให้ดึงใหม่ได้: event จากเรียลไทม์, รอบ polling,
   การกลับมาที่แท็บ และตอน subscribe ติด — สองทางยิงพร้อมกันเมื่อไหร่จะได้
   คำตอบสองชุดที่เทียบกับ "ภาพถ่ายรอบก่อน" ชุดเดียวกัน
   ผลคือแจ้งเตือนซ้ำสองรอบจากเหตุการณ์เดียว (toast เด้งสองใบ เสียงดังสองที)

   ตัวนี้จึงปล่อยให้ทำงานทีละรอบ ถ้ามีคนสั่งเข้ามาระหว่างที่ยังไม่เสร็จ
   จะจำไว้แล้ววนอีกรอบเดียวหลังรอบปัจจุบันจบ — ไม่ทิ้งงาน และไม่ทำซ้อน

   callback ที่คืนออกไปมี identity คงที่ ใส่ใน deps ของ useEffect ได้โดยไม่วนลูป */
export function useSerialCallback(fn) {
  const fnRef = useRef(fn);
  const runningRef = useRef(false);
  const queuedRef = useRef(false);

  useEffect(() => {
    fnRef.current = fn;
  });

  return useCallback(async () => {
    if (runningRef.current) {
      queuedRef.current = true;
      return;
    }

    runningRef.current = true;
    try {
      do {
        queuedRef.current = false;
        await fnRef.current();
      } while (queuedRef.current);
    } finally {
      runningRef.current = false;
    }
  }, []);
}

export function useRealtimeTable({
  table,
  event = '*',
  filter,
  onChange,
  enabled = true,
  /* ต่อติดแล้วยังถามซ้ำนาน ๆ ที กัน WebSocket หลุดแบบไม่แจ้ง (พบบ่อยตอนมือถือสลับ Wi-Fi/4G) */
  livePollMs = 60000,
  fallbackPollMs = 8000,
}) {
  const [live, setLive] = useState(false);
  const cbRef = useRef({ onChange });

  // เก็บ callback ล่าสุดไว้ใน ref แทนการใส่ใน deps
  // ไม่งั้น component ที่ส่ง arrow function เข้ามาจะ subscribe ใหม่ทุกครั้งที่ re-render
  useEffect(() => {
    cbRef.current = { onChange };
  });

  useEffect(() => {
    if (!enabled) {
      setLive(false);
      return undefined;
    }

    channelSeq += 1;
    let cancelled = false;

    const channel = supabase
      .channel(`rt-${table}-${channelSeq}`)
      .on(
        'postgres_changes',
        { event, schema: 'public', table, ...(filter ? { filter } : {}) },
        () => cbRef.current.onChange?.()
      )
      .subscribe((status) => {
        if (cancelled) return;
        setLive(status === 'SUBSCRIBED');
        // เพิ่งต่อติด (หรือต่อใหม่หลังหลุด) -> ดึงทันทีหนึ่งรอบ
        // กันช่วงที่ socket ยังไม่พร้อมแล้วมีของเปลี่ยนไประหว่างนั้น
        if (status === 'SUBSCRIBED') cbRef.current.onChange?.();
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled, table, event, filter]);

  useEffect(() => {
    if (!enabled) return undefined;

    const ms = live ? livePollMs : fallbackPollMs;
    const id = setInterval(() => {
      // แท็บที่ถูกซ่อนอยู่ไม่ต้องถาม ประหยัดทั้งแบตและโควตา
      // ตอนกลับมาดูจะมี visibilitychange ด้านล่างดึงให้เองอยู่แล้ว
      if (document.visibilityState === 'visible') cbRef.current.onChange?.();
    }, ms);

    return () => clearInterval(id);
  }, [enabled, live, livePollMs, fallbackPollMs]);

  // กลับมาที่แท็บ/หน้าต่าง = ต้องเห็นของล่าสุดทันที ไม่ใช่รอรอบ interval ถัดไป
  useEffect(() => {
    if (!enabled) return undefined;

    const refetchIfVisible = () => {
      if (document.visibilityState === 'visible') cbRef.current.onChange?.();
    };

    document.addEventListener('visibilitychange', refetchIfVisible);
    window.addEventListener('focus', refetchIfVisible);
    window.addEventListener('online', refetchIfVisible);

    return () => {
      document.removeEventListener('visibilitychange', refetchIfVisible);
      window.removeEventListener('focus', refetchIfVisible);
      window.removeEventListener('online', refetchIfVisible);
    };
  }, [enabled]);

  return live;
}

export default useRealtimeTable;
