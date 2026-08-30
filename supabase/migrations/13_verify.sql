-- ============================================================
-- 13_verify.sql — ตรวจว่าไฟล์ 10, 11, 12 รันสำเร็จจริงหรือยัง
--
-- อ่านอย่างเดียว ปลอดภัย 100% ไม่สร้าง ไม่แก้ ไม่ลบอะไรทั้งนั้น
--
-- วิธีใช้: วางทั้งไฟล์ → Run → ดูคอลัมน์ "ผล"
--   ✅ = เรียบร้อย
--   ❌ = ยังไม่มี ต้องกลับไปรันไฟล์ที่ระบุในคอลัมน์สุดท้าย
--
-- ทำไมต้องมีไฟล์นี้:
--   SQL Editor บันทึกชื่อ query ไว้ให้เสมอ ต่อให้กด Run แล้วขึ้น error
--   การเห็นชื่อไฟล์ในลิสต์ด้านซ้ายจึงไม่ได้แปลว่ารันผ่าน
--   ตัวนี้ไปดูของจริงใน catalog ของฐานข้อมูลว่ามีอะไรเกิดขึ้นบ้าง
--
-- หมายเหตุ: ใช้ query_to_xml ครอบการนับแถว เพื่อให้ตารางที่ยังไม่มี
--           ไม่ทำให้ทั้ง query พัง (จะได้เห็นผลตรวจข้ออื่นครบ)
-- ============================================================

with

-- นับแถวแบบไม่พังถ้าตารางยังไม่มี
counts as (
  select
    case when to_regclass('public.events') is null then null else
      (xpath('/row/c/text()', query_to_xml(
        'select count(*) as c from public.events', false, true, '')))[1]::text::bigint
    end as events_rows,

    case when to_regclass('public.option_groups') is null then null else
      (xpath('/row/c/text()', query_to_xml(
        'select count(*) as c from public.option_groups', false, true, '')))[1]::text::bigint
    end as group_rows,

    case when to_regclass('public.options') is null then null else
      (xpath('/row/c/text()', query_to_xml(
        'select count(*) as c from public.options', false, true, '')))[1]::text::bigint
    end as option_rows
),

-- ตัวช่วยเช็คว่าคอลัมน์มีอยู่ไหม
has_col as (
  select
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='orders' and column_name='note') > 0        as orders_note,
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='orders' and column_name='pickup_token') > 0 as orders_token,
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='order_items' and column_name='note') > 0    as items_note,
    (select count(*) from information_schema.columns
      where table_schema='public' and table_name='products' and column_name='image_url') > 0  as products_image
),

-- ฟังก์ชันที่ต้องมี
fn as (
  select proname, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),

checks as (

  -- ---------- ไฟล์ 10: ปฏิทินกิจกรรม ----------
  select 1 as ลำดับ, 'ตาราง events' as รายการ,
         to_regclass('public.events') is not null as ok,
         coalesce((select events_rows::text || ' กิจกรรม' from counts), '—') as รายละเอียด,
         '10_events.sql' as ไฟล์
  union all
  select 2, 'RLS เปิดบน events',
         coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.events')), false),
         (select count(*)::text || ' policy' from pg_policies
           where schemaname='public' and tablename='events'),
         '10_events.sql'
  union all
  select 3, 'ฟังก์ชัน app_can_manage_events()',
         exists (select 1 from fn where proname='app_can_manage_events'),
         'กำหนดว่าใครแก้ปฏิทินได้', '10_events.sql'
  union all
  select 4, 'Realtime ส่ง events',
         exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='events'),
         'ถ้า ❌ ไปเปิดที่ Database > Replication', '10_events.sql'
  union all
  select 5, 'มีข้อมูลกิจกรรมตั้งต้น',
         coalesce((select events_rows from counts), 0) > 0,
         'ควรได้ประมาณ 35 รายการ', '10_events.sql'

  -- ---------- ไฟล์ 11: ตัวเลือกเครื่องดื่ม ----------
  union all
  select 10, 'ตาราง option_groups',
         to_regclass('public.option_groups') is not null,
         coalesce((select group_rows::text || ' กลุ่ม' from counts), '—'), '11_menu_options.sql'
  union all
  select 11, 'ตาราง options',
         to_regclass('public.options') is not null,
         coalesce((select option_rows::text || ' ตัวเลือก' from counts), '—'), '11_menu_options.sql'
  union all
  select 12, 'ตาราง order_item_options',
         to_regclass('public.order_item_options') is not null,
         'เก็บ snapshot ตัวเลือกที่สั่งจริง', '11_menu_options.sql'
  union all
  select 13, 'คอลัมน์ orders.note',
         (select orders_note from has_col), 'หมายเหตุทั้งออเดอร์', '11_menu_options.sql'
  union all
  select 14, 'คอลัมน์ orders.pickup_token',
         (select orders_token from has_col), 'ใช้กับ QR ของเพื่อน', '11_menu_options.sql'
  union all
  select 15, 'คอลัมน์ order_items.note',
         (select items_note from has_col), 'หมายเหตุรายแก้ว', '11_menu_options.sql'
  union all
  select 16, 'คอลัมน์ products.image_url',
         (select products_image from has_col), 'รูปเมนู (ไม่ใส่ก็ได้)', '11_menu_options.sql'
  union all
  select 17, 'มีตัวเลือกตั้งต้นครบ 4 กลุ่ม',
         coalesce((select group_rows from counts), 0) >= 4,
         'ประเภท / ขนาด / ความหวาน / ท็อปปิ้ง', '11_menu_options.sql'

  -- ---------- ไฟล์ 12: สั่งซื้อ + QR ----------
  union all
  select 20, 'ฟังก์ชัน menu_with_options()',
         exists (select 1 from fn where proname='menu_with_options'),
         'หน้าสั่งกาแฟเรียกตัวนี้', '12_order_v2.sql'
  union all
  select 21, 'ฟังก์ชัน place_order_v2()',
         exists (select 1 from fn where proname='place_order_v2'),
         'สั่งซื้อพร้อมตัวเลือก', '12_order_v2.sql'
  union all
  select 22, 'ฟังก์ชัน product_option_groups()',
         exists (select 1 from fn where proname='product_option_groups'),
         'หาตัวเลือกที่ใช้กับเมนูนั้นได้', '12_order_v2.sql'
  union all
  select 23, 'ฟังก์ชัน complete_order()',
         exists (select 1 from fn where proname='complete_order'),
         'จุดต่องาน QR ของเพื่อน', '12_order_v2.sql'
  union all
  select 24, 'ฟังก์ชัน my_orders()',
         exists (select 1 from fn where proname='my_orders'),
         'ออเดอร์ของฉันพร้อมตัวเลือก', '12_order_v2.sql'
  union all
  select 25, 'pos_order_queue อัปเดตเป็นตัวใหม่แล้ว',
         exists (select 1 from fn where proname='pos_order_queue' and def like '%order_item_options%'),
         'ถ้า ❌ บาริสต้าจะไม่เห็นตัวเลือก', '12_order_v2.sql'

  -- ---------- ของเดิมที่ต้องมีมาก่อน ----------
  union all
  select 30, 'app_is_pos_staff() (ของเดิม)',
         exists (select 1 from fn where proname='app_is_pos_staff'),
         'ไฟล์ 11 กับ 12 เรียกใช้ตัวนี้', '07_pos_ops.sql'
  union all
  select 31, 'place_order() เดิมยังปิดช่องโหว่อยู่',
         exists (select 1 from fn where proname='place_order' and def like '%app_is_pos_staff%'),
         'ของเดิม ไม่ได้แก้ในรอบนี้', '09_fix_place_order_authz.sql'
)

select
  case when ok then '✅' else '❌' end   as ผล,
  รายการ,
  รายละเอียด,
  case when ok then '' else 'ยังไม่ได้รัน ' || ไฟล์ end as ต้องทำอะไร
from checks
order by ลำดับ;
