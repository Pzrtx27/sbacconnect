import { useEffect, useRef, useState } from 'react';
import { SCHOOL_TIMEZONE } from '../../utils/timetable';

/* นาฬิกาเดินจริงตามเวลาไทย — "ศุกร์ 11 ก.ย. 2569 · 19:52:34 น."

   ทำไมต้องบังคับ timeZone เป็นเวลาไทย ไม่ปล่อยตามเครื่อง:
     วันที่ของการเช็คชื่อคิดที่ฝั่งฐานข้อมูลด้วย Asia/Bangkok เสมอ
     (41_homeroom_attendance.sql) ถ้าหน้าจอโชว์เวลาเครื่องที่ตั้งผิดโซน
     ครูจะเถียงกับตัวเลขบนจอว่าทำไมเช็คชื่อไปลงเป็นของเมื่อวาน

   ทำไมแยกเป็นคอมโพเนนต์เล็ก ๆ ไม่ทำเป็นฮุกแล้วเรียกในหน้าครูตรง ๆ:
     มันเปลี่ยน state ทุกวินาที ถ้า state นั้นอยู่ในหน้าครู ทั้งหน้า (การ์ด รายการวินัย
     ใบลา สมุดคะแนน) จะ re-render วินาทีละครั้งตลอดเวลาที่เปิดหน้าไว้
     แยกออกมาแบบนี้ตัวที่ re-render คือ <span> ตัวเดียว

   onDateChange: ยิงตอนวันที่ไทยเปลี่ยน (เที่ยงคืน) สำหรับหน้าที่โชว์ยอด "ของวันนี้"
   ค้างไว้ข้ามคืน จะได้โหลดใหม่เองแทนที่จะโชว์ยอดเมื่อวานว่าเป็นวันนี้ */

const DATE_FMT = new Intl.DateTimeFormat('th-TH', {
  timeZone: SCHOOL_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME_FMT = new Intl.DateTimeFormat('th-TH', {
  timeZone: SCHOOL_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

// 'YYYY-MM-DD' ตามเวลาไทย — รูปแบบเดียวกับ todayISO() ใน utils/timetable
const ISO_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIMEZONE });

export default function LiveClock({ className = '', onDateChange }) {
  const [now, setNow] = useState(() => new Date());
  const lastDateISO = useRef(ISO_FMT.format(new Date()));

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const iso = ISO_FMT.format(now);
    if (iso === lastDateISO.current) return;
    lastDateISO.current = iso;
    onDateChange?.(iso);
  }, [now, onDateChange]);

  return (
    <span className={className}>
      {DATE_FMT.format(now)} · {TIME_FMT.format(now)} น.
    </span>
  );
}
