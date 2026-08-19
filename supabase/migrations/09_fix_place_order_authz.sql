-- ============================================================
-- 09_fix_place_order_authz.sql — ปิดช่องโหว่ place_order
--
-- ปัญหาที่พบ (ทดสอบยืนยันแล้ว):
--   place_order() เดิมไม่เช็คว่า "คนที่เรียก" มีสิทธิ์ใช้บัตรใบนั้นหรือไม่
--   03_rls.sql ให้สิทธิ์ execute แก่ทุกคนที่ล็อกอิน (authenticated)
--   → นักเรียนคนใดก็ได้ ยิง place_order('รหัสเพื่อน', ...) แล้วหักเงินเพื่อนได้ทันที
--   และรหัสนักเรียนคือเลขที่พิมพ์อยู่บนบัตร ใครเห็นก็รู้
--
--   พิสูจน์: ล็อกอินเป็นนักเรียน A แล้วยิงด้วยรหัสบัตรของนักเรียน B
--   ได้ INVALID_ITEMS = ผ่านด่านค้นบัตรไปแล้ว ไม่ได้ถูกปฏิเสธเรื่องสิทธิ์
--
-- วิธีแก้: เพิ่มเงื่อนไขเดียว — ต้องเป็นเจ้าของบัตรเอง หรือเป็นเจ้าหน้าที่หน้าร้าน
--   * นักเรียนสั่งกาแฟให้ตัวเองผ่านแอป  -> ผ่าน (บัตรตัวเอง)
--   * เครื่อง POS/แคชเชียร์แตะบัตรนักเรียน -> ผ่าน (มี role pos/cashier)
--   * นักเรียนยิงบัตรเพื่อน              -> FORBIDDEN
--
-- ตรรกะส่วนอื่นคงเดิมทั้งหมด (ราคาคิดฝั่ง server, idempotency, ล็อกแถว)
-- ต้องรัน 07_pos_ops.sql ก่อน เพราะใช้ app_is_pos_staff()
-- รันซ้ำได้
-- ============================================================

create or replace function place_order(
  p_credential text,
  p_items      jsonb,
  p_idem       text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid;
  v_total   integer;
  v_balance integer;
  v_order   uuid;
  v_code    text;
  v_prev    wallet_entries%rowtype;
begin
  -- 1) ยิงซ้ำ = คืนผลเดิม ไม่ตัดเงินใหม่
  select * into v_prev from wallet_entries where idempotency_key = p_idem;
  if found then
    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'order_id', v_prev.ref_id,
      'balance', app_balance(v_prev.user_id));
  end if;

  -- 2) หาคนจากบัตร
  select uc.user_id into v_user
  from user_credentials uc
  join users u on u.id = uc.user_id
  where uc.value = p_credential and uc.is_active and u.is_active;

  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'CARD_NOT_FOUND');
  end if;

  -- 2.1) *** ส่วนที่เพิ่มเข้ามา *** ตรวจสิทธิ์การใช้บัตรใบนี้
  --      เจ้าของบัตรเอง หรือเจ้าหน้าที่หน้าร้านเท่านั้น
  if v_user is distinct from app_current_user_id() and not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  -- 3) ล็อกแถวผู้ใช้ กันซื้อพร้อมกันจากสองเครื่อง
  perform 1 from users where id = v_user for update;

  -- 4) ราคาคำนวณฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อราคาที่เครื่องส่งมา
  select coalesce(sum(p.price_satang * i.qty), 0) into v_total
  from jsonb_to_recordset(p_items) as i(id bigint, qty integer)
  join products p on p.id = i.id and p.is_active;

  if v_total <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ITEMS');
  end if;

  v_balance := app_balance(v_user);
  if v_balance < v_total then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_FUNDS',
                              'balance', v_balance, 'total', v_total);
  end if;

  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');

  insert into orders (user_id, total_satang, status, pickup_code)
  values (v_user, v_total, 'paid', v_code)
  returning id into v_order;

  insert into order_items (order_id, product_id, qty, unit_price_satang)
  select v_order, p.id, i.qty, p.price_satang
  from jsonb_to_recordset(p_items) as i(id bigint, qty integer)
  join products p on p.id = i.id;

  insert into wallet_entries (user_id, amount_satang, kind, ref_id,
                              balance_after, idempotency_key, created_by)
  values (v_user, -v_total, 'purchase', v_order,
          v_balance - v_total, p_idem, coalesce(app_current_user_id(), v_user));

  return jsonb_build_object('ok', true, 'order_id', v_order,
                            'pickup_code', v_code,
                            'balance', v_balance - v_total);

exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'DUPLICATE_IN_FLIGHT');
end $$;

grant execute on function place_order(text, jsonb, text) to authenticated;
revoke all on function place_order(text, jsonb, text) from anon;

-- ============================================================
-- ตรวจสอบ: ต้องเห็นบรรทัด app_current_user_id ในนิยามฟังก์ชัน
-- ============================================================
select
  case when pg_get_functiondef(p.oid) like '%app_is_pos_staff%'
       then 'OK: ปิดช่องโหว่แล้ว'
       else 'ยังไม่ได้อัปเดต'
  end as สถานะ
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'place_order';
