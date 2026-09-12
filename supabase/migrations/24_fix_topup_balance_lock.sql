-- ============================================================
-- 24_fix_topup_balance_lock.sql — ล็อกแถวผู้ใช้ก่อนอ่านยอดในเส้นทางเติมเงิน
--
-- ปัญหาที่แก้:
--   approve_topup_request() (18_topup_requests.sql) และ topup_qr_instant()
--   (19_topup_qr_instant.sql) อ่านยอดด้วย app_balance(user_id) แล้วเขียน
--   balance_after = ยอดเดิม + ยอดใหม่ ลง wallet_entries
--
--   แต่ทั้งสองตัวไม่ได้ล็อกแถวใน users ก่อนอ่าน ต่างจาก place_order_v2
--   (12_order_v2.sql:186) ที่ทำ `perform 1 from users where id = v_user for update;`
--   ไว้ตั้งแต่แรก
--
--   ผลคือถ้าเกิดสองรายการของคนเดียวกันพร้อมกัน — เจ้าหน้าที่สองคนกดอนุมัติคำขอ
--   คนละใบของนักเรียนคนเดียวกันในวินาทีเดียวกัน หรือนักเรียนเปิดสองแท็บแล้วกด
--   เติมเงินพร้อมกัน — ทั้งคู่จะอ่านยอดเดิมค่าเดียวกัน แล้วเขียน balance_after
--   ที่ไม่ต่อเนื่องกันลงไป
--
--   ยอดเงินจริงไม่พัง เพราะ app_balance() คิดจาก sum(amount_satang) ไม่ได้อ่านจาก
--   balance_after แต่ "ประวัติการเดินบัญชี" ที่ฝ่ายการเงินใช้ตรวจย้อนหลังจะผิด
--   เช่นเห็นยอดคงเหลือกระโดดข้ามรายการ ซึ่งเป็นปัญหาตอนต้องพิสูจน์ว่าเงินหายไปไหน
--
-- แก้โดยใส่ `perform 1 from users ... for update;` ก่อนอ่านยอด ให้เหมือน place_order_v2
-- ตรรกะอื่นทั้งหมดคงเดิมทุกบรรทัด
--
-- ต้องรันหลัง 18 และ 19 — รันซ้ำได้
-- ============================================================

-- ============================================================
-- 1) approve_topup_request — เจ้าหน้าที่อนุมัติคำขอเติมเงิน
-- ============================================================
create or replace function public.approve_topup_request(
  p_request_id   uuid,
  p_amount_baht  numeric default null,
  p_note         text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_req      public.topup_requests%rowtype;
  v_balance  integer;
  v_satang   integer;
  v_staff    uuid := app_current_user_id();
begin
  if not app_is_finance_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  -- ล็อกแถวกันเจ้าหน้าที่สองคนกด approve พร้อมกันแล้วเติมเงินซ้ำ
  select * into v_req from public.topup_requests where id = p_request_id for update;

  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REVIEWED');
  end if;

  v_satang := round(coalesce(p_amount_baht, v_req.amount_baht) * 100)::integer;
  if v_satang <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_AMOUNT');
  end if;

  -- ล็อกแถวเจ้าของกระเป๋าเงินก่อนอ่านยอด (บรรทัดที่เพิ่มในไฟล์นี้)
  -- ล็อกใบคำขอด้านบนกันได้แค่ "ใบเดียวกันถูกอนุมัติซ้ำ" ไม่ได้กัน "สองใบคนละใบ
  -- ของคนเดียวกันถูกอนุมัติพร้อมกัน" ซึ่งเป็นเคสที่ทำให้ balance_after เพี้ยน
  perform 1 from public.users where id = v_req.user_id for update;

  v_balance := app_balance(v_req.user_id);

  -- balance_after คำนวณจากยอดเดิมเสมอ (แนวเดียวกับ topup_cash / place_order_v2)
  -- idempotency_key ผูกกับ request id ตายตัว — ต่อให้เผลอเรียกซ้ำก็เติมเงินซ้ำไม่ได้
  insert into public.wallet_entries
    (user_id, amount_satang, kind, ref_id, balance_after, idempotency_key, created_by)
  values
    (v_req.user_id, v_satang, 'topup_qr', v_req.id, v_balance + v_satang,
     'topup-request:' || v_req.id, v_staff);

  update public.topup_requests
     set status = 'approved',
         reviewed_by = v_staff,
         reviewed_at = now(),
         note = p_note
   where id = p_request_id;

  return jsonb_build_object('ok', true, 'balance', v_balance + v_satang);
end $$;

comment on function public.approve_topup_request(uuid, numeric, text) is
  'อนุมัติคำขอเติมเงิน (role cashier/sysadmin เท่านั้น) แล้วเติมเงินเข้า wallet_entries จริง — ล็อกทั้งแถวคำขอและแถวเจ้าของกระเป๋าเงินก่อนอ่านยอด ให้ balance_after ต่อเนื่องเสมอ';

grant execute on function public.approve_topup_request(uuid, numeric, text) to authenticated;
revoke all on function public.approve_topup_request(uuid, numeric, text) from anon;

-- ============================================================
-- 2) topup_qr_instant — ถอดออกจากไฟล์นี้แล้ว (เดิมอยู่ตรงนี้ 64 บรรทัด)
--
-- เดิมบล็อกนี้ create or replace ตัว topup_qr_instant() แล้ว grant ให้ authenticated
-- ซึ่งกลายเป็นกับดัก: ตัวนั้นเชื่อยอดที่ผู้ใช้พิมพ์ 100% และไม่มีด่านอะไรเลย
-- 30_topup_instant_guarded.sql ถอนสิทธิ์มันไปแล้ว และ 36_drop_topup_qr_instant_v1.sql
-- ลบทิ้งถาวร — แต่ถ้าใครเผลอรันไฟล์ 24 ซ้ำ (ทุกไฟล์ในโปรเจกต์เขียนว่า "รันซ้ำได้")
-- ฟังก์ชันกับสิทธิ์จะกลับมาเงียบ ๆ ไม่มี error ไม่มี log = ช่องเสกเงินเปิดใหม่ทันที
--
-- จึงตัดออกให้ไฟล์นี้เหลือแค่หน้าที่จริงของมัน คือแก้การล็อกแถวก่อนอ่านยอด
-- (ส่วนที่ 1 ด้านบน) ตัวที่ใช้งานจริงตอนนี้คือ topup_qr_instant_v2() ในไฟล์ 30
-- ถ้าอยากดูว่าโค้ดตัวเก่าหน้าตาอย่างไร ยังอ่านได้ที่ 19_topup_qr_instant.sql
-- ============================================================

-- ============================================================
-- ตรวจสอบ: หา wallet_entries ที่ balance_after ไม่ต่อเนื่องกัน (อาการของบั๊กเดิม)
-- ถ้าคิวรีนี้คืน 0 แถว แปลว่าประวัติเดินบัญชีทั้งหมดต่อเนื่องดี
-- ============================================================
with ordered as (
  select
    user_id,
    created_at,
    amount_satang,
    balance_after,
    lag(balance_after) over (partition by user_id order by created_at, id) as prev_balance
  from public.wallet_entries
)
select count(*) as รายการที่ยอดคงเหลือไม่ต่อเนื่อง
from ordered
where prev_balance is not null
  and balance_after is distinct from prev_balance + amount_satang;
