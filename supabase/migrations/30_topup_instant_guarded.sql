-- ============================================================
-- 30_topup_instant_guarded.sql — เติมเงินทันที แต่ปิดช่องยิงวนลูป
--
-- ที่มา:
--   topup_qr_instant() เดิม (19_topup_qr_instant.sql) เชื่อยอดที่ผู้ใช้พิมพ์ 100%
--   และไม่มีอะไรกันการเรียกซ้ำเลย นักเรียนเปิด DevTools ยิง RPC วนลูป
--   ใส่ยอดสูงสุดทุกครั้ง ได้เงินไม่จำกัด แล้วเอาไปซื้อของจริงได้
--   ที่แย่กว่านั้นคือไม่ต้องอัปโหลดไฟล์ด้วยซ้ำ เพราะตรวจแค่ว่า path
--   ขึ้นต้นด้วย user id ตัวเอง ไม่ได้เช็คว่ามีไฟล์อยู่จริงใน bucket
--
--   ทีมงานอยากได้ประสบการณ์ "เงินเข้าทันที" ไว้สาธิต ซึ่งทำได้
--   แต่ต้องแก้ที่ต้นเหตุจริง: ปัญหาไม่ใช่ "เร็ว" แต่คือ "ทำซ้ำได้ไม่จำกัด
--   และไม่มีอะไรผูกกับหลักฐานการโอน"
--
-- สามด่านที่เพิ่มเข้ามา:
--   1. สลิปต้องมีไฟล์อยู่จริงใน bucket — ไม่ใช่แค่ส่งชื่อ path มาลอย ๆ
--   2. สลิปรูปเดิมใช้ซ้ำไม่ได้ — ผูก sha256 ของไฟล์ไว้ unique ทั้งตาราง
--      โอนจริงครั้งเดียวจะเอาสลิปใบเดิมมายิงซ้ำสิบรอบไม่ได้
--   3. เพดานต่อวันต่อคน — ต่อให้หาสลิปใหม่ได้เรื่อย ๆ ก็ยังจำกัดความเสียหาย
--
--   ยังไม่ได้ตรวจกับธนาคารจริง (ต้องใช้ API ที่มีค่าใช้จ่าย) จึงยังไม่ควรใช้
--   กับเงินจริงจำนวนมาก แต่ปิดช่อง "เสกเงินไม่จำกัดในสามสิบวินาที" ได้แล้ว
--
-- ต้องรัน 18_topup_requests.sql และ 24_fix_topup_balance_lock.sql มาก่อน
-- รันซ้ำได้
-- ============================================================

-- ---------- 1) ผูกลายนิ้วมือของไฟล์สลิปไว้กับคำขอ ----------
alter table public.topup_requests
  add column if not exists slip_sha256 text;

-- unique ทั้งตาราง ไม่ใช่แค่ต่อคน — สลิปใบเดียวกันส่งต่อให้เพื่อนใช้ซ้ำก็ไม่ผ่าน
create unique index if not exists topup_requests_slip_sha256_key
  on public.topup_requests (slip_sha256)
  where slip_sha256 is not null;

comment on column public.topup_requests.slip_sha256 is
  'sha256 ของไฟล์สลิป คำนวณฝั่งเบราว์เซอร์ — unique กันเอาสลิปใบเดิมมาใช้ซ้ำ';

-- ---------- 2) เพดานต่อวัน ----------
create or replace function public.topup_daily_limit_satang()
returns integer
language sql
immutable
set search_path = public
as $$
  -- 2,000 บาท/วัน — พอสำหรับการใช้จ่ายในโรงเรียนจริง
  -- แต่ต่อให้หลุดทุกด่าน ความเสียหายต่อวันก็ยังจำกัด
  select 200000;
$$;

comment on function public.topup_daily_limit_satang() is
  'เพดานเติมเงินอัตโนมัติต่อคนต่อวัน (สตางค์) — แก้ที่นี่ที่เดียว';

-- ---------- 3) RPC ตัวใหม่ ----------
create or replace function public.topup_qr_instant_v2(
  p_amount_baht numeric,
  p_slip_path   text,
  p_slip_mime   text default null,
  p_slip_sha256 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user        uuid := app_current_user_id();
  v_satang      integer;
  v_max_satang  constant integer := 2000000;   -- 20,000 บาท ต่อครั้ง (เท่าของเดิม)
  v_day_satang  integer;
  v_day_limit   integer := public.topup_daily_limit_satang();
  v_balance     integer;
  v_request     uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  if p_amount_baht is null or p_amount_baht <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_AMOUNT');
  end if;

  v_satang := round(p_amount_baht * 100)::integer;

  if v_satang > v_max_satang then
    return jsonb_build_object('ok', false, 'error', 'AMOUNT_TOO_LARGE');
  end if;

  -- ---------- ด่าน 1: path ต้องเป็นของตัวเอง ----------
  if p_slip_path is null or (storage.foldername(p_slip_path))[1] is distinct from v_user::text then
    return jsonb_build_object('ok', false, 'error', 'INVALID_SLIP_PATH');
  end if;

  -- ---------- ด่าน 2: ไฟล์ต้องมีอยู่จริงใน bucket ----------
  -- ของเดิมข้ามข้อนี้ไป จึงยิง RPC ได้โดยไม่ต้องอัปโหลดอะไรเลย
  if not exists (
    select 1 from storage.objects
     where bucket_id = 'topup-slips'
       and name = p_slip_path
  ) then
    return jsonb_build_object('ok', false, 'error', 'SLIP_NOT_UPLOADED');
  end if;

  -- ---------- ด่าน 3: ต้องมีลายนิ้วมือของไฟล์ ----------
  if p_slip_sha256 is null or char_length(p_slip_sha256) <> 64 then
    return jsonb_build_object('ok', false, 'error', 'SLIP_HASH_REQUIRED');
  end if;

  if exists (select 1 from public.topup_requests where slip_sha256 = p_slip_sha256) then
    return jsonb_build_object('ok', false, 'error', 'SLIP_ALREADY_USED');
  end if;

  -- ---------- ด่าน 4: เพดานต่อวัน ----------
  -- ล็อกแถวผู้ใช้ก่อนนับ กันสองคำขอพร้อมกันนับยอดเดิมทั้งคู่แล้วผ่านทั้งคู่
  perform 1 from public.users where id = v_user for update;

  select coalesce(sum(round(amount_baht * 100)::integer), 0)
    into v_day_satang
    from public.topup_requests
   where user_id = v_user
     and status = 'approved'
     and created_at >= date_trunc('day', now());

  if v_day_satang + v_satang > v_day_limit then
    return jsonb_build_object(
      'ok', false, 'error', 'DAILY_LIMIT',
      'used_baht', round(v_day_satang / 100.0, 2),
      'limit_baht', round(v_day_limit / 100.0, 2)
    );
  end if;

  -- ---------- ผ่านครบทุกด่าน ----------
  v_balance := app_balance(v_user);

  insert into public.topup_requests
    (user_id, amount_baht, slip_path, slip_mime, slip_sha256, status, reviewed_by, reviewed_at, note)
  values
    (v_user, p_amount_baht, p_slip_path, p_slip_mime, p_slip_sha256, 'approved', v_user, now(),
     'เติมอัตโนมัติหลังแนบสลิป (ยังไม่ได้ตรวจกับธนาคาร)')
  returning id into v_request;

  insert into public.wallet_entries
    (user_id, amount_satang, kind, ref_id, balance_after, idempotency_key, created_by)
  values
    (v_user, v_satang, 'topup_qr', v_request, v_balance + v_satang,
     'topup-request:' || v_request, v_user);

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request,
    'balance_satang', v_balance + v_satang,
    'day_used_baht', round((v_day_satang + v_satang) / 100.0, 2),
    'day_limit_baht', round(v_day_limit / 100.0, 2)
  );
exception
  -- ชนกันพอดีระหว่างเช็คกับ insert (สองแท็บยิงสลิปใบเดียวกันพร้อมกัน)
  -- unique index เป็นด่านสุดท้ายที่กันไว้จริง ตอบให้ตรงกับด่านที่ 3
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'SLIP_ALREADY_USED');
end $$;

comment on function public.topup_qr_instant_v2(numeric, text, text, text) is
  'เติมเงินทันทีหลังแนบสลิป — ตรวจว่าไฟล์มีจริง สลิปไม่ซ้ำ และไม่เกินเพดานต่อวัน';

grant execute on function public.topup_qr_instant_v2(numeric, text, text, text) to authenticated;
revoke all on function public.topup_qr_instant_v2(numeric, text, text, text) from anon;

-- ---------- 4) ปิดตัวเก่าที่ไม่มีด่านอะไรเลย ----------
-- ไม่ drop ทิ้งเพราะอาจมีใครอ้างถึงอยู่ แต่ถอนสิทธิ์เรียกออกให้หมด
-- ใครยิงตรงจาก DevTools จะได้ 42501 แทนที่จะได้เงิน
do $$
begin
  if to_regprocedure('public.topup_qr_instant(numeric, text, text)') is not null then
    revoke all on function public.topup_qr_instant(numeric, text, text) from authenticated, anon, public;
    raise notice 'ถอนสิทธิ์เรียก topup_qr_instant() ตัวเก่าแล้ว — ใช้ topup_qr_instant_v2() แทน';
  end if;
end $$;

do $$
begin
  raise notice 'เติมเงินทันทีแบบมีด่านพร้อมใช้งาน เพดาน % บาท/วัน',
    round(public.topup_daily_limit_satang() / 100.0, 2);
end $$;
