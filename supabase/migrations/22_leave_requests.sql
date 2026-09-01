-- ============================================================
-- 22_leave_requests.sql — ระบบใบลาจริง อนุมัติ 2 ขั้น (ครูประจำชั้น -> ฝ่ายวิชาการ)
--
-- ปัญหาที่แก้:
--   ฟอร์ม "ยื่นใบลา" ของนักเรียน (StudentHome.jsx) และโมดัล "อนุมัติใบลา" ของครู
--   (TeacherHome.jsx) ตอนนี้เป็นของปลอมทั้งหมด — เขียน/อ่านผ่าน localStorage
--   (key sbac_leave_requests) เห็นกันแค่เครื่องเดียว ไม่มีการอนุมัติหลายขั้น
--   และนักเรียนไม่ได้รับการแจ้งเตือนอะไรเลยเมื่อสถานะเปลี่ยน
--
-- Workflow ที่ต้องการ: นักเรียนยื่น -> ครูประจำชั้นอนุมัติ -> ฝ่ายวิชาการอนุมัติซ้ำ ->
--   แจ้งเตือนนักเรียนทันทีทุกครั้งที่สถานะเปลี่ยน (อนุมัติ/ไม่อนุมัติ ทั้งสองขั้น)
--
-- การตัดสินใจที่ผู้ใช้ยืนยันแล้ว:
--   1) ผู้อนุมัติขั้นที่ 2 = role 'academic' ที่มีอยู่แล้ว (ไม่สร้าง role ใหม่)
--   2) เพิ่มคอลัมน์ผูก "ครูประจำชั้น" ต่อห้องเรียนใน class_rooms — ฝ่ายวิชาการ/แอดมิน
--      เป็นคนกำหนด (ยังไม่เคยมีการผูกครูกับห้องมาก่อนเลยในระบบนี้)
--
-- ยึดโครงเดิม: public.users(id uuid) + app_current_user_id()/app_has_role() ที่มีอยู่แล้ว
-- รันซ้ำได้ทั้งไฟล์
-- ============================================================

-- ============================================================
-- 1) ผูกครูประจำชั้นเข้ากับห้องเรียน
-- ============================================================
alter table public.class_rooms
  add column if not exists homeroom_teacher_id uuid references public.users(id) on delete set null;

comment on column public.class_rooms.homeroom_teacher_id is
  'ครูประจำชั้นของห้องนี้ — กำหนดโดยฝ่ายวิชาการ/แอดมินผ่าน set_homeroom_teacher() เท่านั้น null = ยังไม่กำหนด (ระบบจะให้ครูคนไหนก็ได้ของ role teacher อนุมัติใบลาขั้นที่ 1 แทนไปก่อน กันคำขอค้าง)';

-- ============================================================
-- 2) ใครจัดการงานฝ่ายวิชาการได้บ้าง (กำหนดครูประจำชั้น, อนุมัติใบลาขั้น 2)
-- ============================================================
create or replace function public.app_is_academic_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select app_has_role('academic') or app_has_role('sysadmin');
$$;

comment on function public.app_is_academic_staff() is
  'true เมื่อผู้เรียกมี role academic หรือ sysadmin — ใช้กำหนดสิทธิ์งานบริหารระดับวิทยาลัย เช่น ผูกครูประจำชั้น และอนุมัติใบลาขั้นสุดท้าย';

grant execute on function public.app_is_academic_staff() to authenticated;
revoke all on function public.app_is_academic_staff() from anon;

-- ============================================================
-- 3) ใครคือครูประจำชั้นของนักเรียนคนหนึ่ง (รวม fallback ห้องที่ยังไม่ผูกใคร)
-- ============================================================
create or replace function public.app_is_homeroom_teacher_of(p_student_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.student_profiles sp
    join public.class_rooms cr on cr.id = sp.class_room_id
    where sp.user_id = p_student_user_id
      and (
        cr.homeroom_teacher_id = app_current_user_id()
        or (cr.homeroom_teacher_id is null and app_has_role('teacher'))
      )
  );
$$;

comment on function public.app_is_homeroom_teacher_of(uuid) is
  'true เมื่อผู้เรียกเป็นครูประจำชั้นของนักเรียนคนนี้ — ถ้าห้องนั้นยังไม่ผูกครูประจำชั้นไว้ (homeroom_teacher_id is null) จะยอมให้ role teacher คนไหนก็ได้อนุมัติแทนไปก่อน กันใบลาค้างเพราะแอดมินยังตั้งค่าไม่ครบ';

grant execute on function public.app_is_homeroom_teacher_of(uuid) to authenticated;
revoke all on function public.app_is_homeroom_teacher_of(uuid) from anon;

-- ============================================================
-- 4) RPC: ผูก/เปลี่ยนครูประจำชั้น
-- ============================================================
create or replace function public.set_homeroom_teacher(
  p_class_room_id bigint,
  p_teacher_user_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not app_is_academic_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_teacher_user_id is not null and not exists (
    select 1 from public.user_roles where user_id = p_teacher_user_id and role = 'teacher'
  ) then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_TEACHER');
  end if;

  update public.class_rooms set homeroom_teacher_id = p_teacher_user_id where id = p_class_room_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'CLASSROOM_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true);
end $$;

comment on function public.set_homeroom_teacher(bigint, uuid) is
  'ผูก/ถอดครูประจำชั้นของห้องเรียนหนึ่ง (role academic/sysadmin เท่านั้น) — ส่ง p_teacher_user_id เป็น null เพื่อถอด';

grant execute on function public.set_homeroom_teacher(bigint, uuid) to authenticated;
revoke all on function public.set_homeroom_teacher(bigint, uuid) from anon;

-- ============================================================
-- 5) RPC: รายชื่อห้องเรียนพร้อมครูประจำชั้น + รายชื่อครูทั้งหมด — สำหรับหน้าจัดการของฝ่ายวิชาการ
-- ============================================================
create or replace function public.list_classrooms_with_homeroom()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', cr.id,
    'label', cr.level || ' ห้อง ' || cr.room_no,
    'homeroom_teacher_id', cr.homeroom_teacher_id,
    'homeroom_teacher_name', t.full_name
  ) order by cr.level, cr.room_no), '[]'::jsonb)
  from public.class_rooms cr
  left join public.users t on t.id = cr.homeroom_teacher_id;
$$;

create or replace function public.list_teachers()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', u.id, 'full_name', u.full_name) order by u.full_name), '[]'::jsonb)
  from public.users u
  join public.user_roles ur on ur.user_id = u.id and ur.role = 'teacher';
$$;

comment on function public.list_classrooms_with_homeroom() is
  'รายชื่อห้องเรียนทั้งหมดพร้อมครูประจำชั้นปัจจุบัน (role academic/sysadmin เท่านั้น) — ใช้กับหน้าจัดการครูประจำชั้น';
comment on function public.list_teachers() is
  'รายชื่อครูทั้งหมด (role academic/sysadmin เท่านั้น) — ใช้เป็นตัวเลือกตอนกำหนดครูประจำชั้น';

grant execute on function public.list_classrooms_with_homeroom() to authenticated;
grant execute on function public.list_teachers() to authenticated;
revoke all on function public.list_classrooms_with_homeroom() from anon;
revoke all on function public.list_teachers() from anon;

-- ป้องกันการเรียกดูข้อมูลครูทั้งวิทยาลัยโดยไม่มีสิทธิ์ (เช็คซ้ำในฟังก์ชันเองก็จริง แต่ใส่ไว้
-- อีกชั้นเป็น defense-in-depth เผื่อมีคนแก้ language sql เป็น security invoker ทีหลังโดยไม่ตั้งใจ)
revoke execute on function public.list_classrooms_with_homeroom() from public;
revoke execute on function public.list_teachers() from public;

-- ============================================================
-- 6) ตาราง leave_requests
-- ============================================================
create table if not exists public.leave_requests (
  id                 uuid primary key default gen_random_uuid(),

  student_user_id    uuid not null default app_current_user_id()
                       references public.users(id) on delete cascade,

  leave_type         text not null,
  start_date         date not null,
  end_date           date,
  reason             text not null,

  status             text not null default 'pending_teacher',

  teacher_user_id    uuid references public.users(id),
  teacher_decided_at timestamptz,

  academic_user_id    uuid references public.users(id),
  academic_decided_at timestamptz,

  rejection_reason   text,

  created_at         timestamptz not null default now(),

  constraint leave_requests_type_valid check (leave_type in ('sick', 'personal', 'activity', 'other')),
  constraint leave_requests_status_valid check (
    status in ('pending_teacher', 'pending_academic', 'approved', 'rejected_by_teacher', 'rejected_by_academic')
  ),
  constraint leave_requests_reason_not_blank check (char_length(trim(reason)) > 0),
  constraint leave_requests_dates_valid check (end_date is null or end_date >= start_date)
);

create index if not exists leave_requests_student_idx on public.leave_requests (student_user_id, created_at desc);
create index if not exists leave_requests_pending_teacher_idx on public.leave_requests (created_at) where status = 'pending_teacher';
create index if not exists leave_requests_pending_academic_idx on public.leave_requests (created_at) where status = 'pending_academic';

comment on table public.leave_requests is
  'ใบลาของนักเรียน อนุมัติ 2 ขั้น: ครูประจำชั้น (pending_teacher -> pending_academic) แล้วฝ่ายวิชาการ (pending_academic -> approved) เขียนได้ทางเดียวผ่าน RPC เท่านั้น';

alter table public.leave_requests enable row level security;

drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests
  for select
  using (
    student_user_id = app_current_user_id()
    or app_is_academic_staff()
    or app_is_homeroom_teacher_of(student_user_id)
    or teacher_user_id = app_current_user_id()
  );

-- ไม่มี policy insert/update ให้ authenticated เลย — เขียนได้ทางเดียวผ่าน RPC ด้านล่างเท่านั้น
grant select on public.leave_requests to authenticated;
revoke all on public.leave_requests from anon;

-- ============================================================
-- 7) RPC: นักเรียนยื่นใบลา
-- ============================================================
create or replace function public.submit_leave_request(
  p_leave_type text,
  p_start_date date,
  p_end_date   date,
  p_reason     text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me      uuid := app_current_user_id();
  v_reason  text := trim(coalesce(p_reason, ''));
  v_id      uuid;
begin
  if not exists (select 1 from public.student_profiles where user_id = v_me) then
    return jsonb_build_object('ok', false, 'error', 'STUDENT_ONLY');
  end if;

  if p_leave_type not in ('sick', 'personal', 'activity', 'other') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_TYPE');
  end if;

  if p_start_date is null then
    return jsonb_build_object('ok', false, 'error', 'START_DATE_REQUIRED');
  end if;

  if char_length(v_reason) = 0 then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;

  insert into public.leave_requests (student_user_id, leave_type, start_date, end_date, reason)
  values (v_me, p_leave_type, p_start_date, p_end_date, v_reason)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

comment on function public.submit_leave_request(text, date, date, text) is
  'นักเรียนยื่นใบลาใหม่ — สถานะเริ่มต้น pending_teacher เสมอ (แก้จาก client เป็นค่าอื่นไม่ได้)';

grant execute on function public.submit_leave_request(text, date, date, text) to authenticated;
revoke all on function public.submit_leave_request(text, date, date, text) from anon;

-- ============================================================
-- 8) RPC: ครูประจำชั้นตัดสินใจ (ขั้นที่ 1)
-- ============================================================
create or replace function public.teacher_decide_leave_request(
  p_id      uuid,
  p_approve boolean,
  p_reason  text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_req   public.leave_requests%rowtype;
  v_me    uuid := app_current_user_id();
  v_title text;
  v_body  text;
begin
  select * into v_req from public.leave_requests where id = p_id;

  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if v_req.status <> 'pending_teacher' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REVIEWED');
  end if;

  if not (app_is_homeroom_teacher_of(v_req.student_user_id) or app_has_role('sysadmin')) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_approve then
    update public.leave_requests set
      status = 'pending_academic',
      teacher_user_id = v_me,
      teacher_decided_at = now()
    where id = p_id;

    v_title := '📝 ครูประจำชั้นอนุมัติใบลาแล้ว';
    v_body  := 'รอฝ่ายวิชาการอนุมัติอีกขั้นหนึ่ง';
  else
    update public.leave_requests set
      status = 'rejected_by_teacher',
      teacher_user_id = v_me,
      teacher_decided_at = now(),
      rejection_reason = p_reason
    where id = p_id;

    v_title := '❌ ครูประจำชั้นไม่อนุมัติใบลา';
    v_body  := coalesce(nullif(trim(p_reason), ''), 'กรุณาติดต่อครูประจำชั้นเพื่อสอบถามรายละเอียด');
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (v_req.student_user_id, 'leave_' || (case when p_approve then 'teacher_approved' else 'rejected' end),
          v_title, v_body, jsonb_build_object('leave_id', p_id));

  return jsonb_build_object('ok', true);
end $$;

comment on function public.teacher_decide_leave_request(uuid, boolean, text) is
  'ครูประจำชั้นอนุมัติ/ไม่อนุมัติใบลาขั้นที่ 1 (หรือ sysadmin override) — อนุมัติแล้วสถานะไปรอฝ่ายวิชาการ ไม่อนุมัติจบเลย ทั้งสองแบบแจ้งเตือนนักเรียนทันที';

grant execute on function public.teacher_decide_leave_request(uuid, boolean, text) to authenticated;
revoke all on function public.teacher_decide_leave_request(uuid, boolean, text) from anon;

-- ============================================================
-- 9) RPC: ฝ่ายวิชาการตัดสินใจ (ขั้นที่ 2 — ขั้นสุดท้าย)
-- ============================================================
create or replace function public.academic_decide_leave_request(
  p_id      uuid,
  p_approve boolean,
  p_reason  text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_req   public.leave_requests%rowtype;
  v_me    uuid := app_current_user_id();
  v_title text;
  v_body  text;
begin
  if not app_is_academic_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into v_req from public.leave_requests where id = p_id;

  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if v_req.status <> 'pending_academic' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REVIEWED');
  end if;

  if p_approve then
    update public.leave_requests set
      status = 'approved',
      academic_user_id = v_me,
      academic_decided_at = now()
    where id = p_id;

    v_title := '✅ ใบลาอนุมัติแล้ว';
    v_body  := 'ใบลาของคุณได้รับการอนุมัติครบทุกขั้นตอนแล้ว';
  else
    update public.leave_requests set
      status = 'rejected_by_academic',
      academic_user_id = v_me,
      academic_decided_at = now(),
      rejection_reason = p_reason
    where id = p_id;

    v_title := '❌ ฝ่ายวิชาการไม่อนุมัติใบลา';
    v_body  := coalesce(nullif(trim(p_reason), ''), 'กรุณาติดต่อฝ่ายวิชาการเพื่อสอบถามรายละเอียด');
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (v_req.student_user_id, 'leave_' || (case when p_approve then 'approved' else 'rejected' end),
          v_title, v_body, jsonb_build_object('leave_id', p_id));

  return jsonb_build_object('ok', true);
end $$;

comment on function public.academic_decide_leave_request(uuid, boolean, text) is
  'ฝ่ายวิชาการอนุมัติ/ไม่อนุมัติใบลาขั้นสุดท้าย (role academic/sysadmin เท่านั้น) — แจ้งเตือนนักเรียนทันทีทั้งสองแบบ';

grant execute on function public.academic_decide_leave_request(uuid, boolean, text) to authenticated;
revoke all on function public.academic_decide_leave_request(uuid, boolean, text) from anon;

-- ============================================================
-- 10) RPC: รายการใบลา — ใช้ร่วมกัน 3 มุมมอง (นักเรียน/ครู/ฝ่ายวิชาการ)
-- ============================================================
create or replace function public.list_leave_requests(p_status_filter text default null, p_limit integer default 100)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me            uuid := app_current_user_id();
  v_is_academic   boolean := app_is_academic_staff();
  v_result        jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(l)::jsonb order by l.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      lr.id,
      lr.student_user_id,
      s.full_name                                    as student_name,
      sp.student_code,
      case when cr.id is null then null
           else cr.level || ' ห้อง ' || cr.room_no end as class_label,
      lr.leave_type,
      lr.start_date,
      lr.end_date,
      lr.reason,
      lr.status,
      lr.rejection_reason,
      lr.created_at,
      coalesce(t.full_name, null)                    as teacher_name,
      lr.teacher_decided_at,
      coalesce(a.full_name, null)                    as academic_name,
      lr.academic_decided_at
    from public.leave_requests lr
    join public.users s on s.id = lr.student_user_id
    left join public.student_profiles sp on sp.user_id = lr.student_user_id
    left join public.class_rooms cr on cr.id = sp.class_room_id
    left join public.users t on t.id = lr.teacher_user_id
    left join public.users a on a.id = lr.academic_user_id
    where (p_status_filter is null or lr.status = p_status_filter)
      and (
        lr.student_user_id = v_me
        or v_is_academic
        or app_is_homeroom_teacher_of(lr.student_user_id)
        or lr.teacher_user_id = v_me
      )
    order by lr.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
  ) l;

  return jsonb_build_object('ok', true, 'requests', v_result);
end $$;

comment on function public.list_leave_requests(text, integer) is
  'รายการใบลา กรองสิทธิ์ให้อัตโนมัติตามผู้เรียก: นักเรียนเห็นของตัวเอง, ครูประจำชั้นเห็นของนักเรียนในห้องตน, ฝ่ายวิชาการ/แอดมินเห็นทั้งหมด — ส่ง p_status_filter เพื่อกรองสถานะ เช่น pending_teacher/pending_academic';

grant execute on function public.list_leave_requests(text, integer) to authenticated;
revoke all on function public.list_leave_requests(text, integer) from anon;

-- ============================================================
-- 11) เปิด Realtime ให้ leave_requests (แจ้งเตือนหลักอยู่ในตาราง notifications
--      อยู่แล้ว — อันนี้เสริมให้หน้ารออนุมัติของครู/ฝ่ายวิชาการ รีเฟรชคิวเองแบบเรียลไทม์)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.leave_requests';
    raise notice 'เพิ่ม public.leave_requests เข้า supabase_realtime แล้ว';
  else
    raise notice 'public.leave_requests อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป';
  end if;
exception when others then
  raise warning 'เพิ่ม leave_requests เข้า realtime ไม่สำเร็จ: % — ไปเปิดเองที่ Database > Replication ได้', sqlerrm;
end $$;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  (select count(*) from public.leave_requests)                                    as ใบลาทั้งหมด,
  (select count(*) from public.leave_requests where status = 'pending_teacher')   as รอครูประจำชั้น,
  (select count(*) from public.leave_requests where status = 'pending_academic')  as รอฝ่ายวิชาการ,
  (select count(*) from public.class_rooms where homeroom_teacher_id is not null) as ห้องที่ผูกครูประจำชั้นแล้ว,
  (select count(*) from public.class_rooms)                                       as ห้องทั้งหมด;
