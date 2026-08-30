-- ============================================================
-- 12_order_v2.sql — โมดูล B ส่วนที่ 2: สั่งซื้อพร้อมตัวเลือก + จุดต่องาน QR
--
-- ต่อจาก 11_menu_options.sql (ต้องรัน 11 ก่อน)
--
-- ของเดิม place_order() รับแค่ [{id, qty}] ใส่ตัวเลือกไม่ได้
-- ไฟล์นี้ "ไม่แตะ" ของเดิม แต่เพิ่มตัวใหม่ขึ้นมาคู่กัน:
--
--   menu_with_options()  เมนู + ตัวเลือกที่ใช้ได้ของแต่ละเมนู (หน้าเว็บเรียกครั้งเดียวจบ)
--   place_order_v2()     สั่งซื้อพร้อมตัวเลือกและหมายเหตุ
--   pos_order_queue()    คิวหน้าร้าน — เพิ่มตัวเลือกกับหมายเหตุเข้าไป (replace ของเดิม)
--   complete_order()     ปิดออเดอร์จากการสแกน QR (ให้เพื่อนในกลุ่มเรียก)
--
-- หลักที่ยึดทั้งไฟล์ เหมือน 09:
--   * ราคาคำนวณฝั่งเซิร์ฟเวอร์เสมอ ไม่รับตัวเลขราคาจากเบราว์เซอร์แม้แต่ตัวเดียว
--   * idempotency_key กันตัดเงินซ้ำ
--   * เช็คสิทธิ์ก่อนทุกครั้ง
--
-- รันซ้ำได้ทั้งไฟล์
-- ============================================================

-- ============================================================
-- 1) กลุ่มตัวเลือกที่ใช้ได้กับเมนูหนึ่ง ๆ
-- ============================================================
-- รวมสองแหล่งเข้าด้วยกัน:
--   ก) กลุ่มเฉพาะของเมนูนั้น (option_groups.product_id = เมนูนี้)
--   ข) กลุ่มกลางที่หมวดของเมนูนี้เข้าเงื่อนไข
-- ถ้าเมนูมีกลุ่มชื่อซ้ำกับกลุ่มกลาง ให้ของเมนูชนะ (override)
--   เช่น "ชาเย็นสูตรพิเศษ" อยากมีระดับความหวานของตัวเอง ก็สร้างกลุ่มชื่อเดียวกันทับได้เลย
create or replace function public.product_option_groups(p_product_id bigint)
returns setof public.option_groups
language sql stable security definer set search_path = public
as $$
  select og.*
  from public.option_groups og
  join public.products p on p.id = p_product_id
  where og.is_active
    and (
      og.product_id = p.id
      or (
        og.product_id is null
        and (og.applies_to_categories is null
             or p.category = any (og.applies_to_categories))
        and not exists (
          select 1 from public.option_groups og2
          where og2.product_id = p.id
            and og2.is_active
            and og2.name = og.name
        )
      )
    )
  order by og.sort_order, og.id;
$$;

-- ============================================================
-- 2) เมนูพร้อมตัวเลือก — สำหรับหน้าสั่งซื้อ
-- ============================================================
-- ยิงทีเดียวได้ครบ ไม่ต้องให้หน้าเว็บวน query ทีละเมนู (N+1 query)
create or replace function public.menu_with_options()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',            p.id,
          'name',          p.name,
          'category',      p.category,
          'price_satang',  p.price_satang,
          'image_url',     p.image_url,
          'stock',         p.stock,
          'option_groups', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id',         g.id,
                'name',       g.name,
                'min_select', g.min_select,
                'max_select', g.max_select,
                'options',    coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id',                 o.id,
                      'name',               o.name,
                      'price_delta_satang', o.price_delta_satang,
                      'is_default',         o.is_default)
                    order by o.sort_order, o.id)
                  from public.options o
                  where o.group_id = g.id and o.is_active
                ), '[]'::jsonb))
              order by g.sort_order, g.id)
            from public.product_option_groups(p.id) g
          ), '[]'::jsonb))
        order by p.category, p.id)
      from public.products p
      where p.is_active
    ), '[]'::jsonb)
  );
$$;

-- ============================================================
-- 3) สั่งซื้อพร้อมตัวเลือก
-- ============================================================
-- รูปแบบ p_items ที่รับ:
--   [
--     {"product_id": 1, "qty": 2, "option_ids": [3, 9, 11], "note": "ไม่ใส่หลอด"},
--     {"product_id": 4, "qty": 1, "option_ids": []}
--   ]
--
-- p_credential:
--   null  = สั่งให้ตัวเอง (นักเรียนกดสั่งในแอป) — ใช้ตัวตนจาก JWT ตรง ๆ
--   มีค่า = แตะบัตรที่เครื่อง POS — เช็คสิทธิ์เหมือน 09 คือต้องเป็นเจ้าของบัตรหรือเจ้าหน้าที่
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
  v_token := encode(gen_random_bytes(16), 'hex');

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

-- ============================================================
-- 4) คิวหน้าร้าน — เวอร์ชันที่เห็นตัวเลือก
-- ============================================================
-- replace ของเดิมใน 07_pos_ops.sql (ลายเซ็นเดิม หน้าเว็บไม่ต้องแก้ชื่อฟังก์ชัน)
-- เพิ่ม: ตัวเลือกรายแก้ว, หมายเหตุรายแก้ว, หมายเหตุทั้งออเดอร์
-- บาริสต้าต้องเห็น "ลาเต้ (เย็น, หวานน้อย, ไข่มุก)" ไม่ใช่แค่ "ลาเต้"
create or replace function public.pos_order_queue(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      o.id,
      o.total_satang,
      o.status,
      o.pickup_code,
      o.note                                     as order_note,
      o.created_at,
      u.full_name                                as student_name,
      coalesce(sp.student_code, '')              as student_code,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name',              p.name,
                 'qty',               oi.qty,
                 'unit_price_satang', oi.unit_price_satang,
                 'category',          p.category,
                 'note',              oi.note,
                 'options', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'group', oio.group_name,
                            'name',  oio.option_name,
                            'price_delta_satang', oio.price_delta_satang)
                          order by oio.group_name, oio.option_name)
                   from order_item_options oio
                   where oio.order_item_id = oi.id
                 ), '[]'::jsonb))
               order by oi.id)
        from order_items oi
        join products p on p.id = oi.product_id
        where oi.order_id = o.id
      ), '[]'::jsonb)                            as items
    from orders o
    join users u on u.id = o.user_id
    left join student_profiles sp on sp.user_id = o.user_id
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) q;

  return jsonb_build_object('ok', true, 'orders', v_result);
end $$;

-- ============================================================
-- 5) ออเดอร์ของฉัน — เวอร์ชันที่เห็นตัวเลือก
-- ============================================================
-- หน้า MyOrders/OrderHistory เดิม select ตรงจากตาราง ซึ่งได้แค่ชื่อเมนูเปล่า ๆ
-- RLS จำกัดให้เห็นเฉพาะของตัวเองอยู่แล้ว ตัวนี้แค่ประกอบ json ให้ครบทีเดียว
create or replace function public.my_orders(p_limit integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_user   uuid := app_current_user_id();
  v_result jsonb;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  select coalesce(jsonb_agg(row_to_json(q)::jsonb order by q.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      o.id, o.total_satang, o.status, o.pickup_code,
      o.note as order_note, o.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', p.name,
                 'qty', oi.qty,
                 'unit_price_satang', oi.unit_price_satang,
                 'category', p.category,
                 'note', oi.note,
                 'options', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'group', oio.group_name, 'name', oio.option_name)
                          order by oio.group_name, oio.option_name)
                   from order_item_options oio where oio.order_item_id = oi.id
                 ), '[]'::jsonb))
               order by oi.id)
        from order_items oi
        join products p on p.id = oi.product_id
        where oi.order_id = o.id
      ), '[]'::jsonb) as items
    from orders o
    where o.user_id = v_user
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100))
  ) q;

  return jsonb_build_object('ok', true, 'orders', v_result);
end $$;

-- ============================================================
-- 6) จุดต่องาน QR ของเพื่อน (ข้อ 06 ในแผน)
-- ============================================================
-- ตกลงกันแค่สามอย่าง เพื่อนทำหน้าสแกนไป เราทำฝั่ง DB
--
--   1. QR เข้ารหัสอะไร   sbac://order/{pickup_code}?t={pickup_token}
--      ทั้งสองค่าอยู่ในผลลัพธ์ที่ place_order_v2 คืนกลับมาแล้ว
--
--   2. ยืนยันยังไง        เรียก complete_order(pickup_code, token)
--      ถ้า token ตรงและยังไม่ปิด จะปิดออเดอร์ให้ ถ้าสแกนซ้ำจะได้ ALREADY_COMPLETED
--
--   3. ใครสแกนได้         เฉพาะ role pos/cashier/sysadmin
--      ฝั่งเพื่อนไม่ต้องเช็คเอง ฟังก์ชันนี้เช็คให้แล้ว
--
-- ทำไมต้องมี token ไม่ใช้ pickup_code อย่างเดียว:
--   pickup_code เป็นเลข 4 หลัก มีแค่ 10,000 ค่า ไล่เดาทั้งหมดใช้เวลาไม่กี่วินาที
--   token เป็นค่าสุ่ม 128 บิต เดาไม่ได้ในทางปฏิบัติ
create or replace function public.complete_order(
  p_pickup_code text,
  p_token       text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_order orders%rowtype;
begin
  if not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_token is null or p_pickup_code is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_QR');
  end if;

  -- ค้นด้วย token เป็นหลัก (unique) แล้วบังคับให้ pickup_code ตรงด้วย
  -- ล็อกแถวไว้เลย กันสองเครื่องสแกนใบเดียวกันพร้อมกันแล้วปิดซ้อน
  select * into v_order
  from orders
  where pickup_token = p_token and pickup_code = p_pickup_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  if v_order.status = 'done' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_COMPLETED',
                              'order_id', v_order.id);
  end if;

  if v_order.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'ORDER_CANCELLED',
                              'order_id', v_order.id);
  end if;

  update orders set status = 'done' where id = v_order.id;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'pickup_code', v_order.pickup_code,
    'total_satang', v_order.total_satang,
    'previous_status', v_order.status);
end $$;

-- ============================================================
-- 7) สิทธิ์การเรียก
-- ============================================================
grant execute on function public.product_option_groups(bigint)              to authenticated;
grant execute on function public.menu_with_options()                        to authenticated;
grant execute on function public.place_order_v2(jsonb, text, text, text)    to authenticated;
grant execute on function public.my_orders(integer)                         to authenticated;
grant execute on function public.complete_order(text, text)                 to authenticated;

revoke all on function public.product_option_groups(bigint)              from anon;
revoke all on function public.menu_with_options()                        from anon;
revoke all on function public.place_order_v2(jsonb, text, text, text)    from anon;
revoke all on function public.my_orders(integer)                         from anon;
revoke all on function public.complete_order(text, text)                 from anon;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select p.proname                          as ฟังก์ชัน,
       pg_get_function_arguments(p.oid)   as พารามิเตอร์
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('product_option_groups','menu_with_options','place_order_v2',
                    'my_orders','pos_order_queue','complete_order')
order by p.proname;
