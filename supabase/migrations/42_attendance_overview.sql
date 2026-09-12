-- ============================================================
-- 42_attendance_overview.sql — สรุปผลเช็คชื่อ "รายห้อง" ให้ครบทุกสถานะ
--
-- ปัญหาที่เจอหลังใช้จริง (41_homeroom_attendance.sql):
--   การ์ด "รายงานสถานะห้องเรียน" โชว์แค่ มาเรียน กับ ขาดเรียน
--   ห้องที่เช็คว่า "สาย" หรือ "ลา" ครบทุกคนจึงขึ้น 0/2 มาเรียน และ 0 ขาดเรียน
--   ทั้งที่เช็คชื่อครบแล้ว — ตัวเลขหายไปเฉย ๆ เพราะไม่มีช่องให้มันอยู่
--   และครูที่ดูแลหลายห้องเห็นสรุปของห้องที่เลือกอยู่ห้องเดียว
--
-- แก้โดยให้ my_homeroom_classes() คืนยอดของ "วันนี้" มาพร้อมกับรายชื่อห้องเลย
-- หน้าเว็บจึงวาดสรุปได้ครบทุกห้องทุกสถานะโดยไม่ต้องยิง RPC เพิ่มทีละห้อง
--
-- ไม่แตะตาราง ไม่แตะ RPC ตัวอื่น — แทนที่ฟังก์ชันเดียว รันซ้ำได้
-- ต้องรัน 41_homeroom_attendance.sql มาก่อน
-- ============================================================

create or replace function public.my_homeroom_classes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',            x.id,
               'label',         x.level || '/' || x.room_no,
               'student_count', x.student_count,
               -- true = ไม่ใช่ห้องของตัวเองจริง ๆ แต่ห้องนี้ยังไม่มีครูประจำชั้น
               'is_fallback',   x.is_fallback,
               -- ยอดของวันนี้ (เวลาไทย) — 'marked' คือจำนวนคนที่เช็คไปแล้วทั้งหมด
               'marked',        x.marked_count,
               'present',       x.present_count,
               'late',          x.late_count,
               'absent',        x.absent_count,
               'leave',         x.leave_count
             )
             order by x.level, x.room_no
           ),
           '[]'::jsonb
         )
  from (
    select cr.id,
           cr.level,
           cr.room_no,
           (cr.homeroom_teacher_id is null) as is_fallback,
           (select count(*) from public.student_profiles sp where sp.class_room_id = cr.id) as student_count,
           coalesce(t.marked_count,  0) as marked_count,
           coalesce(t.present_count, 0) as present_count,
           coalesce(t.late_count,    0) as late_count,
           coalesce(t.absent_count,  0) as absent_count,
           coalesce(t.leave_count,   0) as leave_count
    from public.class_rooms cr
    -- นับแยกสถานะในรอบเดียว — count(*) filter เร็วกว่ายิง subquery สี่รอบต่อห้อง
    left join lateral (
      select count(*)                                          as marked_count,
             count(*) filter (where a.status = 'present')      as present_count,
             count(*) filter (where a.status = 'late')         as late_count,
             count(*) filter (where a.status = 'absent')       as absent_count,
             count(*) filter (where a.status = 'leave')        as leave_count
      from public.attendance_homeroom a
      where a.class_room_id = cr.id
        and a.attend_date   = (now() at time zone 'Asia/Bangkok')::date
    ) t on true
    where cr.homeroom_teacher_id = app_current_user_id()
       or app_is_academic_staff()
       -- ครูที่ยังไม่ถูกผูกห้องไหนเลย เห็นเฉพาะห้องที่ยังว่างครูประจำชั้น
       or (
            cr.homeroom_teacher_id is null
            and app_has_role('teacher')
            and not exists (
              select 1 from public.class_rooms c2
              where c2.homeroom_teacher_id = app_current_user_id()
            )
          )
  ) x;
$$;

comment on function public.my_homeroom_classes() is
  'ห้องที่ผู้เรียกเช็คชื่อเข้าแถวได้ พร้อมจำนวนนักเรียนและยอดเช็คชื่อของวันนี้แยกตามสถานะ (มา/สาย/ขาด/ลา) — ใช้วาดการ์ดสรุปรายห้องในหน้าครู';

grant execute on function public.my_homeroom_classes() to authenticated;
revoke all on function public.my_homeroom_classes() from anon;
revoke execute on function public.my_homeroom_classes() from public;

-- ============================================================
-- ตรวจผล — ยอดของวันนี้แยกสถานะทุกห้อง (มุมมองแอดมิน ไม่ผ่านสิทธิ์ของผู้เรียก)
-- ============================================================
select cr.level || '/' || cr.room_no                            as ห้อง,
       count(sp.user_id)                                        as นักเรียนทั้งหมด,
       count(a.id)                                              as เช็คแล้ว,
       count(a.id) filter (where a.status = 'present')           as มา,
       count(a.id) filter (where a.status = 'late')              as สาย,
       count(a.id) filter (where a.status = 'absent')            as ขาด,
       count(a.id) filter (where a.status = 'leave')             as ลา
  from public.class_rooms cr
  left join public.student_profiles sp on sp.class_room_id = cr.id
  left join public.attendance_homeroom a
         on a.student_user_id = sp.user_id
        and a.attend_date = (now() at time zone 'Asia/Bangkok')::date
 group by cr.id, cr.level, cr.room_no
 order by cr.level, cr.room_no;
