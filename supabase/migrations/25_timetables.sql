-- ============================================================
-- 25_timetables.sql — ตารางสอนย้ายจาก Firebase มาอยู่ Supabase
--
-- ปัญหาที่แก้:
--   หน้าวิชาการมีฟอร์ม "แก้ไขตารางสอน / สั่งสอนแทน" ที่เขียนลง Firestore
--   แต่ src/config/firebase.js ถูกเปลี่ยนเป็น stub ที่ throw ทันทีที่ถูกเรียก
--   (โปรเจกต์ Firebase เดิมไม่ได้อยู่ในบัญชีเรา และ rules เปิดสาธารณะ)
--   ผลคือปุ่มบันทึกกดแล้ว error ตลอด — ฟีเจอร์นี้ตายมาตั้งแต่ย้ายมา Supabase
--
--   ส่วนตารางที่นักเรียนเห็น ดึงจาก Google Sheet ผ่าน URL export csv สาธารณะ
--   ซึ่งอ่านได้อย่างเดียว เขียนกลับไม่ได้ ต่อให้ฟอร์มฝั่งวิชาการทำงาน
--   ก็ไม่มีทางไปโผล่ที่นักเรียนอยู่ดี สองฝั่งไม่เคยเชื่อมกันเลย
--
-- วิธีแก้:
--   ตาราง timetables เป็นแหล่งข้อมูลจริงที่ทั้งสองฝั่งใช้ร่วมกัน
--   ฝ่ายวิชาการเขียน -> realtime ส่งเฉพาะแถวที่แก้ -> นักเรียนเห็นทันที
--   ไม่ต้อง poll ทั้งไฟล์ทุก 20 วินาทีเหมือนของเดิม
--
--   ยังใช้ Google Sheet แก้ทั้งเทอมได้เหมือนเดิม — หน้าวิชาการมีปุ่ม
--   "นำเข้าจาก Google Sheet" ที่ดูดชีตทั้งแท็บเข้ามาทับทีเดียว
--   (แก้ทีละคาบในฟอร์มทุกต้นเทอมคือความทรมาน ชีตชนะเรื่องนี้จริง)
--
-- เรื่อง class_id:
--   เก็บ class_id (m3_6) ตรง ๆ บนแถว ไม่ใช่แค่ FK ไป class_rooms
--   เพราะ realtime ฝั่ง client กรองด้วยค่าในแถวเท่านั้น (filter=class_id=eq.m3_6)
--   ถ้าเก็บแต่ uuid หน้าเว็บจะต้องแปลง id ก่อนทุกครั้งถึงจะ subscribe ได้
--   FK ไป class_rooms ผูกเพิ่มให้ถ้าตารางนั้นมีจริง — ไม่มีก็ยังใช้งานได้
--
-- รันซ้ำได้ / ไม่ต้องรันไฟล์อื่นก่อน
-- ============================================================

create table if not exists public.timetables (
  id                 uuid primary key default gen_random_uuid(),
  class_id           text        not null,
  day                text        not null,
  period             smallint    not null,
  subject            text        not null default '',
  teacher            text        not null default '',
  room               text        not null default '',
  is_substituted     boolean     not null default false,
  substitute_teacher text        not null default '',
  substitute_room    text        not null default '',
  updated_at         timestamptz not null default now(),
  updated_by         uuid        references auth.users(id) on delete set null,

  -- หนึ่งห้อง หนึ่งวัน หนึ่งคาบ มีได้แถวเดียว — กัน upsert ซ้ำจนตารางมีคาบซ้อน
  constraint timetables_slot_unique unique (class_id, day, period),

  -- กันวันเขียนผิด (monday / จันทร์ / Mon) ที่จะทำให้ตารางแสดงไม่ครบแบบเงียบ ๆ
  constraint timetables_day_valid check (
    day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
  ),
  constraint timetables_period_valid check (period between 1 and 12)
);

-- นักเรียนเปิดหน้าตารางสอน = อ่านทั้งห้องทีเดียวเสมอ
create index if not exists timetables_class_day_idx
  on public.timetables (class_id, day, period);

comment on table public.timetables is
  'ตารางสอนรายห้อง — ฝ่ายวิชาการแก้ นักเรียนเห็นผ่าน realtime';
comment on column public.timetables.class_id is
  'รหัสห้องแบบที่หน้าเว็บใช้ เช่น m3_6 (ดู toClassId ใน src/utils/identity.js)';
comment on column public.timetables.is_substituted is
  'true = คาบนี้มีครูสอนแทน หน้าเว็บจะไฮไลต์เป็นสีแดงให้นักเรียนเห็นชัด';

-- ---------- ผูก FK ไป class_rooms ถ้าตารางนั้นมีอยู่จริง ----------
-- 01_schema.sql ไม่ได้อยู่ใน repo จึงไม่รู้ล่วงหน้าว่า class_rooms หน้าตายังไง
-- อ่านจาก catalog ตอนรันแทนการเดา (แนวเดียวกับ 14_event_rooms.sql)
do $$
declare
  v_pk_col  text;
  v_pk_type text;
begin
  if to_regclass('public.class_rooms') is null then
    raise notice 'ไม่มีตาราง class_rooms — ข้ามการผูก FK (timetables ยังใช้งานได้ปกติ)';
    return;
  end if;

  select a.attname, format_type(a.atttypid, a.atttypmod)
    into v_pk_col, v_pk_type
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = 'public.class_rooms'::regclass and i.indisprimary
  limit 1;

  if v_pk_col is null then
    raise notice 'class_rooms ไม่มี primary key — ข้ามการผูก FK';
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'timetables'
      and column_name = 'class_room_id'
  ) then
    execute format(
      'alter table public.timetables add column class_room_id %s references public.class_rooms(%I) on delete cascade',
      v_pk_type, v_pk_col
    );
    raise notice 'เพิ่มคอลัมน์ class_room_id ผูกกับ class_rooms(%) แล้ว', v_pk_col;
  end if;
exception when others then
  raise warning 'ผูก FK กับ class_rooms ไม่สำเร็จ: % — timetables ยังใช้งานได้ด้วย class_id', sqlerrm;
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.timetables enable row level security;

drop policy if exists timetables_read_all on public.timetables;
drop policy if exists timetables_write_academic on public.timetables;

-- อ่าน: ทุกคนที่ล็อกอิน
-- ตารางสอนไม่ใช่ข้อมูลส่วนบุคคล และนักเรียนต้องดูของห้องอื่นได้ตอนเรียนรวม/ย้ายห้อง
-- ที่ต้องกันคือ "การแก้" ไม่ใช่ "การอ่าน"
create policy timetables_read_all on public.timetables
  for select to authenticated
  using (true);

-- เขียน: ฝ่ายวิชาการเท่านั้น
-- ครูทั่วไปแก้ไม่ได้ ไม่งั้นครูคนหนึ่งย้ายคาบตัวเองแล้วชนกับอีกห้องโดยไม่มีใครรู้
create policy timetables_write_academic on public.timetables
  for all to authenticated
  using (public.app_is_academic_staff())
  with check (public.app_is_academic_staff());

-- grant คือ "ประตูชั้นนอก" ส่วน policy คือ "ยามที่ตรวจทีละแถว" ต้องเปิดทั้งคู่ถึงจะผ่าน
-- (แนวเดียวกับ 10_events.sql และ 20_behavior_and_notifications.sql ทุกตาราง)
--
-- ที่ต้อง revoke anon ทั้งที่ policy เขียน "to authenticated" อยู่แล้ว:
--   Supabase ให้สิทธิ์ anon กับตารางใหม่ใน public โดยอัตโนมัติ ถ้าไม่ถอน
--   คนที่ยังไม่ล็อกอินจะยิง /rest/v1/timetables แล้วได้ 200 กลับไป (แม้ได้ผลลัพธ์ว่าง)
--   ตอนนี้ยังไม่รั่วเพราะไม่มี policy ให้ anon แต่ถ้าวันหลังมีใครเผลอเพิ่ม policy
--   ที่ไม่ระบุ role ข้อมูลจะหลุดทันทีโดยไม่มีใครรู้ — ปิดประตูชั้นนอกไว้เลยดีกว่า
grant select, insert, update, delete on public.timetables to authenticated;
revoke all on public.timetables from anon;

-- ============================================================
-- Realtime — หัวใจของฟีเจอร์นี้
-- ถ้าไม่เพิ่มเข้า publication หน้าเว็บ subscribe แล้วจะไม่มี event ส่งมาเลย
-- ครอบ do block เพราะสั่งซ้ำจะ error ว่า is already member of publication
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'timetables'
  ) then
    execute 'alter publication supabase_realtime add table public.timetables';
    raise notice 'เพิ่ม public.timetables เข้า supabase_realtime แล้ว';
  else
    raise notice 'public.timetables อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป';
  end if;
exception when others then
  raise warning 'เพิ่ม timetables เข้า realtime ไม่สำเร็จ: % — เปิดเองได้ที่ Database > Replication', sqlerrm;
end $$;

-- realtime ส่ง payload ของแถวเดิมตอน UPDATE/DELETE ได้ก็ต่อเมื่อ replica identity เป็น full
-- ไม่ตั้ง = ฝั่งเว็บจะได้แค่ค่า primary key กลับมา แล้วอัปเดตตารางบนจอไม่ถูกแถว
alter table public.timetables replica identity full;

-- ============================================================
-- ข้อมูลตั้งต้น — ตารางจริงภาคเรียน 1/2569
-- มาจาก timetable_m3_4.csv / timetable_m3_6.csv ที่อยู่ root ของ repo
-- on conflict do nothing = รันซ้ำไม่ทับของที่ฝ่ายวิชาการแก้ไปแล้ว
-- ============================================================
insert into public.timetables (class_id, day, period, subject, teacher, room) values
  ('m3_4', 'Monday', 1, 'การผลิตสื่อผสมเพื่องานการตลาด', 'อ.ธีรวัฒน์', '1606'),
  ('m3_4', 'Monday', 2, 'โปรแกรมนำเสนอ', 'อ.ธีรภาพ', '1606'),
  ('m3_4', 'Monday', 3, 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', 'อ.พลศิต', 'สตูดิโอ'),
  ('m3_4', 'Monday', 4, 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', 'อ.พลศิต', 'สตูดิโอ'),
  ('m3_4', 'Monday', 5, 'พักกลางวัน', '', ''),
  ('m3_4', 'Monday', 6, 'โฮมรูม (HR)', '', ''),
  ('m3_4', 'Tuesday', 1, 'โปรแกรมนำเสนอ', 'อ.ธีรภาพ', '1406'),
  ('m3_4', 'Tuesday', 2, 'โปรแกรมนำเสนอ', 'อ.ธีรภาพ', '1406'),
  ('m3_4', 'Tuesday', 3, 'โครงงานด้านการตลาด', 'อ.ศิริญากร', '1606'),
  ('m3_4', 'Tuesday', 4, 'การผลิตสื่อผสมเพื่องานการตลาด', 'อ.ธีรวัฒน์', '1606'),
  ('m3_4', 'Tuesday', 5, 'พักกลางวัน', '', ''),
  ('m3_4', 'Tuesday', 6, 'โฮมรูม (HR)', '', ''),
  ('m3_4', 'Wednesday', 1, 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', 'อ.พลศิต', '1406'),
  ('m3_4', 'Wednesday', 2, 'โปรแกรมนำเสนอ', 'อ.ธีรภาพ', '1407'),
  ('m3_4', 'Wednesday', 3, 'โปรแกรมนำเสนอ', 'อ.ธีรภาพ', '1407'),
  ('m3_4', 'Wednesday', 5, 'พักกลางวัน', '', ''),
  ('m3_4', 'Wednesday', 6, 'โฮมรูม (HR)', '', ''),
  ('m3_4', 'Thursday', 1, 'โครงงานด้านการตลาด', 'อ.ศิริญากร', '1606'),
  ('m3_4', 'Thursday', 2, 'โครงงานด้านการตลาด', 'อ.ศิริญากร', '1606'),
  ('m3_4', 'Thursday', 3, 'การผลิตสื่อผสมเพื่องานการตลาด', 'อ.ธีรวัฒน์', '1606'),
  ('m3_4', 'Thursday', 4, 'การผลิตสื่อผสมเพื่องานการตลาด', 'อ.ธีรวัฒน์', '1606'),
  ('m3_4', 'Thursday', 5, 'พักกลางวัน', '', ''),
  ('m3_4', 'Thursday', 6, 'กิจกรรมชมรม', '', ''),
  ('m3_4', 'Friday', 1, 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', 'อ.พลศิต', '1606'),
  ('m3_4', 'Friday', 2, 'การถ่ายภาพและการถ่ายทอดเพื่องานการตลาด', 'อ.พลศิต', '1606'),
  ('m3_4', 'Friday', 3, 'การผลิตสื่อผสมเพื่องานการตลาด', 'อ.ธีรวัฒน์', '1606'),
  ('m3_4', 'Friday', 4, 'การผลิตสื่อผสมเพื่องานการตลาด', 'อ.ธีรวัฒน์', '1606'),
  ('m3_4', 'Friday', 5, 'พักกลางวัน', '', ''),
  ('m3_4', 'Friday', 6, 'โฮมรูม (HR)', '', ''),
  ('m3_6', 'Monday', 1, 'การสร้างเกมคอมพิวเตอร์', 'อ.ธีรภาพ', '1503'),
  ('m3_6', 'Monday', 2, 'โปรแกรมนำเสนอ', 'อ.ประภวิษณ์', '1503'),
  ('m3_6', 'Monday', 3, 'เทคโนโลยีการนำเข้าข้อมูลสู่ระบบคอมพิวเตอร์', 'อ.ณัฐธิดา', '1503'),
  ('m3_6', 'Monday', 4, 'โปรแกรมนำเสนอ', 'อ.ประภวิษณ์', '1406'),
  ('m3_6', 'Monday', 5, 'พักกลางวัน', '', ''),
  ('m3_6', 'Monday', 6, 'โฮมรูม (HR)', '', ''),
  ('m3_6', 'Tuesday', 1, 'เทคโนโลยีการนำเข้าข้อมูลสู่ระบบคอมพิวเตอร์', 'อ.ณัฐธิดา', '1507'),
  ('m3_6', 'Tuesday', 2, 'เทคโนโลยีการนำเข้าข้อมูลสู่ระบบคอมพิวเตอร์', 'อ.ณัฐธิดา', '1507'),
  ('m3_6', 'Tuesday', 3, 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', 'อ.ธีรภาพ', '1509'),
  ('m3_6', 'Tuesday', 4, 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', 'อ.ธีรภาพ', '1509'),
  ('m3_6', 'Tuesday', 5, 'พักกลางวัน', '', ''),
  ('m3_6', 'Tuesday', 6, 'โฮมรูม (HR)', '', ''),
  ('m3_6', 'Wednesday', 1, 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', 'อ.ธีรภาพ', '1503'),
  ('m3_6', 'Wednesday', 2, 'เทคโนโลยีการนำเข้าข้อมูลสู่ระบบคอมพิวเตอร์', 'อ.ณัฐธิดา', '1503'),
  ('m3_6', 'Wednesday', 3, 'การติดตั้งระบบเครือข่ายคอมพิวเตอร์เบื้องต้น', 'อ.ทนงศักดิ์', '1506'),
  ('m3_6', 'Wednesday', 4, 'การติดตั้งระบบเครือข่ายคอมพิวเตอร์เบื้องต้น', 'อ.ทนงศักดิ์', '1506'),
  ('m3_6', 'Wednesday', 5, 'พักกลางวัน', '', ''),
  ('m3_6', 'Wednesday', 6, 'โฮมรูม (HR)', '', ''),
  ('m3_6', 'Thursday', 1, 'โปรแกรมนำเสนอ', 'อ.ประภวิษณ์', '1408'),
  ('m3_6', 'Thursday', 2, 'โปรแกรมนำเสนอ', 'อ.ประภวิษณ์', '1408'),
  ('m3_6', 'Thursday', 3, 'โครงงานด้านเทคโนโลยีสารสนเทศ', 'อ.ทนงศักดิ์', '1503'),
  ('m3_6', 'Thursday', 4, 'โครงงานด้านเทคโนโลยีสารสนเทศ', 'อ.ทนงศักดิ์', '1503'),
  ('m3_6', 'Thursday', 5, 'พักกลางวัน', '', ''),
  ('m3_6', 'Thursday', 6, 'กิจกรรมชมรม', '', ''),
  ('m3_6', 'Thursday', 7, 'การสร้างเกมคอมพิวเตอร์', 'ช.3/6', '1509'),
  ('m3_6', 'Thursday', 8, 'การสร้างเกมคอมพิวเตอร์', 'ช.3/6', '1509'),
  ('m3_6', 'Friday', 1, 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', 'อ.ธีรภาพ', '1408'),
  ('m3_6', 'Friday', 2, 'การออกแบบกราฟิกสิ่งพิมพ์ดิจิทัล', 'อ.ธีรภาพ', '1408'),
  ('m3_6', 'Friday', 3, 'การติดตั้งระบบเครือข่ายคอมพิวเตอร์เบื้องต้น', 'อ.ทนงศักดิ์', '1506'),
  ('m3_6', 'Friday', 4, 'การติดตั้งระบบเครือข่ายคอมพิวเตอร์เบื้องต้น', 'อ.ทนงศักดิ์', '1506'),
  ('m3_6', 'Friday', 5, 'พักกลางวัน', '', ''),
  ('m3_6', 'Friday', 6, 'โฮมรูม (HR)', '', ''),
  ('m3_6', 'Friday', 7, 'การสร้างเกมคอมพิวเตอร์', 'ช.3/6', '1509'),
  ('m3_6', 'Friday', 8, 'การสร้างเกมคอมพิวเตอร์', 'ช.3/6', '1509')
on conflict (class_id, day, period) do nothing;

-- ============================================================
-- ตรวจผล
-- ============================================================
do $$
declare v_count int; v_classes int;
begin
  select count(*), count(distinct class_id) into v_count, v_classes from public.timetables;
  raise notice 'timetables พร้อมใช้งาน: % คาบ จาก % ห้อง', v_count, v_classes;
end $$;
