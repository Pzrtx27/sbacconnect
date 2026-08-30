-- ============================================================
-- 15_fix_place_order_token.sql — แก้บั๊ก "สั่งซื้อไม่สำเร็จ"
--
-- อาการ: กดยืนยันสั่งแล้วขึ้นข้อความ
--        "สั่งซื้อไม่สำเร็จ: function gen_random_bytes(integer) does not exist"
--
-- สาเหตุ:
--   place_order_v2 ประกาศ set search_path = public เพื่อกัน search_path hijacking
--   (แนวปฏิบัติมาตรฐานของ security definer) แต่ gen_random_bytes มาจาก extension
--   pgcrypto ซึ่ง Supabase ติดตั้งไว้ที่ schema "extensions"
--   พอ search_path ไม่มี extensions ฟังก์ชันจึงหาไม่เจอ
--
--   ตอนรันไฟล์ 11 ไม่พังเพราะ SQL Editor มี extensions อยู่ใน search_path ให้อยู่แล้ว
--   บั๊กเลยโผล่เฉพาะตอนเรียกจากแอปจริง ซึ่งเป็นจุดที่ทดสอบไม่ถึงในรอบก่อน
--
-- ทางแก้ที่เลือก:
--   ไม่เติม extensions เข้า search_path เพราะนั่นคือคลายการล็อกที่ตั้งใจใส่ไว้
--   เปลี่ยนไปใช้ gen_random_uuid() ซึ่งเป็นของ core ตั้งแต่ PostgreSQL 13
--   ได้ค่าสุ่ม 128 บิตเท่ากัน และไม่ผูกกับ extension ใดอีกเลย
--
-- ต้องรันหลัง 12_order_v2.sql / รันซ้ำได้
-- ============================================================

-- ============================================================
-- 1) ค่า default ของคอลัมน์ก็ผูกกับ pgcrypto เหมือนกัน เปลี่ยนด้วย
-- ============================================================
alter table public.orders
  alter column pickup_token set default replace(gen_random_uuid()::text, '-', '');

-- ============================================================
-- 2) place_order_v2 ฉบับแก้แล้ว (ตรรกะอื่นเหมือนเดิมทุกบรรทัด)
-- ============================================================
create or replace function public.place_order_v2(
  p_items      jsonb,
  p_idem       text,
  p_note       text default null,
  p_credential text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user       uuid;
  v_prev       wallet_entries%rowtype;
  v_item       jsonb;
  v_product    products%rowtype;
  v_option_ids bigint[];
  v_delta      integer;
  v_unit       integer;
  v_qty        integer;
  v_note       text;
  v_total      integer := 0;
  v_balance    integer;
  v_order      uuid;
  v_order_item public.order_items.id%type;   -- ชนิดเดียวกับคอลัมน์จริง ไม่เดาเอง
  v_code       text;
  v_token      text;
  v_bad        integer;
  v_count      integer;
begin
  -- ---------- 1) ยิงซ้ำ = คืนผลเดิม ไม่ตัดเงินใหม่ ----------
  select * into v_prev from wallet_entries where idempotency_key = p_idem;
  if found then
    return jsonb_build_object(
      'ok', true, 'duplicate', true,
      'order_id', v_prev.ref_id,
      'balance', app_balance(v_prev.user_id));
  end if;

  -- ---------- 2) ตัวตนของคนที่จะถูกหักเงิน ----------
  if p_credential is null then
    v_user := app_current_user_id();
    if v_user is null then
      return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
    end if;
  else
    select uc.user_id into v_user
    from user_credentials uc
    join users u on u.id = uc.user_id
    where uc.value = p_credential and uc.is_active and u.is_active;

    if v_user is null then
      return jsonb_build_object('ok', false, 'error', 'CARD_NOT_FOUND');
    end if;

    -- ช่องโหว่ที่ปิดไปใน 09: ห้ามเอาบัตรคนอื่นมายิง
    if v_user is distinct from app_current_user_id() and not app_is_pos_staff() then
      return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
    end if;
  end if;

  -- ---------- 3) ตรวจรูปร่างของตะกร้า ----------
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ITEMS');
  end if;

  if jsonb_array_length(p_items) > 20 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY_ITEMS');
  end if;

  if p_note is not null and char_length(p_note) > 300 then
    return jsonb_build_object('ok', false, 'error', 'NOTE_TOO_LONG');
  end if;

  -- ---------- 4) ล็อกแถวผู้ใช้ กันกดสั่งพร้อมกันสองเครื่อง ----------
  perform 1 from users where id = v_user for update;

  -- ---------- 5) เดินทีละรายการ: ตรวจ + คิดราคา ----------
  -- ต้องคิดราคาให้ครบก่อน แล้วค่อยเช็คยอดเงิน ไม่งั้นสร้างออเดอร์ทิ้งไว้ครึ่ง ๆ กลาง ๆ
  -- (ทั้งฟังก์ชันอยู่ใน transaction เดียว ถ้า return error กลางทางทุกอย่าง rollback หมด)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- เมนู
    select * into v_product
    from products
    where id = (v_item->>'product_id')::bigint and is_active;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'PRODUCT_NOT_FOUND',
                                'product_id', v_item->>'product_id');
    end if;

    -- จำนวน
    v_qty := coalesce((v_item->>'qty')::integer, 0);
    if v_qty < 1 or v_qty > 20 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_QTY',
                                'product', v_product.name);
    end if;

    -- ตัวเลือกที่ส่งมา — ตัดค่าซ้ำออก กัน PK ชนตอน insert
    select coalesce(array_agg(distinct x::bigint), '{}'::bigint[])
      into v_option_ids
    from jsonb_array_elements_text(coalesce(v_item->'option_ids', '[]'::jsonb)) as x;

    -- 5.1 ทุก option ที่ส่งมาต้องเป็นของจริง เปิดใช้อยู่ และอยู่ในกลุ่มที่ใช้กับเมนูนี้ได้
    --     กันคนเปิด DevTools ยิง option ของเมนูอื่นเพื่อกดราคาลง
    select count(*) into v_bad
    from unnest(v_option_ids) as oid
    where not exists (
      select 1
      from options o
      join product_option_groups(v_product.id) g on g.id = o.group_id
      where o.id = oid and o.is_active
    );

    if v_bad > 0 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_OPTION',
                                'product', v_product.name);
    end if;

    -- 5.2 แต่ละกลุ่มต้องเลือกครบตามที่บังคับ และไม่เกินโควตา
    --     เช่น "ประเภท" บังคับ 1 ถ้าไม่เลือกเลยต้องไม่ผ่าน
    select count(*) into v_bad
    from product_option_groups(v_product.id) g
    cross join lateral (
      select count(*) as picked
      from options o
      where o.group_id = g.id and o.id = any(v_option_ids)
    ) s
    where s.picked < g.min_select or s.picked > g.max_select;

    if v_bad > 0 then
      return jsonb_build_object('ok', false, 'error', 'OPTION_RULE_VIOLATED',
                                'product', v_product.name);
    end if;

    -- 5.3 ราคาต่อหน่วย = ราคาเมนู + ผลรวมส่วนต่างของตัวเลือก
    select coalesce(sum(price_delta_satang), 0) into v_delta
    from options where id = any(v_option_ids);

    v_unit := v_product.price_satang + v_delta;
    if v_unit < 0 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_PRICE',
                                'product', v_product.name);
    end if;

    v_total := v_total + v_unit * v_qty;
  end loop;

  if v_total <= 0 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ITEMS');
  end if;

  -- ---------- 6) ยอดเงิน ----------
  v_balance := app_balance(v_user);
  if v_balance < v_total then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_FUNDS',
                              'balance', v_balance, 'total', v_total);
  end if;

  -- ---------- 7) สร้างออเดอร์ ----------
  v_code  := lpad((floor(random() * 10000))::int::text, 4, '0');
  -- เดิมใช้ gen_random_bytes(16) ซึ่งมาจาก extension pgcrypto
  -- บน Supabase pgcrypto ติดตั้งอยู่ที่ schema "extensions" ไม่ใช่ "public"
  -- ฟังก์ชันนี้ล็อก search_path = public ไว้ (จำเป็น กัน search_path hijacking)
  -- จึงมองไม่เห็น -> ERROR: function gen_random_bytes(integer) does not exist
  --
  -- gen_random_uuid() เป็นของ PostgreSQL core ตั้งแต่ v13 ไม่ต้องพึ่ง extension
  -- ถอดขีดออกได้เลข hex 32 ตัว = ค่าสุ่ม 128 บิต เท่าของเดิมเป๊ะ
  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into orders (user_id, total_satang, status, pickup_code, pickup_token, note)
  values (v_user, v_total, 'paid', v_code, v_token, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_order;

  -- เดินรอบสองเพื่อ insert — คราวนี้ข้อมูลผ่านการตรวจมาแล้วทั้งหมด
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_product from products where id = (v_item->>'product_id')::bigint;
    v_qty  := (v_item->>'qty')::integer;
    v_note := nullif(trim(coalesce(v_item->>'note', '')), '');

    select coalesce(array_agg(distinct x::bigint), '{}'::bigint[])
      into v_option_ids
    from jsonb_array_elements_text(coalesce(v_item->'option_ids', '[]'::jsonb)) as x;

    select coalesce(sum(price_delta_satang), 0) into v_delta
    from options where id = any(v_option_ids);

    v_unit := v_product.price_satang + v_delta;

    insert into order_items (order_id, product_id, qty, unit_price_satang, note)
    values (v_order, v_product.id, v_qty, v_unit, left(v_note, 200))
    returning id into v_order_item;

    -- snapshot ชื่อและราคา ณ ตอนสั่ง — อ่านเหตุผลเต็มใน 11_menu_options.sql
    insert into order_item_options (order_item_id, option_id, option_name, price_delta_satang, group_name)
    select v_order_item, o.id, o.name, o.price_delta_satang, og.name
    from options o
    join option_groups og on og.id = o.group_id
    where o.id = any(v_option_ids);
  end loop;

  -- ---------- 8) หักเงิน ----------
  insert into wallet_entries (user_id, amount_satang, kind, ref_id,
                              balance_after, idempotency_key, created_by)
  values (v_user, -v_total, 'purchase', v_order,
          v_balance - v_total, p_idem, coalesce(app_current_user_id(), v_user));

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'pickup_code', v_code,
    'pickup_token', v_token,
    'total', v_total,
    'balance', v_balance - v_total);

exception when unique_violation then
  -- สองเครื่องกดพร้อมกันด้วย idem เดียวกัน — อีกฝั่งชนะไปแล้ว
  return jsonb_build_object('ok', false, 'error', 'DUPLICATE_IN_FLIGHT');
end $$;

grant execute on function public.place_order_v2(jsonb, text, text, text) to authenticated;
revoke all on function public.place_order_v2(jsonb, text, text, text) from anon;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  case
    when pg_get_functiondef(p.oid) like '%gen_random_bytes%'
      then 'ยังไม่ได้แก้ — ยังเรียก gen_random_bytes อยู่'
    when pg_get_functiondef(p.oid) like '%gen_random_uuid%'
      then 'OK: แก้แล้ว สั่งซื้อได้'
    else 'ผิดปกติ — ไม่พบตัวสร้าง token ในฟังก์ชัน'
  end as สถานะ_place_order_v2,
  (select pg_get_expr(d.adbin, d.adrelid)
     from pg_attrdef d
     join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.orders'::regclass and a.attname = 'pickup_token')
  as default_ของ_pickup_token
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'place_order_v2';
