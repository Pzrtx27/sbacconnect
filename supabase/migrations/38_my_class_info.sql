-- ============================================================
-- 38_my_class_info.sql — นักเรียนต้องเห็น "ครูที่ปรึกษา" ของตัวเองในหน้าแรก
--
-- ปัญหา: ชื่อครูที่ปรึกษาอยู่ที่ class_rooms.homeroom_teacher_id -> users.full_name
--   แต่ policy users_self_select (03_rls.sql) ให้แต่ละคนอ่าน users ได้เฉพาะแถวของตัวเอง
--   นักเรียน join ไปหาชื่อครูตรง ๆ จึงได้ null เสมอ ไม่ใช่เพราะไม่มีข้อมูล แต่เพราะ RLS กัน
--
-- ทำไมไม่ใช้ list_classrooms_with_homeroom() ที่มีอยู่แล้ว:
--   ตัวนั้นคืน "ทุกห้องทั้งวิทยาลัยพร้อมชื่อครูประจำชั้นทุกคน" ซึ่งเกินความจำเป็นของหน้าแรก
--   หน้าแรกต้องการแค่ห้องของคนที่ล็อกอินอยู่ห้องเดียว จึงเขียนตัวใหม่ที่แคบที่สุดเท่าที่พอใช้
--
-- ขอบเขตที่ฟังก์ชันนี้เปิดให้: ห้องของ "ผู้เรียกเอง" เท่านั้น
--   ไม่รับพารามิเตอร์ใด ๆ เลย จึงถามแทนคนอื่นไม่ได้ตั้งแต่ต้น
--   คนที่ไม่มี student_profile (ครู/วิชาการ/บาริสต้า) จะได้ ok=false กลับไปเฉย ๆ
--
-- รันซ้ำได้ / ต้องรัน 01_schema.sql, 02_functions.sql และ 22_leave_requests.sql มาก่อน
-- ============================================================

create or replace function public.my_class_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ok',            true,
        'student_code',  sp.student_code,
        'level',         cr.level,
        'room_no',       cr.room_no,
        -- ป้ายที่เอาไปแสดงได้เลย เช่น 'ปวช.3/6' — ประกอบที่นี่ที่เดียว
        -- จะได้ไม่ต้องมีสูตรประกอบชื่อห้องกระจายอยู่หลายหน้า
        'class_label',   case
                           when cr.id is null then null
                           else cr.level || '/' || cr.room_no
                         end,
        -- ครูที่ปรึกษา/ครูประจำชั้น = คนเดียวกัน (ดู 22_leave_requests.sql)
        'advisor_name',  t.full_name,
        'advisor_email', t.email
      )
      from public.student_profiles sp
      -- left join ทั้งสองชั้น: นักเรียนที่ยังไม่ถูกผูกห้อง หรือห้องที่ยังไม่ตั้งครูที่ปรึกษา
      -- ต้องยังได้ ok=true พร้อมค่า null กลับไป ไม่ใช่หายไปทั้งก้อน
      -- (หน้าแรกจะได้ขึ้นว่า "ยังไม่ได้กำหนด" แทนที่จะขึ้นว่าโหลดไม่สำเร็จ)
      left join public.class_rooms cr on cr.id = sp.class_room_id
      left join public.users t on t.id = cr.homeroom_teacher_id
      where sp.user_id = app_current_user_id()
    ),
    jsonb_build_object('ok', false, 'reason', 'NOT_A_STUDENT')
  );
$$;

comment on function public.my_class_info() is
  'ข้อมูลห้องเรียนของผู้เรียกเอง (ระดับชั้น ห้อง และชื่อครูที่ปรึกษา) — ใช้แสดงในหน้าแรกของนักเรียน '
  'ไม่รับพารามิเตอร์ จึงถามแทนคนอื่นไม่ได้ ผู้ที่ไม่ใช่นักเรียนจะได้ ok=false';

grant execute on function public.my_class_info() to authenticated;
revoke all on function public.my_class_info() from anon;
revoke execute on function public.my_class_info() from public;

-- ============================================================
-- ตรวจผล — ห้องไหนตั้งครูที่ปรึกษาไว้แล้วบ้าง และมีนักเรียนกี่คนที่จะเห็นชื่อ
--
-- แถวที่ขึ้นว่า "— ยังไม่ได้กำหนด —" ไม่ใช่ข้อผิดพลาดของไฟล์นี้
-- แต่แปลว่าฝ่ายวิชาการยังไม่ได้ตั้งครูที่ปรึกษาให้ห้องนั้นในหน้าจัดการ
-- ============================================================
select cr.level || '/' || cr.room_no                    as ห้อง,
       coalesce(t.full_name, '— ยังไม่ได้กำหนด —')       as ครูที่ปรึกษา,
       count(sp.user_id)                                as จำนวนนักเรียน
  from public.class_rooms cr
  left join public.users t on t.id = cr.homeroom_teacher_id
  left join public.student_profiles sp on sp.class_room_id = cr.id
 group by cr.id, cr.level, cr.room_no, t.full_name
 order by cr.level, cr.room_no;
