-- ============================================================
-- 40_gradebook.sql — คะแนนระหว่างภาคของจริง (T1-T5 และหัวข้อย่อย T1.1 / T1.2)
--
-- ปัญหาที่แก้:
--   โมดัล "คะแนนระหว่างภาค" กับ "ผลการเรียน" ใน src/pages/student/StudentHome.jsx
--   เป็นตัวเลขที่เขียนตายไว้ในโค้ด (ตัวแปร SCORE_ITEMS และ array ในโมดัลเกรด)
--   นักเรียนทุกคนทั้งวิทยาลัยจึงเห็นคะแนนชุดเดียวกันเป๊ะ — 42/50 วิชาเกม, GPA 3.45
--   ไม่ว่าจะเรียนห้องไหน สาขาอะไร หรือทำคะแนนได้จริงเท่าไหร่
--   และไม่มีหน้าไหนในระบบเลยที่อาจารย์จะกรอกคะแนนเข้าไปได้
--
--   ที่สำคัญกว่านั้น: ของเดิมเก็บได้แค่ "ยอดรวมของวิชา" (42/50) ซึ่งตอบคำถามที่
--   นักเรียนถามจริง ๆ ไม่ได้เลย — หายไปตรงไหน ใบงานไหนยังไม่ส่ง สอบปฏิบัติได้เท่าไหร่
--   โครงสร้างจริงที่อาจารย์ใช้คิดคะแนนคือ T1-T5 แล้วซอยย่อยเป็น T1.1 T1.2 ในแต่ละตัว
--
-- ไฟล์นี้เพิ่ม:
--   1) subjects       — รายวิชาของแต่ละห้อง/ภาคเรียน (seed จาก timetables ที่มีอยู่แล้ว)
--   2) score_items    — หัวข้อคะแนนแบบต้นไม้ 2 ชั้น: T1-T5 (แม่) แล้วแตกเป็น T1.1 T1.2 (ลูก)
--   3) student_scores — คะแนนรายคน รายหัวข้อย่อย
--   4) score_logs     — ปูมทุกการให้/ตัด/แก้คะแนน ย้อนดูได้ว่าใครทำอะไรเมื่อไหร่
--   5) RPC ครบชุดทั้งฝั่งนักเรียน (ดูของตัวเอง) และฝั่งอาจารย์ (กรอก/ให้/ตัด/แก้โครงสร้าง)
--
-- หลักการเดียวกับทั้งโปรเจกต์: ตารางเปิดให้ "อ่าน" ผ่าน RLS เท่านั้น
-- ส่วนการ "เขียน" ทุกจุดผ่าน RPC security definer ที่ตรวจสิทธิ์เองก่อนเสมอ
-- (แนวเดียวกับ 18_topup_requests.sql และ 20_behavior_and_notifications.sql)
--
-- รันซ้ำได้ / ต้องรัน 01_schema.sql, 02_functions.sql, 20_behavior_and_notifications.sql,
-- 22_leave_requests.sql และ 25_timetables.sql มาก่อน
-- ============================================================

-- ============================================================
-- 1) ตาราง subjects — รายวิชาของห้องหนึ่งในภาคเรียนหนึ่ง
-- ============================================================
create table if not exists public.subjects (
  id              uuid primary key default gen_random_uuid(),

  -- ผูกกับห้องเรียนจริง ไม่ใช่ข้อความ ปวช.3/6 ที่พิมพ์ไม่ตรงกันเมื่อไหร่ก็หลุดทันที
  class_room_id   bigint      not null references public.class_rooms(id) on delete cascade,

  -- 1/2569 — คนละเทอมคือคนละชุดคะแนน ไม่ทับกัน และดูย้อนหลังได้
  term            text        not null default '1/2569',

  code            text        not null default '',
  name            text        not null,
  credits         smallint    not null default 3 check (credits between 0 and 30),

  -- ครูประจำวิชา — null ได้ เพราะตอน seed จาก timetables เรามีแค่ชื่อครูเป็นข้อความ
  -- ซึ่งจับคู่กับบัญชีในตาราง users ไม่ได้เสมอไป
  -- วิชาที่ teacher_user_id เป็น null ครูคนไหนก็กรอกคะแนนได้ (ดู app_can_grade_subject)
  -- ไม่งั้นข้อมูลที่ seed มาจะกรอกไม่ได้เลยสักวิชา = ฟีเจอร์ตายตั้งแต่วันแรก
  teacher_user_id uuid        references public.users(id) on delete set null,
  teacher_name    text        not null default '',

  sort_order      smallint    not null default 0,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint subjects_name_not_blank check (char_length(trim(name)) > 0),
  -- หนึ่งห้อง หนึ่งเทอม ห้ามมีวิชาชื่อซ้ำ — กัน seed/นำเข้าซ้ำจนคะแนนกระจายสองก้อน
  constraint subjects_unique_per_class unique (class_room_id, term, name)
);

create index if not exists subjects_class_term_idx on public.subjects (class_room_id, term, sort_order);
create index if not exists subjects_teacher_idx on public.subjects (teacher_user_id);

comment on table public.subjects is
  'รายวิชาของห้องเรียนหนึ่งในภาคเรียนหนึ่ง — เจ้าของคะแนน T1-T5 ทั้งหมดใน score_items';
comment on column public.subjects.teacher_user_id is
  'ครูประจำวิชา — null = ยังไม่ได้ผูกกับบัญชีจริง ครูทุกคนกรอกคะแนนวิชานี้ได้ชั่วคราว';

-- ============================================================
-- 2) ตาราง score_items — หัวข้อคะแนนแบบต้นไม้ 2 ชั้น
--
-- ชั้นบน (parent_id is null) = T1..T5    เช่น T1 จิตพิสัย
-- ชั้นล่าง (parent_id = T)   = T1.1 T1.2 เช่น T1.1 ความรับผิดชอบ
--
-- คะแนนเต็มของ T = ผลรวมของลูก (ถ้ามีลูก) ไม่ต้องกรอกซ้ำให้ขัดกันเอง
-- T ที่ไม่มีลูกเลยก็ใช้ max_score ของตัวเองเป็นหัวข้อให้คะแนนตรง ๆ ได้
-- ============================================================
create table if not exists public.score_items (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid        not null references public.subjects(id) on delete cascade,

  -- ลบ T1 ทิ้ง = T1.1 T1.2 ต้องหายตามไปด้วย ไม่ใช่ลอยเป็นหัวข้อไร้แม่
  -- on delete cascade จัดการให้ในชั้น DB เลย ไม่ต้องหวังว่าหน้าเว็บจะลบครบ
  parent_id   uuid        references public.score_items(id) on delete cascade,

  code         text        not null,
  label        text        not null default '',
  max_score    numeric(6,2) not null default 0 check (max_score >= 0 and max_score <= 1000),
  sort_order   smallint    not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint score_items_code_not_blank check (char_length(trim(code)) > 0),
  -- รหัสห้ามซ้ำในวิชาเดียวกัน — T1.1 สองอันในวิชาเดียวคือความสับสนที่ไม่มีใครแก้ถูก
  constraint score_items_code_unique unique (subject_id, code)
);

create index if not exists score_items_subject_idx on public.score_items (subject_id, sort_order);
create index if not exists score_items_parent_idx on public.score_items (parent_id, sort_order);

comment on table public.score_items is
  'หัวข้อคะแนนของรายวิชา 2 ชั้น: parent_id is null = T1-T5, parent_id = ลูกของ T นั้น เช่น T1.1 T1.2';
comment on column public.score_items.max_score is
  'คะแนนเต็มของหัวข้อนี้ — หัวข้อที่มีลูก ระบบจะใช้ผลรวมของลูกแทนค่านี้เสมอ';

-- กันโครงสร้างลึกเกินสองชั้น (T1.1.1) ด้วย trigger ไม่ใช่ check constraint
-- เพราะ check เรียกตารางตัวเองไม่ได้ และโครงสร้างหน้าเว็บทั้งฝั่งนักเรียน/อาจารย์
-- วาดไว้แค่สองชั้น ถ้าเผลอมีชั้นสามจะหายไปเงียบ ๆ โดยไม่มีใครรู้ว่าคะแนนตกหล่น
create or replace function public.score_items_depth_guard()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.score_items where id = new.parent_id and parent_id is not null) then
      raise exception 'score_items รองรับแค่ 2 ชั้น เพิ่มชั้นที่สามไม่ได้';
    end if;
    if exists (select 1 from public.score_items where id = new.parent_id and subject_id <> new.subject_id) then
      raise exception 'หัวข้อย่อยต้องอยู่ในรายวิชาเดียวกับหัวข้อแม่';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $fn$;

drop trigger if exists score_items_depth_guard_trg on public.score_items;
create trigger score_items_depth_guard_trg
  before insert or update on public.score_items
  for each row execute function public.score_items_depth_guard();

-- ============================================================
-- 3) ตาราง student_scores — คะแนนรายคน รายหัวข้อ
-- ============================================================
create table if not exists public.student_scores (
  id              uuid primary key default gen_random_uuid(),

  -- เก็บ subject_id ซ้ำทั้งที่ไล่จาก item_id ก็ได้ — เพื่อให้สรุปยอดรายวิชา
  -- ไม่ต้อง join score_items ทุกครั้ง และ index เดียวจบ
  subject_id      uuid        not null references public.subjects(id) on delete cascade,
  item_id         uuid        not null references public.score_items(id) on delete cascade,
  student_user_id uuid        not null references public.users(id) on delete cascade,

  score           numeric(6,2) not null default 0 check (score >= 0),
  note            text        not null default '',

  -- คนที่แก้ล่าสุด — ห้ามลบบัญชีครูที่ยังมีคะแนนค้างอยู่ (แนวเดียวกับ behavior_logs)
  graded_by       uuid        references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- หนึ่งคน หนึ่งหัวข้อ มีได้คะแนนเดียว — หัวใจของการ upsert ทั้งไฟล์นี้
  constraint student_scores_unique unique (item_id, student_user_id)
);

create index if not exists student_scores_student_idx on public.student_scores (student_user_id, subject_id);
create index if not exists student_scores_subject_idx on public.student_scores (subject_id);

comment on table public.student_scores is
  'คะแนนของนักเรียนรายหัวข้อย่อย — เขียนได้ทางเดียวผ่าน save_score, adjust_score, bulk_save_scores';

-- ============================================================
-- 4) ตาราง score_logs — ปูมการให้/ตัด/แก้คะแนน
--
-- ต่างจาก behavior_log_edits ตรงที่บันทึกทุกครั้งที่ค่าเปลี่ยน ไม่ใช่เฉพาะตอนแก้
-- เพราะคะแนนเป็นเรื่องที่ถูกทักท้วงย้อนหลังบ่อยที่สุดในโรงเรียน
-- ต้องตอบได้ว่าครูคนไหน ตัดตอนไหน เพราะอะไร โดยไม่ต้องเชื่อความจำใคร
-- ============================================================
create table if not exists public.score_logs (
  id              uuid primary key default gen_random_uuid(),
  subject_id      uuid        not null references public.subjects(id) on delete cascade,
  item_id         uuid        references public.score_items(id) on delete set null,
  student_user_id uuid        not null references public.users(id) on delete cascade,

  item_code       text        not null default '',
  action          text        not null,
  old_score       numeric(6,2),
  new_score       numeric(6,2),
  delta           numeric(6,2) not null default 0,
  reason          text        not null default '',

  teacher_user_id uuid        not null default app_current_user_id() references public.users(id),
  created_at      timestamptz not null default now(),

  constraint score_logs_action_valid check (action in ('set', 'adjust', 'clear'))
);

create index if not exists score_logs_student_idx on public.score_logs (student_user_id, created_at desc);
create index if not exists score_logs_subject_idx on public.score_logs (subject_id, created_at desc);

comment on table public.score_logs is
  'ปูมทุกการเปลี่ยนแปลงคะแนน — ใครให้/ตัด เท่าไหร่ เพราะอะไร เมื่อไหร่ (อ่านอย่างเดียว เขียนผ่าน RPC)';

-- ============================================================
-- 5) ตัวช่วยสิทธิ์ + ตัวช่วยคำนวณ
-- ============================================================

-- ใครกรอกคะแนนวิชานี้ได้
--   ฝ่ายวิชาการ/แอดมิน  -> ได้ทุกวิชา (ต้องแก้แทนครูที่ลาออก/ลาคลอดได้)
--   ครูประจำวิชา        -> ได้เฉพาะวิชาตัวเอง
--   ครูทั่วไป           -> ได้เฉพาะวิชาที่ยังไม่ได้ผูกครูประจำวิชา (teacher_user_id is null)
--                          เพราะข้อมูลที่ seed จาก timetables มาแบบนั้นทั้งหมด
--                          ถ้าปิดตายไว้ก่อน จะไม่มีใครกรอกคะแนนได้เลยสักวิชา
create or replace function public.app_can_grade_subject(p_subject_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and (
        app_has_role('academic')
        or app_has_role('sysadmin')
        or (
          app_has_role('teacher')
          and (s.teacher_user_id is null or s.teacher_user_id = app_current_user_id())
        )
      )
  );
$fn$;

comment on function public.app_can_grade_subject(uuid) is
  'true เมื่อผู้เรียกมีสิทธิ์กรอก/แก้คะแนนของรายวิชานี้ — ฝ่ายวิชาการได้ทุกวิชา ครูได้วิชาตัวเองหรือวิชาที่ยังไม่ระบุครู';

grant execute on function public.app_can_grade_subject(uuid) to authenticated;
revoke all on function public.app_can_grade_subject(uuid) from anon;
revoke execute on function public.app_can_grade_subject(uuid) from public;

-- คะแนนเต็มของวิชา = ผลรวมของหัวข้อที่ไม่มีลูก (ใบ) เท่านั้น
-- ถ้ารวมทั้งแม่และลูกจะได้สองเท่าเสมอ เพราะแม่คือผลรวมของลูกอยู่แล้ว
create or replace function public.subject_max_score(p_subject_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $fn$
  select coalesce(sum(si.max_score), 0)
  from public.score_items si
  where si.subject_id = p_subject_id
    and not exists (select 1 from public.score_items c where c.parent_id = si.id);
$fn$;

-- คะแนนที่นักเรียนคนหนึ่งทำได้ในวิชาหนึ่ง (นับเฉพาะหัวข้อใบเช่นกัน)
create or replace function public.student_subject_score(p_subject_id uuid, p_student_user_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $fn$
  select coalesce(sum(ss.score), 0)
  from public.student_scores ss
  join public.score_items si on si.id = ss.item_id
  where ss.subject_id = p_subject_id
    and ss.student_user_id = p_student_user_id
    and not exists (select 1 from public.score_items c where c.parent_id = si.id);
$fn$;

-- ตัวช่วยจัดรูปตัวเลขคะแนนสำหรับข้อความแจ้งเตือน
-- to_char แบบ FM ทิ้งจุดทศนิยมค้างไว้เมื่อไม่มีเศษ (2.00 กลายเป็น "2.") ซึ่งอ่านแล้วเหมือนพิมพ์ตก
-- rtrim จุดท้ายออกจึงได้ 2 กับ 2.5 ตามที่ครูเขียนบนกระดานจริง
create or replace function public.fmt_score(p_value numeric)
returns text language sql immutable
as $fn$
  select rtrim(to_char(coalesce(p_value, 0), 'FM999990.99'), '.');
$fn$;

grant execute on function public.fmt_score(numeric) to authenticated;

-- สองตัวข้างบนไม่ grant ให้ authenticated โดยตั้งใจ
-- student_subject_score() รับ uuid ของนักเรียนเป็นพารามิเตอร์ ถ้าเปิดให้เรียกตรง
-- ใครก็ตามที่ล็อกอินอยู่จะยิงถามยอดคะแนนของเพื่อนทั้งห้องได้จาก DevTools
-- ฟังก์ชันที่ต้องใช้มัน (my_score_summary, subject_gradebook) เป็น security definer
-- จึงเรียกได้ด้วยสิทธิ์ของเจ้าของอยู่แล้ว ไม่ต้องเปิดประตูชั้นนอกให้หน้าเว็บ
revoke all on function public.subject_max_score(uuid) from public;
revoke all on function public.subject_max_score(uuid) from anon;
revoke all on function public.subject_max_score(uuid) from authenticated;
revoke all on function public.student_subject_score(uuid, uuid) from public;
revoke all on function public.student_subject_score(uuid, uuid) from anon;
revoke all on function public.student_subject_score(uuid, uuid) from authenticated;

-- ============================================================
-- 6) RLS
-- ============================================================
alter table public.subjects       enable row level security;
alter table public.score_items    enable row level security;
alter table public.student_scores enable row level security;
alter table public.score_logs     enable row level security;

drop policy if exists subjects_read       on public.subjects;
drop policy if exists score_items_read    on public.score_items;
drop policy if exists student_scores_read on public.student_scores;
drop policy if exists score_logs_read     on public.score_logs;

-- รายวิชา/หัวข้อคะแนน: ไม่ใช่ข้อมูลส่วนบุคคล ใครล็อกอินอยู่ก็อ่านได้
-- ที่ต้องกันคือ "การแก้" ไม่ใช่ "การอ่าน" (แนวเดียวกับ timetables ใน 25_timetables.sql)
create policy subjects_read on public.subjects
  for select to authenticated using (true);

create policy score_items_read on public.score_items
  for select to authenticated using (true);

-- คะแนนรายคน: เจ้าของเห็นของตัวเอง เจ้าหน้าที่สอนเห็นทั้งหมด
-- นักเรียนต้องไม่เห็นคะแนนเพื่อนแม้แต่แถวเดียว
create policy student_scores_read on public.student_scores
  for select to authenticated
  using (student_user_id = app_current_user_id() or app_is_teaching_staff());

create policy score_logs_read on public.score_logs
  for select to authenticated
  using (student_user_id = app_current_user_id() or app_is_teaching_staff());

-- ไม่มี policy insert/update/delete ให้ใครเลย — เขียนได้ทางเดียวผ่าน RPC ข้างล่าง
-- grant คือประตูชั้นนอก policy คือยามที่ตรวจทีละแถว ต้องเปิดทั้งคู่ถึงจะผ่าน
grant select on public.subjects       to authenticated;
grant select on public.score_items    to authenticated;
grant select on public.student_scores to authenticated;
grant select on public.score_logs     to authenticated;

revoke all on public.subjects       from anon;
revoke all on public.score_items    from anon;
revoke all on public.student_scores from anon;
revoke all on public.score_logs     from anon;

-- ต้องถอนสิทธิ์เขียนออกจาก authenticated ด้วย ไม่ใช่แค่ไม่ grant ให้
--
-- Supabase ตั้ง "alter default privileges in schema public grant all on tables
-- to anon, authenticated" ไว้ตั้งแต่ตอนสร้างโปรเจกต์ ตารางใหม่ทุกตัวจึงได้ ALL
-- ติดมาตั้งแต่บรรทัด create table แล้ว — grant select ข้างบนเพิ่มสิทธิ์ ไม่ได้ถอนอะไร
-- (28_harden_core_tables.sql พิสูจน์เรื่องนี้มาแล้วด้วยการยิง API จริง)
--
-- ตอนนี้ยังเขียนไม่ได้เพราะไม่มี policy insert/update/delete ให้ RLS ผ่าน
-- แต่นั่นเหลือกำแพงชั้นเดียว วันไหนมีคนเพิ่ม policy กว้างเกินไปสักข้อ
-- นักเรียนจะ PATCH /rest/v1/student_scores แก้คะแนนตัวเองได้ทันที
-- ถอนที่ชั้น grant ด้วย = ต่อให้ policy พลาด ประตูชั้นนอกก็ยังปิดอยู่
-- (41_homeroom_attendance.sql กับ 43_student_fees.sql ทำแบบนี้กับตารางของตัวเองแล้ว)
revoke insert, update, delete on public.subjects       from authenticated;
revoke insert, update, delete on public.score_items    from authenticated;
revoke insert, update, delete on public.student_scores from authenticated;
revoke insert, update, delete on public.score_logs     from authenticated;

-- ============================================================
-- 7) RPC ฝั่งนักเรียน — สรุปคะแนนทุกวิชาของตัวเอง
--
-- แทนตัวแปร SCORE_ITEMS ที่เขียนตายไว้ใน StudentHome.jsx
-- ไม่รับ user id เป็นพารามิเตอร์เลย จึงถามแทนคนอื่นไม่ได้ตั้งแต่ต้น
-- (แนวเดียวกับ my_class_info() ใน 38_my_class_info.sql)
-- ============================================================
create or replace function public.my_score_summary(p_term text default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_me       uuid := app_current_user_id();
  v_class_id bigint;
  v_term     text;
  v_result   jsonb;
begin
  select sp.class_room_id into v_class_id
  from public.student_profiles sp
  where sp.user_id = v_me;

  /* "ไม่ใช่นักเรียน" กับ "เป็นนักเรียนแต่ยังไม่ถูกจัดห้อง" เป็นคนละเรื่องกัน
     ถ้ารวมเป็นข้อความเดียว นักเรียนใหม่ที่ฝ่ายทะเบียนยังไม่ได้ผูกห้องให้
     จะเห็นว่า "บัญชีนี้ไม่ได้เป็นนักเรียน" แล้วไปตั้งคำถามผิดจุดกับฝ่ายไอที
     ทั้งที่สิ่งที่ต้องทำคือให้ฝ่ายวิชาการจัดห้องให้ */
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_STUDENT', 'subjects', '[]'::jsonb);
  end if;

  if v_class_id is null then
    return jsonb_build_object('ok', false, 'error', 'NO_CLASSROOM', 'subjects', '[]'::jsonb);
  end if;

  -- ไม่ระบุเทอมมา = เอาเทอมล่าสุดที่ห้องนี้มีข้อมูล
  -- ขึ้นเทอมใหม่แล้วหน้าเว็บไม่ต้องแก้โค้ดตาม
  --
  -- ต้องแยกปีออกมาเรียงก่อนเทอม ไม่ใช่เรียงทั้งสตริง
  -- เพราะเรียงตรง ๆ แล้ว '2/2569' จะชนะ '1/2570' (เทียบตัวอักษรตัวแรก)
  -- ซึ่งแปลว่าพอขึ้นปีการศึกษาใหม่ นักเรียนจะเห็นคะแนนของเทอมปีที่แล้วค้างอยู่
  v_term := coalesce(
    nullif(trim(coalesce(p_term, '')), ''),
    (select s.term from public.subjects s
      where s.class_room_id = v_class_id and s.is_active
      order by split_part(s.term, '/', 2) desc, split_part(s.term, '/', 1) desc
      limit 1)
  );

  select coalesce(jsonb_agg(x order by x.sort_order, x.name), '[]'::jsonb)
    into v_result
  from (
    select
      s.id                                            as subject_id,
      s.code,
      s.name,
      s.credits,
      coalesce(nullif(s.teacher_name, ''), t.full_name, '') as teacher_name,
      s.sort_order,
      public.subject_max_score(s.id)                  as max_score,
      public.student_subject_score(s.id, v_me)        as score,
      -- มีคะแนนกรอกแล้วกี่หัวข้อ จากทั้งหมดกี่หัวข้อ
      -- ใช้บอกนักเรียนว่ายอดที่เห็นยังไม่ครบ ไม่ใช่ทำได้แค่นี้
      (select count(*) from public.score_items si
        where si.subject_id = s.id
          and not exists (select 1 from public.score_items c where c.parent_id = si.id)
      )                                               as item_count,
      (select count(*) from public.student_scores ss
        where ss.subject_id = s.id and ss.student_user_id = v_me
      )                                               as graded_count
    from public.subjects s
    left join public.users t on t.id = s.teacher_user_id
    where s.class_room_id = v_class_id
      and s.is_active
      and s.term = v_term
  ) x;

  return jsonb_build_object(
    'ok',       true,
    'term',     v_term,
    'subjects', v_result
  );
end $fn$;

comment on function public.my_score_summary(text) is
  'สรุปคะแนนระหว่างภาคทุกวิชาของผู้เรียกเอง — ไม่รับ user id จึงดูแทนคนอื่นไม่ได้';

grant execute on function public.my_score_summary(text) to authenticated;
revoke all on function public.my_score_summary(text) from anon;
revoke execute on function public.my_score_summary(text) from public;

-- ============================================================
-- 8) RPC ฝั่งนักเรียน — รายละเอียดวิชาเดียว แตก T1-T5 และหัวข้อย่อย
--
-- นี่คือหน้าจอที่นักเรียนกดเข้าไปดูจากสรุปด้านบน
-- คืนเป็นต้นไม้พร้อมคะแนนของตัวเองในใบแต่ละใบ หน้าเว็บแค่วาดตาม ไม่ต้องคำนวณเอง
-- ============================================================
create or replace function public.my_subject_scores(p_subject_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_me       uuid := app_current_user_id();
  v_class_id bigint;
  v_subject  record;
  v_items    jsonb;
begin
  select sp.class_room_id into v_class_id
  from public.student_profiles sp where sp.user_id = v_me;

  select s.*, coalesce(nullif(s.teacher_name, ''), t.full_name, '') as display_teacher
    into v_subject
  from public.subjects s
  left join public.users t on t.id = s.teacher_user_id
  where s.id = p_subject_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'SUBJECT_NOT_FOUND');
  end if;

  -- นักเรียนดูได้เฉพาะวิชาของห้องตัวเอง เจ้าหน้าที่สอนดูได้หมด (ใช้พรีวิวหน้าที่นักเรียนเห็น)
  if v_subject.class_room_id is distinct from v_class_id and not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id',         p.id,
             'code',       p.code,
             'label',      p.label,
             'sort_order', p.sort_order,
             -- หัวข้อที่มีลูก: คะแนนเต็มและคะแนนที่ได้ = ผลรวมของลูก
             -- หัวข้อที่ไม่มีลูก: ใช้ค่าของตัวเอง
             'max_score',  coalesce(ch.child_max, p.max_score),
             'score',      coalesce(ch.child_score, own.score, 0),
             'note',       coalesce(own.note, ''),
             'has_score',  case when ch.child_max is not null
                                then coalesce(ch.child_graded, 0) > 0
                                else own.id is not null end,
             'updated_at', coalesce(ch.child_updated, own.updated_at),
             'children',   coalesce(ch.items, '[]'::jsonb)
           )
           order by p.sort_order, p.code
         ), '[]'::jsonb)
    into v_items
  from public.score_items p
  left join public.student_scores own
    on own.item_id = p.id and own.student_user_id = v_me
  left join lateral (
    select
      sum(c.max_score)                                  as child_max,
      sum(coalesce(cs.score, 0))                        as child_score,
      count(cs.id)                                      as child_graded,
      max(cs.updated_at)                                as child_updated,
      jsonb_agg(
        jsonb_build_object(
          'id',         c.id,
          'code',       c.code,
          'label',      c.label,
          'sort_order', c.sort_order,
          'max_score',  c.max_score,
          'score',      coalesce(cs.score, 0),
          'note',       coalesce(cs.note, ''),
          'has_score',  cs.id is not null,
          'updated_at', cs.updated_at,
          'children',   '[]'::jsonb
        ) order by c.sort_order, c.code
      )                                                 as items
    from public.score_items c
    left join public.student_scores cs
      on cs.item_id = c.id and cs.student_user_id = v_me
    where c.parent_id = p.id
  ) ch on true
  where p.subject_id = p_subject_id
    and p.parent_id is null;

  return jsonb_build_object(
    'ok', true,
    'subject', jsonb_build_object(
      'id',           v_subject.id,
      'code',         v_subject.code,
      'name',         v_subject.name,
      'credits',      v_subject.credits,
      'term',         v_subject.term,
      'teacher_name', v_subject.display_teacher,
      'max_score',    public.subject_max_score(p_subject_id),
      'score',        public.student_subject_score(p_subject_id, v_me)
    ),
    'items', v_items
  );
end $fn$;

comment on function public.my_subject_scores(uuid) is
  'รายละเอียดคะแนนวิชาเดียวของผู้เรียกเอง แตกเป็นต้นไม้ T1-T5 พร้อมหัวข้อย่อย T1.1 T1.2';

grant execute on function public.my_subject_scores(uuid) to authenticated;
revoke all on function public.my_subject_scores(uuid) from anon;
revoke execute on function public.my_subject_scores(uuid) from public;

-- ============================================================
-- 9) RPC ฝั่งอาจารย์ — รายวิชาที่ตัวเองกรอกคะแนนได้
-- ============================================================
create or replace function public.list_gradebook_subjects(
  p_class_room_id bigint default null,
  p_term          text   default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_me     uuid := app_current_user_id();
  v_term   text := nullif(trim(coalesce(p_term, '')), '');
  v_result jsonb;
begin
  if not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select coalesce(jsonb_agg(x order by x.level, x.room_no, x.sort_order, x.name), '[]'::jsonb)
    into v_result
  from (
    select
      s.id                                   as subject_id,
      s.code,
      s.name,
      s.credits,
      s.term,
      s.sort_order,
      s.class_room_id,
      cr.level,
      cr.room_no,
      cr.level || '/' || cr.room_no          as class_label,
      s.teacher_user_id,
      coalesce(nullif(s.teacher_name, ''), t.full_name, '') as teacher_name,
      public.subject_max_score(s.id)         as max_score,
      public.app_can_grade_subject(s.id)     as can_grade,
      (select count(*) from public.score_items si where si.subject_id = s.id and si.parent_id is null) as unit_count,
      (select count(*) from public.student_profiles sp where sp.class_room_id = s.class_room_id)       as student_count
    from public.subjects s
    join public.class_rooms cr on cr.id = s.class_room_id
    left join public.users t on t.id = s.teacher_user_id
    where s.is_active
      and (p_class_room_id is null or s.class_room_id = p_class_room_id)
      and (v_term is null or s.term = v_term)
  ) x;

  return jsonb_build_object('ok', true, 'subjects', v_result);
end $fn$;

comment on function public.list_gradebook_subjects(bigint, text) is
  'รายวิชาทั้งหมดพร้อมธง can_grade บอกว่าผู้เรียกกรอกคะแนนวิชานั้นได้หรือไม่ (role teacher/academic/sysadmin)';

grant execute on function public.list_gradebook_subjects(bigint, text) to authenticated;
revoke all on function public.list_gradebook_subjects(bigint, text) from anon;
revoke execute on function public.list_gradebook_subjects(bigint, text) from public;

-- ============================================================
-- 10) RPC ฝั่งอาจารย์ — ตารางคะแนนทั้งห้องของวิชาหนึ่ง
--
-- คืนสามก้อนในคำขอเดียว: โครงสร้างหัวข้อ, รายชื่อนักเรียน, คะแนนทุกช่อง
-- หน้าเว็บจะได้ไม่ต้องยิงทีละนักเรียน (ห้องละ 30 คน = 30 คำขอ ซึ่งช้าจนใช้ไม่ได้จริง)
-- ============================================================
create or replace function public.subject_gradebook(p_subject_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_subject  record;
  v_items    jsonb;
  v_students jsonb;
begin
  if not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select s.*, cr.level, cr.room_no,
         coalesce(nullif(s.teacher_name, ''), t.full_name, '') as display_teacher
    into v_subject
  from public.subjects s
  join public.class_rooms cr on cr.id = s.class_room_id
  left join public.users t on t.id = s.teacher_user_id
  where s.id = p_subject_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'SUBJECT_NOT_FOUND');
  end if;

  -- โครงสร้างหัวข้อ (ไม่มีคะแนนใคร — คะแนนอยู่ในก้อน students)
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id',         p.id,
             'code',       p.code,
             'label',      p.label,
             'sort_order', p.sort_order,
             'max_score',  coalesce(ch.child_max, p.max_score),
             'children',   coalesce(ch.items, '[]'::jsonb)
           ) order by p.sort_order, p.code
         ), '[]'::jsonb)
    into v_items
  from public.score_items p
  left join lateral (
    select
      sum(c.max_score) as child_max,
      jsonb_agg(
        jsonb_build_object(
          'id',         c.id,
          'code',       c.code,
          'label',      c.label,
          'sort_order', c.sort_order,
          'max_score',  c.max_score,
          'children',   '[]'::jsonb
        ) order by c.sort_order, c.code
      ) as items
    from public.score_items c where c.parent_id = p.id
  ) ch on true
  where p.subject_id = p_subject_id and p.parent_id is null;

  -- รายชื่อนักเรียนในห้องนั้น พร้อมคะแนนทุกช่องเป็น object คีย์ด้วย item_id
  -- เลือก object แทน array เพราะหน้าเว็บต้องหยิบคะแนนของช่องที่กำลังแก้ให้ไวที่สุด
  select coalesce(jsonb_agg(y order by y.full_name), '[]'::jsonb)
    into v_students
  from (
    select
      u.id                                              as user_id,
      u.full_name,
      sp.student_code,
      public.student_subject_score(p_subject_id, u.id)  as total_score,
      coalesce((
        select jsonb_object_agg(ss.item_id::text, jsonb_build_object(
                 'score', ss.score,
                 'note',  ss.note
               ))
        from public.student_scores ss
        where ss.subject_id = p_subject_id and ss.student_user_id = u.id
      ), '{}'::jsonb)                                   as scores
    from public.student_profiles sp
    join public.users u on u.id = sp.user_id
    where sp.class_room_id = v_subject.class_room_id
  ) y;

  return jsonb_build_object(
    'ok', true,
    'can_grade', public.app_can_grade_subject(p_subject_id),
    'subject', jsonb_build_object(
      'id',           v_subject.id,
      'code',         v_subject.code,
      'name',         v_subject.name,
      'credits',      v_subject.credits,
      'term',         v_subject.term,
      'teacher_name', v_subject.display_teacher,
      'class_label',  v_subject.level || '/' || v_subject.room_no,
      'max_score',    public.subject_max_score(p_subject_id)
    ),
    'items',    v_items,
    'students', v_students
  );
end $fn$;

comment on function public.subject_gradebook(uuid) is
  'ตารางคะแนนทั้งห้องของวิชาหนึ่ง — โครงสร้างหัวข้อ รายชื่อนักเรียน และคะแนนทุกช่อง ในคำขอเดียว';

grant execute on function public.subject_gradebook(uuid) to authenticated;
revoke all on function public.subject_gradebook(uuid) from anon;
revoke execute on function public.subject_gradebook(uuid) from public;

-- ============================================================
-- 11) แกนกลางของการเขียนคะแนน
--
-- ทั้ง save_score / adjust_score / bulk_save_scores ลงเอยที่ฟังก์ชันนี้ตัวเดียว
-- กฎทุกข้อจึงอยู่ที่เดียว ไม่มีทางที่ทางใดทางหนึ่งจะหลุดการตรวจ
--   - ให้คะแนนได้เฉพาะหัวข้อใบ (หัวข้อที่ไม่มีลูก) — T1 ที่มี T1.1 T1.2 ห้ามกรอกตรง
--   - คะแนนต้องอยู่ในช่วง 0 ถึงคะแนนเต็มของหัวข้อนั้น
--   - นักเรียนต้องอยู่ห้องเดียวกับวิชานั้น
--   - ทุกครั้งที่ค่าเปลี่ยนจริง ลง score_logs และแจ้งเตือนนักเรียน
-- ============================================================
create or replace function public.apply_score_change(
  p_item_id         uuid,
  p_student_user_id uuid,
  p_new_score       numeric,   -- null = ล้างคะแนนทิ้ง
  p_note            text,
  p_action          text,
  p_reason          text,
  p_notify          boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_me        uuid := app_current_user_id();
  v_item      record;
  v_old       numeric;
  v_old_note  text;
  v_note      text;
  v_new       numeric := p_new_score;
  v_delta     numeric;
  v_title     text;
  v_body      text;
begin
  select si.*, s.class_room_id, s.name as subject_name, s.id as subj_id
    into v_item
  from public.score_items si
  join public.subjects s on s.id = si.subject_id
  where si.id = p_item_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ITEM_NOT_FOUND');
  end if;

  if not public.app_can_grade_subject(v_item.subj_id) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  -- หัวข้อที่มีลูกคือ "ยอดรวม" ไม่ใช่ช่องกรอก
  -- ถ้าปล่อยให้กรอกได้ ยอดรวมจะขัดกับผลบวกของลูกทันทีโดยไม่มีใครสังเกต
  if exists (select 1 from public.score_items c where c.parent_id = p_item_id) then
    return jsonb_build_object('ok', false, 'error', 'PARENT_ITEM_NOT_GRADABLE');
  end if;

  if not exists (
    select 1 from public.student_profiles sp
    where sp.user_id = p_student_user_id and sp.class_room_id = v_item.class_room_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'STUDENT_NOT_IN_CLASS');
  end if;

  select ss.score, ss.note into v_old, v_old_note
  from public.student_scores ss
  where ss.item_id = p_item_id and ss.student_user_id = p_student_user_id;

  if v_new is not null then
    -- ปัดสองตำแหน่งก่อนเทียบ ไม่งั้น 8.005 กับ 8.00 จะนับเป็นคนละค่าทั้งที่เก็บลงไปเท่ากัน
    v_new := round(v_new, 2);

    if v_new < 0 then
      return jsonb_build_object('ok', false, 'error', 'SCORE_NEGATIVE');
    end if;

    if v_new > v_item.max_score then
      return jsonb_build_object(
        'ok', false, 'error', 'SCORE_OVER_MAX',
        'max_score', v_item.max_score
      );
    end if;
  end if;

  v_delta := coalesce(v_new, 0) - coalesce(v_old, 0);

  /* p_note เป็น null แปลว่า "ไม่ได้ยุ่งกับหมายเหตุ" ไม่ใช่ "ลบหมายเหตุทิ้ง"
     ต้องแยกสองอย่างนี้ให้ขาด เพราะทางที่เรียกเข้ามาส่วนใหญ่ไม่ได้ส่งหมายเหตุมาด้วยเลย
     — adjust_score() (ปุ่มให้/ตัดคะแนน) และ bulk_save_scores() (กรอกทั้งห้อง)
     ถ้าตีความ null เป็นค่าว่าง ครูกดปุ่ม -1 ทีเดียว หมายเหตุ "ส่งช้า 2 วัน"
     ที่พิมพ์ไว้ก่อนหน้าจะหายไปเงียบ ๆ โดยไม่มีอะไรบอก
     อยากล้างหมายเหตุจริง ๆ ให้ส่งสตริงว่างมา ซึ่งเป็นสิ่งที่ช่องกรอกในหน้าเว็บส่งอยู่แล้ว */
  v_note := coalesce(p_note, v_old_note, '');

  -- ค่าไม่เปลี่ยนและหมายเหตุไม่เปลี่ยน = ไม่ต้องเขียนอะไรเลย
  -- กันปูมบวมและกันแจ้งเตือนซ้ำตอนครูกดบันทึกทั้งห้องทั้งที่แก้ไปคนเดียว
  if v_new is not distinct from v_old
     and v_note is not distinct from coalesce(v_old_note, '') then
    return jsonb_build_object('ok', true, 'unchanged', true, 'score', v_old);
  end if;

  if v_new is null then
    delete from public.student_scores
    where item_id = p_item_id and student_user_id = p_student_user_id;
  else
    insert into public.student_scores
      (subject_id, item_id, student_user_id, score, note, graded_by)
    values
      (v_item.subj_id, p_item_id, p_student_user_id, v_new, v_note, v_me)
    on conflict (item_id, student_user_id) do update
      set score      = excluded.score,
          note       = excluded.note,
          graded_by  = excluded.graded_by,
          updated_at = now();
  end if;

  insert into public.score_logs
    (subject_id, item_id, student_user_id, item_code, action, old_score, new_score, delta, reason, teacher_user_id)
  values
    (v_item.subj_id, p_item_id, p_student_user_id, v_item.code,
     p_action, v_old, v_new, v_delta, coalesce(p_reason, ''), v_me);

  if p_notify then
    if v_new is null then
      v_title := 'ลบคะแนน ' || v_item.code || ' วิชา' || v_item.subject_name;
      v_body  := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'อาจารย์ลบคะแนนหัวข้อนี้ออก');

    /* ประกาศคะแนนครั้งแรกของหัวข้อนี้ ต้องแยกออกมาก่อนเช็ค delta
       ไม่งั้นคนที่ได้ 0 คะแนน (delta = 0 - 0 = 0) จะตกไปกิ่งสุดท้าย
       แล้วได้แจ้งเตือนว่า "อาจารย์แก้ไขหมายเหตุ" ทั้งที่เพิ่งถูกให้ศูนย์
       ซึ่งเป็นกรณีที่นักเรียนต้องรู้มากที่สุดในบรรดาทั้งหมด */
    elsif v_old is null then
      v_title := 'ประกาศคะแนน ' || v_item.code || ' ' || public.fmt_score(v_new)
                 || '/' || public.fmt_score(v_item.max_score);
      v_body  := v_item.subject_name
                 || coalesce(' — ' || nullif(trim(coalesce(p_reason, '')), ''), '');

    elsif v_delta > 0 then
      v_title := 'ได้คะแนน ' || v_item.code || ' +' || public.fmt_score(v_delta)
                 || ' (' || public.fmt_score(v_new) || '/'
                 || public.fmt_score(v_item.max_score) || ')';
      v_body  := v_item.subject_name
                 || coalesce(' — ' || nullif(trim(coalesce(p_reason, '')), ''), '');
    elsif v_delta < 0 then
      v_title := 'ถูกปรับคะแนน ' || v_item.code || ' ' || public.fmt_score(v_delta)
                 || ' (' || public.fmt_score(v_new) || '/'
                 || public.fmt_score(v_item.max_score) || ')';
      v_body  := v_item.subject_name
                 || coalesce(' — ' || nullif(trim(coalesce(p_reason, '')), ''), '');
    else
      v_title := 'อาจารย์แก้ไขหมายเหตุคะแนน ' || v_item.code;
      v_body  := v_item.subject_name || ' — ' || v_note;
    end if;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      p_student_user_id,
      'score_update',
      v_title,
      v_body,
      jsonb_build_object(
        'subject_id', v_item.subj_id,
        'item_id',    p_item_id,
        'item_code',  v_item.code,
        'old_score',  v_old,
        'new_score',  v_new,
        'delta',      v_delta
      )
    );
  end if;

  return jsonb_build_object(
    'ok',        true,
    'score',     v_new,
    'old_score', v_old,
    'delta',     v_delta
  );
end $fn$;

comment on function public.apply_score_change(uuid, uuid, numeric, text, text, text, boolean) is
  'แกนกลางการเขียนคะแนน — ตรวจสิทธิ์ ตรวจช่วงคะแนน บันทึกปูม และแจ้งเตือนนักเรียน จุดเดียวที่แตะ student_scores ได้';

-- ไม่ให้หน้าเว็บเรียกตรง ๆ — เรียกผ่าน save_score/adjust_score/bulk_save_scores เท่านั้น
-- (ตัวนี้รับ p_action กับ p_notify ซึ่งถ้าเปิดให้เรียกเองจะปลอมปูมและปิดแจ้งเตือนได้ตามใจ)
revoke all on function public.apply_score_change(uuid, uuid, numeric, text, text, text, boolean) from public;
revoke all on function public.apply_score_change(uuid, uuid, numeric, text, text, text, boolean) from anon;
revoke all on function public.apply_score_change(uuid, uuid, numeric, text, text, text, boolean) from authenticated;

-- ============================================================
-- 12) RPC: กรอกคะแนนช่องเดียว (ตั้งค่าเป็นตัวเลขที่ระบุ)
-- ============================================================
create or replace function public.save_score(
  p_item_id         uuid,
  p_student_user_id uuid,
  p_score           numeric,
  p_note            text default null,
  p_reason          text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
begin
  if not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  return public.apply_score_change(
    p_item_id, p_student_user_id, p_score, p_note,
    case when p_score is null then 'clear' else 'set' end,
    p_reason, true
  );
end $fn$;

comment on function public.save_score(uuid, uuid, numeric, text, text) is
  'กรอก/แก้คะแนนหนึ่งช่อง — ส่ง p_score เป็น null เพื่อล้างคะแนนหัวข้อนั้นทิ้ง';

grant execute on function public.save_score(uuid, uuid, numeric, text, text) to authenticated;
revoke all on function public.save_score(uuid, uuid, numeric, text, text) from anon;
revoke execute on function public.save_score(uuid, uuid, numeric, text, text) from public;

-- ============================================================
-- 13) RPC: ให้/ตัดคะแนนแบบบวกลบจากของเดิม
--
-- ต่างจาก save_score ตรงที่ครูไม่ต้องรู้ว่าเดิมได้เท่าไหร่ แค่บอกว่าจะบวกหรือลบเท่าไหร่
-- ซึ่งตรงกับวิธีพูดจริงในห้องเรียน: ส่งช้าหักหนึ่งคะแนน, ช่วยงานเพิ่มให้สองคะแนน
-- คะแนนสุดท้ายถูกบีบให้อยู่ในช่วง 0 ถึงเต็มเสมอ ตัดเกินไม่ติดลบ บวกเกินไม่ทะลุเพดาน
-- ============================================================
create or replace function public.adjust_score(
  p_item_id         uuid,
  p_student_user_id uuid,
  p_delta           numeric,
  p_reason          text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_item    record;
  v_old     numeric;
  v_target  numeric;
begin
  if not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DELTA');
  end if;

  select si.max_score, si.subject_id into v_item
  from public.score_items si where si.id = p_item_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ITEM_NOT_FOUND');
  end if;

  select ss.score into v_old
  from public.student_scores ss
  where ss.item_id = p_item_id and ss.student_user_id = p_student_user_id;

  v_target := greatest(0, least(v_item.max_score, coalesce(v_old, 0) + p_delta));

  return public.apply_score_change(
    p_item_id, p_student_user_id, v_target, null, 'adjust', p_reason, true
  );
end $fn$;

comment on function public.adjust_score(uuid, uuid, numeric, text) is
  'ให้คะแนนเพิ่ม (delta บวก) หรือตัดคะแนน (delta ลบ) จากคะแนนเดิม — บีบผลลัพธ์ให้อยู่ในช่วง 0 ถึงคะแนนเต็มเสมอ';

grant execute on function public.adjust_score(uuid, uuid, numeric, text) to authenticated;
revoke all on function public.adjust_score(uuid, uuid, numeric, text) from anon;
revoke execute on function public.adjust_score(uuid, uuid, numeric, text) from public;

-- ============================================================
-- 14) RPC: บันทึกคะแนนทั้งคอลัมน์ทีเดียว
--
-- ครูกรอกคะแนนใบงานทั้งห้องรวดเดียวเป็นเรื่องปกติ
-- ถ้าให้ยิงทีละคนแบบ 30 คำขอ จะช้าและมีโอกาสค้างกลางทางจนคะแนนเข้าไม่ครบ
-- ทำในธุรกรรมเดียว = เข้าครบทุกคนหรือไม่เข้าเลย
-- ============================================================
create or replace function public.bulk_save_scores(
  p_item_id uuid,
  p_rows    jsonb,
  p_notify  boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_row     jsonb;
  v_res     jsonb;
  v_saved   integer := 0;
  v_skipped integer := 0;
  v_errors  jsonb := '[]'::jsonb;
begin
  if not app_is_teaching_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ROWS');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_res := public.apply_score_change(
      p_item_id,
      (v_row->>'student_user_id')::uuid,
      case when v_row->>'score' is null or v_row->>'score' = ''
           then null else (v_row->>'score')::numeric end,
      v_row->>'note',
      'set',
      v_row->>'reason',
      p_notify
    );

    if (v_res->>'ok')::boolean then
      if coalesce((v_res->>'unchanged')::boolean, false)
        then v_skipped := v_skipped + 1;
        else v_saved := v_saved + 1;
      end if;
    else
      -- แถวที่พังไม่ล้มทั้งชุด แต่ต้องรายงานกลับไปให้ครูเห็นว่าใครไม่เข้า
      -- (เงียบไปเฉย ๆ แล้วครูคิดว่าบันทึกครบ คือสิ่งที่แย่ที่สุดของฟีเจอร์นี้)
      v_errors := v_errors || jsonb_build_object(
        'student_user_id', v_row->>'student_user_id',
        'error',           v_res->>'error'
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok',      true,
    'saved',   v_saved,
    'skipped', v_skipped,
    'errors',  v_errors
  );
end $fn$;

comment on function public.bulk_save_scores(uuid, jsonb, boolean) is
  'บันทึกคะแนนหัวข้อเดียวให้นักเรียนหลายคนในธุรกรรมเดียว — p_rows เป็น array ของ {student_user_id, score, note}';

grant execute on function public.bulk_save_scores(uuid, jsonb, boolean) to authenticated;
revoke all on function public.bulk_save_scores(uuid, jsonb, boolean) from anon;
revoke execute on function public.bulk_save_scores(uuid, jsonb, boolean) from public;

-- ============================================================
-- 15) RPC: จัดการโครงสร้าง T1-T5 และหัวข้อย่อย
-- ============================================================
create or replace function public.upsert_score_item(
  p_item_id    uuid    default null,
  p_subject_id uuid    default null,
  p_parent_id  uuid    default null,
  p_code       text    default null,
  p_label      text    default null,
  p_max_score  numeric default null,
  p_sort_order integer default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_subject_id uuid := p_subject_id;
  v_id         uuid;
  v_code       text := trim(coalesce(p_code, ''));
begin
  -- แก้ของเดิม: วิชาต้องมาจากแถวเดิมเสมอ ไม่ใช่จากที่หน้าเว็บส่งมา
  -- กันการย้ายหัวข้อข้ามวิชาโดยไม่ตั้งใจ ซึ่งจะพาคะแนนเดิมย้ายตามไปทั้งก้อน
  if p_item_id is not null then
    select subject_id into v_subject_id from public.score_items where id = p_item_id;
    if v_subject_id is null then
      return jsonb_build_object('ok', false, 'error', 'ITEM_NOT_FOUND');
    end if;
  end if;

  if v_subject_id is null then
    return jsonb_build_object('ok', false, 'error', 'SUBJECT_REQUIRED');
  end if;

  if not public.app_can_grade_subject(v_subject_id) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_item_id is null and char_length(v_code) = 0 then
    return jsonb_build_object('ok', false, 'error', 'CODE_REQUIRED');
  end if;

  if p_max_score is not null and (p_max_score < 0 or p_max_score > 1000) then
    return jsonb_build_object('ok', false, 'error', 'INVALID_MAX_SCORE');
  end if;

  if p_item_id is null then
    /* ไม่ระบุลำดับมา = ต่อท้ายพี่น้องในระดับเดียวกัน ไม่ใช่ลงไปเป็น 0 ทั้งหมด
       ถ้าปล่อยเป็น 0 หมด การเรียงจะไปตกที่ code แทน แล้ว T1.10 จะขึ้นก่อน T1.2
       เพราะเป็นการเทียบตัวอักษร ไม่ใช่ตัวเลข — เจอตอนวิชาที่มีใบงานเกินเก้าใบ */
    if p_sort_order is null then
      select coalesce(max(si.sort_order), 0) + 1 into p_sort_order
      from public.score_items si
      where si.subject_id = v_subject_id
        and si.parent_id is not distinct from p_parent_id;
    end if;

    insert into public.score_items (subject_id, parent_id, code, label, max_score, sort_order)
    values (
      v_subject_id, p_parent_id, v_code, coalesce(p_label, ''),
      coalesce(p_max_score, 0), p_sort_order
    )
    returning id into v_id;
  else
    update public.score_items
       set code       = case when char_length(v_code) > 0 then v_code else code end,
           label      = coalesce(p_label, label),
           max_score  = coalesce(p_max_score, max_score),
           sort_order = coalesce(p_sort_order, sort_order)
     where id = p_item_id
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'item_id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'CODE_DUPLICATE');
end $fn$;

comment on function public.upsert_score_item(uuid, uuid, uuid, text, text, numeric, integer) is
  'เพิ่ม/แก้หัวข้อคะแนน — ส่ง p_item_id เพื่อแก้ของเดิม, ส่ง p_parent_id เพื่อสร้างหัวข้อย่อยของ T นั้น';

grant execute on function public.upsert_score_item(uuid, uuid, uuid, text, text, numeric, integer) to authenticated;
revoke all on function public.upsert_score_item(uuid, uuid, uuid, text, text, numeric, integer) from anon;
revoke execute on function public.upsert_score_item(uuid, uuid, uuid, text, text, numeric, integer) from public;

create or replace function public.delete_score_item(p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_subject_id uuid;
  v_scores     integer;
begin
  select subject_id into v_subject_id from public.score_items where id = p_item_id;

  if v_subject_id is null then
    return jsonb_build_object('ok', false, 'error', 'ITEM_NOT_FOUND');
  end if;

  if not public.app_can_grade_subject(v_subject_id) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  -- นับคะแนนที่จะหายไปด้วย (รวมของหัวข้อลูก) แล้วส่งกลับให้หน้าเว็บยืนยันอีกชั้น
  select count(*) into v_scores
  from public.student_scores ss
  where ss.item_id = p_item_id
     or ss.item_id in (select id from public.score_items where parent_id = p_item_id);

  delete from public.score_items where id = p_item_id;

  return jsonb_build_object('ok', true, 'deleted_scores', v_scores);
end $fn$;

comment on function public.delete_score_item(uuid) is
  'ลบหัวข้อคะแนน (ลบ T = ลบหัวข้อย่อยและคะแนนทั้งหมดใต้มันด้วย) คืนจำนวนคะแนนที่หายไป';

grant execute on function public.delete_score_item(uuid) to authenticated;
revoke all on function public.delete_score_item(uuid) from anon;
revoke execute on function public.delete_score_item(uuid) from public;

-- ============================================================
-- 16) RPC: จัดการรายวิชา (ฝ่ายวิชาการ)
-- ============================================================
create or replace function public.upsert_subject(
  p_subject_id     uuid    default null,
  p_class_room_id  bigint  default null,
  p_term           text    default null,
  p_code           text    default null,
  p_name           text    default null,
  p_credits        integer default null,
  p_teacher_user_id uuid   default null,
  p_teacher_name   text    default null,
  p_sort_order     integer default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_id   uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  -- สร้าง/ย้ายวิชาเป็นงานของฝ่ายวิชาการ ครูแก้ได้แค่คะแนนกับหัวข้อในวิชาตัวเอง
  -- (ครูคนหนึ่งเพิ่มวิชาให้ห้องอื่นได้ = ตารางเรียนกับสมุดคะแนนจะเริ่มไม่ตรงกัน)
  if not app_is_academic_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_subject_id is null then
    if char_length(v_name) = 0 then
      return jsonb_build_object('ok', false, 'error', 'NAME_REQUIRED');
    end if;
    if p_class_room_id is null then
      return jsonb_build_object('ok', false, 'error', 'CLASS_REQUIRED');
    end if;

    insert into public.subjects
      (class_room_id, term, code, name, credits, teacher_user_id, teacher_name, sort_order)
    values (
      p_class_room_id,
      coalesce(nullif(trim(coalesce(p_term, '')), ''), '1/2569'),
      coalesce(p_code, ''), v_name, coalesce(p_credits, 3),
      p_teacher_user_id, coalesce(p_teacher_name, ''), coalesce(p_sort_order, 0)
    )
    returning id into v_id;
  else
    update public.subjects
       set code            = coalesce(p_code, code),
           name            = case when char_length(v_name) > 0 then v_name else name end,
           credits         = coalesce(p_credits, credits),
           teacher_user_id = coalesce(p_teacher_user_id, teacher_user_id),
           teacher_name    = coalesce(p_teacher_name, teacher_name),
           sort_order      = coalesce(p_sort_order, sort_order),
           term            = coalesce(nullif(trim(coalesce(p_term, '')), ''), term),
           updated_at      = now()
     where id = p_subject_id
    returning id into v_id;

    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'SUBJECT_NOT_FOUND');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'subject_id', v_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'SUBJECT_DUPLICATE');
end $fn$;

comment on function public.upsert_subject(uuid, bigint, text, text, text, integer, uuid, text, integer) is
  'เพิ่ม/แก้รายวิชา (ฝ่ายวิชาการ/แอดมินเท่านั้น)';

grant execute on function public.upsert_subject(uuid, bigint, text, text, text, integer, uuid, text, integer) to authenticated;
revoke all on function public.upsert_subject(uuid, bigint, text, text, text, integer, uuid, text, integer) from anon;
revoke execute on function public.upsert_subject(uuid, bigint, text, text, text, integer, uuid, text, integer) from public;

create or replace function public.archive_subject(p_subject_id uuid, p_is_active boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
begin
  if not app_is_academic_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  -- ซ่อน ไม่ลบ — คะแนนที่กรอกไปแล้วต้องยังตรวจย้อนหลังได้เสมอ
  update public.subjects set is_active = p_is_active, updated_at = now()
   where id = p_subject_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'SUBJECT_NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true);
end $fn$;

grant execute on function public.archive_subject(uuid, boolean) to authenticated;
revoke all on function public.archive_subject(uuid, boolean) from anon;
revoke execute on function public.archive_subject(uuid, boolean) from public;

-- ============================================================
-- 17) RPC: ใส่โครงสร้าง T1-T5 มาตรฐานให้วิชาที่ยังว่าง
--
-- วิชาเปิดใหม่ต้องกรอกหัวข้อเองสิบกว่าช่องทุกครั้งคือกำแพงที่ทำให้ไม่มีใครเริ่มใช้
-- ปุ่มเดียวได้โครงมาตรฐานแล้วค่อยแก้ทีหลัง เร็วกว่ามาก
-- ============================================================
create or replace function public.apply_default_score_template(p_subject_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_parent uuid;
  v_unit   record;
  v_child  record;
  v_count  integer := 0;
begin
  if not public.app_can_grade_subject(p_subject_id) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if exists (select 1 from public.score_items where subject_id = p_subject_id) then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_HAS_ITEMS');
  end if;

  -- สัดส่วนมาตรฐานของวิทยาลัย รวม 100 คะแนน — ครูแก้ตัวเลขทีหลังได้ทุกช่อง
  for v_unit in
    select * from (values
      ('T1', 'จิตพิสัยและความรับผิดชอบ', 1),
      ('T2', 'ใบงานและแบบฝึกหัด',        2),
      ('T3', 'ชิ้นงาน/ปฏิบัติ',           3),
      ('T4', 'สอบกลางภาค',               4),
      ('T5', 'สอบปลายภาค',               5)
    ) as u(code, label, ord)
  loop
    insert into public.score_items (subject_id, parent_id, code, label, max_score, sort_order)
    values (p_subject_id, null, v_unit.code, v_unit.label, 0, v_unit.ord)
    returning id into v_parent;

    for v_child in
      select * from (values
        ('.1', 'ครั้งที่ 1', 10, 1),
        ('.2', 'ครั้งที่ 2', 10, 2)
      ) as c(suffix, label, max_score, ord)
    loop
      insert into public.score_items (subject_id, parent_id, code, label, max_score, sort_order)
      values (
        p_subject_id, v_parent, v_unit.code || v_child.suffix,
        v_child.label, v_child.max_score, v_child.ord
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'items_created', v_count);
end $fn$;

comment on function public.apply_default_score_template(uuid) is
  'ใส่โครงสร้าง T1-T5 พร้อมหัวข้อย่อยสองหัวข้อต่อ T รวม 100 คะแนน ให้วิชาที่ยังไม่มีหัวข้อเลย';

grant execute on function public.apply_default_score_template(uuid) to authenticated;
revoke all on function public.apply_default_score_template(uuid) from anon;
revoke execute on function public.apply_default_score_template(uuid) from public;

-- ============================================================
-- 18) RPC: ปูมคะแนน
-- ============================================================
create or replace function public.list_score_logs(
  p_subject_id      uuid default null,
  p_student_user_id uuid default null,
  p_limit           integer default 50
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_me     uuid := app_current_user_id();
  v_target uuid := p_student_user_id;
  v_result jsonb;
begin
  -- ไม่มีตัวตน = ไม่มีสิทธิ์ ต้องตัดจบตรงนี้ก่อนอย่างอื่น
  --
  -- ของเดิมเขียนด่านเดียวว่า
  --   not app_is_teaching_staff() and p_student_user_id is distinct from v_me
  -- ซึ่งพังเมื่อคนเรียกไม่ได้ล็อกอิน: v_me เป็น null และ p_student_user_id ก็ default null
  -- null is distinct from null = false ทั้งก้อนจึงเป็น false ด่านไม่ทำงาน
  -- แล้วไหลลงไปที่ where ซึ่งแปล null ว่า "ไม่ต้องกรอง"
  -- ผลคือใครถือ anon key (ซึ่งอยู่ใน bundle ที่ส่งให้เบราว์เซอร์) ยิงเข้ามาเปล่า ๆ
  -- ก็ได้ชื่อนักเรียนจริงพร้อมคะแนนและเหตุผลที่ครูเขียน ของทั้งวิทยาลัย
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  -- คนที่ไม่ใช่เจ้าหน้าที่สอน: บังคับขอบเขตให้เป็นของตัวเองเสมอ ไม่ว่าจะส่งอะไรมา
  -- ใช้ "บังคับขอบเขต" แทน "ตอบ FORBIDDEN" เพราะปลอดภัยเท่ากันแต่ไม่มีทางพลาด
  -- ต่อให้หน้าเว็บไม่ส่ง p_student_user_id มา นักเรียนก็ได้ของตัวเอง ไม่ใช่ของทุกคน
  if not app_is_teaching_staff() then
    v_target := v_me;
  end if;

  select coalesce(jsonb_agg(row_to_json(l)::jsonb order by l.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      sl.id,
      sl.created_at,
      sl.action,
      sl.item_code,
      sl.old_score,
      sl.new_score,
      sl.delta,
      sl.reason,
      sl.student_user_id,
      su.full_name                         as student_name,
      sj.name                              as subject_name,
      coalesce(t.full_name, 'ไม่ทราบชื่อ')  as teacher_name
    from public.score_logs sl
    join public.subjects sj on sj.id = sl.subject_id
    join public.users su on su.id = sl.student_user_id
    left join public.users t on t.id = sl.teacher_user_id
    where (p_subject_id is null or sl.subject_id = p_subject_id)
      and (v_target is null or sl.student_user_id = v_target)
    order by sl.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) l;

  return jsonb_build_object('ok', true, 'logs', v_result);
end $fn$;

comment on function public.list_score_logs(uuid, uuid, integer) is
  'ปูมการให้/ตัด/แก้คะแนน — นักเรียนดูของตัวเองได้ เจ้าหน้าที่สอนดูได้ทั้งหมด';

grant execute on function public.list_score_logs(uuid, uuid, integer) to authenticated;
revoke all on function public.list_score_logs(uuid, uuid, integer) from anon;
revoke execute on function public.list_score_logs(uuid, uuid, integer) from public;

-- ============================================================
-- 19) Realtime
--
-- ครูกรอกคะแนนแล้วนักเรียนที่เปิดหน้าค้างไว้ต้องเห็นทันที
-- ไม่ต้องปิดเปิดแอปใหม่ (บั๊กเดิมของฝั่งพฤติกรรม ดูคอมเมนต์ใน StudentHome.jsx)
-- ============================================================
do $$
declare
  v_table text;
begin
  foreach v_table in array array['subjects', 'score_items', 'student_scores']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
      raise notice 'เพิ่ม public.% เข้า supabase_realtime แล้ว', v_table;
    end if;
  end loop;
exception when others then
  raise warning 'เพิ่มตารางคะแนนเข้า realtime ไม่สำเร็จ: % — เปิดเองได้ที่ Database > Replication', sqlerrm;
end $$;

-- replica identity full: ไม่ตั้ง = UPDATE/DELETE ส่งกลับมาแค่ primary key
-- หน้าเว็บจะรู้ว่า "มีอะไรเปลี่ยน" แต่ไม่รู้ว่าเปลี่ยนของใคร จึงกรองตามนักเรียนไม่ได้
alter table public.subjects       replica identity full;
alter table public.score_items    replica identity full;
alter table public.student_scores replica identity full;

-- ============================================================
-- 20) ข้อมูลตั้งต้น — สร้างรายวิชาจากตารางสอนที่มีอยู่แล้ว
--
-- ไม่พิมพ์รายชื่อวิชาซ้ำในไฟล์นี้ เพราะ 25_timetables.sql มีของจริงอยู่แล้ว
-- และฝ่ายวิชาการแก้ตารางสอนบ่อยกว่าที่ใครจะกลับมาแก้ seed ตรงนี้ตาม
--
-- คาบที่ไม่ใช่วิชาเรียน (พักกลางวัน โฮมรูม ชมรม) ต้องไม่กลายเป็นรายวิชาที่มีคะแนน
-- on conflict do nothing = รันซ้ำไม่ทับของที่ฝ่ายวิชาการแก้ไปแล้ว
-- ============================================================
insert into public.subjects (class_room_id, term, name, teacher_name, sort_order)
select
  cr.id,
  '1/2569',
  tt.subject,
  /* ครูที่สอนวิชานี้บ่อยที่สุดในตารางของห้องนั้น
     ต้องเป็น mode() ไม่ใช่หยิบชื่อแรกที่เจอ เพราะวิชาเดียวกันมีคาบที่ครูอื่นคุมแทน
     ปนอยู่ในตาราง (เช่น 'ช.3/6' ในคาบชมรมวิชาการของวิชาสร้างเกม)
     nullif ตัดค่าว่างทิ้งก่อน เพราะ mode() ข้าม null ให้เอง แต่ไม่ข้ามสตริงว่าง
     ซึ่งถ้าไม่ตัด คาบที่ไม่ได้ระบุครูจะชนะโหวตได้ */
  coalesce(mode() within group (order by nullif(trim(tt.teacher), '')), ''),
  row_number() over (partition by cr.id order by tt.subject)
from public.timetables tt
join public.class_rooms cr
  on 'm' || substring(cr.level from '\d+') || '_' || substring(cr.room_no from '\d+') = tt.class_id
where trim(tt.subject) <> ''
  and tt.subject not in ('พักกลางวัน', 'โฮมรูม (HR)', 'กิจกรรมชมรม')
group by cr.id, tt.subject
on conflict (class_room_id, term, name) do nothing;

-- ใส่โครงสร้าง T1-T5 ให้ทุกวิชาที่เพิ่งสร้างและยังไม่มีหัวข้อคะแนนเลย
do $$
declare
  v_subject record;
  v_parent  uuid;
  v_unit    record;
  v_child   record;
  v_done    integer := 0;
begin
  for v_subject in
    select s.id from public.subjects s
    where not exists (select 1 from public.score_items si where si.subject_id = s.id)
  loop
    for v_unit in
      select * from (values
        ('T1', 'จิตพิสัยและความรับผิดชอบ', 1),
        ('T2', 'ใบงานและแบบฝึกหัด',        2),
        ('T3', 'ชิ้นงาน/ปฏิบัติ',           3),
        ('T4', 'สอบกลางภาค',               4),
        ('T5', 'สอบปลายภาค',               5)
      ) as u(code, label, ord)
    loop
      insert into public.score_items (subject_id, parent_id, code, label, max_score, sort_order)
      values (v_subject.id, null, v_unit.code, v_unit.label, 0, v_unit.ord)
      returning id into v_parent;

      for v_child in
        select * from (values
          ('.1', 'ครั้งที่ 1', 10, 1),
          ('.2', 'ครั้งที่ 2', 10, 2)
        ) as c(suffix, label, max_score, ord)
      loop
        insert into public.score_items (subject_id, parent_id, code, label, max_score, sort_order)
        values (v_subject.id, v_parent, v_unit.code || v_child.suffix,
                v_child.label, v_child.max_score, v_child.ord);
      end loop;
    end loop;
    v_done := v_done + 1;
  end loop;

  raise notice 'ใส่โครงสร้าง T1-T5 ให้ % รายวิชา', v_done;
end $$;

-- ============================================================
-- ตรวจผล
-- ============================================================
select
  cr.level || '/' || cr.room_no                              as ห้อง,
  s.name                                                     as รายวิชา,
  coalesce(nullif(s.teacher_name, ''), 'ยังไม่ระบุ')          as ครูผู้สอน,
  (select count(*) from public.score_items si
    where si.subject_id = s.id and si.parent_id is null)     as จำนวนหน่วย,
  (select count(*) from public.score_items si
    where si.subject_id = s.id and si.parent_id is not null) as จำนวนหัวข้อย่อย,
  public.subject_max_score(s.id)                             as คะแนนเต็ม
from public.subjects s
join public.class_rooms cr on cr.id = s.class_room_id
where s.is_active
order by cr.level, cr.room_no, s.sort_order, s.name;

-- ============================================================
-- ตรวจผลด้านสิทธิ์ — ต้องไม่มี anon เรียก RPC ของไฟล์นี้ได้
-- และ authenticated ต้องเขียนสี่ตารางนี้ไม่ได้
-- แนวเดียวกับบล็อกตรวจผลท้าย 28_harden_core_tables.sql และ 35_revoke_app_balance.sql
-- ============================================================
do $$
declare
  r record;
  v_bad int := 0;
begin
  -- ก) RPC ที่ anon ยังเรียกได้
  -- revoke ... from anon อย่างเดียวไม่พอ เพราะ anon เป็นสมาชิกของ PUBLIC
  -- และ PostgreSQL แจก EXECUTE ให้ PUBLIC เป็นค่าเริ่มต้นกับทุกฟังก์ชันใหม่
  for r in
    select p.oid::regprocedure::text as f
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_can_grade_subject', 'my_score_summary', 'my_subject_scores',
        'list_gradebook_subjects', 'subject_gradebook', 'save_score', 'adjust_score',
        'bulk_save_scores', 'upsert_score_item', 'delete_score_item', 'upsert_subject',
        'archive_subject', 'apply_default_score_template', 'list_score_logs',
        'subject_max_score', 'student_subject_score', 'apply_score_change'
      )
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    raise warning 'anon ยังเรียกได้: %', r.f;
    v_bad := v_bad + 1;
  end loop;

  -- ข) สิทธิ์เขียนที่ยังค้างอยู่บนตารางของสมุดคะแนน
  for r in
    select table_name || ' / ' || grantee || ' / ' || privilege_type as f
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('subjects', 'score_items', 'student_scores', 'score_logs')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  loop
    raise warning 'ยังเหลือสิทธิ์เขียน: %', r.f;
    v_bad := v_bad + 1;
  end loop;

  if v_bad = 0 then
    raise notice 'ผ่าน — anon เรียก RPC ของสมุดคะแนนไม่ได้ และเขียนสี่ตารางไม่ได้ทั้ง anon/authenticated';
  else
    raise warning 'ยังไม่ผ่าน % รายการ — ดูบรรทัด WARNING ด้านบน', v_bad;
  end if;
end $$;

-- ============================================================
-- เตือน: วิชาที่ยังไม่ผูก teacher_user_id
--
-- app_can_grade_subject มีกิ่ง fallback "s.teacher_user_id is null" ซึ่งตั้งใจไว้
-- ไม่ให้ฟีเจอร์ตายตั้งแต่วันแรก แต่ seed ข้างบนใส่ได้แค่ teacher_name (text)
-- เพราะ timetables เก็บชื่อครูเป็นข้อความ จับคู่กับ users ไม่ได้
-- ผลคือทุกแถวเข้ากิ่ง fallback = ครูทุกคนแก้และลบคะแนนได้ทุกห้องทุกวิชา
-- ต้องผูกครูให้ครบก่อนบอกครูว่าเปิดใช้ได้ ดูวิธีในคอมเมนต์ท้ายไฟล์
-- ============================================================
do $$
declare
  v_unbound int;
begin
  select count(*) into v_unbound
  from public.subjects where teacher_user_id is null and is_active;

  if v_unbound > 0 then
    raise warning 'มี % วิชาที่ยังไม่ผูก teacher_user_id — ตอนนี้ครูทุกคนแก้/ลบคะแนนวิชาเหล่านี้ได้', v_unbound;
    raise warning 'แก้: รัน 46_bind_subject_teachers.sql แล้วผูกวิชาที่เหลือผ่านฝ่ายวิชาการ';
  else
    raise notice 'ผ่าน — ทุกวิชาผูกครูผู้สอนแล้ว';
  end if;
end $$;
