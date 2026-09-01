-- ============================================================
-- 23_repair_tickets.sql — ระบบแจ้งซ่อมจริง (แทนใบแจ้งซ่อมปลอมของแชทบอทตัวเก่า)
--
-- ปัญหาที่แก้:
--   แชทบอทตัวเดิม (ChatbotFAB.jsx ที่ถอดออกไปแล้ว) รับเรื่องแจ้งซ่อมแล้วตอบกลับว่า
--   "สร้างใบแจ้งซ่อมเรียบร้อย เลขที่ RPR-XXXX ฝ่ายอาคารจะดำเนินการภายใน 24-48 ชม."
--   ทั้งที่เลขนั้นสร้างจาก Date.now() ในเบราว์เซอร์ และไม่ได้ถูกบันทึกที่ไหนเลย
--   นักเรียนเข้าใจว่าแจ้งแล้ว แต่ไม่มีใครได้รับเรื่อง — แย่กว่าไม่มีฟีเจอร์นี้เลย
--
--   ไฟล์นี้ทำให้เลขใบแจ้งซ่อมเป็นของจริง: ออกโดย DB ตามลำดับ ตามกลับมาดูสถานะได้
--   และฝ่ายวิชาการเห็นคิวงานจริงในหน้าจัดการ
--
-- Workflow: ใครก็ได้ที่ล็อกอิน (นักเรียน/ครู) แจ้ง -> สถานะ open
--           -> ฝ่ายวิชาการรับเรื่อง (in_progress) -> ปิดงาน (done) หรือยกเลิก (cancelled)
--           -> แจ้งเตือนผู้แจ้งทุกครั้งที่สถานะเปลี่ยน (ใช้ตาราง notifications เดิม)
--
-- ยึดโครงเดิม: public.users(id uuid) + app_current_user_id() / app_has_role()
--              / app_is_academic_staff() (นิยามไว้ใน 22_leave_requests.sql)
-- รันซ้ำได้ทั้งไฟล์
-- ============================================================

-- ============================================================
-- 1) เลขใบแจ้งซ่อม — ออกจาก DB ไม่ใช่จากเบราว์เซอร์
--    รูปแบบ RPR-2608-0001 (ปี-เดือน แล้วลำดับที่ไม่ซ้ำ)
--    ใช้ sequence เพราะต้องการเลขที่ไม่ชนกันแม้แจ้งพร้อมกันหลายคน
--    (นับต่อเนื่องข้ามเดือน ไม่รีเซ็ต — รีเซ็ตรายเดือนต้องล็อกตารางซึ่งไม่คุ้ม)
-- ============================================================
create sequence if not exists public.repair_ticket_seq;

create or replace function public.next_repair_ticket_no()
returns text
language sql volatile
as $$
  select 'RPR-' || to_char(now(), 'YYMM') || '-' ||
         lpad(nextval('public.repair_ticket_seq')::text, 4, '0');
$$;

comment on function public.next_repair_ticket_no() is
  'ออกเลขใบแจ้งซ่อมถัดไป เช่น RPR-2608-0001 — ใช้ sequence จึงไม่ชนกันแม้มีคนแจ้งพร้อมกัน';

-- ============================================================
-- 2) ตาราง repair_tickets
-- ============================================================
create table if not exists public.repair_tickets (
  id             uuid primary key default gen_random_uuid(),
  ticket_no      text not null unique default public.next_repair_ticket_no(),

  reporter_user_id uuid not null default app_current_user_id()
                     references public.users(id) on delete cascade,

  room_label     text not null,
  equipment      text not null,
  problem        text not null,

  status         text not null default 'open',

  handled_by     uuid references public.users(id) on delete set null,
  handled_at     timestamptz,
  staff_note     text,

  created_at     timestamptz not null default now(),

  constraint repair_tickets_status_valid check (status in ('open', 'in_progress', 'done', 'cancelled')),
  constraint repair_tickets_room_not_blank    check (char_length(trim(room_label)) between 1 and 60),
  constraint repair_tickets_problem_not_blank check (char_length(trim(problem))    between 1 and 500),
  constraint repair_tickets_equipment_len     check (char_length(trim(equipment))  between 1 and 60)
);

-- คิวงานของฝ่ายวิชาการเรียงตามเวลา และหน้า "ใบแจ้งของฉัน" ของผู้แจ้ง
create index if not exists repair_tickets_reporter_idx on public.repair_tickets (reporter_user_id, created_at desc);
create index if not exists repair_tickets_open_idx     on public.repair_tickets (created_at) where status in ('open', 'in_progress');

comment on table public.repair_tickets is
  'ใบแจ้งซ่อมอุปกรณ์/อาคาร แจ้งผ่านผู้ช่วย SBAC Connect หรือหน้าจัดการ — เขียนได้ทางเดียวผ่าน RPC เท่านั้น';

alter table public.repair_tickets enable row level security;

drop policy if exists repair_tickets_read on public.repair_tickets;
create policy repair_tickets_read on public.repair_tickets
  for select
  using (
    reporter_user_id = app_current_user_id()
    or app_is_academic_staff()
  );

-- ไม่มี policy insert/update ให้ authenticated — เขียนผ่าน RPC ด้านล่างเท่านั้น
grant select on public.repair_tickets to authenticated;
revoke all on public.repair_tickets from anon;

-- ============================================================
-- 3) RPC: แจ้งซ่อม
--    กันสแปม: คนหนึ่งแจ้งได้ไม่เกิน 5 ใบต่อชั่วโมง
--    (แชทบอทเปิดให้พิมพ์แจ้งได้ง่ายมาก ถ้าไม่กันไว้ คิวงานจริงจะจมเร็ว)
-- ============================================================
create or replace function public.submit_repair_ticket(
  p_room      text,
  p_equipment text,
  p_problem   text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me        uuid := app_current_user_id();
  v_room      text := trim(coalesce(p_room, ''));
  v_equipment text := trim(coalesce(p_equipment, ''));
  v_problem   text := trim(coalesce(p_problem, ''));
  v_recent    integer;
  v_row       public.repair_tickets%rowtype;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  if char_length(v_room) = 0 or char_length(v_room) > 60 then
    return jsonb_build_object('ok', false, 'error', 'ROOM_REQUIRED');
  end if;

  if char_length(v_problem) = 0 then
    return jsonb_build_object('ok', false, 'error', 'PROBLEM_REQUIRED');
  end if;

  if char_length(v_problem) > 500 then
    return jsonb_build_object('ok', false, 'error', 'PROBLEM_TOO_LONG');
  end if;

  if char_length(v_equipment) = 0 then
    v_equipment := 'อุปกรณ์ทั่วไป';
  end if;

  select count(*) into v_recent
  from public.repair_tickets
  where reporter_user_id = v_me and created_at > now() - interval '1 hour';

  if v_recent >= 5 then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;

  insert into public.repair_tickets (reporter_user_id, room_label, equipment, problem)
  values (v_me, v_room, left(v_equipment, 60), v_problem)
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'ticket_no', v_row.ticket_no,
    'room_label', v_row.room_label,
    'equipment', v_row.equipment,
    'created_at', v_row.created_at
  );
end $$;

comment on function public.submit_repair_ticket(text, text, text) is
  'แจ้งซ่อม 1 ใบ — เลขใบออกจาก DB จริง สถานะเริ่มต้น open เสมอ จำกัด 5 ใบ/ชั่วโมง/คน กันสแปมจากช่องแชท';

grant execute on function public.submit_repair_ticket(text, text, text) to authenticated;
revoke all on function public.submit_repair_ticket(text, text, text) from anon;

-- ============================================================
-- 4) RPC: รายการใบแจ้งซ่อม — กรองสิทธิ์ให้อัตโนมัติ
--    ผู้แจ้งเห็นของตัวเอง / ฝ่ายวิชาการ+แอดมินเห็นทั้งหมด
-- ============================================================
create or replace function public.list_repair_tickets(
  p_status_filter text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me          uuid := app_current_user_id();
  v_is_academic boolean := app_is_academic_staff();
  v_result      jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      rt.id,
      rt.ticket_no,
      rt.room_label,
      rt.equipment,
      rt.problem,
      rt.status,
      rt.staff_note,
      rt.created_at,
      rt.handled_at,
      rt.reporter_user_id,
      u.full_name              as reporter_name,
      sp.student_code          as reporter_code,
      h.full_name              as handled_by_name
    from public.repair_tickets rt
    join public.users u on u.id = rt.reporter_user_id
    left join public.student_profiles sp on sp.user_id = rt.reporter_user_id
    left join public.users h on h.id = rt.handled_by
    where (p_status_filter is null or rt.status = p_status_filter)
      and (rt.reporter_user_id = v_me or v_is_academic)
    order by rt.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) t;

  return jsonb_build_object('ok', true, 'tickets', v_result, 'is_staff_view', v_is_academic);
end $$;

comment on function public.list_repair_tickets(text, integer) is
  'รายการใบแจ้งซ่อม กรองสิทธิ์ตามผู้เรียก: ผู้แจ้งเห็นของตัวเอง ฝ่ายวิชาการ/แอดมินเห็นทั้งหมด';

grant execute on function public.list_repair_tickets(text, integer) to authenticated;
revoke all on function public.list_repair_tickets(text, integer) from anon;

-- ============================================================
-- 5) RPC: ฝ่ายวิชาการเปลี่ยนสถานะ + แจ้งเตือนผู้แจ้ง
-- ============================================================
create or replace function public.update_repair_ticket_status(
  p_id     uuid,
  p_status text,
  p_note   text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ticket public.repair_tickets%rowtype;
  v_me     uuid := app_current_user_id();
  v_title  text;
  v_body   text;
begin
  if not app_is_academic_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_status not in ('open', 'in_progress', 'done', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_STATUS');
  end if;

  select * into v_ticket from public.repair_tickets where id = p_id;

  if v_ticket.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if v_ticket.status = p_status then
    return jsonb_build_object('ok', false, 'error', 'NO_CHANGE');
  end if;

  update public.repair_tickets set
    status     = p_status,
    handled_by = v_me,
    handled_at = now(),
    staff_note = coalesce(nullif(trim(p_note), ''), staff_note)
  where id = p_id;

  v_title := case p_status
    when 'in_progress' then '🔧 รับเรื่องแจ้งซ่อมแล้ว'
    when 'done'        then '✅ ซ่อมเรียบร้อยแล้ว'
    when 'cancelled'   then '⚠️ ใบแจ้งซ่อมถูกยกเลิก'
    else '📋 ใบแจ้งซ่อมกลับมารอดำเนินการ'
  end;

  v_body := v_ticket.ticket_no || ' · ' || v_ticket.room_label || ' · ' || v_ticket.equipment ||
            coalesce(' — ' || nullif(trim(p_note), ''), '');

  insert into public.notifications (user_id, type, title, body, data)
  values (v_ticket.reporter_user_id, 'repair_' || p_status, v_title, v_body,
          jsonb_build_object('repair_id', p_id, 'ticket_no', v_ticket.ticket_no));

  return jsonb_build_object('ok', true, 'ticket_no', v_ticket.ticket_no);
end $$;

comment on function public.update_repair_ticket_status(uuid, text, text) is
  'ฝ่ายวิชาการ/แอดมินเปลี่ยนสถานะใบแจ้งซ่อม (open/in_progress/done/cancelled) — แจ้งเตือนผู้แจ้งทุกครั้งที่เปลี่ยน';

grant execute on function public.update_repair_ticket_status(uuid, text, text) to authenticated;
revoke all on function public.update_repair_ticket_status(uuid, text, text) from anon;

-- ============================================================
-- 6) เปิด Realtime ให้ repair_tickets
--    คิวงานฝ่ายวิชาการต้องขึ้นทันทีที่นักเรียนกดแจ้งจากช่องแชท ไม่ต้องกดรีเฟรช
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'repair_tickets'
  ) then
    execute 'alter publication supabase_realtime add table public.repair_tickets';
    raise notice 'เพิ่ม public.repair_tickets เข้า supabase_realtime แล้ว';
  else
    raise notice 'public.repair_tickets อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป';
  end if;
exception when others then
  raise warning 'เพิ่ม repair_tickets เข้า realtime ไม่สำเร็จ: % — ไปเปิดเองที่ Database > Replication ได้', sqlerrm;
end $$;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  (select count(*) from public.repair_tickets)                              as ใบแจ้งซ่อมทั้งหมด,
  (select count(*) from public.repair_tickets where status = 'open')        as รอดำเนินการ,
  (select count(*) from public.repair_tickets where status = 'in_progress') as กำลังซ่อม,
  (select count(*) from public.repair_tickets where status = 'done')        as ซ่อมเสร็จแล้ว,
  -- อ่าน last_value ตรง ๆ ไม่เรียก next_repair_ticket_no() เพราะการเรียกจะกินเลขไปหนึ่งใบ
  (select last_value from public.repair_ticket_seq)                         as เลขล่าสุดที่ออกไป;
