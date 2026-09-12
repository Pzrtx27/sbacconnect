-- ============================================================
-- 28_harden_core_tables.sql — ปิดประตูชั้นนอกของตารางแกนกลาง
--
-- ที่มา: ตรวจความปลอดภัยก่อนส่งงานแล้วยิง API จริงด้วย anon key พบว่า
--   /rest/v1/user_roles      -> HTTP 200 []
--   /rest/v1/users           -> HTTP 200 []
--   /rest/v1/wallet_entries  -> HTTP 200 []
--   /rest/v1/student_profiles-> HTTP 200 []
-- ตอบ 200 แปลว่า anon "มีสิทธิ์ระดับตาราง" อยู่ แค่ RLS ไม่คืนแถวให้เท่านั้น
-- ตารางที่ตั้งค่าถูกต้อง (เช่น events, repair_tickets, timetables หลังแก้)
-- ตอบ 401 code 42501 คือถูกปฏิเสธตั้งแต่ประตูชั้นนอก ไม่ทันได้เข้า RLS ด้วยซ้ำ
--
-- ตอนนี้ยังไม่รั่ว เพราะไม่มี policy ไหนเขียนให้ anon
-- แต่แปลว่าความปลอดภัยของตารางสำคัญที่สุดสี่ตัวนี้แขวนอยู่กับชั้นเดียว
-- ถ้าวันหลังมีคนเพิ่ม policy โดยลืมใส่ "to authenticated" ข้อมูลหลุดทันทีเงียบ ๆ
--
-- อีกครึ่งที่สำคัญกว่า: ถอนสิทธิ์ "เขียน" ออกจาก authenticated
--   ถ้านักเรียนเขียน user_roles ได้ เขา insert (uid ตัวเอง, 'sysadmin') ครั้งเดียว
--   ทุก app_is_..._staff() ใน migration ทั้งหมดจะกลายเป็น true พร้อมกัน
--   เขียน wallet_entries ได้ = เติมเงินตัวเองไม่จำกัด
--   นี่คือสมมติฐานที่รายงานความปลอดภัยบอกว่า "แบกทั้งระบบไว้" — ตอกให้แน่นตรงนี้
--
-- ยังคงสิทธิ์ SELECT ให้ authenticated ไว้ เพราะ AuthContext.jsx อ่าน
-- users / user_roles / student_profiles ตอนโหลดโปรไฟล์
-- ส่วนการเขียนทั้งหมดของแอปวิ่งผ่าน SECURITY DEFINER RPC ซึ่งรันด้วยสิทธิ์เจ้าของฟังก์ชัน
-- ไม่ได้ใช้สิทธิ์ของผู้เรียก จึงไม่กระทบอะไรเลย
--
-- รันซ้ำได้ / ปลอดภัยกับข้อมูลที่มีอยู่ (ไม่แตะข้อมูล แตะแค่สิทธิ์)
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array['users', 'user_roles', 'student_profiles', 'wallet_entries']
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'ข้าม %  — ไม่มีตารางนี้', t;
      continue;
    end if;

    -- ประตูชั้นนอกของคนที่ยังไม่ล็อกอิน: ปิดสนิท
    execute format('revoke all on public.%I from anon', t);

    -- คนที่ล็อกอินแล้ว: อ่านได้ (RLS กรองรายแถวต่อ) แต่เขียนไม่ได้เด็ดขาด
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);

    raise notice 'ปิดสิทธิ์เขียน % สำหรับ authenticated และถอน anon ออกหมดแล้ว', t;
  end loop;
end $$;

-- ============================================================
-- ตรวจผล — ต้องไม่เหลือสิทธิ์เขียนของ anon/authenticated บนสี่ตารางนี้
-- ============================================================
do $$
declare
  r record;
  v_bad int := 0;
begin
  for r in
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('users', 'user_roles', 'student_profiles', 'wallet_entries')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  loop
    raise warning 'ยังเหลือสิทธิ์: % มีสิทธิ์ % บน %', r.grantee, r.privilege_type, r.table_name;
    v_bad := v_bad + 1;
  end loop;

  if v_bad = 0 then
    raise notice 'ผ่าน — anon และ authenticated เขียนตารางแกนกลางไม่ได้แล้วทั้งสี่ตาราง';
  else
    raise warning 'ยังเหลือสิทธิ์เขียนอยู่ % รายการ — ดูบรรทัด WARNING ด้านบน', v_bad;
  end if;
end $$;
