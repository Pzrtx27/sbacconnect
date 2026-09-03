-- ============================================================
-- 31_substitutions.sql — สอนแทนชั่วคราว "มีผลแค่ 1 วัน"
--
-- ปัญหาที่แก้:
--   25_timetables.sql เก็บธงสอนแทน (is_substituted / substitute_teacher /
--   substitute_room) ไว้บนแถวเดียวกับตารางประจำเทอม ซึ่ง key คือ
--   (class_id, day, period) โดย day เป็นชื่อวัน ไม่มีวันที่
--
--   แปลว่าสั่งสอนแทน "วันจันทร์ คาบ 3" หนึ่งครั้ง = ทุกวันจันทร์ตลอดไป
--   จนกว่าจะมีคนกดยกเลิกเอง แต่ของจริงคือครูลาแค่วันเดียว
--   สัปดาห์ถัดไปตารางควรกลับเป็นปกติเองโดยไม่ต้องมีใครจำ
--
--   ที่ผ่านมาจึงมีสถานะค้างที่ไม่มีใครเก็บกวาด และนักเรียนเห็นชื่อครูสอนแทน
--   ของสัปดาห์ที่แล้วค้างอยู่บนตาราง
--
-- แนวคิดใหม่ — แยกของสองอายุออกจากกัน:
--   ตารางประจำเทอม (วิชา/ครู/ห้อง)  -> Google Sheet เป็นต้นฉบับ อ่านสดผ่าน csv
--   สอนแทนรายวัน                    -> ตารางนี้ ผูกกับ sub_date ที่เป็น date จริง
--
--   หน้าเว็บ query เฉพาะแถวของวันที่ต้องการ พ้นวันแล้วแถวเก่าไม่ถูกดึงมาแสดงอีก
--   "หมดอายุเอง" เพราะเงื่อนไขคือวันที่ ไม่ใช่สถานะ boolean ที่ต้องมีคนมาปิด
--
-- ตาราง timetables จากไฟล์ 25 ไม่ได้ถูกลบ แต่แอปเลิกอ่านแล้ว
-- (เก็บไว้เผื่อย้อนกลับ / เผื่อมีข้อมูลเก่าที่ยังอยากดู — ลบทีหลังได้)
--
-- ต้องรัน 22_leave_requests.sql มาก่อน เพราะใช้ app_is_academic_staff()
-- รันซ้ำได้ทั้งไฟล์
-- ============================================================

create table if not exists public.substitutions (
  id                 uuid        primary key default gen_random_uuid(),

  -- รหัสห้องแบบที่หน้าเว็บใช้ เช่น m3_6 (ดู toClassId ใน src/utils/identity.js)
  -- ตรงกับ key ของแท็บใน TIMETABLE_TAB_GID_BY_CLASS ฝั่งชีต จึง merge กันได้ตรง ๆ
  class_id           text        not null check (btrim(class_id) <> ''),

  -- *** หัวใจของไฟล์นี้ *** วันที่จริง ไม่ใช่ชื่อวันในสัปดาห์
  sub_date           date        not null,

  period             smallint    not null check (period between 1 and 12),

  -- คัดลอกจากตารางฐานตอนกดบันทึก เพื่อให้แถวนี้อ่านรู้เรื่องด้วยตัวเอง
  -- ถ้าชีตถูกแก้ทีหลัง ประวัติของวันนั้นจะยังตรงกับที่ประกาศออกไปจริง
  subject            text        not null default '',
  original_teacher   text        not null default '',

  substitute_teacher text        not null default '',

  -- null/'' = ใช้ห้องเดิมตามตาราง (ตรงกับปุ่ม "ห้องเดิมตามตาราง" ในหน้าวิชาการ)
  substitute_room    text        not null default '',

  note               text        not null default '',

  created_by         uuid        references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- หนึ่งห้อง หนึ่งวันที่ หนึ่งคาบ มีได้แถวเดียว
  -- ทำให้ฝั่งเว็บใช้ upsert ได้ กดบันทึกซ้ำ/สองคนกดพร้อมกันก็ไม่เกิดแถวซ้อน
  constraint substitutions_slot_unique unique (class_id, sub_date, period)
);

comment on table public.substitutions is
  'สอนแทนชั่วคราวรายวัน — ผูกกับ sub_date จึงมีผลแค่วันเดียวและหมดอายุเอง';
comment on column public.substitutions.sub_date is
  'วันที่ที่สอนแทนมีผล — หน้าเว็บดึงเฉพาะแถวของวันนั้น พ้นวันแล้วไม่แสดงอีก';
comment on column public.substitutions.substitute_room is
  'ค่าว่าง = ใช้ห้องเดิมตามตาราง ไม่ได้แปลว่าไม่มีห้อง';

-- query หลัก: "ห้องนี้ วันนี้ (หรือ 7 วันข้างหน้า) มีสอนแทนอะไรบ้าง"
create index if not exists substitutions_class_date_idx
  on public.substitutions (class_id, sub_date);

-- ครูเปิดหน้าแรก: "วันนี้ทั้งวิทยาลัยมีสอนแทนอะไรบ้าง"
create index if not exists substitutions_date_idx
  on public.substitutions (sub_date);

-- ---------- updated_at ขยับเอง ----------
-- ตั้งชื่อเฉพาะเจาะจง ไม่ใช้ชื่อกลาง ๆ กันไปทับ trigger function ของไฟล์อื่น
create or replace function public.substitutions_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists substitutions_set_updated_at on public.substitutions;
create trigger substitutions_set_updated_at
  before update on public.substitutions
  for each row execute function public.substitutions_touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.substitutions enable row level security;

-- อ่าน: ทุกคนที่ล็อกอิน
-- ตารางสอนไม่ใช่ข้อมูลส่วนบุคคล และครูต้องเห็นของทุกห้องเพื่อรู้ว่าตัวเองต้องไปสอนแทนที่ไหน
-- จึงไม่กรองด้วย class_id (แนวเดียวกับ timetables ในไฟล์ 25)
drop policy if exists substitutions_read on public.substitutions;
create policy substitutions_read on public.substitutions
  for select to authenticated
  using (true);

-- เขียน/แก้/ลบ: ฝ่ายวิชาการเท่านั้น
-- ใส่ทั้ง using และ with check — using คุมว่าแตะแถวไหนได้ with check คุมค่าที่เขียนลงไป
-- ขาดข้อใดข้อหนึ่งจะมีช่องให้เขียนแถวที่ตัวเองแก้ไม่ได้ลงไป
drop policy if exists substitutions_write_academic on public.substitutions;
create policy substitutions_write_academic on public.substitutions
  for all to authenticated
  using (public.app_is_academic_staff())
  with check (public.app_is_academic_staff());

grant select, insert, update, delete on public.substitutions to authenticated;

-- ถอนสิทธิ์ anon ให้ครบ — Supabase ให้สิทธิ์ anon กับตารางใหม่ใน public อัตโนมัติ
-- ตอนนี้ RLS กันอยู่ (policy ระบุ to authenticated) แต่ถ้าวันหลังมีใครเพิ่ม policy
-- ที่ไม่ระบุ role ข้อมูลจะหลุดทันทีโดยไม่มีใครรู้ (เหตุผลเดียวกับ 25b/28)
revoke all on public.substitutions from anon;

-- ============================================================
-- Realtime — สั่งสอนแทนแล้วนักเรียนที่เปิดหน้าตารางอยู่ต้องเห็นทันที
-- ============================================================
-- นี่คือส่วนที่เร่งด่วนจริงในระบบนี้: ครูลากะทันหันตอนคาบกำลังจะเริ่ม
-- ส่วนตารางประจำเทอมไม่ต้อง realtime เพราะเปลี่ยนปีละสองครั้ง
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'substitutions'
  ) then
    execute 'alter publication supabase_realtime add table public.substitutions';
    raise notice 'เพิ่ม public.substitutions เข้า supabase_realtime แล้ว';
  else
    raise notice 'public.substitutions อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป';
  end if;
exception when others then
  raise warning 'เพิ่ม substitutions เข้า realtime ไม่สำเร็จ: % — เปิดเองได้ที่ Database > Replication', sqlerrm;
end $$;

-- ไม่ตั้ง full = ฝั่งเว็บได้แค่ค่า primary key กลับมาตอน UPDATE/DELETE
-- ซึ่งไม่พอจะรู้ว่าแถวที่หายไปเป็นของห้องไหนวันไหน
alter table public.substitutions replica identity full;

-- ============================================================
-- เก็บกวาดแถวเก่า (ไม่บังคับ)
-- ============================================================
-- ข้อมูลนี้หมดประโยชน์ทันทีที่พ้นวัน ปล่อยไว้ก็ไม่กระทบการแสดงผล
-- เพราะทุก query กรองด้วยวันที่อยู่แล้ว — มีไว้เผื่ออยากล้างประวัติสิ้นปี
create or replace function public.purge_old_substitutions(p_keep_days integer default 90)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_deleted integer;
begin
  if not app_is_academic_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  delete from public.substitutions
   where sub_date < current_date - greatest(1, coalesce(p_keep_days, 90));

  get diagnostics v_deleted = row_count;
  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end $$;

grant execute on function public.purge_old_substitutions(integer) to authenticated;
revoke all on function public.purge_old_substitutions(integer) from anon;

-- ============================================================
-- ตรวจสอบผลลัพธ์
-- ============================================================
select
  (select count(*) from public.substitutions)                                as แถวทั้งหมด,
  (select count(*) from public.substitutions where sub_date = current_date)  as สอนแทนวันนี้,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'substitutions')             as จำนวน_policy,
  (select exists (
     select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'substitutions'))           as realtime_เปิดแล้ว,
  case
    when (select relrowsecurity from pg_class where oid = 'public.substitutions'::regclass)
    then 'OK: สร้างตาราง + เปิด RLS เรียบร้อย'
    else 'ผิดพลาด: RLS ยังไม่เปิด'
  end                                                                        as สถานะ;
