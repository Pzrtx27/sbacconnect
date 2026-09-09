-- ============================================================
-- 35_revoke_app_balance.sql — ปิดช่องอ่านยอดเงินของคนอื่น
--
-- ที่มา:
--   02_functions.sql สร้าง app_balance(p_user_id uuid) เป็น security definer
--   เพื่อให้ฟังก์ชันอื่น (place_order / topup_cash / place_order_v2 /
--   topup_qr_instant_v2) เรียกใช้ภายใน — ตั้งใจให้เป็น "ตัวช่วยภายใน" ไม่ใช่ API
--
--   แต่ 03_rls.sql grant execute ให้แค่ my_balance() / place_order() / topup_cash()
--   ส่วน app_balance() ไม่ถูกแตะเลยสักบรรทัด และ PostgreSQL แจก EXECUTE ให้ PUBLIC
--   เป็นค่าเริ่มต้นกับทุกฟังก์ชันใหม่ ขณะที่ PostgREST เปิด schema public เป็น RPC
--   อัตโนมัติ ผลคือมันกลายเป็น endpoint สาธารณะโดยไม่มีใครตั้งใจ:
--
--     supabase.rpc('app_balance', { p_user_id: '<uuid ของใครก็ได้>' })
--
--   ซึ่งขัดกับ policy ในไฟล์ 03 ที่เขียนไว้ตรง ๆ ว่า
--   "ดูได้เฉพาะของตัวเอง ไม่มีใครดูของคนอื่นได้ แม้แต่ sysadmin"
--
--   เส้นทางที่ใช้ได้จริงคือบัญชีครู เพราะ search_students() (20_behavior...)
--   คืน user_id ของนักเรียนทุกคนมาให้อยู่แล้ว จึงไล่อ่านยอดเงินได้ทั้งวิทยาลัย
--   (นักเรียนด้วยกันเดา uuid ไม่ได้ จึงยังทำไม่ได้)
--
-- ทำไมถอนสิทธิ์แล้วไม่พัง:
--   ฟังก์ชันที่เรียก app_balance() ล้วนเป็น security definer ซึ่งรันด้วยสิทธิ์
--   ของเจ้าของฟังก์ชัน ไม่ใช่สิทธิ์ของผู้เรียก การถอนสิทธิ์ผู้เรียกจึงไม่กระทบ
--   ส่วนหน้าเว็บใช้ my_balance() (ไม่รับพารามิเตอร์ อ่านของตัวเองเท่านั้น) ไม่ถูกแตะ
--
-- รันซ้ำได้ / สั้น ใช้เวลาไม่ถึงวินาที
-- ============================================================

revoke all on function public.app_balance(uuid) from public, anon, authenticated;

-- ============================================================
-- ตรวจผล — ต้องไม่เหลือสิทธิ์เรียกของ anon/authenticated
-- ถ้ายังเหลือ ให้ raise exception ทิ้งไปเลย จะได้ไม่เข้าใจผิดว่าปิดสำเร็จ
-- ============================================================
do $$
declare
  r    text;
  bad  text[] := '{}';
begin
  foreach r in array array['anon', 'authenticated', 'public']
  loop
    if has_function_privilege(r, 'public.app_balance(uuid)', 'execute') then
      bad := bad || r;
    end if;
  end loop;

  if array_length(bad, 1) is not null then
    raise exception 'ยังถอนสิทธิ์ไม่หมด เหลือ: %', array_to_string(bad, ', ');
  end if;

  raise notice 'app_balance(uuid) เป็นตัวช่วยภายในแล้ว — anon/authenticated เรียกตรงไม่ได้';
  raise notice 'my_balance() ยังใช้ได้ตามปกติ (หน้าเว็บอ่านยอดเงินตัวเองผ่านตัวนี้)';
end $$;
