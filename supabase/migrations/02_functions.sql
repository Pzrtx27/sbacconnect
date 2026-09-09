-- ============================================================
-- 02_functions.sql — ตรรกะเงินทั้งหมดอยู่ในนี้
-- security definer = ทางเข้าเดียวที่แตะ wallet_entries ได้
-- ============================================================

-- ---------- ตัวช่วย ----------
create or replace function app_current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from users where auth_uid = auth.uid();
$$;

create or replace function app_has_role(p_role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join users u on u.id = ur.user_id
    where u.auth_uid = auth.uid() and ur.role = p_role
  );
$$;

-- ยอดคงเหลือ = balance_after ของแถวล่าสุด (เร็ว ไม่ต้อง sum ทั้งตาราง)
create or replace function app_balance(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select balance_after from wallet_entries
     where user_id = p_user_id order by id desc limit 1), 0);
$$;

create or replace function my_balance()
returns integer language sql stable security definer set search_path = public as $$
  select app_balance(app_current_user_id());
$$;

-- ---------- ซื้อของหน้าร้าน ----------
-- p_items ตัวอย่าง: [{"id":1,"qty":2},{"id":3,"qty":1}]
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
          v_balance - v_total, p_idem, v_user);

  return jsonb_build_object('ok', true, 'order_id', v_order,
                            'pickup_code', v_code,
                            'balance', v_balance - v_total);

exception when unique_violation then
  -- สองคำสั่งซื้อ idem เดียวกันชนกันพอดี ตัวที่แพ้ไม่ตัดเงิน
  return jsonb_build_object('ok', false, 'error', 'DUPLICATE_IN_FLIGHT');
end $$;

-- ---------- เติมเงินสดที่จุดบริการ ----------
create or replace function topup_cash(
  p_user_id       uuid,
  p_amount_satang integer,
  p_idem          text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cashier uuid;
  v_balance integer;
  v_prev    wallet_entries%rowtype;
begin
  if not app_has_role('cashier') then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  v_cashier := app_current_user_id();

  -- เพดานต่อรายการ 1,000 บาท กันพิมพ์ผิดเป็นหมื่น
  if p_amount_satang <= 0 or p_amount_satang > 100000 then
    return jsonb_build_object('ok', false, 'error', 'AMOUNT_OUT_OF_RANGE');
  end if;

  select * into v_prev from wallet_entries where idempotency_key = p_idem;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true,
                              'balance', app_balance(v_prev.user_id));
  end if;

  perform 1 from users where id = p_user_id for update;
  v_balance := app_balance(p_user_id);

  insert into wallet_entries (user_id, amount_satang, kind, ref_id,
                              balance_after, idempotency_key, created_by)
  values (p_user_id, p_amount_satang, 'topup_cash', null,
          v_balance + p_amount_satang, p_idem, v_cashier);

  return jsonb_build_object('ok', true,
                            'balance', v_balance + p_amount_satang);

exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'DUPLICATE_IN_FLIGHT');
end $$;
