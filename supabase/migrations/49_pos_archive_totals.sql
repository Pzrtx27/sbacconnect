-- ============================================================
-- 49) ยอดรวมในคลังบิลต้องไม่นับบิลที่ยกเลิก
--
-- pos_archive_orders() ของไฟล์ 17 ยอมเก็บเข้าคลังทั้ง status 'done' และ 'cancelled'
--   update orders set archived_at = now() where ... and status in ('done', 'cancelled')
-- ส่วน CTE matched ใน pos_archived_orders() กรองแค่ archived_at is not null
-- แล้ว sum(total_satang) ทับทั้งก้อน
--
-- ผลคือ "ยอดรวมทั้งหมด" ที่หน้าร้านเห็น สูงกว่ายอดขายจริงเท่ากับมูลค่าบิลที่ยกเลิก
-- ซึ่งเป็นตัวเลขที่บาริสต้าใช้กระทบยอดปลายวัน — ผิดแล้วไปโทษเงินในลิ้นชักแทน
--
-- แก้โดยแยกให้ชัดสามค่า ไม่ใช่ซ่อนบิลยกเลิกไป:
--   total_satang    ยอดขายจริง (เฉพาะ done)
--   cancelled_count จำนวนใบที่ยกเลิก
--   count           จำนวนใบทั้งหมดที่ตรงเงื่อนไขค้น (เท่าเดิม)
-- บิลที่ยกเลิกยังต้องค้นเจอได้อยู่ เพราะลูกค้ามาถามว่า "ที่ยกเลิกไปเมื่อวานคือใบไหน"
--
-- รันซ้ำได้
-- ============================================================
create or replace function public.pos_archived_orders(
  p_search text default null,
  p_from   date default null,
  p_to     date default null,
  p_limit  int  default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_q        text := nullif(trim(coalesce(p_search, '')), '');
  v_limit    int  := greatest(1, least(coalesce(p_limit, 100), 200));
  v_count    int;
  v_total    bigint;
  v_cancel   int;
  v_orders   jsonb;
begin
  if not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  /* คำสั่งเดียวจบทั้งยอดรวมและใบที่เอามาแสดง โดยมีเงื่อนไขการค้นเขียนไว้ที่เดียว (matched)
     ถ้าแยกเป็นสองคำสั่ง วันหนึ่งมีคนแก้เงื่อนไขที่หนึ่งแล้วลืมอีกที่
     ยอดรวมกับรายการที่เห็นจะไม่ตรงกันแบบเงียบ ๆ ซึ่งจับได้ยากมาก

     เพิ่ม o.status เข้ามาใน matched เพื่อให้แยกยอดขายจริงออกจากบิลที่ยกเลิกได้
     โดยที่เงื่อนไขการค้นยังอยู่ที่เดียวเหมือนเดิม */
  with matched as (
    select o.id, o.total_satang, o.created_at, o.status
    from orders o
    join users u on u.id = o.user_id
    left join student_profiles sp on sp.user_id = o.user_id
    where o.archived_at is not null
      and (p_from is null or (o.created_at at time zone 'Asia/Bangkok')::date >= p_from)
      and (p_to   is null or (o.created_at at time zone 'Asia/Bangkok')::date <= p_to)
      and (
        v_q is null
        or o.pickup_code ilike '%' || v_q || '%'
        or u.full_name   ilike '%' || v_q || '%'
        or coalesce(sp.student_code, '') ilike '%' || v_q || '%'
      )
  ),
  page as (
    select id from matched order by created_at desc limit v_limit
  ),
  bills as (
    select coalesce(jsonb_agg(row_to_json(b)::jsonb order by b.created_at desc), '[]'::jsonb) as list
    from (
      select
        o.id,
        o.total_satang,
        o.status,
        o.pickup_code,
        o.note                                     as order_note,
        o.created_at,
        o.archived_at,
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
      from page
      join orders o on o.id = page.id
      join users u on u.id = o.user_id
      left join student_profiles sp on sp.user_id = o.user_id
    ) b
  )
  select
    (select count(*) from matched),
    -- ยอดขายจริง: เฉพาะใบที่ทำเสร็จ ไม่รวมที่ยกเลิก
    (select coalesce(sum(total_satang), 0) from matched where status = 'done'),
    (select count(*) from matched where status = 'cancelled'),
    (select list from bills)
  into v_count, v_total, v_cancel, v_orders;

  return jsonb_build_object(
    'ok', true,
    'orders', v_orders,
    'summary', jsonb_build_object(
      'count',           v_count,     -- ทั้งหมดที่ตรงเงื่อนไข (รวมที่ยกเลิก)
      'shown',           jsonb_array_length(v_orders),
      'total_satang',    v_total,     -- ยอดขายจริง เฉพาะ done
      'cancelled_count', v_cancel,
      'limit',           v_limit
    )
  );
end $fn$;

comment on function public.pos_archived_orders(text, date, date, int) is
  'ค้นบิลที่ถูกเก็บเข้าคลัง — total_satang นับเฉพาะบิลที่ทำเสร็จ ส่วนบิลที่ยกเลิกยังค้นเจอได้และนับแยกใน cancelled_count';

grant execute on function public.pos_archived_orders(text, date, date, int) to authenticated;
revoke all     on function public.pos_archived_orders(text, date, date, int) from anon;
revoke execute on function public.pos_archived_orders(text, date, date, int) from public;
