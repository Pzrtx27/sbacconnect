-- ============================================================
-- 32_fix_substitutions_created_by.sql — ปลด foreign key ที่บล็อกการบันทึกสอนแทน
--
-- อาการ: กด "สั่งสอนแทน" แล้วขึ้น "บันทึกไม่สำเร็จ" ทุกครั้ง
--   console: code 23503
--            "insert or update on table substitutions violates foreign key"
--            details: Key is not present in table "users".
--
-- สาเหตุ: ไฟล์ 31 ตั้ง created_by uuid references auth.users(id)
--   แล้วฝั่งเว็บส่งค่าจาก supabase.auth.getUser() มาใส่
--   ค่าที่ส่งมาไม่ตรงกับแถวใน auth.users จริง (session เก่า/บัญชีถูกสร้างใหม่
--   หรือ getUser() คืนค่าจาก cache) — FK จึงปฏิเสธทั้ง insert
--
-- ทำไมแก้แบบนี้:
--   created_by เป็นแค่ "ข้อมูลกำกับว่าใครสั่ง" ไม่ใช่ข้อมูลที่ระบบต้องใช้ทำงาน
--   ของกำกับไม่ควรมีอำนาจทำให้ของหลัก (การประกาศสอนแทน) พังทั้งก้อน
--   ส่วนการคุมสิทธิ์ว่าใครเขียนได้ เป็นหน้าที่ของ RLS อยู่แล้ว ไม่ใช่ FK นี้
--
--   เปลี่ยนไปให้ DB เติมเองจาก auth.uid() ซึ่งอ่านจาก JWT ของคนที่ยิงเข้ามาจริง
--   เชื่อถือได้กว่าค่าที่เบราว์เซอร์ส่งมา และปลอมไม่ได้
--
-- รันซ้ำได้
-- ============================================================

-- ---------- 1) ดูก่อนว่าตอนนี้ FK ชี้ไปไหน (ไว้อ่านผลตอนรัน) ----------
do $$
declare
  r record;
begin
  for r in
    select con.conname,
           nsp.nspname || '.' || cls.relname as ชี้ไปที่
    from pg_constraint con
    join pg_class cls on cls.oid = con.confrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where con.conrelid = 'public.substitutions'::regclass
      and con.contype = 'f'
  loop
    raise notice 'พบ foreign key: % -> %', r.conname, r.ชี้ไปที่;
  end loop;
end $$;

-- ---------- 2) ถอด FK ทุกตัวของ substitutions ----------
-- ไล่จาก catalog แทนการเดาชื่อ constraint เพราะชื่อที่ Postgres ตั้งให้อัตโนมัติ
-- อาจไม่ใช่ substitutions_created_by_fkey เสมอไป
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.substitutions'::regclass and contype = 'f'
  loop
    execute format('alter table public.substitutions drop constraint %I', r.conname);
    raise notice 'ถอด foreign key % แล้ว', r.conname;
  end loop;
end $$;

-- ---------- 3) ให้ DB เติม created_by เอง ----------
-- auth.uid() อ่าน sub จาก JWT ของ request นั้น ๆ
-- ฝั่งเว็บเลิกส่ง created_by มาแล้ว (ดู saveSubstitution ใน src/utils/timetable.js)
alter table public.substitutions
  alter column created_by set default auth.uid();

comment on column public.substitutions.created_by is
  'ใครเป็นคนสั่งสอนแทน — DB เติมเองจาก auth.uid() ไม่รับค่าจากฝั่งเว็บ และไม่มี FK '
  'เพราะเป็นข้อมูลกำกับ ไม่ควรทำให้การบันทึกล้มทั้งรายการ';

-- ============================================================
-- ตรวจสอบผลลัพธ์ — ต้องได้ 0 กับ auth.uid()
-- ============================================================
select
  (select count(*) from pg_constraint
    where conrelid = 'public.substitutions'::regclass and contype = 'f')  as foreign_key_ที่เหลือ,
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'substitutions'
      and column_name = 'created_by')                                     as ค่าเริ่มต้น_created_by,
  case
    when (select count(*) from pg_constraint
           where conrelid = 'public.substitutions'::regclass and contype = 'f') = 0
    then 'OK: ถอด FK เรียบร้อย บันทึกสอนแทนได้แล้ว'
    else 'ยังมี FK เหลืออยู่ — ดู notice ด้านบน'
  end                                                                     as สถานะ;
