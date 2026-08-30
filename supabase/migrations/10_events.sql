-- ============================================================
-- 10_events.sql — โมดูล A: ปฏิทินกิจกรรม
--
-- ปัญหาที่แก้:
--   ปฏิทินใน src/components/ui/AcademicCalendar.jsx เป็นข้อมูล hard-code
--   ในไฟล์ .jsx ทั้งหมด ฝ่ายวิชาการแก้เองไม่ได้ ต้องให้โปรแกรมเมอร์แก้โค้ดแล้ว deploy ใหม่
--   และหน้า AcademicDashboard มีปุ่ม "ประกาศกิจกรรม" ที่ยิงไป Firebase ซึ่งถูกปิดไปแล้ว
--   → กดแล้ว error ตลอด
--
-- สิ่งที่ไฟล์นี้ทำ:
--   สร้างตาราง events + RLS ให้ฝ่ายวิชาการจัดการเองได้ผ่านหน้าเว็บ
--   คนอื่นอ่านได้อย่างเดียว และเห็นเฉพาะที่เผยแพร่แล้ว
--
-- ยึดโครงเดิมของโปรเจกต์: ใช้ public.users (uuid) + app_has_role() ที่มีอยู่แล้ว
-- ไม่ได้ใช้ profiles.role ตามที่เขียนในแผน เพราะ DB จริงไม่มีตาราง profiles
--
-- รันซ้ำได้ทั้งไฟล์
-- ============================================================

-- ============================================================
-- 1) ตาราง
-- ============================================================
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text        not null,
  description  text,
  location     text,

  -- เก็บเป็น timestamptz เสมอ ไม่เก็บ date เปล่า
  -- เพราะกิจกรรมมีเวลาเริ่ม-จบจริง และต้องเรียงข้ามวันได้ถูกต้อง
  start_at     timestamptz not null,
  end_at       timestamptz,
  all_day      boolean     not null default false,

  -- ต้องตรงกับ EVENT_TYPE_LABELS ในหน้าเว็บ (src/utils/events.js)
  category     text        not null default 'activity',
  color        text        not null default 'blue',

  is_published boolean     not null default true,

  -- default เป็นฟังก์ชัน ไม่ใช่ค่าที่หน้าเว็บส่งมา — จะได้ปลอมชื่อคนสร้างไม่ได้
  created_by   uuid default app_current_user_id() references public.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- กันฝ่ายวิชาการกรอกเวลาจบก่อนเวลาเริ่ม
  constraint events_time_order check (end_at is null or end_at >= start_at),
  constraint events_title_len  check (char_length(trim(title)) between 1 and 200)
);

-- ค่าที่หน้าเว็บรู้จัก — เขียนเป็น check ไม่ใช่ enum
-- เพราะ enum เพิ่มค่าใหม่แล้วแก้ยาก ส่วนอันนี้ทีหลังอยากเพิ่มหมวดก็แค่ replace constraint
alter table public.events drop constraint if exists events_category_valid;
alter table public.events add constraint events_category_valid
  check (category in ('activity','holiday','exam','academic','deadline'));

alter table public.events drop constraint if exists events_color_valid;
alter table public.events add constraint events_color_valid
  check (color in ('emerald','blue','red','rose','amber','orange','violet'));

-- ปฏิทินค้นด้วย "ช่วงเดือน" เสมอ → index ที่ start_at คือตัวที่ใช้จริง
create index if not exists events_start_at_idx on public.events (start_at);
create index if not exists events_published_start_idx on public.events (start_at) where is_published;

comment on table public.events is
  'ปฏิทินกิจกรรมวิทยาลัย — ฝ่ายวิชาการ (role academic/sysadmin) จัดการเอง คนอื่นอ่านอย่างเดียว';

-- ============================================================
-- 2) updated_at อัตโนมัติ
-- ============================================================
create or replace function public.events_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.events_set_updated_at();

-- ============================================================
-- 3) ใครจัดการปฏิทินได้
-- ============================================================
-- security definer: ต้องอ่าน user_roles ซึ่งเปิด RLS อยู่
-- ตัวนี้ใช้ในทุก policy ของ events จุดเดียว เปลี่ยนนโยบายทีหลังแก้ที่นี่ที่เดียว
create or replace function public.app_can_manage_events()
returns boolean
language sql stable security definer set search_path = public
as $$
  select app_has_role('academic') or app_has_role('sysadmin');
$$;

comment on function public.app_can_manage_events() is
  'true เมื่อผู้เรียกเป็นฝ่ายวิชาการหรือแอดมินระบบ — ใช้กำหนดสิทธิ์เขียนปฏิทิน';

-- ============================================================
-- 4) RLS
-- ============================================================
alter table public.events enable row level security;

-- อ่าน: ทุกคนที่ล็อกอิน เห็นเฉพาะที่เผยแพร่แล้ว
-- ฝ่ายวิชาการเห็นฉบับร่างของตัวเองด้วย (จะได้เตรียมกิจกรรมไว้ก่อนแล้วค่อยกดเผยแพร่)
drop policy if exists events_read on public.events;
create policy events_read on public.events
  for select
  using (is_published or app_can_manage_events());

drop policy if exists events_write_insert on public.events;
create policy events_write_insert on public.events
  for insert
  with check (app_can_manage_events());

drop policy if exists events_write_update on public.events;
create policy events_write_update on public.events
  for update
  using (app_can_manage_events())
  with check (app_can_manage_events());

drop policy if exists events_write_delete on public.events;
create policy events_write_delete on public.events
  for delete
  using (app_can_manage_events());

-- grant คือ "ประตูชั้นนอก" ส่วน policy คือ "ยามที่ตรวจทีละแถว" ต้องเปิดทั้งคู่ถึงจะผ่าน
grant select, insert, update, delete on public.events to authenticated;
revoke all on public.events from anon;

grant execute on function public.app_can_manage_events() to authenticated;

-- ============================================================
-- 5) เปิด Realtime
-- ============================================================
-- หน้าเว็บ subscribe ตาราง events อยู่ ถ้าไม่เพิ่มเข้า publication จะไม่มี event ส่งมา
-- ครอบ do block เพราะสั่งซ้ำจะ error ว่า "is already member of publication"
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    execute 'alter publication supabase_realtime add table public.events';
    raise notice 'เพิ่ม public.events เข้า supabase_realtime แล้ว';
  else
    raise notice 'public.events อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป';
  end if;
exception when others then
  -- ไม่ให้ทั้งไฟล์ล้มเพราะเรื่อง publication อย่างเดียว
  raise warning 'เพิ่ม events เข้า realtime ไม่สำเร็จ: % — ไปเปิดเองที่ Database > Replication ได้', sqlerrm;
end $$;

-- ============================================================
-- 6) ข้อมูลตั้งต้น — ย้ายกิจกรรมที่ hard-code ไว้ในโค้ดมาลง DB
-- ============================================================
-- ชุดนี้คือของเดิมใน AcademicCalendar.jsx ทั้งหมด (ก.ค.–ก.ย. 2569)
-- ใส่ให้เพื่อเปิดหน้าเว็บแล้วเห็นข้อมูลทันที ไม่ใช่ปฏิทินว่างเปล่า
-- on conflict do nothing ไม่ได้เพราะไม่มี unique key → ใช้ where not exists แทน
insert into public.events (title, description, location, start_at, end_at, all_day, category, color)
select v.title, v.description, v.location, v.start_at, v.end_at, v.all_day, v.category, v.color
from (values
  -- ---------- กรกฎาคม 2569 ----------
  -- แถวแรก cast ชนิดให้ชัด เพราะคอลัมน์ description เป็น null ทุกแถว
  -- ถ้าไม่ cast Postgres จะมองเป็นชนิด unknown แล้วเดาผิดได้ในบางเวอร์ชัน
  ('รด. (ROTC)'::text,                            null::text, 'สนามกีฬา'::text,          timestamptz '2026-07-02 13:00+07', timestamptz '2026-07-02 16:00+07', false, 'activity'::text, 'emerald'::text),
  ('ประชุมฝ่ายวิชาการ',                             null, 'ห้องประชุม อาคาร 1',           timestamptz '2026-07-03 09:00+07', timestamptz '2026-07-03 12:00+07', false, 'academic', 'blue'),
  ('ส่งงานโครงงานกลุ่ม',                            null, 'ห้อง 1406',                   timestamptz '2026-07-07 16:00+07', null,                              false, 'deadline', 'orange'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-07-09 13:00+07', timestamptz '2026-07-09 16:00+07', false, 'activity', 'emerald'),
  ('กิจกรรมวันสถาปนา',                              null, 'หอประชุม',                    timestamptz '2026-07-10 08:00+07', timestamptz '2026-07-10 12:00+07', false, 'activity', 'violet'),
  ('วันอาสาฬหบูชา',                                 null, null,                          timestamptz '2026-07-13 00:00+07', null,                              true,  'holiday',  'red'),
  ('วันเข้าพรรษา',                                  null, null,                          timestamptz '2026-07-14 00:00+07', null,                              true,  'holiday',  'red'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-07-16 13:00+07', timestamptz '2026-07-16 16:00+07', false, 'activity', 'emerald'),
  ('สอบกลางภาค - การสร้างเกมคอมพิวเตอร์',            null, 'ห้อง 1409',                   timestamptz '2026-07-18 08:30+07', timestamptz '2026-07-18 10:30+07', false, 'exam',     'rose'),
  ('ส่งโปรเจค 50%',                                null, 'ห้อง 1503 / ส่งระบบออนไลน์',    timestamptz '2026-07-19 16:30+07', null,                              false, 'deadline', 'orange'),
  ('สอบกลางภาค - English for Project Work',       null, 'ห้อง 1503',                   timestamptz '2026-07-19 08:30+07', timestamptz '2026-07-19 10:30+07', false, 'exam',     'rose'),
  ('สอบกลางภาค - ทักษะดิจิทัล',                     null, 'ห้อง 1509',                   timestamptz '2026-07-21 08:30+07', timestamptz '2026-07-21 10:30+07', false, 'exam',     'rose'),
  ('สอบกลางภาค - การซ่อมบำรุงคอมพิวเตอร์',           null, 'ห้อง 1401',                   timestamptz '2026-07-22 08:30+07', timestamptz '2026-07-22 10:30+07', false, 'exam',     'rose'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-07-23 13:00+07', timestamptz '2026-07-23 16:00+07', false, 'activity', 'emerald'),
  ('สอบกลางภาค - การออกแบบกราฟิกพื้นฐาน',           null, 'ห้อง 1406',                   timestamptz '2026-07-24 08:30+07', timestamptz '2026-07-24 10:30+07', false, 'exam',     'rose'),
  ('วันเฉลิมพระชนมพรรษา ร.10',                      null, null,                          timestamptz '2026-07-28 00:00+07', null,                              true,  'holiday',  'red'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-07-30 13:00+07', timestamptz '2026-07-30 16:00+07', false, 'activity', 'emerald'),

  -- ---------- สิงหาคม 2569 ----------
  ('ประชุมฝ่ายวิชาการ',                             null, 'ห้องประชุม อาคาร 1',           timestamptz '2026-08-03 09:00+07', timestamptz '2026-08-03 12:00+07', false, 'academic', 'blue'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-08-06 13:00+07', timestamptz '2026-08-06 16:00+07', false, 'activity', 'emerald'),
  ('วันแม่แห่งชาติ',                                null, null,                          timestamptz '2026-08-12 00:00+07', null,                              true,  'holiday',  'red'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-08-13 13:00+07', timestamptz '2026-08-13 16:00+07', false, 'activity', 'emerald'),
  ('ส่งโปรเจค 75%',                                null, 'ห้อง 1503 / ส่งระบบออนไลน์',    timestamptz '2026-08-14 16:30+07', null,                              false, 'deadline', 'orange'),
  ('กิจกรรมสัปดาห์วิทยาศาสตร์',                       null, 'หอประชุม',                    timestamptz '2026-08-18 08:00+07', timestamptz '2026-08-18 15:00+07', false, 'activity', 'violet'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-08-20 13:00+07', timestamptz '2026-08-20 16:00+07', false, 'activity', 'emerald'),
  ('ส่งงานรายวิชาทักษะดิจิทัล',                       null, 'ห้อง 1509',                   timestamptz '2026-08-21 16:00+07', null,                              false, 'deadline', 'orange'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-08-27 13:00+07', timestamptz '2026-08-27 16:00+07', false, 'activity', 'emerald'),
  ('ประกาศตารางสอบปลายภาค',                        null, 'บอร์ดฝ่ายวิชาการ / แอป',        timestamptz '2026-08-31 00:00+07', null,                              true,  'academic', 'blue'),

  -- ---------- กันยายน 2569 ----------
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-09-03 13:00+07', timestamptz '2026-09-03 16:00+07', false, 'activity', 'emerald'),
  ('รด. (ROTC)',                                  null, 'สนามกีฬา',                    timestamptz '2026-09-10 13:00+07', timestamptz '2026-09-10 16:00+07', false, 'activity', 'emerald'),
  ('ส่งโปรเจคฉบับสมบูรณ์ 100%',                     null, 'ห้อง 1503',                   timestamptz '2026-09-11 16:30+07', null,                              false, 'deadline', 'orange'),
  ('สอบปลายภาค - วันแรก',                          null, 'ตามผังห้องสอบ',                timestamptz '2026-09-21 08:30+07', timestamptz '2026-09-21 15:30+07', false, 'exam',     'rose'),
  ('สอบปลายภาค',                                   null, 'ตามผังห้องสอบ',                timestamptz '2026-09-22 08:30+07', timestamptz '2026-09-22 15:30+07', false, 'exam',     'rose'),
  ('สอบปลายภาค',                                   null, 'ตามผังห้องสอบ',                timestamptz '2026-09-23 08:30+07', timestamptz '2026-09-23 15:30+07', false, 'exam',     'rose'),
  ('สอบปลายภาค - วันสุดท้าย',                       null, 'ตามผังห้องสอบ',                timestamptz '2026-09-24 08:30+07', timestamptz '2026-09-24 15:30+07', false, 'exam',     'rose'),
  ('ประกาศผลการเรียน',                             null, 'แอป SBAC Connect',            timestamptz '2026-09-30 00:00+07', null,                              true,  'academic', 'blue')
) as v(title, description, location, start_at, end_at, all_day, category, color)
where not exists (
  -- กันรันซ้ำแล้วกิจกรรมโผล่สองรอบ: ถือว่า "ชื่อเดียวกัน + เริ่มเวลาเดียวกัน" คืออันเดิม
  select 1 from public.events e
  where e.title = v.title and e.start_at = v.start_at
);

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  count(*)                                          as จำนวนกิจกรรมทั้งหมด,
  count(*) filter (where start_at >= now())         as ที่ยังไม่ถึง,
  min(start_at)::date                               as กิจกรรมแรกสุด,
  max(start_at)::date                               as กิจกรรมท้ายสุด
from public.events;
