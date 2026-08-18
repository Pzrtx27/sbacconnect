-- ============================================================
-- 07_pos_ops.sql — ฟังก์ชันสำหรับหน้าร้าน (บาริสต้า/POS)
--
-- ทำไมต้องมีไฟล์นี้:
--   03_rls.sql สั่ง revoke insert/update/delete on orders ไว้ทั้งหมด
--   และ orders_self_select ให้เห็นเฉพาะออเดอร์ของตัวเอง
--   → บาริสต้าจึง "เห็นคิวไม่ได้" และ "เปลี่ยนสถานะไม่ได้" เลย
--   ไฟล์นี้เปิดทางเข้าเฉพาะจุดผ่าน security definer + เช็ค role เท่านั้น
--   (ไม่แก้ policy หรือโครงสร้างเดิม)
--
-- role ที่ใช้: 'pos' (คนหน้าเคาน์เตอร์) — enum app_role มีอยู่แล้ว ไม่ต้องเพิ่ม
-- รันซ้ำได้
-- ============================================================

-- ---------- ตัวช่วย: คนนี้มีสิทธิ์จัดการหน้าร้านไหม ----------
create or replace function public.app_is_pos_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select app_has_role('pos') or app_has_role('cashier') or app_has_role('sysadmin');
$$;

-- ---------- คิวออเดอร์สำหรับหน้าร้าน ----------
-- คืนออเดอร์ทั้งหมด (ไม่ใช่แค่ของตัวเอง) พร้อมรายการสินค้าและชื่อผู้สั่ง
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
      o.created_at,
      u.full_name                                as student_name,
      coalesce(sp.student_code, '')              as student_code,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', p.name,
                 'qty', oi.qty,
                 'unit_price_satang', oi.unit_price_satang,
                 'category', p.category)
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

-- ---------- เปลี่ยนสถานะออเดอร์ ----------
-- อนุญาตเฉพาะการเดินหน้าตามลำดับจริง กันกดผิดแล้วย้อนสถานะมั่ว
--   paid -> preparing -> done
--   paid/preparing -> cancelled
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status   order_status
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_current order_status;
begin
  if not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select status into v_current from orders where id = p_order_id;

  if v_current is null then
    return jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  end if;

  -- กดปุ่มเดิมซ้ำ = ไม่ถือว่าผิด คืนสถานะปัจจุบันไป
  if v_current = p_status then
    return jsonb_build_object('ok', true, 'status', v_current, 'unchanged', true);
  end if;

  if not (
       (v_current = 'paid'      and p_status in ('preparing','cancelled'))
    or (v_current = 'preparing' and p_status in ('done','cancelled'))
  ) then
    return jsonb_build_object(
      'ok', false, 'error', 'INVALID_TRANSITION',
      'from', v_current, 'to', p_status);
  end if;

  update orders set status = p_status where id = p_order_id;

  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ---------- สิทธิ์การเรียก ----------
grant execute on function public.pos_order_queue(integer) to authenticated;
grant execute on function public.set_order_status(uuid, order_status) to authenticated;

revoke all on function public.pos_order_queue(integer) from anon;
revoke all on function public.set_order_status(uuid, order_status) from anon;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select p.proname as function_name,
       pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('app_is_pos_staff','pos_order_queue','set_order_status')
order by p.proname;
