-- ============================================================
-- 20_behavior_and_notifications.sql — ตัด/เพิ่มคะแนนพฤติกรรม + แจ้งเตือนนักเรียนทันที
--
-- ปัญหาที่แก้:
--   ฟีเจอร์ตัดคะแนนใน TeacherHome.jsx (โมดัล "จัดการพฤติกรรมและความประพฤติ") ตอนนี้เป็น
--   ของปลอมทั้งหมด — รายชื่อนักเรียน hardcode ไว้ในโค้ด (ตัวแปร STUDENTS) และบันทึกผ่าน
--   localStorage (key sbac_behavior_logs) ซึ่งอยู่เฉพาะเครื่องอาจารย์คนที่กดปุ่มเท่านั้น
--   ไม่มีใครเห็น และนักเรียนไม่ได้รับการแจ้งเตือนอะไรเลย
--
-- ไฟล์นี้เพิ่ม:
--   1) behavior_categories — หมวดหมู่ความผิด/ความดีสำเร็จรูป (ย้ายจาก behaviorPresets เดิม)
--   2) behavior_logs        — บันทึกการตัด/เพิ่มคะแนนจริงลง DB ถาวร ตรวจสอบย้อนหลังได้
--   3) notifications        — กล่องแจ้งเตือนในระบบของผู้ใช้แต่ละคน (ออกแบบให้ใช้ร่วมกับ
--                             ฟีเจอร์อื่นในอนาคตได้ เช่น อนุมัติใบลา ไม่ได้ผูกกับพฤติกรรมอย่างเดียว)
--   4) RPC: search_students / submit_behavior_log / mark_notification_read /
--           mark_all_notifications_read — ทุกจุดที่ "เขียน" ข้อมูลทำผ่าน RPC security
--           definer เท่านั้น ยึดแนวเดียวกับ 18_topup_requests.sql (revoke insert/update
--           ตรงจากหน้าเว็บทั้งหมด กันแก้ยอด/ปลอมแจ้งเตือนผ่าน DevTools)
--
-- ช่องทางแจ้งเตือน: ตอนนี้ใช้ Supabase Realtime ส่งเข้า "ระบบของนักเรียน" (in-app,
-- เห็นทันทีที่หน้าเว็บที่เปิดอยู่ ผ่าน postgres_changes) เพราะไม่ต้องพึ่ง credential
-- ภายนอกเพิ่ม — LINE Official Account ต้องมี channel access token, Web Push ต้องมี
-- VAPID key + service worker, Email ต้องมี SMTP/API key ซึ่งยังไม่มีตัวไหนตั้งค่าไว้ใน
-- .env ของโปรเจกต์นี้เลย ตาราง notifications ออกแบบเป็นกล่องกลางที่เพิ่มคอลัมน์/ตาราง
-- ส่งออกช่องทางอื่นทีหลังได้โดยไม่ต้องรื้อโครงสร้างเดิม (เช่น เพิ่ม worker ที่อ่านแถวใหม่
-- แล้วยิงต่อไป LINE Messaging API)
--
-- ยึดโครงเดิมของโปรเจกต์: public.users(id uuid) + app_current_user_id() / app_has_role()
-- ที่มีอยู่แล้ว (ดู 07_pos_ops.sql, 18_topup_requests.sql) รันซ้ำได้ทั้งไฟล์
-- ============================================================

-- ============================================================
-- 1) ใครมีสิทธิ์ตัด/เพิ่มคะแนนได้ (ครูผู้สอน/ฝ่ายวิชาการ/แอดมิน)
-- ============================================================
create or replace function public.app_is_teaching_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select app_has_role('teacher') or app_has_role('academic') or app_has_role('sysadmin');
$$;

comment on function public.app_is_teaching_staff() is
  'true เมื่อผู้เรียกมี role teacher, academic หรือ sysadmin — ใช้กำหนดสิทธิ์ค้นหานักเรียน/ตัด-เพิ่มคะแนนพฤติกรรม';

grant execute on function public.app_is_teaching_staff() to authenticated;

-- ============================================================
-- 2) ตาราง behavior_categories — หมวดหมู่สำเร็จรูป
-- ============================================================
create table if not exists public.behavior_categories (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  action_type     text not null,
  label           text not null,
  default_points  integer not null check (default_points > 0),
  sort_order      integer not null default 0,
  is_active       boolean not null default true,

  constraint behavior_categories_action_type_valid check (action_type in ('add', 'deduct'))
);

comment on table public.behavior_categories is
  'หมวดหมู่ความผิด/ความดีสำเร็จรูปสำหรับฟอร์มตัด-เพิ่มคะแนนของอาจารย์ — แก้ label/คะแนน/เปิดปิดได้จาก SQL editor โดยไม่ต้องแก้โค้ดหน้าเว็บ';

-- ย้ายจาก behaviorPresets เดิมใน TeacherHome.jsx ตรงตัว (code ใหม่ ไม่กระทบของเดิมถ้ารันซ้ำ)
insert into public.behavior_categories (code, action_type, label, default_points, sort_order) values
  ('late',           'deduct', 'มาสายบ่อยครั้ง',            3,  1),
  ('uniform',        'deduct', 'แต่งกายไม่เรียบร้อย',        5,  2),
  ('phone_in_class', 'deduct', 'ใช้โทรศัพท์ในห้องเรียน',      2,  3),
  ('no_homework',    'deduct', 'ไม่ส่งงานวิชาโครงการ',       10, 4),
  ('volunteer',      'add',    'ช่วยเหลือกิจกรรมวิทยาลัย',   5,  1),
  ('clean_room',     'add',    'รักษาความสะอาดห้องเรียน',    2,  2),
  ('public_spirit',  'add',    'มีจิตสาธารณะดีเด่น',         5,  3),
  ('skill_contest',  'add',    'ชนะการประกวดทักษะวิชาการ',   10, 4)
on conflict (code) do nothing;

alter table public.behavior_categories enable row level security;

-- อ่าน: ใครก็ตามที่ล็อกอินอยู่เห็นหมวดที่ active, เจ้าหน้าที่สอน (ผู้แก้ไข) เห็นหมวดที่ปิดไว้ด้วย
drop policy if exists behavior_categories_read on public.behavior_categories;
create policy behavior_categories_read on public.behavior_categories
  for select
  using (is_active or app_is_teaching_staff());

-- ไม่มี policy insert/update/delete — จัดการหมวดหมู่ผ่าน SQL editor/dashboard เท่านั้น
grant select on public.behavior_categories to authenticated;
revoke all on public.behavior_categories from anon;

-- ============================================================
-- 3) ตาราง behavior_logs — บันทึกจริง
-- ============================================================
create table if not exists public.behavior_logs (
  id                uuid primary key default gen_random_uuid(),

  -- นักเรียนที่ถูกบันทึก — ลบบัญชีนักเรียนแล้วให้ประวัติหายไปด้วย (แนวเดียวกับ topup_requests.user_id)
  student_user_id   uuid not null
                      references public.users(id) on delete cascade,

  -- ครูผู้บันทึก — default เป็นฟังก์ชัน ไม่ใช่ค่าที่หน้าเว็บส่งมา จะได้ปลอมเป็นคนอื่นไม่ได้
  -- ไม่ใส่ on delete cascade/set null: ห้ามลบบัญชีครูที่มีประวัติการบันทึกอยู่ (กันประวัติหาย/ไม่รู้ว่าใครบันทึก)
  teacher_user_id   uuid not null default app_current_user_id()
                      references public.users(id),

  category_id       uuid references public.behavior_categories(id) on delete set null,
  action_type       text not null,
  reason            text not null,
  points            integer not null check (points > 0),
  created_at        timestamptz not null default now(),

  constraint behavior_logs_action_type_valid check (action_type in ('add', 'deduct')),
  constraint behavior_logs_reason_not_blank check (char_length(trim(reason)) > 0)
);

create index if not exists behavior_logs_student_idx on public.behavior_logs (student_user_id, created_at desc);
create index if not exists behavior_logs_teacher_idx on public.behavior_logs (teacher_user_id, created_at desc);

comment on table public.behavior_logs is
  'ประวัติการตัด/เพิ่มคะแนนพฤติกรรมจริง เขียนได้ทางเดียวผ่าน submit_behavior_log() เท่านั้น (ดูข้อ 6)';

alter table public.behavior_logs enable row level security;

-- อ่าน: เจ้าของ (นักเรียน), ครูผู้บันทึกรายการนั้น, หรือเจ้าหน้าที่สอนคนอื่น (ต้องเห็นภาพรวมได้)
drop policy if exists behavior_logs_read on public.behavior_logs;
create policy behavior_logs_read on public.behavior_logs
  for select
  using (
    student_user_id = app_current_user_id()
    or teacher_user_id = app_current_user_id()
    or app_is_teaching_staff()
  );

-- ไม่มี policy insert ให้ authenticated เลย — สร้างได้ทางเดียวผ่าน submit_behavior_log()
-- ซึ่งเช็ค role + validate ก่อนเสมอ (กันอาจารย์ปลอมแถวตรงจาก DevTools/Postman)
grant select on public.behavior_logs to authenticated;
revoke all on public.behavior_logs from anon;

-- ============================================================
-- 4) คะแนนพฤติกรรมปัจจุบันของนักเรียนคนหนึ่ง
-- ============================================================
-- เริ่มที่ 100 แต้ม บวก/ลบตามประวัติ แล้ว clamp ไว้ที่ 0-100 (สูตรเดียวกับของเดิมในหน้าเว็บ)
-- จำกัดสิทธิ์เรียก: ดูของตัวเองได้เสมอ, คนอื่นดูได้เฉพาะเจ้าหน้าที่สอน — เลขคะแนนคนอื่นไม่ใช่ข้อมูล
-- สาธารณะ ถึงจะไม่มีชื่อกำกับมาด้วยก็ตาม
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
  ), 0)))::integer;
end $$;

comment on function public.behavior_score(uuid) is
  'คะแนนพฤติกรรมปัจจุบัน (0-100, เริ่มที่ 100) ของนักเรียนคนหนึ่ง — เรียกดูของตัวเองได้เสมอ คนอื่นดูได้เฉพาะเจ้าหน้าที่สอน';

grant execute on function public.behavior_score(uuid) to authenticated;
revoke all on function public.behavior_score(uuid) from anon;

-- ============================================================
-- 5) ตาราง notifications — กล่องแจ้งเตือนในระบบ
-- ============================================================
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,

  -- type ใช้ prefix แยกฟีเจอร์ เช่น 'behavior_deduct' / 'behavior_add' — เผื่อฟีเจอร์อื่น
  -- (อนุมัติใบลา, แจ้งเตือนกิจกรรม ฯลฯ) มาใช้ตารางเดียวกันนี้ในอนาคตโดยไม่ต้องสร้างตารางใหม่
  type        text not null,
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,

  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where not is_read;

comment on table public.notifications is
  'กล่องแจ้งเตือนในระบบของผู้ใช้แต่ละคน อ่านได้เฉพาะของตัวเอง เขียน/แก้ is_read ได้ทางเดียวผ่าน RPC security definer เท่านั้น — จับคู่กับ Supabase Realtime (ดู src/hooks/useNotifications.js) ให้ขึ้นทันทีที่หน้าเว็บของผู้รับโดยไม่ต้องรีเฟรช';

alter table public.notifications enable row level security;

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select
  using (user_id = app_current_user_id());

-- ไม่มี policy insert/update/delete ให้ใครเลยแม้แต่เจ้าของ (แนวเดียวกับ topup_requests หลัง approve)
-- สร้างผ่าน submit_behavior_log() เท่านั้น, แก้ is_read ผ่าน mark_notification_read() /
-- mark_all_notifications_read() เท่านั้น — กันปลอมแจ้งเตือนเป็นคนอื่น หรือย้อนไปแก้เนื้อหาที่เคยส่งแล้ว
grant select on public.notifications to authenticated;
revoke all on public.notifications from anon;

-- ============================================================
-- 6) RPC: ค้นหานักเรียน (สำหรับฟอร์มตัดคะแนนของอาจารย์)
-- ============================================================
create or replace function public.search_students(p_query text, p_limit integer default 20)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_q      text := trim(coalesce(p_query, ''));
  v_result jsonb;
begin
  if not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  -- ไม่ค้นด้วยคำสั้นเกินไป กันดึงนักเรียนทั้งวิทยาลัยออกมาโดยไม่ตั้งใจ
  if char_length(v_q) < 2 then
    return jsonb_build_object('ok', true, 'students', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.full_name), '[]'::jsonb)
    into v_result
  from (
    select
      u.id                                                as user_id,
      u.full_name,
      sp.student_code,
      case when cr.id is null then null
           else cr.level || ' ห้อง ' || cr.room_no end     as class_label,
      public.behavior_score(u.id)                          as score
    from public.student_profiles sp
    join public.users u on u.id = sp.user_id
    left join public.class_rooms cr on cr.id = sp.class_room_id
    where u.full_name ilike '%' || v_q || '%'
       or sp.student_code ilike '%' || v_q || '%'
    order by u.full_name
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ) s;

  return jsonb_build_object('ok', true, 'students', v_result);
end $$;

comment on function public.search_students(text, integer) is
  'ค้นหานักเรียนด้วยชื่อหรือรหัสประจำตัว (role teacher/academic/sysadmin เท่านั้น) — ใช้กับฟอร์มตัด/เพิ่มคะแนนของอาจารย์';

grant execute on function public.search_students(text, integer) to authenticated;
revoke all on function public.search_students(text, integer) from anon;

-- ============================================================
-- 7) RPC: บันทึกการตัด/เพิ่มคะแนน + แจ้งเตือนนักเรียนทันที
-- ============================================================
-- จุดเดียวที่ insert เข้า behavior_logs และ notifications ได้จริง — ทำสองอย่างในธุรกรรม
-- เดียวกัน (ฟังก์ชันเดียว) นักเรียนจึงไม่มีทางเห็นคะแนนเปลี่ยนโดยไม่มีแจ้งเตือนคู่กันเสมอ
create or replace function public.submit_behavior_log(
  p_student_user_id uuid,
  p_category_id     uuid,
  p_reason          text,
  p_points          integer,
  p_action_type     text
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_teacher   uuid := app_current_user_id();
  v_reason    text := trim(coalesce(p_reason, ''));
  v_log_id    uuid;
  v_new_score integer;
  v_title     text;
begin
  if not app_is_teaching_staff() then
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

  if p_student_user_id is null or not exists (
    select 1 from public.student_profiles where user_id = p_student_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'STUDENT_NOT_FOUND');
  end if;

  insert into public.behavior_logs
    (student_user_id, teacher_user_id, category_id, action_type, reason, points)
  values
    (p_student_user_id, v_teacher, p_category_id, p_action_type, v_reason, p_points)
  returning id into v_log_id;

  v_new_score := public.behavior_score(p_student_user_id);

  v_title := case when p_action_type = 'add'
                   then '⭐ ได้รับคะแนนความดี +' || p_points || ' คะแนน'
                   else '⚠️ ถูกตัดคะแนนความประพฤติ -' || p_points || ' คะแนน' end;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_student_user_id,
    'behavior_' || p_action_type,
    v_title,
    v_reason,
    jsonb_build_object(
      'log_id', v_log_id,
      'points', p_points,
      'action_type', p_action_type,
      'new_score', v_new_score
    )
  );

  return jsonb_build_object('ok', true, 'log_id', v_log_id, 'new_score', v_new_score);
end $$;

comment on function public.submit_behavior_log(uuid, uuid, text, integer, text) is
  'บันทึกการตัด/เพิ่มคะแนนพฤติกรรม (role teacher/academic/sysadmin เท่านั้น) แล้วสร้างแจ้งเตือนให้นักเรียนในธุรกรรมเดียวกันทันที — จุดเดียวที่เขียน behavior_logs/notifications ของฟีเจอร์นี้ได้';

grant execute on function public.submit_behavior_log(uuid, uuid, text, integer, text) to authenticated;
revoke all on function public.submit_behavior_log(uuid, uuid, text, integer, text) from anon;

-- ============================================================
-- 8) RPC: ทำเครื่องหมายอ่านแจ้งเตือนแล้ว
-- ============================================================
create or replace function public.mark_notification_read(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  update public.notifications
     set is_read = true
   where id = p_id
     and user_id = app_current_user_id();

  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mark_all_notifications_read()
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  update public.notifications
     set is_read = true
   where user_id = app_current_user_id()
     and not is_read;

  return jsonb_build_object('ok', true);
end $$;

comment on function public.mark_notification_read(uuid) is
  'ทำเครื่องหมายว่าอ่านแจ้งเตือนใบเดียวแล้ว — แก้ได้เฉพาะแจ้งเตือนของตัวเอง';
comment on function public.mark_all_notifications_read() is
  'ทำเครื่องหมายว่าอ่านแจ้งเตือนทั้งหมดของตัวเองแล้ว';

grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
revoke all on function public.mark_notification_read(uuid) from anon;
revoke all on function public.mark_all_notifications_read() from anon;

-- ============================================================
-- 9) RPC: ประวัติ + คะแนนของตัวเอง (ฝั่งนักเรียน)
-- ============================================================
-- หน้า StudentHome.jsx เดิมมีโมดัล "คะแนนความประพฤติ" อยู่ก่อนแล้ว แต่ผูกกับ
-- localStorage (sbac_behavior_logs) คนละชุดกับของจริงที่บันทึกผ่าน submit_behavior_log()
-- ด้านบน — RPC นี้คือของจริงที่หน้าเว็บนักเรียนต้องเปลี่ยนไปเรียกแทน
-- ทำ join ชื่อครูผู้บันทึกในนี้เพราะ RLS ของ public.users ให้เห็นแถวตัวเองเท่านั้น
-- ถ้า query จากฝั่งหน้าเว็บตรง ๆ แบบ join จะได้ full_name เป็น null
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
    order by bl.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) l;

  return jsonb_build_object('ok', true, 'logs', v_result, 'score', public.behavior_score(v_me));
end $$;

comment on function public.my_behavior_logs(integer) is
  'คะแนนพฤติกรรมปัจจุบัน + ประวัติการตัด/เพิ่มคะแนนของ "ตัวเอง" (นักเรียนเรียกดูของตัวเองเท่านั้น) — ใช้กับโมดัล "คะแนนความประพฤติ" ใน StudentHome.jsx';

grant execute on function public.my_behavior_logs(integer) to authenticated;
revoke all on function public.my_behavior_logs(integer) from anon;

-- ============================================================
-- 10) เปิด Realtime ให้ notifications
-- ============================================================
-- หน้าเว็บ subscribe ตาราง notifications อยู่ (postgres_changes) ถ้าไม่เพิ่มเข้า
-- publication จะไม่มี event ส่งมาเลยแม้ RLS จะอนุญาตให้อ่านได้ก็ตาม
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
    raise notice 'เพิ่ม public.notifications เข้า supabase_realtime แล้ว';
  else
    raise notice 'public.notifications อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป';
  end if;
exception when others then
  -- ไม่ให้ทั้งไฟล์ล้มเพราะเรื่อง publication อย่างเดียว
  raise warning 'เพิ่ม notifications เข้า realtime ไม่สำเร็จ: % — ไปเปิดเองที่ Database > Replication ได้', sqlerrm;
end $$;

-- เปิดให้ behavior_logs ด้วย — หน้าคะแนนความประพฤติของนักเรียนจะได้อัปเดตสด ๆ ทันทีที่ครูบันทึก
-- โดยไม่ต้องรอ toast แจ้งเตือนแล้วกดปิดโมดัลแล้วเปิดใหม่เอง
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'behavior_logs'
  ) then
    execute 'alter publication supabase_realtime add table public.behavior_logs';
    raise notice 'เพิ่ม public.behavior_logs เข้า supabase_realtime แล้ว';
  else
    raise notice 'public.behavior_logs อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป';
  end if;
exception when others then
  raise warning 'เพิ่ม behavior_logs เข้า realtime ไม่สำเร็จ: % — ไปเปิดเองที่ Database > Replication ได้', sqlerrm;
end $$;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  (select count(*) from public.behavior_categories)                        as หมวดหมู่ทั้งหมด,
  (select count(*) from public.behavior_logs)                              as รายการที่บันทึกแล้ว,
  (select count(*) from public.notifications)                              as แจ้งเตือนทั้งหมด,
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  )                                                                        as notifications_realtime_เปิดแล้ว,
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'behavior_logs'
  )                                                                        as behavior_logs_realtime_เปิดแล้ว;
