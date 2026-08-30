-- ============================================================
-- 14_event_rooms.sql — กิจกรรมแยกตามห้องเรียน
--
-- ปัญหาที่แก้:
--   ปฏิทินตอนนี้เป็นของกลางทั้งวิทยาลัย ทุกคนเห็นเหมือนกันหมด
--   แต่ของจริง "รด." ของ ปวช.3/6 อยู่วันจันทร์ ส่วน 3/4 อยู่วันอังคาร
--   ถ้าไม่แยกห้อง นักเรียนจะเห็นรดสัปดาห์ละสองครั้งแล้วไม่รู้ว่าอันไหนของตัวเอง
--
-- วิธีแก้:
--   เพิ่มคอลัมน์ class_room_id บน events
--     null   = กิจกรรมของทั้งวิทยาลัย (วันหยุด ประกาศผลสอบ ฯลฯ) — ทุกคนเห็น
--     มีค่า  = กิจกรรมของห้องนั้นห้องเดียว — เห็นเฉพาะนักเรียนห้องนั้น
--   แล้วให้ RLS เป็นตัวกรอง ไม่ใช่หน้าเว็บ
--   นักเรียนห้องอื่นยิง API ตรงก็ไม่เห็น เพราะกรองตั้งแต่ชั้นฐานข้อมูล
--
-- ครู/ฝ่ายวิชาการเห็นทุกห้อง เพราะสอนหลายห้อง
--
-- หมายเหตุเรื่องการเขียนไฟล์นี้:
--   ไม่รู้ล่วงหน้าว่า class_rooms ใช้ PK ชื่ออะไรชนิดอะไร
--   และ student_profiles ผูกกับ class_rooms ด้วยคอลัมน์ชื่ออะไร (01_schema.sql ไม่ได้อยู่ใน repo)
--   จึงอ่านจาก catalog แล้วประกอบคำสั่งตอนรัน — ไม่เดาแล้วพังทีหลัง
--
-- ต้องรัน 10_events.sql มาก่อน / รันซ้ำได้
-- ============================================================

do $$
declare
  v_pk_col  text;   -- ชื่อ PK ของ class_rooms
  v_pk_type text;   -- ชนิดของ PK
  v_fk_col  text;   -- คอลัมน์ใน student_profiles ที่ชี้ไป class_rooms
begin
  -- ---------- 1) หา PK ของ class_rooms ----------
  select a.attname, format_type(a.atttypid, a.atttypmod)
    into v_pk_col, v_pk_type
  from pg_index i
  join pg_attribute a
    on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = 'public.class_rooms'::regclass
    and i.indisprimary
  limit 1;

  if v_pk_col is null then
    raise exception 'หา primary key ของ public.class_rooms ไม่เจอ — ต้องรัน 01_schema.sql ก่อน';
  end if;

  -- ---------- 2) หาคอลัมน์ที่ student_profiles ใช้ผูกกับ class_rooms ----------
  select a.attname
    into v_fk_col
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.conrelid  = 'public.student_profiles'::regclass
    and c.confrelid = 'public.class_rooms'::regclass
    and c.contype   = 'f'
  limit 1;

  if v_fk_col is null then
    raise exception 'student_profiles ไม่มี foreign key ไป class_rooms — ตรวจ schema ก่อน';
  end if;

  raise notice 'class_rooms PK = %(%) / student_profiles ผูกด้วยคอลัมน์ %', v_pk_col, v_pk_type, v_fk_col;

  -- ---------- 3) คอลัมน์ใหม่บน events ----------
  -- on delete cascade: ถ้าห้องเรียนถูกลบ กิจกรรมของห้องนั้นก็ไม่มีความหมายแล้ว
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'class_room_id'
  ) then
    execute format(
      'alter table public.events add column class_room_id %s references public.class_rooms(%I) on delete cascade',
      v_pk_type, v_pk_col);
  end if;

  execute 'create index if not exists events_class_room_idx on public.events (class_room_id)';

  -- ---------- 4) ห้องของคนที่กำลังเรียก ----------
  execute format($f$
    create or replace function public.my_class_room_id()
    returns %s
    language sql stable security definer set search_path = public
    as 'select sp.%I from student_profiles sp where sp.user_id = app_current_user_id() limit 1'
  $f$, v_pk_type, v_fk_col);

  -- ---------- 5) รายชื่อห้องสำหรับ dropdown ฝั่งหน้าเว็บ ----------
  -- ทำเป็น RPC แทนการให้หน้าเว็บ select ตาราง class_rooms ตรง ๆ
  -- จะได้ไม่ต้องไปเปิด RLS ของตารางนั้นเพิ่ม
  execute format($f$
    create or replace function public.list_class_rooms()
    returns jsonb
    language sql stable security definer set search_path = public
    as 'select coalesce(jsonb_agg(jsonb_build_object(
             ''id'', cr.%I,
             ''label'', cr.level || '' ห้อง '' || cr.room_no)
           order by cr.level, cr.room_no), ''[]''::jsonb)
        from class_rooms cr'
  $f$, v_pk_col);
end $$;

comment on column public.events.class_room_id is
  'ห้องเรียนที่กิจกรรมนี้เกี่ยวข้อง — null = ทั้งวิทยาลัย';

-- ============================================================
-- 6) RLS: กรองตามห้องตั้งแต่ชั้นฐานข้อมูล
-- ============================================================
-- แทนที่ policy เดิมจาก 10_events.sql
--
-- ลำดับการตัดสิน:
--   ฝ่ายวิชาการ/แอดมิน -> เห็นหมด รวมฉบับร่าง (ต้องจัดการทุกห้อง)
--   ครู                -> เห็นทุกห้องที่เผยแพร่แล้ว (สอนหลายห้อง)
--   นักเรียน           -> เห็นของกลาง + ของห้องตัวเองเท่านั้น
drop policy if exists events_read on public.events;
create policy events_read on public.events
  for select
  using (
    app_can_manage_events()
    or (
      is_published
      and (
        class_room_id is null                       -- กิจกรรมกลางทั้งวิทยาลัย
        or app_has_role('teacher')                  -- ครูเห็นทุกห้อง
        or class_room_id = my_class_room_id()       -- นักเรียนเห็นเฉพาะห้องตัวเอง
      )
    )
  );

grant execute on function public.my_class_room_id()  to authenticated;
grant execute on function public.list_class_rooms()  to authenticated;

revoke all on function public.my_class_room_id()  from anon;
revoke all on function public.list_class_rooms()  from anon;

-- ============================================================
-- ตรวจสอบ
-- ============================================================

-- 7.1 ห้องเรียนที่มีอยู่ในระบบ — เอา id ไปใช้ตอนสร้างกิจกรรมของห้อง
select public.list_class_rooms() as ห้องเรียนทั้งหมด;
