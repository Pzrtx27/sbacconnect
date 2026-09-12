-- ============================================================
-- 41_homeroom_attendance.sql — เช็คชื่อเข้าแถวโฮมรูมของจริง + แจ้งเตือนนักเรียน
--
-- ของเดิม (src/pages/teacher/TeacherHome.jsx): รายชื่อเป็น mock 3 คนที่ hardcode ไว้
-- และผลการเช็คชื่อเขียนลง localStorage ของเครื่องครูเท่านั้น ไม่ได้แตะฐานข้อมูลเลย
-- เปลี่ยนเครื่อง/ล้างแคชคือหาย นักเรียนไม่มีทางรู้ว่าถูกลงว่าขาดหรือสาย
--
-- ไฟล์นี้ทำสามอย่าง
--   1) ตาราง attendance_homeroom  — เก็บผลเช็คชื่อจริง หนึ่งคนหนึ่งวันหนึ่งแถว
--   2) RPC สำหรับครู               — ห้องที่ตัวเองเป็นครูประจำชั้น / รายชื่อนักเรียน / บันทึก
--   3) แจ้งเตือนนักเรียนอัตโนมัติ    — insert notifications ในธุรกรรมเดียวกับการบันทึก
--      (รูปแบบเดียวกับ submit_behavior_log ใน 20_behavior_and_notifications.sql
--       นักเรียนจะเห็นทันทีผ่าน Supabase Realtime ไม่ต้องรีเฟรช ดู useNotifications.js)
--
-- แจ้งเตือน "เฉพาะคนที่สถานะเปลี่ยน" เท่านั้น — ครูกดบันทึกซ้ำหรือแก้ของเด็กคนเดียว
-- แล้วกดบันทึกทั้งห้างใหม่ เด็กที่เหลือจะไม่โดนเด้งซ้ำ (เงื่อนไข where ใน on conflict)
--
-- รันซ้ำได้ / ต้องรัน 01_schema.sql, 02_functions.sql, 20_behavior_and_notifications.sql
-- และ 22_leave_requests.sql (คอลัมน์ class_rooms.homeroom_teacher_id) มาก่อน
-- ============================================================

-- ============================================================
-- 1) ตารางผลเช็คชื่อ
-- ============================================================
create table if not exists public.attendance_homeroom (
  id              bigint generated always as identity primary key,

  class_room_id   bigint not null references public.class_rooms(id) on delete cascade,
  student_user_id uuid   not null references public.users(id) on delete cascade,

  -- วันที่ตามเวลาไทยเสมอ ไม่ใช่ timezone ของเครื่องที่รัน (เซิร์ฟเวอร์ Supabase เป็น UTC
  -- ถ้าใช้ current_date เฉย ๆ การเช็คชื่อตอนเช้าจะยังถูกนับเป็นของเมื่อวาน)
  attend_date     date   not null default (now() at time zone 'Asia/Bangkok')::date,

  status          text   not null check (status in ('present', 'late', 'absent', 'leave')),

  -- ครูที่กดบันทึกครั้งล่าสุด — ใช้ตรวจสอบย้อนหลังเวลามีข้อโต้แย้งเรื่องการลงขาด
  teacher_user_id uuid   not null references public.users(id),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- หนึ่งคนหนึ่งวันมีสถานะเดียว — กดบันทึกซ้ำคือแก้ของเดิม ไม่ใช่เพิ่มแถวใหม่
  unique (student_user_id, attend_date)
);

create index if not exists attendance_homeroom_class_date_idx
  on public.attendance_homeroom (class_room_id, attend_date);

comment on table public.attendance_homeroom is
  'ผลเช็คชื่อเข้าแถวโฮมรูมรายวัน — เขียนได้ทางเดียวผ่าน save_homeroom_attendance() นักเรียนอ่านได้เฉพาะของตัวเอง';
comment on column public.attendance_homeroom.status is
  'present = มา / late = สาย / absent = ขาด / leave = ลา (ตรงกับปุ่มสี่ปุ่มในโมดัลเช็คชื่อของครู)';

alter table public.attendance_homeroom enable row level security;

-- นักเรียนเปิดดูประวัติการเข้าแถวของตัวเองได้ ครู/วิชาการอ่านผ่าน RPC security definer เท่านั้น
-- (ถ้าเปิด policy ให้ครูอ่านทั้งตาราง = ครูทุกคนเห็นสถานะเด็กทั้งวิทยาลัยโดยไม่จำเป็น)
drop policy if exists attendance_homeroom_read_own on public.attendance_homeroom;
create policy attendance_homeroom_read_own on public.attendance_homeroom
  for select
  to authenticated
  using (student_user_id = app_current_user_id());

grant select on public.attendance_homeroom to authenticated;
revoke insert, update, delete on public.attendance_homeroom from authenticated;
revoke all on public.attendance_homeroom from anon;

-- ============================================================
-- 2) ใครเช็คชื่อห้องนี้ได้
--
-- app_is_homeroom_teacher_of() ที่มีอยู่แล้วรับ "uuid ของนักเรียน" แต่ตอนเปิดโมดัล
-- เรายังไม่มีนักเรียนในมือ มีแค่ห้อง จึงต้องมีตัวที่ถามด้วย class_room_id
--
-- ยอมให้ครูคนไหนก็ได้เช็คชื่อห้องที่ "ยังไม่ผูกครูประจำชั้น" ด้วยเหตุผลเดียวกับใบลา
-- (22_leave_requests.sql) — กันฟีเจอร์ตายสนิทเพราะฝ่ายวิชาการยังตั้งค่าไม่ครบ
-- ============================================================
create or replace function public.app_can_take_attendance_of_class(p_class_room_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_is_academic_staff()
      or exists (
           select 1
           from public.class_rooms cr
           where cr.id = p_class_room_id
             and (
               cr.homeroom_teacher_id = app_current_user_id()
               or (cr.homeroom_teacher_id is null and app_has_role('teacher'))
             )
         );
$$;

comment on function public.app_can_take_attendance_of_class(bigint) is
  'true เมื่อผู้เรียกเช็คชื่อห้องนี้ได้ — ครูประจำชั้นของห้องนั้น, ครูคนไหนก็ได้ถ้าห้องยังไม่ผูกครูประจำชั้น, หรือฝ่ายวิชาการ/แอดมิน';

grant execute on function public.app_can_take_attendance_of_class(bigint) to authenticated;
revoke all on function public.app_can_take_attendance_of_class(bigint) from anon;

-- ============================================================
-- 3) ห้องที่ผู้เรียกเช็คชื่อได้ — ใช้ตั้งชื่อหัวโมดัลและทำตัวเลือกห้อง
--
-- ของเดิมหัวโมดัลเขียนตายตัวว่า "ปวช.3/6" ครูทุกคนจึงเห็นห้องเดียวกันหมด
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
               -- หน้าเว็บเอาไปขึ้นป้ายเตือนให้ไปผูกครูประจำชั้นให้เรียบร้อย
               'is_fallback',   x.is_fallback
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
           (select count(*) from public.student_profiles sp where sp.class_room_id = cr.id) as student_count
    from public.class_rooms cr
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
  'ห้องที่ผู้เรียกเช็คชื่อเข้าแถวได้ พร้อมจำนวนนักเรียน — ครูเห็นห้องที่ตัวเองเป็นครูประจำชั้น ฝ่ายวิชาการเห็นทุกห้อง';

grant execute on function public.my_homeroom_classes() to authenticated;
revoke all on function public.my_homeroom_classes() from anon;
revoke execute on function public.my_homeroom_classes() from public;

-- ============================================================
-- 4) รายชื่อนักเรียนในห้อง + สถานะที่เช็คไว้แล้วของวันนั้น
--
-- คืนสถานะเดิมมาด้วย เพื่อให้ครูเปิดโมดัลซ้ำแล้วเห็นของที่เช็คไปแล้วติ๊กค้างอยู่
-- (ของเดิมอ่านจาก localStorage ครูคนอื่นหรือเครื่องอื่นจึงไม่เห็นว่าเช็คไปแล้ว)
-- ============================================================
create or replace function public.homeroom_roster(
  p_class_room_id bigint,
  p_date          date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_date     date := coalesce(p_date, (now() at time zone 'Asia/Bangkok')::date);
  v_label    text;
  v_students jsonb;
begin
  if not app_can_take_attendance_of_class(p_class_room_id) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select cr.level || '/' || cr.room_no into v_label
  from public.class_rooms cr
  where cr.id = p_class_room_id;

  if v_label is null then
    return jsonb_build_object('ok', false, 'error', 'CLASS_NOT_FOUND');
  end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.student_code, s.full_name), '[]'::jsonb)
    into v_students
  from (
    select u.id           as user_id,
           u.full_name,
           sp.student_code,
           a.status                              -- null = ยังไม่ได้เช็คของวันนี้
    from public.student_profiles sp
    join public.users u on u.id = sp.user_id
    left join public.attendance_homeroom a
           on a.student_user_id = sp.user_id
          and a.attend_date     = v_date
    where sp.class_room_id = p_class_room_id
  ) s;

  return jsonb_build_object(
    'ok',            true,
    'class_room_id', p_class_room_id,
    'class_label',   v_label,
    'date',          v_date,
    'students',      v_students
  );
end $$;

comment on function public.homeroom_roster(bigint, date) is
  'รายชื่อนักเรียนในห้องพร้อมสถานะการเข้าแถวของวันที่ระบุ (ไม่ระบุ = วันนี้ตามเวลาไทย) — ใช้กับโมดัลเช็คชื่อของครู';

grant execute on function public.homeroom_roster(bigint, date) to authenticated;
revoke all on function public.homeroom_roster(bigint, date) from anon;
revoke execute on function public.homeroom_roster(bigint, date) from public;

-- ============================================================
-- 5) บันทึกผลเช็คชื่อ + แจ้งเตือนนักเรียน
--
-- p_entries รูปแบบ: [{"student_user_id": "uuid", "status": "present"}, ...]
-- ============================================================
create or replace function public.save_homeroom_attendance(
  p_class_room_id bigint,
  p_entries       jsonb,
  p_date          date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_today        date := (now() at time zone 'Asia/Bangkok')::date;
  v_date         date := coalesce(p_date, v_today);
  v_teacher      uuid := app_current_user_id();
  v_teacher_name text;
  v_label        text;
  v_date_th      text;
  v_total        int;
  v_valid        int;
  v_notified     int;
begin
  if not app_can_take_attendance_of_class(p_class_room_id) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'BAD_PAYLOAD');
  end if;

  -- เช็คชื่อล่วงหน้าไม่ได้ ย้อนหลังได้ (ครูลืมเช็ค/แก้ของเมื่อวาน)
  if v_date > v_today then
    return jsonb_build_object('ok', false, 'error', 'FUTURE_DATE');
  end if;

  select cr.level || '/' || cr.room_no into v_label
  from public.class_rooms cr
  where cr.id = p_class_room_id;

  if v_label is null then
    return jsonb_build_object('ok', false, 'error', 'CLASS_NOT_FOUND');
  end if;

  select count(*) into v_total from jsonb_array_elements(p_entries);

  if v_total = 0 then
    return jsonb_build_object('ok', false, 'error', 'EMPTY');
  end if;

  -- ทุกแถวต้องเป็นนักเรียน "ของห้องนี้" และสถานะต้องเป็นค่าที่รู้จัก
  -- กันการยิง RPC ตรง ๆ เพื่อลงขาดให้เด็กห้องอื่น
  select count(*) into v_valid
  from jsonb_array_elements(p_entries) e
  join public.student_profiles sp
    on sp.user_id       = (e->>'student_user_id')::uuid
   and sp.class_room_id = p_class_room_id
  where e->>'status' in ('present', 'late', 'absent', 'leave');

  if v_valid <> v_total then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ENTRY');
  end if;

  select u.full_name into v_teacher_name from public.users u where u.id = v_teacher;

  -- 12/09/2569 — ปีพุทธศักราชแบบเดียวกับที่ใช้เรียกภาคเรียนในสมุดคะแนน
  v_date_th := to_char(v_date, 'DD/MM/') || (extract(year from v_date)::int + 543)::text;

  with incoming as (
    -- distinct กันกรณีหน้าเว็บส่งนักเรียนคนเดียวมาสองแถว
    -- (on conflict จะ error ทันทีถ้าแถวเดียวกันถูกแตะสองครั้งในคำสั่งเดียว)
    select distinct on (student_user_id) student_user_id, status
    from (
      select (e->>'student_user_id')::uuid as student_user_id,
             e->>'status'                  as status
      from jsonb_array_elements(p_entries) e
    ) raw
    order by student_user_id
  ),
  saved as (
    insert into public.attendance_homeroom as ah
      (class_room_id, student_user_id, attend_date, status, teacher_user_id)
    select p_class_room_id, i.student_user_id, v_date, i.status, v_teacher
    from incoming i
    on conflict (student_user_id, attend_date) do update
      set status          = excluded.status,
          class_room_id   = excluded.class_room_id,
          teacher_user_id = excluded.teacher_user_id,
          updated_at      = now()
      -- แถวที่สถานะเหมือนเดิมจะไม่ถูก update และไม่ถูกส่งออกทาง returning
      -- = ไม่มีแจ้งเตือนซ้ำเวลาครูกดบันทึกรอบสอง
      where ah.status is distinct from excluded.status
    returning ah.student_user_id, ah.status
  )
  insert into public.notifications (user_id, type, title, body, data)
  select s.student_user_id,
         'attendance_' || s.status,
         case s.status
           when 'present' then '✅ เช็คชื่อเข้าแถว: มาเรียน'
           when 'late'    then '⏰ เช็คชื่อเข้าแถว: มาสาย'
           when 'absent'  then '❗ เช็คชื่อเข้าแถว: ขาดเรียน'
           else                '📝 เช็คชื่อเข้าแถว: ลา'
         end,
         'ห้อง ' || v_label || ' วันที่ ' || v_date_th ||
         ' — บันทึกโดย ' || coalesce(v_teacher_name, 'ครูประจำชั้น') ||
         case s.status
           when 'absent' then ' หากข้อมูลไม่ถูกต้องให้ติดต่อครูประจำชั้นทันที'
           when 'late'   then ' หากข้อมูลไม่ถูกต้องให้ติดต่อครูประจำชั้นทันที'
           else ''
         end,
         jsonb_build_object(
           'class_room_id', p_class_room_id,
           'class_label',   v_label,
           'attend_date',   v_date,
           'status',        s.status
         )
  from saved s;

  get diagnostics v_notified = row_count;

  return jsonb_build_object(
    'ok',          true,
    'saved',       v_total,
    'notified',    v_notified,   -- เฉพาะคนที่สถานะเปลี่ยนจากเดิม
    'date',        v_date,
    'class_label', v_label
  );
end $$;

comment on function public.save_homeroom_attendance(bigint, jsonb, date) is
  'บันทึกผลเช็คชื่อเข้าแถวทั้งห้อง (upsert รายวัน) แล้วสร้างแจ้งเตือนให้นักเรียนเฉพาะคนที่สถานะเปลี่ยน — ธุรกรรมเดียวกัน ถ้าแจ้งเตือนพังผลเช็คชื่อก็ไม่ถูกบันทึก';

grant execute on function public.save_homeroom_attendance(bigint, jsonb, date) to authenticated;
revoke all on function public.save_homeroom_attendance(bigint, jsonb, date) from anon;
revoke execute on function public.save_homeroom_attendance(bigint, jsonb, date) from public;

-- ============================================================
-- ตรวจผล — รันแล้วควรเห็นห้องของตัวเองพร้อมจำนวนนักเรียน
-- (รันใน SQL Editor จะได้ [] เพราะไม่ได้ล็อกอินเป็นครู ให้ไปดูผลจริงที่หน้าเว็บครู)
-- ============================================================
select cr.level || '/' || cr.room_no                  as ห้อง,
       coalesce(t.full_name, '— ยังไม่ได้กำหนด —')     as ครูประจำชั้น,
       count(sp.user_id)                              as จำนวนนักเรียน,
       count(a.id)                                    as เช็คชื่อแล้ววันนี้
  from public.class_rooms cr
  left join public.users t on t.id = cr.homeroom_teacher_id
  left join public.student_profiles sp on sp.class_room_id = cr.id
  left join public.attendance_homeroom a
         on a.student_user_id = sp.user_id
        and a.attend_date = (now() at time zone 'Asia/Bangkok')::date
 group by cr.id, cr.level, cr.room_no, t.full_name
 order by cr.level, cr.room_no;
