-- ============================================================
-- REVIEW_TOPUP_REQUESTS.sql — ตรวจ/อนุมัติคำขอเติมเงิน QR+สลิป
--
-- ใช้ตอนไหน: มีนักเรียนแจ้งโอนเงินเข้ามาผ่านหน้าเว็บ (QR พร้อมเพย์ + แนบสลิป)
-- ต้องมาเทียบสลิปกับ statement ธนาคารจริงก่อนกดอนุมัติ
--
-- ทำไมต้องมาที่นี่ ไม่มีปุ่มอนุมัติในแอป:
--   หน้าเว็บยังไม่มีแผงเจ้าหน้าที่การเงินสำหรับงานนี้โดยเฉพาะ (ยังไม่ได้ทำ)
--   ตอนนี้จึงต้องอนุมัติผ่าน SQL Editor ไปก่อน
--
-- ทำไมข้อ 2/3 ไม่เรียก approve_topup_request()/reject_topup_request() ตรง ๆ:
--   สองฟังก์ชันนั้น (ใน 18_topup_requests.sql) เช็คว่า "คนเรียกมี role cashier/sysadmin ไหม"
--   จาก auth.uid() ซึ่งมาจาก session ที่ล็อกอินในแอปเท่านั้น — SQL Editor ไม่มี session
--   แบบนั้นเลย เรียกตรง ๆ จากที่นี่จะได้ {"ok":false,"error":"FORBIDDEN"} เสมอ
--   ข้อ 2/3 ด้านล่างจึงทำงานแบบเดียวกับ TOPUP_FOR_TESTING.sql แทน คือรันเป็นแอดมิน
--   ฐานข้อมูลตรง ๆ ไม่ผ่านการเช็ค role ของแอป (คนที่เข้า SQL Editor ได้ก็เท่ากับ/เกิน
--   สิทธิ์ cashier อยู่แล้ว ไม่ต่างจากที่ TOPUP_FOR_TESTING.sql ทำมาตั้งแต่แรก)
--   ฟังก์ชัน RPC สองตัวนั้นยังเก็บไว้ใช้ตอนทำแผงเจ้าหน้าที่การเงินในแอปจริง (ดูข้อสุดท้าย)
--
-- ดูรูปสลิปยังไง:
--   ไฟล์อยู่ใน Storage > topup-slips (private bucket) เปิดจาก Supabase Dashboard ได้เลย
--   path ของแต่ละคำขออยู่ในคอลัมน์ slip_path ด้านล่าง (รูปแบบ <user_id>/<ไฟล์นิรนาม>)
--
-- ไฟล์นี้ไม่ใช่ migration ไม่ต้องรันตามลำดับ รันเมื่อไรก็ได้ที่ต้องการ
-- ============================================================

-- ============================================================
-- 1) รายการคำขอที่รอตรวจสอบ (เก่าสุดก่อน จะได้ไม่มีใครรอนาน)
-- ============================================================
select
  t.id                          as รหัสคำขอ,
  u.email,
  u.full_name                   as ชื่อ,
  coalesce(sp.student_code,'-') as รหัสนักเรียน,
  t.amount_baht                 as แจ้งโอน_บาท,
  t.slip_path                   as ไฟล์สลิป,
  t.created_at                  as ส่งคำขอเมื่อ
from public.topup_requests t
join public.users u on u.id = t.user_id
left join public.student_profiles sp on sp.user_id = t.user_id
where t.status = 'pending'
order by t.created_at asc;

-- ============================================================
-- 2) อนุมัติ — แก้ค่าในบล็อกนี้แล้ว Run (ทำทีละคำขอ)
-- ============================================================
do $$
declare
  -- ⬇⬇ แก้ตรงนี้ ⬇⬇
  v_request_id  uuid    := 'ec3a478b-c6a0-439c-ae97-d305c7566162'::uuid;
  v_amount_baht numeric := null;  -- ปล่อย null = ใช้ยอดที่นักเรียนแจ้งไว้เลย หรือใส่ยอดจริงถ้าไม่ตรง เช่น 300
  v_note        text    := 'ตรวจสอบสลิปแล้ว ตรงกับยอดที่แจ้ง';
  -- ⬆⬆ แก้ตรงนี้ ⬆⬆

  v_req     public.topup_requests%rowtype;
  v_balance integer;
  v_satang  integer;
begin
  select * into v_req from public.topup_requests where id = v_request_id for update;

  if v_req.id is null then
    raise exception 'ไม่พบคำขอ % (เช็ครหัสจากข้อ 1 อีกครั้ง)', v_request_id;
  end if;

  if v_req.status <> 'pending' then
    raise exception 'คำขอนี้ถูกตรวจไปแล้ว (สถานะปัจจุบัน: %)', v_req.status;
  end if;

  v_satang  := round(coalesce(v_amount_baht, v_req.amount_baht) * 100)::integer;
  v_balance := app_balance(v_req.user_id);

  -- balance_after คำนวณจากยอดเดิมเสมอ, idempotency_key ผูกกับ request id ตายตัว
  -- (แนวเดียวกับ TOPUP_FOR_TESTING.sql / approve_topup_request())
  insert into public.wallet_entries
    (user_id, amount_satang, kind, ref_id, balance_after, idempotency_key, created_by)
  values
    (v_req.user_id, v_satang, 'topup_qr', v_req.id, v_balance + v_satang,
     'topup-request:' || v_req.id, v_req.user_id);

  update public.topup_requests
     set status = 'approved', reviewed_at = now(), note = v_note
   where id = v_request_id;

  raise notice 'อนุมัติแล้ว เติม % บาท (ยอดใหม่ % บาท)', v_satang / 100.0, (v_balance + v_satang) / 100.0;
end $$;

-- ============================================================
-- 3) ปฏิเสธ — ใช้ตอนสลิปปลอม / ยอดไม่ตรง / โอนผิดบัญชี (ไม่แตะยอดเงินเลย)
-- ============================================================
do $$
declare
  -- ⬇⬇ แก้ตรงนี้ ⬇⬇
  v_request_id uuid := ''::uuid;
  v_note       text := 'เหตุผลที่ไม่อนุมัติ เช่น สลิปไม่ตรงกับยอดที่แจ้ง';
  -- ⬆⬆ แก้ตรงนี้ ⬆⬆

  v_req public.topup_requests%rowtype;
begin
  select * into v_req from public.topup_requests where id = v_request_id for update;

  if v_req.id is null then
    raise exception 'ไม่พบคำขอ % (เช็ครหัสจากข้อ 1 อีกครั้ง)', v_request_id;
  end if;

  if v_req.status <> 'pending' then
    raise exception 'คำขอนี้ถูกตรวจไปแล้ว (สถานะปัจจุบัน: %)', v_req.status;
  end if;

  update public.topup_requests
     set status = 'rejected', reviewed_at = now(), note = v_note
   where id = v_request_id;

  raise notice 'ปฏิเสธคำขอ % แล้ว', v_request_id;
end $$;

-- ============================================================
-- 4) ตรวจผล — ดูประวัติล่าสุดทั้งหมด (ทุกสถานะ)
-- ============================================================
select
  t.id,
  u.email,
  t.amount_baht,
  t.status,
  t.note,
  t.reviewed_at,
  ru.email as ผู้ตรวจ
from public.topup_requests t
join public.users u on u.id = t.user_id
left join public.users ru on ru.id = t.reviewed_by
order by t.created_at desc
limit 50;

-- ============================================================
-- ถ้าอยากอนุมัติได้จากหน้าเว็บโดยตรง (ไม่ต้องมาที่นี่ทุกครั้ง)
-- ============================================================
-- ต้องทำแผงเจ้าหน้าที่การเงินในแอปเพิ่ม (ยังไม่ได้ทำในรอบนี้) แล้วให้แผงนั้นเรียก
--   supabase.rpc('approve_topup_request', { p_request_id, p_amount_baht, p_note })
--   supabase.rpc('reject_topup_request',  { p_request_id, p_note })
-- จากบัญชีที่มี role 'cashier' หรือ 'sysadmin' เท่านั้น (เพิ่ม role แบบเดียวกับ TOPUP_FOR_TESTING.sql)
