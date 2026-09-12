import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabase';

/* เช็คชื่อเข้าแถวโฮมรูม (41_homeroom_attendance.sql)

   ของเดิมในหน้าครูเป็นรายชื่อสมมติ 3 คนที่ hardcode ไว้ในไฟล์ และผลการเช็คชื่อ
   เขียนลง localStorage ของเครื่องนั้นเครื่องเดียว — เปลี่ยนเครื่องคือหาย
   และนักเรียนไม่มีทางรู้ว่าถูกลงว่าขาดหรือสาย ฮุกนี้ย้ายทั้งเส้นทางไปที่ฐานข้อมูลจริง

   ทำไมต้องผ่าน RPC ทั้งหมด ไม่ select ตารางตรง ๆ:
     ชื่อนักเรียนอยู่ในตาราง users ซึ่ง policy users_self_select ให้อ่านได้เฉพาะแถวตัวเอง
     ครู join หารายชื่อห้องตัวเองตรง ๆ จะได้ [] กลับมาเงียบ ๆ (บทเรียนเดียวกับ 38_my_class_info)

   ไม่ส่งวันที่ไปจากหน้าเว็บ ปล่อยให้ฝั่ง DB คิดเองตามเวลาไทย
   ถ้านาฬิกาเครื่องครูเพี้ยน การเช็คชื่อจะได้ไม่ไปลงผิดวัน */

export const ATTENDANCE_OPTIONS = [
  { id: 'present', label: 'มา' },
  { id: 'late', label: 'สาย' },
  { id: 'absent', label: 'ขาด' },
  { id: 'leave', label: 'ลา' },
];

export const attendanceErrorMessage = (code) =>
  ({
    SETUP: 'ยังไม่ได้ติดตั้งระบบเช็คชื่อในฐานข้อมูล (รัน supabase/migrations/41_homeroom_attendance.sql)',
    NO_CLASS: 'บัญชีนี้ยังไม่ได้ถูกกำหนดให้เป็นครูประจำชั้นของห้องใด — ให้ฝ่ายวิชาการกำหนดให้ก่อน',
    FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์เช็คชื่อห้องนี้',
    CLASS_NOT_FOUND: 'ไม่พบห้องเรียนนี้ในระบบ',
    INVALID_ENTRY: 'มีรายชื่อที่ไม่ได้อยู่ในห้องนี้ กรุณาปิดแล้วเปิดใหม่อีกครั้ง',
    FUTURE_DATE: 'เช็คชื่อล่วงหน้าไม่ได้',
    EMPTY: 'ยังไม่มีรายชื่อนักเรียนให้บันทึก',
    INCOMPLETE: 'กรุณาระบุสถานะการเข้าเรียนของนักเรียนให้ครบถ้วน',
  })[code] || 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

export function useHomeroomAttendance(enabled = true) {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(null);
  const [classLabel, setClassLabel] = useState('');
  const [attendDate, setAttendDate] = useState('');
  const [students, setStudents] = useState([]);
  const [draft, setDraft] = useState({});
  const [loadingClasses, setLoadingClasses] = useState(enabled);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  /* ---------- 1) ห้องที่บัญชีนี้เช็คชื่อได้ + ยอดของวันนี้แยกสถานะ ----------
     ยอด มา/สาย/ขาด/ลา มาพร้อมรายชื่อห้องเลย (42_attendance_overview.sql)
     การ์ดสรุปหน้าแรกจึงวาดได้ทุกห้องโดยไม่ต้องโหลดรายชื่อนักเรียนของทุกห้องมาก่อน */
  const loadClasses = useCallback(async () => {
    if (!enabled) {
      setLoadingClasses(false);
      return;
    }

    setLoadingClasses(true);
    const { data, error: rpcError } = await supabase.rpc('my_homeroom_classes');

    if (rpcError) {
      // ยังไม่ได้รัน 41_homeroom_attendance.sql ก็จะมาตกที่นี่ — บอกให้ชัดว่าต้องทำอะไรต่อ
      console.error('[attendance] โหลดห้องที่เช็คชื่อได้ไม่สำเร็จ (รัน supabase/migrations/41_homeroom_attendance.sql แล้วหรือยัง):', rpcError);
      setError('SETUP');
      setLoadingClasses(false);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    setClasses(rows);
    setError(rows.length ? null : 'NO_CLASS');
    setClassId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
    setLoadingClasses(false);
  }, [enabled]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // ---------- 2) รายชื่อนักเรียน + สถานะที่เช็คไว้แล้ววันนี้ ----------
  const loadRoster = useCallback(async () => {
    if (!enabled || !classId) return;

    setLoadingRoster(true);
    const { data, error: rpcError } = await supabase.rpc('homeroom_roster', { p_class_room_id: classId });

    if (rpcError) {
      console.error('[attendance] โหลดรายชื่อนักเรียนไม่สำเร็จ (รัน supabase/migrations/41_homeroom_attendance.sql แล้วหรือยัง):', rpcError);
      setError('SETUP');
      setStudents([]);
      setLoadingRoster(false);
      return;
    }

    if (!data?.ok) {
      setError(data?.error || 'UNKNOWN');
      setStudents([]);
      setLoadingRoster(false);
      return;
    }

    const rows = data.students || [];
    setError(null);
    setClassLabel(data.class_label || '');
    setAttendDate(data.date || '');
    setStudents(rows);

    /* ติ๊กค้างตามของที่เคยบันทึกไว้ ไม่ใช่เริ่มจากว่างทุกครั้ง
       ครูเปิดโมดัลซ้ำตอนบ่ายเพื่อแก้ของเด็กคนเดียวจะได้ไม่ต้องติ๊กใหม่ทั้งห้อง */
    setDraft(Object.fromEntries(rows.filter((s) => s.status).map((s) => [s.user_id, s.status])));
    setLoadingRoster(false);
  }, [enabled, classId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  // ---------- 3) ติ๊กสถานะ ----------
  const setStatus = useCallback((userId, status) => {
    setDraft((prev) => ({ ...prev, [userId]: status }));
  }, []);

  // ห้องหนึ่งมีสี่สิบคน วันปกติคือ "มาทั้งห้อง ยกเว้นสองคน" — ติ๊กทีละคนสี่สิบครั้งไม่มีใครทำจริง
  const markAll = useCallback(
    (status) => {
      setDraft(Object.fromEntries(students.map((s) => [s.user_id, status])));
    },
    [students],
  );

  // ---------- 4) บันทึก + แจ้งเตือนนักเรียน ----------
  const save = useCallback(async () => {
    const entries = students
      .map((s) => ({ student_user_id: s.user_id, status: draft[s.user_id] }))
      .filter((e) => e.status);

    if (!students.length) return { ok: false, error: 'EMPTY' };
    if (entries.length !== students.length) return { ok: false, error: 'INCOMPLETE' };

    setSaving(true);
    const { data, error: rpcError } = await supabase.rpc('save_homeroom_attendance', {
      p_class_room_id: classId,
      p_entries: entries,
    });
    setSaving(false);

    if (rpcError) {
      console.error('[attendance] บันทึกการเช็คชื่อไม่สำเร็จ:', rpcError);
      return { ok: false, error: 'SETUP' };
    }
    if (!data?.ok) return { ok: false, error: data?.error || 'UNKNOWN' };

    // โหลดทั้งสองอย่าง: รายชื่อ (ติ๊กค้างตามของที่บันทึก) และยอดรายห้องบนการ์ดสรุป
    await Promise.all([loadRoster(), loadClasses()]);
    return data; // { ok, saved, notified, date, class_label }
  }, [students, draft, classId, loadRoster, loadClasses]);

  // ---------- 5) ตัวเลขสรุปที่หน้าเว็บใช้ ----------
  const summary = useMemo(() => {
    const counted = (status) => students.filter((s) => draft[s.user_id] === status).length;
    return {
      total: students.length,
      marked: students.filter((s) => draft[s.user_id]).length,
      present: counted('present'),
      late: counted('late'),
      absent: counted('absent'),
      leave: counted('leave'),
      // "เช็คชื่อแล้ววันนี้" ดูจากของที่บันทึกลง DB จริง ไม่ใช่ของที่เพิ่งติ๊กค้างในจอ
      submittedToday: students.length > 0 && students.every((s) => s.status),
    };
  }, [students, draft]);

  /* สรุป "รายห้อง" สำหรับการ์ดหน้าแรก — ใช้ยอดจากฐานข้อมูล ไม่ใช่ของที่ติ๊กค้างในจอ
     ครูที่ดูแลหลายห้องจึงเห็นครบทุกห้องพร้อมกัน ไม่ใช่เฉพาะห้องที่เลือกอยู่ในโมดัล

     ?? 0 ไว้กันกรณียังไม่ได้รัน 42_attendance_overview.sql — ฟังก์ชันเวอร์ชันเก่า
     ไม่ได้คืนยอดแยกสถานะมาด้วย การ์ดจะขึ้น 0 แทนที่จะพัง

     ห้องที่ยังไม่มีนักเรียนในระบบไม่ถูกนับ ไม่งั้นป้ายรวมจะค้างที่ "ยังไม่ครบ" ตลอดไป */
  const overview = useMemo(() => {
    const rooms = classes.map((c) => {
      const marked = c.marked ?? 0;
      return {
        ...c,
        marked,
        present: c.present ?? 0,
        late: c.late ?? 0,
        absent: c.absent ?? 0,
        leave: c.leave ?? 0,
        done: c.student_count > 0 && marked >= c.student_count,
      };
    });
    const active = rooms.filter((r) => r.student_count > 0);

    return {
      rooms,
      activeCount: active.length,
      doneCount: active.filter((r) => r.done).length,
      allDone: active.length > 0 && active.every((r) => r.done),
    };
  }, [classes]);

  return {
    classes,
    classId,
    setClassId,
    classLabel,
    attendDate,
    students,
    draft,
    setStatus,
    markAll,
    save,
    reload: loadRoster,
    reloadClasses: loadClasses,
    loading: loadingClasses || loadingRoster,
    saving,
    error,
    summary,
    overview,
  };
}

export default useHomeroomAttendance;
