-- ============================================================
-- 34_realtime_orders.sql — เปิด Realtime ให้ตาราง orders (คิวกาแฟสด ๆ)
--
-- ปัญหาที่แก้:
--   หน้าบาริสต้าและหน้า "สถานะการสั่งซื้อ" ของนักเรียน subscribe
--   postgres_changes บนตาราง orders มาตั้งแต่แรก แต่ไม่มีใครเพิ่ม
--   public.orders เข้า publication ชื่อ supabase_realtime เลยสักไฟล์
--   (10_events.sql เพิ่มไว้แค่ public.events)
--   → Postgres ไม่ส่ง WAL ของตารางนี้ออกมา = subscription เงียบสนิท
--   → บาริสต้ากด "เสร็จแล้ว" แต่จอนักเรียนไม่ขยับจนกว่าจะกดรีเฟรช
--
--   อย่างที่สอง: Realtime ตรวจ RLS ให้ "ผู้ฟังแต่ละคน" ทีละแถว
--   ใครอ่านแถวนั้นด้วย select ไม่ได้ ก็จะไม่ได้รับ event ของแถวนั้น
--   03_rls.sql มีแค่ orders_self_select (เห็นเฉพาะของตัวเอง)
--   บาริสต้าจึงยังไม่ได้รับ event ของออเดอร์นักเรียนคนอื่นอยู่ดี
--   ต่อให้เพิ่มเข้า publication แล้วก็ตาม — ต้องเพิ่ม policy ให้ staff ด้วย
--
-- เรื่องความปลอดภัย: policy ใหม่ไม่ได้เปิดข้อมูลเพิ่มจากของเดิม
--   บาริสต้าอ่านออเดอร์ทุกใบผ่าน pos_order_queue() (security definer) ได้อยู่แล้ว
--   ที่เพิ่มคือ "ช่องทางอ่าน" ให้ตรงกับสิทธิ์ที่มีจริง เพื่อให้ Realtime ยอมส่ง event
--   ยังคง revoke insert/update/delete ไว้เหมือนเดิมทุกประการ — เปลี่ยนสถานะ
--   ยังต้องผ่าน set_order_status() / pos_bulk_set_status() เท่านั้น
--
-- ต้องรันหลัง 07_pos_ops.sql (ใช้ app_is_pos_staff) / รันซ้ำได้
-- ============================================================

-- ============================================================
-- 1) ให้ staff หน้าร้าน select ตาราง orders ได้ (เงื่อนไขของ Realtime)
-- ============================================================
-- policy แบบ permissive หลายอันเป็น OR กัน — ของเดิม orders_self_select ไม่ถูกแตะ
-- นักเรียนยังเห็นเฉพาะออเดอร์ตัวเองเหมือนเดิม เพราะ app_is_pos_staff() เป็น false
drop policy if exists orders_pos_select on public.orders;
create policy orders_pos_select on public.orders
  for select to authenticated
  using (app_is_pos_staff());

comment on policy orders_pos_select on public.orders is
  'ให้ role pos/cashier/sysadmin อ่านออเดอร์ทุกใบได้ — จำเป็นสำหรับ Realtime ที่ตรวจ RLS รายแถว';

-- order_items ด้วย: หน้าร้านอ่านผ่าน pos_order_queue อยู่แล้ว
-- แต่เผื่ออนาคตอยากฟัง event ระดับรายการสินค้า จะได้ไม่ต้องมาไล่แก้ทีหลัง
drop policy if exists order_items_pos_select on public.order_items;
create policy order_items_pos_select on public.order_items
  for select to authenticated
  using (app_is_pos_staff());

-- ============================================================
-- 2) เพิ่ม orders เข้า publication ของ Realtime
-- ============================================================
-- ครอบ do block เพราะสั่งซ้ำจะ error ว่า "is already member of publication"
do $$
declare
  t text;
begin
  foreach t in array array['orders', 'order_items'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'เพิ่ม public.% เข้า supabase_realtime แล้ว', t;
    else
      raise notice 'public.% อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป', t;
    end if;
  end loop;
exception when others then
  -- ไม่ให้ทั้งไฟล์ล้มเพราะเรื่อง publication อย่างเดียว
  raise warning 'เพิ่ม orders เข้า realtime ไม่สำเร็จ: % — ไปเปิดเองที่ Database > Replication ได้', sqlerrm;
end $$;

-- ============================================================
-- 3) ตรวจสอบ
-- ============================================================
-- ต้องได้ true ทั้งสามช่อง ถ้าช่องไหน false ให้อ่าน raise warning ด้านบน
select
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public' and tablename = 'orders')      as realtime_orders,
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public' and tablename = 'order_items') as realtime_order_items,
  exists (select 1 from pg_policies
           where schemaname = 'public' and tablename = 'orders'
             and policyname = 'orders_pos_select')                    as policy_pos_select,
  case
    when exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'orders')
     and exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'orders'
                    and policyname = 'orders_pos_select')
    then 'OK: คิวเป็นเรียลไทม์แล้ว บาริสต้ากดแล้วจอนักเรียนขยับเอง'
    else 'ยังไม่เรียบร้อย — ตรวจข้อความ warning ด้านบน'
  end                                                                 as สถานะ;
