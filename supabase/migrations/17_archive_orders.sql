-- ============================================================
-- 17_archive_orders.sql — เปลี่ยน "ลบออเดอร์" เป็น "เก็บเข้าคลัง"
--
-- ปัญหาที่แก้:
--   pos_delete_orders (ไฟล์ 16) ลบแถวใน orders จริง ๆ
--   แต่หน้าประวัติการสั่งซื้อของนักเรียนอ่านจากตาราง orders ตรง ๆ เหมือนกัน
--   บาริสต้ากดลบเพื่อเคลียร์คิว = ใบเสร็จของนักเรียนหายไปด้วย
--   นักเรียนที่จ่ายเงินไปแล้วเปิดดูประวัติแล้วไม่เจอรายการ ซึ่งรับไม่ได้
--
-- สิ่งที่บาริสต้าต้องการจริง ๆ คือ "เอาออกจากจอ" ไม่ใช่ "ลบออกจากโลก"
--   จึงเปลี่ยนเป็น soft delete: ประทับเวลาไว้ที่ archived_at
--   คิวหน้าร้านกรองทิ้ง / ประวัตินักเรียนไม่แตะ / กู้คืนได้ถ้ากดพลาด
--   นี่คือวิธีที่ระบบ POS จริงใช้กัน ไม่มีใครลบบิลทิ้งจากฐานข้อมูล
--
-- เรื่องพื้นที่เก็บข้อมูล ไม่ต้องกังวล:
--   ~1.5 KB ต่อออเดอร์ (รวม items + options + wallet + index)
--   150 ออเดอร์/วัน x 200 วันเรียน = 30,000 ออเดอร์/ปี ~= 45 MB/ปี
--   Supabase free tier 500 MB -> เก็บได้ราว 10 ปี
--
-- ต้องรันหลัง 16_bulk_ops.sql / รันซ้ำได้
-- ============================================================

-- ============================================================
-- 1) คอลัมน์ใหม่
-- ============================================================
alter table public.orders add column if not exists archived_at timestamptz;

comment on column public.orders.archived_at is
  'เวลาที่บาริสต้าเก็บออเดอร์นี้ออกจากคิว — null = ยังอยู่ในคิว ไม่เกี่ยวกับประวัติของนักเรียน';

-- index บางส่วน: คิวหน้าร้านถามหาเฉพาะแถวที่ยังไม่ถูกเก็บ
create index if not exists orders_active_queue_idx
  on public.orders (created_at desc)
  where archived_at is null;

-- ============================================================
-- 2) เก็บเข้าคลัง (แทน pos_delete_orders)
-- ============================================================
create or replace function public.pos_archive_orders(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_archived integer;
  v_blocked  integer;
begin
  if not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'NO_SELECTION');
  end if;

  if array_length(p_ids, 1) > 200 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY');
  end if;

  -- ออเดอร์ที่ลูกค้ายังรอของอยู่ ห้ามเอาออกจากคิวเงียบ ๆ ต้องกดยกเลิกก่อน
  select count(*) into v_blocked
  from orders
  where id = any(p_ids) and status not in ('done', 'cancelled');

  update orders
     set archived_at = now()
   where id = any(p_ids)
     and status in ('done', 'cancelled')
     and archived_at is null;

  get diagnostics v_archived = row_count;

  if v_archived = 0 and v_blocked > 0 then
    return jsonb_build_object('ok', false, 'error', 'NOTHING_ARCHIVABLE', 'blocked', v_blocked);
  end if;

  return jsonb_build_object('ok', true, 'archived', v_archived, 'blocked', v_blocked);
end $$;

comment on function public.pos_archive_orders(uuid[]) is
  'เอาออเดอร์ที่จบแล้วออกจากคิวหน้าร้าน โดยไม่ลบข้อมูล — ประวัติของนักเรียนยังอยู่ครบ';

-- ---------- กู้คืน เผื่อกดพลาด ----------
create or replace function public.pos_unarchive_orders(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_restored integer;
begin
  if not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'NO_SELECTION');
  end if;

  update orders set archived_at = null
   where id = any(p_ids) and archived_at is not null;

  get diagnostics v_restored = row_count;
  return jsonb_build_object('ok', true, 'restored', v_restored);
end $$;

-- ============================================================
-- 3) คิวหน้าร้านต้องไม่เห็นออเดอร์ที่เก็บไปแล้ว
-- ============================================================
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
    where o.archived_at is null                  -- <<< ตัวที่เพิ่มเข้ามา
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) q;

  return jsonb_build_object('ok', true, 'orders', v_result);
end $$;

-- ============================================================
-- 4) ปิดทางฟังก์ชันลบจริงของเดิม
-- ============================================================
-- เก็บไว้เฉย ๆ แล้วยังเรียกได้ = วันหนึ่งมีคนเผลอเรียก แล้วประวัตินักเรียนหาย
-- ตัดทิ้งไปเลยดีกว่า ถ้าวันหลังอยากลบจริงค่อยเขียนใหม่แบบมีเหตุผลรองรับ
drop function if exists public.pos_delete_orders(uuid[]);

-- ============================================================
-- 5) สิทธิ์การเรียก
-- ============================================================
grant execute on function public.pos_archive_orders(uuid[])   to authenticated;
grant execute on function public.pos_unarchive_orders(uuid[]) to authenticated;

revoke all on function public.pos_archive_orders(uuid[])   from anon;
revoke all on function public.pos_unarchive_orders(uuid[]) from anon;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  (select count(*) from public.orders)                            as ออเดอร์ทั้งหมด,
  (select count(*) from public.orders where archived_at is null)  as ยังอยู่ในคิว,
  (select count(*) from public.orders where archived_at is not null) as เก็บเข้าคลังแล้ว,
  case
    when to_regprocedure('public.pos_delete_orders(uuid[])') is null
     and to_regprocedure('public.pos_archive_orders(uuid[])') is not null
    then 'OK: เปลี่ยนเป็นเก็บเข้าคลังแล้ว ประวัตินักเรียนปลอดภัย'
    else 'ยังไม่เรียบร้อย — ตรวจข้อความ error ด้านบน'
  end                                                             as สถานะ;
