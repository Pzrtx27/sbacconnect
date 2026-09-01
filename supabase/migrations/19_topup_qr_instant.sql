-- ============================================================
-- 19_topup_qr_instant.sql — เติมเงินอัตโนมัติทันทีตอนแนบสลิป (ไม่รอเจ้าหน้าที่ตรวจ)
--
-- คำเตือนที่ทีมงานรับทราบแล้วก่อนขอให้ทำไฟล์นี้ (อ่านก่อนเปิดใช้จริง):
--   ฟังก์ชันนี้ "เชื่อยอดเงินที่ผู้ใช้พิมพ์เอง" ทั้งหมด ไม่มีการตรวจสอบสลิปกับธนาคารจริงเลย
--   ผู้ใช้อัปโหลดรูปอะไรก็ได้ (รูปเก่า/รูปคนอื่น/รูปตัดต่อ/ไม่ใช่สลิปด้วยซ้ำ) แล้วพิมพ์ยอด
--   เท่าไหร่ก็ได้ (ในเพดานที่กำหนด) เงินจะเข้าบัตรทันที ระบบตรวจสอบไม่ได้เลยว่าโอนจริงหรือไม่
--   นี่คือช่องโหว่แบบเดียวกับที่ระบบเดิม revoke สิทธิ์เขียน wallet_entries ทิ้งทั้งหมดตั้งแต่แรก
--   (ดูคอมเมนต์ TOPUP_FOR_TESTING.sql / 18_topup_requests.sql) แต่ทีมงานเลือกแลกความเร็ว
--   กับความเสี่ยงนี้เอง จึงทำให้ตามที่ขอ
--
--   ทางบรรเทาความเสี่ยงเดียวที่ใส่ไว้: p_amount_baht ห้ามเกิน v_max_baht ต่อครั้ง
--   กันเคสพิมพ์เลขมั่ว ๆ ผ่าน DevTools/Postman ตรงเข้า RPC แล้วได้ยอดมหาศาลในครั้งเดียว
--   แต่ยัง "ไม่กัน" การอัปโหลดสลิปปลอม/สลิปเก่าซ้ำเพื่อเติมยอดปกติหลายครั้งอยู่ดี
--
--   ทุกรายการยังบันทึกลง topup_requests (status='approved', note บอกว่าอัตโนมัติ) และ
--   wallet_entries ตามปกติ — ตรวจสอบย้อนหลังได้เต็มที่ แค่ไม่มีใครเช็คก่อนเงินเข้าเท่านั้น
--
--   ถ้าอยากเปลี่ยนกลับไปให้เจ้าหน้าที่ตรวจก่อนเหมือนเดิม: แค่แก้หน้าเว็บ (TopUpSlipForm.jsx)
--   ให้ insert ตรงเข้า topup_requests (status ปล่อยเป็น default 'pending') แทนการเรียก
--   RPC นี้ — ไม่ต้องมาแก้/ลบไฟล์นี้เลย โครงสร้างเดิมใน 18_topup_requests.sql ยังอยู่ครบ
--
-- ต้องรัน 18_topup_requests.sql ก่อนไฟล์นี้เสมอ (ใช้ตาราง/role helper ที่สร้างไว้ในนั้น)
-- รันซ้ำได้ทั้งไฟล์
-- ============================================================

create or replace function public.topup_qr_instant(
  p_amount_baht numeric,
  p_slip_path   text,
  p_slip_mime   text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user     uuid := app_current_user_id();
  v_balance  integer;
  v_satang   integer;
  v_request  uuid;
  v_max_baht constant numeric := 20000; -- เพดานกันพิมพ์เลขมั่ว ๆ ต่อครั้ง ไม่ใช่ข้อจำกัดทางธุรกิจตายตัว
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  if p_amount_baht is null or p_amount_baht <= 0 or p_amount_baht > v_max_baht then
    return jsonb_build_object('ok', false, 'error', 'INVALID_AMOUNT');
  end if;

  -- กันอ้าง path ไฟล์ของคนอื่น: โฟลเดอร์แรกของ path ต้องเป็น users.id ของคนเรียกเท่านั้น
  if p_slip_path is null or (storage.foldername(p_slip_path))[1] is distinct from v_user::text then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SLIP_PATH');
  end if;

  v_satang := round(p_amount_baht * 100)::integer;

  -- บันทึกเป็น "approved" ทันทีพร้อม note บอกชัดว่าอัตโนมัติ ไม่มีใครตรวจ
  -- (ต่างจากทางเดิมใน 18_topup_requests.sql ที่ insert แล้วสถานะเป็น pending รอ approve_topup_request())
  insert into public.topup_requests
    (user_id, amount_baht, slip_path, slip_mime, status, reviewed_by, reviewed_at, note)
  values
    (v_user, p_amount_baht, p_slip_path, p_slip_mime, 'approved', v_user, now(),
     'อนุมัติอัตโนมัติทันที — ไม่มีเจ้าหน้าที่ตรวจสอบสลิป')
  returning id into v_request;

  v_balance := app_balance(v_user);

  -- balance_after คำนวณจากยอดเดิมเสมอ, idempotency_key ผูกกับ request id ตายตัว
  -- (แนวเดียวกับ approve_topup_request() ใน 18_topup_requests.sql)
  insert into public.wallet_entries
    (user_id, amount_satang, kind, ref_id, balance_after, idempotency_key, created_by)
  values
    (v_user, v_satang, 'topup_qr', v_request, v_balance + v_satang,
     'topup-request:' || v_request, v_user);

  return jsonb_build_object('ok', true, 'balance', v_balance + v_satang, 'request_id', v_request);
end $$;

comment on function public.topup_qr_instant(numeric, text, text) is
  'เติมเงินทันทีตอนนักเรียนแนบสลิป ไม่มีเจ้าหน้าที่ตรวจสอบ — เชื่อยอดที่ผู้ใช้พิมพ์เอง 100% '
  '(ความเสี่ยงที่ทีมงานรับทราบและเลือกใช้เอง อ่านคำเตือนเต็มในคอมเมนต์หัวไฟล์ 19_topup_qr_instant.sql)';

grant execute on function public.topup_qr_instant(numeric, text, text) to authenticated;
