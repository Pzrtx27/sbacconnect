-- ============================================================
-- TOPUP_FOR_TESTING.sql — เติมเงินให้บัญชีทดสอบ
--
-- ใช้ตอนไหน: เงินในบัตรหมดระหว่างเทสระบบสั่งกาแฟ แล้วกดสั่งต่อไม่ได้
--
-- ทำไมต้องมาเติมที่นี่ ไม่ใช่ในแอป:
--   ตั้งใจให้เป็นแบบนั้น หน้าเว็บเขียน wallet_entries ตรง ๆ ไม่ได้เลย
--   (RLS revoke สิทธิ์เขียนทิ้งทั้งหมด) ไม่งั้นนักเรียนเปิด DevTools
--   แล้วเสกเงินให้ตัวเองได้ทันที ซึ่งทำให้ทั้งระบบไม่มีความหมาย
--
--   ทางเข้าที่ถูกต้องมีสองทาง:
--     1) ฟังก์ชัน topup_cash() ที่บังคับ role 'cashier' (ใช้จริงหน้าเคาน์เตอร์)
--     2) SQL Editor แบบไฟล์นี้ (ใช้ตอนพัฒนา/ทดสอบเท่านั้น)
--
-- ไฟล์นี้ไม่ใช่ migration ไม่ต้องรันตามลำดับ รันเมื่อไรก็ได้ที่ต้องการ
-- ============================================================

-- ============================================================
-- 1) ดูก่อนว่าใครมีเงินเท่าไร
-- ============================================================
select
  u.email,
  u.full_name                          as ชื่อ,
  coalesce(sp.student_code, '-')       as รหัสนักเรียน,
  (app_balance(u.id) / 100.0)          as ยอดคงเหลือ_บาท
from public.users u
left join public.student_profiles sp on sp.user_id = u.id
where u.is_active
order by u.email;

-- ============================================================
-- 2) เติมเงิน — แก้สองบรรทัดในบล็อกนี้แล้ว Run
-- ============================================================
do $$
declare
  -- ⬇⬇ แก้ตรงนี้ ⬇⬇
  v_email  text    := 'ใส่อีเมลของบัญชีที่จะเติม';   -- เอาจากตารางข้อ 1
  v_baht   numeric := 500;                          -- จำนวนเงินที่จะเติม (บาท)
  -- ⬆⬆ แก้ตรงนี้ ⬆⬆

  v_user    uuid;
  v_satang  integer := (v_baht * 100)::integer;
  v_balance integer;
begin
  select id into v_user
  from public.users
  where lower(trim(email)) = lower(trim(v_email)) and is_active;

  if v_user is null then
    raise exception 'ไม่พบบัญชี % (ดูรายชื่อจากคำสั่งข้อ 1)', v_email;
  end if;

  if v_satang <= 0 then
    raise exception 'จำนวนเงินต้องมากกว่า 0';
  end if;

  v_balance := app_balance(v_user);

  -- balance_after ต้องคำนวณจากยอดเดิมเสมอ ไม่ใช่เดาเอง
  -- idempotency_key ใส่เวลาไว้ด้วย จะได้เติมซ้ำได้โดยไม่ชน unique
  insert into public.wallet_entries
    (user_id, amount_satang, kind, balance_after, idempotency_key, created_by)
  values
    (v_user, v_satang, 'topup', v_balance + v_satang,
     'manual-test:' || v_user || ':' || extract(epoch from clock_timestamp())::bigint,
     v_user);

  raise notice 'เติมให้ % แล้ว % บาท (ยอดใหม่ % บาท)',
    v_email, v_baht, (v_balance + v_satang) / 100.0;
end $$;

-- ============================================================
-- 3) ตรวจผล — ยอดใหม่ควรขึ้นตามที่เติม
-- ============================================================
select
  u.email,
  (app_balance(u.id) / 100.0) as ยอดคงเหลือ_บาท
from public.users u
where u.is_active
order by u.email;

-- ============================================================
-- ถ้าอยากเทสแบบไม่ต้องกลับมาที่นี่บ่อย ๆ
-- ============================================================
-- ให้บัญชีตัวเองมี role 'cashier' เพิ่ม แล้วเรียก topup_cash() จากในแอปได้เลย
-- (ทำเฉพาะบัญชีทดสอบ ห้ามให้บัญชีนักเรียนจริง)
--
--   insert into public.user_roles (user_id, role)
--   select id, 'cashier' from public.users where email = 'อีเมลบัญชีทดสอบ'
--   on conflict do nothing;
--
-- ถอดคืนตอนไม่ใช้แล้ว:
--   delete from public.user_roles
--   where role = 'cashier'
--     and user_id = (select id from public.users where email = 'อีเมลบัญชีทดสอบ');
