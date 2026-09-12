-- ============================================================
-- 46) ผูกครูผู้สอนเข้ากับรายวิชา แล้วรัดสิทธิ์กรอกคะแนนให้แคบลง
--
-- ปัญหาที่แก้
-- ------------
-- app_can_grade_subject ใน 40_gradebook.sql มีกิ่ง fallback เขียนไว้ว่า
--
--     app_has_role('teacher')
--     and (s.teacher_user_id is null or s.teacher_user_id = app_current_user_id())
--
-- เจตนาถูก: กันไม่ให้ฟีเจอร์ตายตั้งแต่วันแรกเพราะยังไม่มีใครผูกครูประจำวิชา
-- แต่ seed ท้ายไฟล์ 40 ใส่ได้แค่ teacher_name ซึ่งเป็น text
-- เพราะ timetables เก็บชื่อครูเป็นข้อความ ไม่มี user id ให้จับคู่
--
-- ผลคือ "ทุกแถว" มี teacher_user_id is null = กิ่ง fallback เป็นจริงกับครูทุกคน
-- fallback ที่ตั้งใจให้เป็นของชั่วคราว กลายเป็นสถานะถาวรของทั้งระบบ
-- ครูคนไหนก็แก้คะแนนเด็กห้องไหนก็ได้ และ delete_score_item ลบหัวข้อทีเดียว
-- คะแนนของนักเรียนทั้งห้องหายตาม (on delete cascade) โดยลบก่อนแล้วค่อยรายงาน
--
-- ไฟล์นี้ทำสองอย่าง: (1) ผูกเท่าที่จับคู่ได้อย่างมั่นใจ (2) รัดกิ่ง fallback
-- รันซ้ำได้ ปลอดภัย
-- ============================================================

-- ------------------------------------------------------------
-- 1) จับคู่ชื่อครูในตารางสอนกับบัญชีผู้ใช้จริง
--
-- ตั้งใจให้ "ไม่ผูก" ปลอดภัยกว่า "ผูกผิด" เพราะผูกผิดแปลว่าครูตัวจริง
-- กรอกคะแนนวิชาตัวเองไม่ได้ แล้วไปโผล่เป็นสิทธิ์ของคนอื่นแทน
-- จึงผูกเฉพาะเมื่อ match ได้ "คนเดียวเท่านั้น" ที่เหลือปล่อยให้คนตัดสิน
-- ------------------------------------------------------------

-- ตัดคำนำหน้าที่ตารางสอนชอบใส่ ('อ.ปิยะนุช' กับ 'ปิยะนุช' ต้องถือว่าเป็นคนเดียวกัน)
create or replace function public.app_norm_teacher_name(p_name text)
returns text
language sql immutable set search_path = pg_catalog, public
as $fn$
  select nullif(
    regexp_replace(
      regexp_replace(coalesce(p_name, ''), '^\s*(อ\.|อาจารย์|ครู|นางสาว|นาง|นาย)\s*', ''),
      '\s+', '', 'g'
    ),
    ''
  );
$fn$;

comment on function public.app_norm_teacher_name(text) is
  'ตัดคำนำหน้าและช่องว่างออกจากชื่อครู ใช้จับคู่ teacher_name จากตารางสอนกับ users.full_name';

do $$
declare
  v_bound int := 0;
begin
  with teachers as (
    -- เฉพาะบัญชีที่มี role teacher จริง และยัง active
    select u.id, public.app_norm_teacher_name(u.full_name) as norm
    from public.users u
    join public.user_roles ur on ur.user_id = u.id and ur.role = 'teacher'
    where u.is_active
      and public.app_norm_teacher_name(u.full_name) is not null
  ),
  -- ชื่อที่ชี้ไปหาครูได้คนเดียวเท่านั้น ชื่อซ้ำกันสองคนขึ้นไปให้ข้าม
  --
  -- ใช้ (array_agg(id))[1] ไม่ใช่ min(id) เพราะ Postgres ไม่มี min() สำหรับ uuid
  -- (ERROR 42883: function min(uuid) does not exist)
  -- having count(*) = 1 การันตีอยู่แล้วว่ากลุ่มนี้มีแถวเดียว จะหยิบตัวไหนก็ตัวเดียวกัน
  unique_names as (
    select norm, (array_agg(id))[1] as user_id
    from teachers
    group by norm
    having count(*) = 1
  )
  update public.subjects s
     set teacher_user_id = un.user_id
    from unique_names un
   where s.teacher_user_id is null
     and public.app_norm_teacher_name(s.teacher_name) = un.norm;

  get diagnostics v_bound = row_count;
  raise notice 'ผูกครูผู้สอนอัตโนมัติได้ % รายวิชา', v_bound;
end $$;

-- ------------------------------------------------------------
-- 2) รัดกิ่ง fallback: วิชาที่ยังไม่ระบุครู ให้เฉพาะครูประจำชั้นของห้องนั้น
--
-- ของเดิมเปิดให้ role teacher "ทุกคนในวิทยาลัย" ซึ่งกว้างเกินความจำเป็นมาก
-- ครูประจำชั้นของห้องนั้นคือคนที่มีเหตุผลจะยุ่งกับคะแนนของห้องนั้นที่สุด
-- ถ้าห้องยังไม่ผูกครูประจำชั้นด้วย ก็ให้ฝ่ายวิชาการจัดการ ไม่ใช่เปิดให้ทุกคน
-- (หลักเดียวกับ app_is_homeroom_teacher_of ใน 22_leave_requests.sql
--  ต่างกันตรงที่ตัวนั้นยอม fallback ให้ครูทุกคนเพื่อกันใบลาค้าง ซึ่งรับได้
--  เพราะใบลาที่อนุมัติผิดคนยังตามแก้ได้ ส่วนคะแนนที่ถูกลบทิ้งไม่มีให้ตามแก้)
-- ------------------------------------------------------------
create or replace function public.app_can_grade_subject(p_subject_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1
    from public.subjects s
    join public.class_rooms cr on cr.id = s.class_room_id
    where s.id = p_subject_id
      and (
        app_has_role('academic')
        or app_has_role('sysadmin')
        or (app_has_role('teacher') and s.teacher_user_id = app_current_user_id())
        or (
          app_has_role('teacher')
          and s.teacher_user_id is null
          and cr.homeroom_teacher_id = app_current_user_id()
        )
      )
  );
$fn$;

comment on function public.app_can_grade_subject(uuid) is
  'true เมื่อผู้เรียกมีสิทธิ์กรอก/แก้คะแนนของรายวิชานี้ — ฝ่ายวิชาการได้ทุกวิชา ครูได้วิชาตัวเอง ส่วนวิชาที่ยังไม่ระบุครูได้เฉพาะครูประจำชั้นของห้องนั้น';

grant execute on function public.app_can_grade_subject(uuid) to authenticated;
revoke all on function public.app_can_grade_subject(uuid) from anon;
revoke execute on function public.app_can_grade_subject(uuid) from public;

grant execute on function public.app_norm_teacher_name(text) to authenticated;
revoke all on function public.app_norm_teacher_name(text) from anon;
revoke execute on function public.app_norm_teacher_name(text) from public;

-- ============================================================
-- ตรวจผล — รายการที่ต้องผูกมือ
--
-- แถวที่ขึ้นมาคือวิชาที่ยัง "ไม่มีใครกรอกคะแนนได้เลย" ถ้าห้องนั้นไม่มีครูประจำชั้น
-- หรือ "ครูประจำชั้นกรอกได้คนเดียว" ถ้ามี — ทั้งสองแบบต้องให้ฝ่ายวิชาการผูกครูจริง
-- ============================================================
select
  cr.level || '/' || cr.room_no                      as ห้อง,
  s.name                                             as รายวิชา,
  coalesce(nullif(s.teacher_name, ''), '— ไม่ระบุ —') as ชื่อครูในตารางสอน,
  case when cr.homeroom_teacher_id is null
       then 'ไม่มีใครกรอกได้'
       else 'ครูประจำชั้นกรอกได้คนเดียว'
  end                                                as สถานะตอนนี้
from public.subjects s
join public.class_rooms cr on cr.id = s.class_room_id
where s.teacher_user_id is null
  and s.is_active
order by cr.level, cr.room_no, s.sort_order, s.name;
