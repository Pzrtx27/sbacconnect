-- ============================================================
-- 21_behavior_crud_and_academic.sql — แก้ไข/ลบรายการตัดคะแนน (soft delete + audit)
--                                       + workflow ฝ่ายวิชาการ (หมวดหมู่ -> ห้อง -> นักเรียน)
--
-- ต่อยอดจาก 20_behavior_and_notifications.sql — รันไฟล์นั้นก่อนเสมอ
--
-- สิ่งที่ไฟล์นี้ทำ:
--   1) เพิ่มคอลัมน์ soft-delete + edit-tracking ให้ behavior_logs (ไม่ hard delete
--      ข้อมูลวินัยนักเรียนเด็ดขาด — ต้องตรวจสอบย้อนหลังได้เสมอว่าใครแก้/ลบอะไรเมื่อไหร่)
--   2) ตาราง behavior_log_edits — audit log เก็บ before/after ทุกครั้งที่แก้ไข/ลบ
--   3) RPC update_behavior_log / delete_behavior_log
--      สิทธิ์: ครูผู้บันทึกรายการนั้นเอง หรือ role academic/sysadmin เท่านั้น
--      (ครูคนอื่นแก้/ลบรายการของเพื่อนครูไม่ได้ — กันแก้ประวัติวินัยของนักเรียนที่ตัวเองไม่ได้บันทึก)
--   4) RPC list_behavior_logs — ครูเห็นเฉพาะรายการที่ตัวเองบันทึก, academic/sysadmin เห็นทั้งหมด
--   5) RPC list_students_by_classroom — endpoint ใหม่สำหรับ workflow แบบ
--      "Step 1 หมวดหมู่ -> Step 2 ห้องเรียน -> Step 3 เลือกนักเรียน" ของฝ่ายวิชาการ
--      (หมายเหตุ: role academic มีสิทธิ์ตัดคะแนนอยู่แล้วตั้งแต่ 20_...sql ผ่าน
--       app_is_teaching_staff() ซึ่งรวม 'academic' ไว้แล้ว — ไม่ต้องเพิ่ม permission ใหม่
--       แค่ต้องมี endpoint ให้หน้าเว็บ "เรียกดูตามห้อง" แทนการค้นด้วยชื่อ/รหัสแบบของครู)
--
-- รันซ้ำได้ทั้งไฟล์
-- ============================================================

-- ============================================================
-- 1) คอลัมน์ soft-delete + edit-tracking
-- ============================================================
alter table public.behavior_logs
  add column if not exists is_deleted    boolean not null default false,
  add column if not exists deleted_at    timestamptz,
  add column if not exists deleted_by    uuid references public.users(id),
  add column if not exists delete_reason text,
  add column if not exists updated_at    timestamptz,
  add column if not exists updated_by    uuid references public.users(id);

create index if not exists behavior_logs_active_idx
  on public.behavior_logs (student_user_id, created_at desc) where not is_deleted;

-- ============================================================
-- 2) ตาราง audit — before/after เต็มทุกครั้งที่แก้ไข/ลบ
-- ============================================================
create table if not exists public.behavior_log_edits (
  id          uuid primary key default gen_random_uuid(),
  log_id      uuid not null references public.behavior_logs(id) on delete cascade,
  action      text not null,
  changed_by  uuid not null default app_current_user_id() references public.users(id),
  changed_at  timestamptz not null default now(),
  before_data jsonb not null,
  after_data  jsonb not null,
  reason      text,

  constraint behavior_log_edits_action_valid check (action in ('update', 'delete'))
);

create index if not exists behavior_log_edits_log_idx on public.behavior_log_edits (log_id, changed_at desc);

comment on table public.behavior_log_edits is
  'ประวัติการแก้ไข/ลบ behavior_logs ทุกครั้ง (before/after เต็ม) — ไม่มี policy insert/update/delete ให้ใครเลยแม้แต่แอดมิน เขียนได้ทางเดียวผ่าน update_behavior_log()/delete_behavior_log() เท่านั้น จึงลบหลักฐานการแก้ไขทิ้งเองไม่ได้';

alter table public.behavior_log_edits enable row level security;

drop policy if exists behavior_log_edits_read on public.behavior_log_edits;
create policy behavior_log_edits_read on public.behavior_log_edits
  for select
  using (app_is_teaching_staff());

grant select on public.behavior_log_edits to authenticated;
revoke all on public.behavior_log_edits from anon;

-- ============================================================
-- 3) RLS select ของ behavior_logs — ซ่อนรายการที่ถูกลบจากทุกคน (ยกเว้นดูผ่าน audit log)
-- ============================================================
drop policy if exists behavior_logs_read on public.behavior_logs;
create policy behavior_logs_read on public.behavior_logs
  for select
  using (
    not is_deleted
    and (
      student_user_id = app_current_user_id()
      or teacher_user_id = app_current_user_id()
      or app_is_teaching_staff()
    )
  );

-- ============================================================
-- 4) behavior_score / my_behavior_logs ต้องไม่นับรายการที่ถูกลบ
-- ============================================================
create or replace function public.behavior_score(p_student_user_id uuid)
returns integer
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_student_user_id <> app_current_user_id() and not app_is_teaching_staff() then
    return null;
  end if;

  return greatest(0, least(100, 100 + coalesce((
    select sum(case when action_type = 'add' then points else -points end)
    from public.behavior_logs
    where student_user_id = p_student_user_id
      and not is_deleted
  ), 0)))::integer;
end $$;

create or replace function public.my_behavior_logs(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me     uuid := app_current_user_id();
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(l)::jsonb order by l.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      bl.id,
      bl.action_type,
      bl.reason,
      bl.points,
      bl.created_at,
      coalesce(t.full_name, 'ไม่ทราบชื่อ') as teacher_name
    from public.behavior_logs bl
    left join public.users t on t.id = bl.teacher_user_id
    where bl.student_user_id = v_me
      and not bl.is_deleted
    order by bl.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) l;

  return jsonb_build_object('ok', true, 'logs', v_result, 'score', public.behavior_score(v_me));
end $$;

-- ============================================================
-- 5) ใครแก้ไข/ลบรายการนี้ได้บ้าง
-- ============================================================
create or replace function public.app_can_edit_behavior_log(p_teacher_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_teacher_user_id = app_current_user_id()
      or app_has_role('academic')
      or app_has_role('sysadmin');
$$;

comment on function public.app_can_edit_behavior_log(uuid) is
  'true เมื่อผู้เรียกคือครูผู้บันทึกรายการนั้นเอง หรือมี role academic/sysadmin — role teacher ทั่วไปแก้/ลบรายการของเพื่อนครูไม่ได้';

grant execute on function public.app_can_edit_behavior_log(uuid) to authenticated;
revoke all on function public.app_can_edit_behavior_log(uuid) from anon;

-- ============================================================
-- 6) RPC: แก้ไขรายการ
-- ============================================================
create or replace function public.update_behavior_log(
  p_log_id      uuid,
  p_category_id uuid,
  p_reason      text,
  p_points      integer,
  p_action_type text,
  p_edit_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_log       public.behavior_logs%rowtype;
  v_before    jsonb;
  v_reason    text := trim(coalesce(p_reason, ''));
  v_new_score integer;
begin
  select * into v_log from public.behavior_logs where id = p_log_id and not is_deleted;

  if v_log.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if not app_can_edit_behavior_log(v_log.teacher_user_id) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_action_type is null or p_action_type not in ('add', 'deduct') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ACTION_TYPE');
  end if;

  if p_points is null or p_points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_POINTS');
  end if;

  if char_length(v_reason) = 0 then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;

  v_before := to_jsonb(v_log);

  update public.behavior_logs set
    category_id = p_category_id,
    reason      = v_reason,
    points      = p_points,
    action_type = p_action_type,
    updated_at  = now(),
    updated_by  = app_current_user_id()
  where id = p_log_id
  returning * into v_log;

  insert into public.behavior_log_edits (log_id, action, before_data, after_data, reason)
  values (p_log_id, 'update', v_before, to_jsonb(v_log), p_edit_reason);

  v_new_score := public.behavior_score(v_log.student_user_id);

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_log.student_user_id,
    'behavior_edited',
    '✏️ รายการพฤติกรรมถูกแก้ไข',
    v_reason,
    jsonb_build_object('log_id', p_log_id, 'points', v_log.points, 'action_type', v_log.action_type, 'new_score', v_new_score)
  );

  return jsonb_build_object('ok', true, 'new_score', v_new_score);
end $$;

comment on function public.update_behavior_log(uuid, uuid, text, integer, text, text) is
  'แก้ไขรายการตัด/เพิ่มคะแนน (ครูผู้บันทึกเองหรือ academic/sysadmin เท่านั้น) — บันทึก before/after ลง behavior_log_edits และแจ้งเตือนนักเรียนทุกครั้ง';

grant execute on function public.update_behavior_log(uuid, uuid, text, integer, text, text) to authenticated;
revoke all on function public.update_behavior_log(uuid, uuid, text, integer, text, text) from anon;

-- ============================================================
-- 7) RPC: ลบ (soft delete) รายการ
-- ============================================================
create or replace function public.delete_behavior_log(
  p_log_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_log       public.behavior_logs%rowtype;
  v_before    jsonb;
  v_new_score integer;
begin
  select * into v_log from public.behavior_logs where id = p_log_id and not is_deleted;

  if v_log.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if not app_can_edit_behavior_log(v_log.teacher_user_id) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  v_before := to_jsonb(v_log);

  update public.behavior_logs set
    is_deleted    = true,
    deleted_at    = now(),
    deleted_by    = app_current_user_id(),
    delete_reason = p_reason
  where id = p_log_id
  returning * into v_log;

  insert into public.behavior_log_edits (log_id, action, before_data, after_data, reason)
  values (p_log_id, 'delete', v_before, to_jsonb(v_log), p_reason);

  v_new_score := public.behavior_score(v_log.student_user_id);

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_log.student_user_id,
    'behavior_deleted',
    '🗑️ รายการพฤติกรรมถูกยกเลิก',
    coalesce(nullif(trim(p_reason), ''), 'รายการ "' || v_log.reason || '" ถูกยกเลิกแล้ว'),
    jsonb_build_object('log_id', p_log_id, 'new_score', v_new_score)
  );

  return jsonb_build_object('ok', true, 'new_score', v_new_score);
end $$;

comment on function public.delete_behavior_log(uuid, text) is
  'ลบรายการแบบ soft delete (ครูผู้บันทึกเองหรือ academic/sysadmin เท่านั้น) — ไม่ hard delete ข้อมูลวินัยเด็ดขาด บันทึกลง behavior_log_edits และแจ้งเตือนนักเรียนทุกครั้ง';

grant execute on function public.delete_behavior_log(uuid, text) to authenticated;
revoke all on function public.delete_behavior_log(uuid, text) from anon;

-- ============================================================
-- 8) RPC: รายการประวัติ — ครูเห็นเฉพาะของตัวเอง, academic/sysadmin เห็นทั้งหมด
-- ============================================================
create or replace function public.list_behavior_logs(
  p_student_user_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me          uuid := app_current_user_id();
  v_is_overseer boolean := app_has_role('academic') or app_has_role('sysadmin');
  v_result      jsonb;
begin
  if not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select coalesce(jsonb_agg(row_to_json(l)::jsonb order by l.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      bl.id,
      bl.student_user_id,
      s.full_name                                  as student_name,
      sp.student_code,
      bl.action_type,
      bl.reason,
      bl.points,
      bl.created_at,
      bl.updated_at,
      bl.teacher_user_id,
      coalesce(t.full_name, 'ไม่ทราบชื่อ')            as teacher_name,
      (bl.teacher_user_id = v_me or v_is_overseer)  as can_edit
    from public.behavior_logs bl
    join public.users s on s.id = bl.student_user_id
    left join public.student_profiles sp on sp.user_id = bl.student_user_id
    left join public.users t on t.id = bl.teacher_user_id
    where not bl.is_deleted
      and (p_student_user_id is null or bl.student_user_id = p_student_user_id)
      and (v_is_overseer or bl.teacher_user_id = v_me)
    order by bl.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) l;

  return jsonb_build_object('ok', true, 'logs', v_result);
end $$;

comment on function public.list_behavior_logs(uuid, integer) is
  'รายการตัด/เพิ่มคะแนน — role teacher เห็นเฉพาะรายการที่ตัวเองบันทึก, role academic/sysadmin เห็นทั้งหมดของทุกครู (ใช้ทั้งฝั่ง "ประวัติของฉัน" ของครู และหน้าจัดการภาพรวมของฝ่ายวิชาการ) ส่ง p_student_user_id เพื่อกรองเฉพาะนักเรียนคนเดียว';

grant execute on function public.list_behavior_logs(uuid, integer) to authenticated;
revoke all on function public.list_behavior_logs(uuid, integer) from anon;

-- ============================================================
-- 9) RPC: รายชื่อนักเรียนในห้องเรียน — Step 3 ของ workflow ฝ่ายวิชาการ
-- ============================================================
create or replace function public.list_students_by_classroom(p_class_room_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_class_room_id is null then
    return jsonb_build_object('ok', true, 'students', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.full_name), '[]'::jsonb)
    into v_result
  from (
    select
      u.id                          as user_id,
      u.full_name,
      sp.student_code,
      public.behavior_score(u.id)   as score
    from public.student_profiles sp
    join public.users u on u.id = sp.user_id
    where sp.class_room_id = p_class_room_id
    order by u.full_name
  ) s;

  return jsonb_build_object('ok', true, 'students', v_result);
end $$;

comment on function public.list_students_by_classroom(bigint) is
  'รายชื่อนักเรียนทั้งหมดในห้องเรียนหนึ่ง (role teacher/academic/sysadmin) — ใช้กับ workflow Step 1 หมวดหมู่ -> Step 2 ห้องเรียน -> Step 3 เลือกนักเรียน ของฝ่ายวิชาการ (list_class_rooms() ของ 14_event_rooms.sql ใช้เป็น Step 2)';

grant execute on function public.list_students_by_classroom(bigint) to authenticated;
revoke all on function public.list_students_by_classroom(bigint) from anon;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  (select count(*) from public.behavior_logs where not is_deleted)  as รายการที่ยังอยู่,
  (select count(*) from public.behavior_logs where is_deleted)      as รายการที่ถูกลบ,
  (select count(*) from public.behavior_log_edits)                  as จำนวนการแก้ไขทั้งหมด;
