-- ============================================================
-- 16_bulk_ops.sql — ลบออเดอร์ทีละหลายใบจากหน้าบาริสต้า
--
-- ทำไมต้องเป็นฟังก์ชัน ไม่ให้หน้าเว็บ delete ตรง ๆ:
--   03_rls.sql revoke สิทธิ์ delete บน orders ไว้ทั้งหมด (ตั้งใจ)
--   ถ้าเปิด policy delete ให้ client นักเรียนคนไหนก็ลบออเดอร์ตัวเองทิ้งได้
--   ซึ่งแปลว่าลบหลักฐานการสั่งได้ ทางเข้าเดียวจึงต้องผ่านฟังก์ชันที่เช็คสิทธิ์เอง
--
-- ข้อจำกัดที่ตั้งใจใส่ไว้ ลบได้เฉพาะออเดอร์ที่ "จบแล้ว" (done / cancelled)
--   ออเดอร์ที่ยัง paid หรือ preparing = ลูกค้ายังรอของอยู่ ลบทิ้งเงียบ ๆ ไม่ได้
--   ถ้าจะเอาออกจริงต้องกดยกเลิกก่อน จะได้มีร่องรอยว่าใครยกเลิกและออเดอร์ถูกปิดยังไง
--
-- wallet_entries ไม่ถูกแตะ ตั้งใจ:
--   ประวัติการตัดเงินคือบัญชี ไม่ใช่คิวงาน ลบคิวได้ แต่ลบหลักฐานว่าเงินหายไปไหนไม่ได้
--   ref_id ของ entry จะชี้ไปยังออเดอร์ที่ไม่มีแล้ว ซึ่งถูกต้องตามความจริงว่า
--   "รายการนี้เกิดขึ้นจริง แล้วร้านลบคิวทิ้งทีหลัง"
--
-- ต้องรันหลัง 12_order_v2.sql / รันซ้ำได้
-- ============================================================

create or replace function public.pos_delete_orders(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_deletable uuid[];
  v_blocked   integer;
  v_deleted   integer;
begin
  if not app_is_pos_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'NO_SELECTION');
  end if;

  -- กันกดทีเดียวลบทั้งร้านโดยไม่ตั้งใจ
  if array_length(p_ids, 1) > 200 then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY');
  end if;

  -- แยกก่อนว่าอันไหนลบได้ อันไหนติดเงื่อนไข
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_deletable
  from orders
  where id = any(p_ids) and status in ('done', 'cancelled');

  select count(*)
    into v_blocked
  from orders
  where id = any(p_ids) and status not in ('done', 'cancelled');

  if array_length(v_deletable, 1) is null then
    return jsonb_build_object(
      'ok', false, 'error', 'NOTHING_DELETABLE', 'blocked', v_blocked);
  end if;

  -- order_item_options -> order_items ผูก on delete cascade ไว้แล้วตั้งแต่ไฟล์ 11
  -- ลบ orders อย่างเดียวจึงลากลูกไปด้วยครบ
  delete from orders where id = any(v_deletable);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'blocked', v_blocked);
end $$;

comment on function public.pos_delete_orders(uuid[]) is
  'ลบออเดอร์ที่จบแล้วทีละหลายใบ สำหรับหน้าบาริสต้า — ไม่แตะ wallet_entries';

-- ---------- เปลี่ยนสถานะทีละหลายใบ ----------
-- ใช้ตอนอยากยกเลิกออเดอร์ค้างหลายใบพร้อมกัน (เช่น ปิดร้านแล้วยังมีคิวค้าง)
-- เดินผ่าน set_order_status ตัวเดิม จึงได้กติกาการเปลี่ยนสถานะเหมือนกันเป๊ะ
create or replace function public.pos_bulk_set_status(
  p_ids    uuid[],
  p_status order_status
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id      uuid;
  v_result  jsonb;
  v_ok      integer := 0;
  v_failed  integer := 0;
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

  foreach v_id in array p_ids loop
    v_result := set_order_status(v_id, p_status);
    if coalesce((v_result->>'ok')::boolean, false) then
      v_ok := v_ok + 1;
    else
      -- ใบที่เปลี่ยนไม่ได้ (เช่น done อยู่แล้ว) ข้ามไป ไม่ทำให้ทั้งชุดล้ม
      v_failed := v_failed + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'updated', v_ok, 'skipped', v_failed);
end $$;

-- ============================================================
-- สิทธิ์การเรียก
-- ============================================================
grant execute on function public.pos_delete_orders(uuid[])               to authenticated;
grant execute on function public.pos_bulk_set_status(uuid[], order_status) to authenticated;

revoke all on function public.pos_delete_orders(uuid[])                from anon;
revoke all on function public.pos_bulk_set_status(uuid[], order_status) from anon;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select p.proname                        as ฟังก์ชัน,
       pg_get_function_arguments(p.oid) as พารามิเตอร์
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('pos_delete_orders', 'pos_bulk_set_status')
order by p.proname;
