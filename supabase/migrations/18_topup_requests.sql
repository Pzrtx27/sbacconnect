-- ============================================================
-- 18_topup_requests.sql — เติมเงินด้วย QR พร้อมเพย์ + แนบสลิปโอนเงิน
--
-- ปัญหาที่แก้:
--   ตอนนี้ทางเดียวที่เติมเงินได้คือเดินไปจุดบริการการเงิน อาคาร 1 ชั้น 1
--   ให้เจ้าหน้าที่แตะบัตรแล้วเรียก topup_cash() (ดู TOPUP_FOR_TESTING.sql)
--   นักเรียนที่อยากโอนเงินผ่าน QR พร้อมเพย์เองไม่มีช่องทางแจ้งระบบเลย
--
-- สิ่งที่ไฟล์นี้ทำ:
--   เพิ่มตาราง topup_requests ให้นักเรียนแจ้ง "ฉันโอนแล้ว พร้อมรูปสลิป" เข้ามาเป็นคำขอ
--   รอเจ้าหน้าที่การเงิน (role cashier/sysadmin) ตรวจสลิปเทียบกับ statement จริง
--   แล้วกด approve/reject ผ่าน RPC ท้ายไฟล์นี้เท่านั้น
--
--   ตารางนี้ "ไม่ใช่" ทางเข้าเติมเงินโดยตรง — insert เข้า topup_requests ได้แค่สร้าง
--   "คำขอ" สถานะ pending เท่านั้น ยังไม่มีผลกับยอดเงินในบัตรจนกว่าเจ้าหน้าที่จะ approve
--   ปิดทางเดียวกับ wallet_entries ทุกจุด: ไม่มีใคร insert wallet_entries ตรง ๆ จากหน้าเว็บได้
--
-- ไฟล์รูปสลิปเก็บใน Storage bucket 'topup-slips' (private) ใต้โฟลเดอร์ของแต่ละคน
-- (path = <users.id>/<ไฟล์นิรนาม>) ชื่อไฟล์ตั้งใหม่ทุกครั้งฝั่งหน้าเว็บก่อนอัปโหลด
-- (timestamp + เลขสุ่ม ดู src/utils/slipFile.js) จึงไม่มีชื่อไฟล์เดิมของผู้ใช้หลุดเข้ามา
--
-- ยึดโครงเดิมของโปรเจกต์: public.users (uuid) + app_has_role() / app_current_user_id()
-- ที่มีอยู่แล้ว รันซ้ำได้ทั้งไฟล์
-- ============================================================

-- ============================================================
-- 1) ตาราง
-- ============================================================
create table if not exists public.topup_requests (
  id            uuid primary key default gen_random_uuid(),

  -- default เป็นฟังก์ชัน ไม่ใช่ค่าที่หน้าเว็บส่งมา — จะได้ปลอมเป็นคนอื่นไม่ได้
  -- (แนวเดียวกับ events.created_by ใน 10_events.sql)
  user_id       uuid not null default app_current_user_id()
                  references public.users(id) on delete cascade,

  -- จำนวนเงินที่นักเรียน "แจ้ง" ว่าโอนไป ใช้ให้เจ้าหน้าที่เทียบกับ statement จริงตอนตรวจ
  -- ไม่ใช่ตัวเลขที่เอาไปเติมบัตรตรง ๆ — ตอน approve เจ้าหน้าที่ยืนยัน/แก้จำนวนอีกที (ดู RPC ท้ายไฟล์)
  amount_baht   numeric(12,2) not null check (amount_baht > 0),

  -- path ใน storage bucket 'topup-slips' เช่น '<user_id>/1735600000000-a1b2c3.jpg'
  slip_path     text not null,
  slip_mime     text,

  status        text not null default 'pending',
  note          text,                       -- เหตุผล/หมายเหตุจากเจ้าหน้าที่ (เช่นตอน reject)

  reviewed_by   uuid references public.users(id) on delete set null,
  reviewed_at   timestamptz,

  created_at    timestamptz not null default now(),

  constraint topup_requests_status_valid check (status in ('pending', 'approved', 'rejected')),
  constraint topup_requests_slip_path_not_blank check (char_length(trim(slip_path)) > 0)
);

create index if not exists topup_requests_user_id_idx on public.topup_requests (user_id, created_at desc);
create index if not exists topup_requests_pending_idx on public.topup_requests (created_at) where status = 'pending';

comment on table public.topup_requests is
  'คำขอเติมเงินผ่าน QR พร้อมเพย์ + แนบสลิป — แค่ "แจ้ง" เท่านั้น ยังไม่มีผลกับยอดบัตรจนกว่า approve_topup_request() จะอนุมัติ';

-- ============================================================
-- 2) ใครตรวจ/อนุมัติคำขอได้
-- ============================================================
-- security definer: ต้องอ่าน user_roles ซึ่งเปิด RLS อยู่ — จุดเดียวที่ใช้ในทุก policy/RPC ของไฟล์นี้
create or replace function public.app_is_finance_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select app_has_role('cashier') or app_has_role('sysadmin');
$$;

comment on function public.app_is_finance_staff() is
  'true เมื่อผู้เรียกมี role cashier หรือ sysadmin — ใช้กำหนดสิทธิ์ตรวจ/อนุมัติคำขอเติมเงิน';

-- ============================================================
-- 3) RLS
-- ============================================================
alter table public.topup_requests enable row level security;

-- อ่าน: เจ้าของเห็นคำขอของตัวเอง, เจ้าหน้าที่การเงินเห็นทุกใบ (ต้องเห็นเพื่อตรวจ)
drop policy if exists topup_requests_read on public.topup_requests;
create policy topup_requests_read on public.topup_requests
  for select
  using (user_id = app_current_user_id() or app_is_finance_staff());

-- สร้างคำขอ: สร้างได้เฉพาะของตัวเอง และต้องเป็นสถานะ pending เท่านั้น
-- (ห้ามส่ง status='approved' มาเองจาก DevTools)
drop policy if exists topup_requests_insert_own on public.topup_requests;
create policy topup_requests_insert_own on public.topup_requests
  for insert
  with check (user_id = app_current_user_id() and status = 'pending');

-- แก้ไข: ปิดทางหน้าเว็บทั้งหมด แม้แต่เจ้าของก็แก้ไม่ได้ (กันแก้ยอด/แก้สถานะเอง)
-- การ approve/reject ทำผ่าน RPC security definer ท้ายไฟล์นี้เท่านั้น ซึ่งรันข้าม RLS ได้อยู่แล้ว
-- ไม่ต้องมี policy for update ใด ๆ ที่นี่

grant select, insert on public.topup_requests to authenticated;
revoke all on public.topup_requests from anon;

grant execute on function public.app_is_finance_staff() to authenticated;

-- ============================================================
-- 4) Storage bucket 'topup-slips' (private) + policy
-- ============================================================
insert into storage.buckets (id, name, public)
values ('topup-slips', 'topup-slips', false)
on conflict (id) do nothing;

-- อัปโหลด: ใส่ไฟล์ได้เฉพาะใต้โฟลเดอร์ของตัวเอง (โฟลเดอร์แรกของ path ต้องตรงกับ users.id ตัวเอง)
drop policy if exists topup_slips_insert_own on storage.objects;
create policy topup_slips_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'topup-slips'
    and (storage.foldername(name))[1] = app_current_user_id()::text
  );

-- อ่าน: เจ้าของอ่านไฟล์ตัวเองได้ เจ้าหน้าที่การเงินอ่านได้ทุกไฟล์ (ต้องเปิดดูสลิปตอนตรวจ)
drop policy if exists topup_slips_select_own_or_staff on storage.objects;
create policy topup_slips_select_own_or_staff on storage.objects
  for select
  using (
    bucket_id = 'topup-slips'
    and (
      (storage.foldername(name))[1] = app_current_user_id()::text
      or app_is_finance_staff()
    )
  );

-- ไม่มี policy update/delete ให้ใคร: สลิปที่ส่งเข้ามาแล้วแก้/ลบไม่ได้เลยแม้แต่เจ้าของ
-- ถือเป็นหลักฐานการโอนเงิน แก้ไขได้ก็เท่ากับปลอมหลักฐานได้

-- ============================================================
-- 5) RPC: อนุมัติคำขอ — จุดเดียวที่ทำให้ยอดเงินในบัตรเพิ่มจริง
-- ============================================================
-- บังคับ role cashier/sysadmin เหมือน topup_cash() ทุกประการ ต่างกันแค่มีสลิปอ้างอิงคำขอ
-- p_amount_baht ให้เจ้าหน้าที่ "ยืนยัน" จำนวนเงินอีกครั้งตอนอนุมัติ (ปกติเท่ากับที่นักเรียนแจ้ง
-- แต่ถ้าเทียบ statement แล้วไม่ตรง เจ้าหน้าที่แก้เป็นยอดจริงที่โอนมาได้ ไม่ต้องเชื่อตัวเลขจากนักเรียนเพียว ๆ)
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
  'อนุมัติคำขอเติมเงิน (role cashier/sysadmin เท่านั้น) แล้วเติมเงินเข้า wallet_entries จริง — จุดเดียวที่ทำให้ยอดบัตรของนักเรียนเพิ่มจากคำขอ QR+สลิป';

-- ============================================================
-- 6) RPC: ปฏิเสธคำขอ — ไม่แตะ wallet_entries เลย
-- ============================================================
create or replace function public.reject_topup_request(
  p_request_id uuid,
  p_note       text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_req public.topup_requests%rowtype;
begin
  if not app_is_finance_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into v_req from public.topup_requests where id = p_request_id for update;

  if v_req.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REVIEWED');
  end if;

  update public.topup_requests
     set status = 'rejected',
         reviewed_by = app_current_user_id(),
         reviewed_at = now(),
         note = p_note
   where id = p_request_id;

  return jsonb_build_object('ok', true);
end $$;

comment on function public.reject_topup_request(uuid, text) is
  'ปฏิเสธคำขอเติมเงิน (role cashier/sysadmin เท่านั้น) — ไม่มีผลกับยอดบัตร ใช้ตอนสลิปปลอม/ยอดไม่ตรง/โอนผิดบัญชี';

grant execute on function public.approve_topup_request(uuid, numeric, text) to authenticated;
grant execute on function public.reject_topup_request(uuid, text) to authenticated;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  count(*)                                     as คำขอทั้งหมด,
  count(*) filter (where status = 'pending')   as รอตรวจสอบ,
  count(*) filter (where status = 'approved')  as อนุมัติแล้ว,
  count(*) filter (where status = 'rejected')  as ไม่อนุมัติ
from public.topup_requests;
