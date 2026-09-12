-- ============================================================
-- 45_pos_archive_browser.sql — เปิดคลังบิลให้หน้าร้านย้อนดูได้
--
-- 17_archive_orders.sql ทำให้ "เก็บเข้าคลัง" ไม่ลบข้อมูลจริง (แค่ประทับ archived_at)
-- แต่ยังไม่มีทางอ่านของในคลังเลยสักทาง:
--   pos_order_queue()  กรอง archived_at is null ทิ้งไปแล้ว
--   RLS บน orders      ให้เห็นเฉพาะออเดอร์ของตัวเอง (orders_self_select ใน 03_rls.sql)
--
-- ผลคือบิลที่เก็บไปแล้วหายจากหน้าร้านถาวรทั้งที่ข้อมูลยังอยู่ครบ
-- ลูกค้ามาถามว่า "เมื่อวานสั่งอะไรไป" หรือ "จ่ายไปเท่าไหร่" หน้าร้านตอบไม่ได้
-- ต้องไปเปิด SQL Editor ดูเอง ซึ่งใช้จริงไม่ไหว
--
-- ไฟล์นี้เพิ่มสองอย่าง:
--   1) pos_archived_orders()   — ค้นบิลในคลัง (รหัสรับของ / ชื่อ / รหัสนักเรียน + ช่วงวันที่)
--   2) index สำหรับการค้นแบบนั้นโดยเฉพาะ
--
-- ไม่ได้เปิดสิทธิ์ใหม่ให้ใคร — ใช้ app_is_pos_staff() ตัวเดียวกับคิวหน้าร้าน
-- (pos / cashier / sysadmin) และเป็นฟังก์ชันอ่านอย่างเดียว ไม่มีทางเขียนอะไร
--
-- ส่วน "กู้คืนกลับคิว" ใช้ pos_unarchive_orders() ที่มีอยู่แล้วในไฟล์ 17 ไม่ต้องเพิ่ม
--
-- รันซ้ำได้ / ต้องรัน 17_archive_orders.sql มาก่อน
-- ============================================================

-- ============================================================
-- 1) index สำหรับคลัง
--
-- ไฟล์ 17 ทำ index ไว้ให้ "คิวที่ยังไม่ถูกเก็บ" (where archived_at is null)
-- ฝั่งคลังถามตรงข้ามกันพอดี จึงต้องมีของตัวเอง ไม่งั้นต้อง seq scan ทั้งตาราง
-- ทุกครั้งที่เปิดแท็บคลัง และยิ่งช้าลงเรื่อย ๆ ตามจำนวนบิลที่สะสมรายปี
-- ============================================================
create index if not exists orders_archived_idx
  on public.orders (created_at desc)
  where archived_at is not null;

-- ============================================================
-- 2) ค้นบิลในคลัง
--
--   p_search : รหัสรับของ / ชื่อนักเรียน / รหัสนักเรียน (บางส่วนก็ได้ ไม่สนตัวพิมพ์)
--   p_from   : วันที่เริ่ม (ตามวันที่สั่ง เวลาไทย) null = ไม่จำกัด
--   p_to     : วันที่สิ้นสุด (รวมวันนั้นด้วย) null = ไม่จำกัด
--   p_limit  : จำนวนใบที่ส่งกลับ 1-300
--
-- คืนรูปแบบเดียวกับ pos_order_queue() เป๊ะ ๆ บวก archived_at
-- หน้าเว็บจะได้ใช้การ์ดใบเดิมแสดงผลได้เลย ไม่ต้องมีตัวแปลงอีกชั้น
--
-- summary นับจาก "ทั้งหมดที่ตรงเงื่อนไข" ไม่ใช่เฉพาะที่ส่งกลับ
-- หน้าเว็บจึงบอกได้ว่ายังมีอีกกี่ใบที่ยังไม่ได้แสดง แทนที่จะให้เข้าใจผิดว่ามีเท่าที่เห็น
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
as $$
declare
  v_q       text    := nullif(btrim(coalesce(p_search, '')), '');
  v_limit   int     := greatest(1, least(coalesce(p_limit, 100), 300));
  v_orders  jsonb;
  v_count   bigint;
  v_total   bigint;
begin
  if not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  /* คำสั่งเดียวจบทั้งยอดรวมและใบที่เอามาแสดง โดยมีเงื่อนไขการค้นเขียนไว้ที่เดียว (matched)
     ถ้าแยกเป็นสองคำสั่ง วันหนึ่งมีคนแก้เงื่อนไขที่หนึ่งแล้วลืมอีกที่
     ยอดรวมกับรายการที่เห็นจะไม่ตรงกันแบบเงียบ ๆ ซึ่งจับได้ยากมาก */
  with matched as (
    select o.id, o.total_satang, o.created_at
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
      from orders o
      join page on page.id = o.id
      join users u on u.id = o.user_id
      left join student_profiles sp on sp.user_id = o.user_id
    ) b
  )
  select
    (select count(*) from matched),
    (select coalesce(sum(total_satang), 0) from matched),
    (select list from bills)
  into v_count, v_total, v_orders;

  return jsonb_build_object(
    'ok', true,
    'orders', v_orders,
    'summary', jsonb_build_object(
      'count',         v_count,     -- ทั้งหมดที่ตรงเงื่อนไข
      'shown',         jsonb_array_length(v_orders),
      'total_satang',  v_total,
      'limit',         v_limit
    )
  );
end $$;

comment on function public.pos_archived_orders(text, date, date, int) is
  'ค้นบิลที่ถูกเก็บเข้าคลัง (archived_at not null) สำหรับหน้าร้าน — อ่านอย่างเดียว ใช้ตอบลูกค้าที่มาถามย้อนหลัง';

-- ============================================================
-- 3) สิทธิ์การเรียก — ชุดเดียวกับคิวหน้าร้าน ไม่เปิดให้ anon
-- ============================================================
grant execute on function public.pos_archived_orders(text, date, date, int) to authenticated;
revoke all on function public.pos_archived_orders(text, date, date, int) from anon;
revoke execute on function public.pos_archived_orders(text, date, date, int) from public;

-- ============================================================
-- ตรวจผล
-- ============================================================
select
  to_regprocedure('public.pos_archived_orders(text,date,date,int)') is not null as มี_pos_archived_orders,
  to_regprocedure('public.pos_unarchive_orders(uuid[])') is not null            as มี_pos_unarchive_orders,
  (select count(*) from public.orders where archived_at is not null)            as บิลในคลังตอนนี้,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'orders_archived_idx')          as มี_index_คลัง;
