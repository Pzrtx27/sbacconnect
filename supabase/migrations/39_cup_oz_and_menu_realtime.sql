-- ============================================================
-- 39_cup_oz_and_menu_realtime.sql
--
-- สามเรื่องในไฟล์เดียว เพราะทั้งสามเรื่องมาจากคำถามเดียวกันของหน้าร้าน
-- ("สั่งแล้วได้แก้วขนาดไหน" และ "เพิ่มเมนูแล้วทำไมไม่ขึ้น"):
--
--   1) ขนาดแก้วบอกจำนวนออนซ์
--      37_cup_sizes_and_free_toppings.sql เปลี่ยนขนาดจาก ปกติ/พิเศษ
--      มาเป็น แก้วเล็ก (S) / แก้วกลาง (M) / แก้วใหญ่ (L) ซึ่งดีขึ้นแล้ว
--      แต่ยังตอบไม่ได้อยู่ดีว่า "ใหญ่" คือใหญ่แค่ไหน — คนสั่งเทียบกับร้านอื่นไม่ได้
--      และบาริสต้าก็ต้องจำเองว่าไซซ์ไหนใช้แก้วใบไหน
--      ตอนนี้ชื่อพกตัวเลขไปด้วย: เล็ก 12 oz / กลาง 16 oz / ใหญ่ 22 oz
--      หน้าเว็บไม่ต้องแก้อะไรเลย เพราะมันแสดงชื่อจาก DB ตรง ๆ อยู่แล้ว
--
--   2) เมนูที่เพิ่มใหม่ต้องได้ตัวเลือกครบ
--      กลุ่ม ประเภท/ขนาด/ความหวาน/ท็อปปิ้ง เป็น "กลุ่มกลาง" ที่จำกัดด้วย
--      applies_to_categories ซึ่ง 11_menu_options.sql ใส่ค่าเดาไว้ตั้งแต่แรก
--      ('coffee','tea','soda','drink','กาแฟ','ชา','โซดา','เครื่องดื่ม','นม')
--      ร้านเพิ่มเมนูใหม่ในหมวดที่ไม่อยู่ในลิสต์นี้ (เช่น 'espresso' หรือ 'smoothie')
--      เมนูจะ "ขึ้น" ก็จริง แต่กดเข้าไปแล้วไม่มีตัวเลือกให้เลือกสักอัน
--      บล็อกด้านล่างจึงกวาดหมวดที่มีอยู่จริงในตาราง products มาเติมให้อัตโนมัติ
--      ยกเว้นหมวดของกิน (ขนมปังไม่ควรมีตัวเลือก "ปั่น")
--
--   3) เปิด Realtime ให้ products/options
--      หน้า CoffeePage เรียก menu_with_options() ครั้งเดียวตอนเปิดหน้า
--      แอปเป็น SPA เปิดค้างได้ทั้งวัน เมนูที่เพิ่งเพิ่มจึงไม่มีทางโผล่เอง
--      = อาการ "เพิ่มกาแฟแล้วไม่ขึ้น" ที่ถูกรายงานมา
--      พอสองตารางนี้อยู่ใน publication แล้ว หน้าเว็บที่ subscribe ไว้
--      จะดึงเมนูใหม่ให้เองทันทีที่ร้านกดบันทึก
--
-- ต้องรันหลัง 37 / รันซ้ำได้ทั้งไฟล์
-- ============================================================

-- ============================================================
-- 1) ขนาดแก้วเป็นออนซ์
-- ============================================================
do $$
declare
  g_size bigint;
begin
  select id into g_size
    from public.option_groups
   where product_id is null and name = 'ขนาด';

  if g_size is null then
    raise notice 'ไม่พบกลุ่ม "ขนาด" — ข้ามส่วนนี้ (ต้องรัน 11_menu_options.sql ก่อน)';
    return;
  end if;

  /* เปลี่ยนชื่อของแถวเดิม ไม่ได้สร้างแถวใหม่

     ทำไมต้อง update ไม่ใช่ insert ใหม่แล้วปิดของเก่า:
     ตัวเลือกที่ลูกค้าเลือกไว้ถูก snapshot ชื่อ+ราคาไว้ใน order_item_options แล้ว
     (11_menu_options.sql) ประวัติจึงไม่ขยับตามการเปลี่ยนชื่อที่นี่
     ส่วนตะกร้าที่ยังค้างอยู่บนเครื่องผู้ใช้จะยังอ้าง options.id เดิมได้ต่อ
     ถ้าปิดของเก่าแล้วสร้างใหม่ ตะกร้าที่ค้างอยู่จะกลายเป็น INVALID_OPTION ทันที */
  -- 1a) เปลี่ยนชื่อ เฉพาะตอนที่ยังไม่มีแถวชื่อใหม่อยู่ — กันชื่อซ้ำเวลารันไฟล์นี้ซ้ำ
  --     (ตาราง options ไม่มี unique (group_id, name) ถ้าไม่กันเองจะได้ขนาดซ้ำสองใบเงียบ ๆ)
  update public.options o
     set name = v.new_name
    from (values
            ('แก้วเล็ก (S)',  'เล็ก 12 oz'),
            ('แก้วกลาง (M)',  'กลาง 16 oz'),
            ('แก้วใหญ่ (L)',  'ใหญ่ 22 oz')
         ) as v(old_name, new_name)
   where o.group_id = g_size
     and o.name = v.old_name
     and not exists (
       select 1 from public.options x
        where x.group_id = g_size and x.name = v.new_name
     );

  -- 1b) ฐานข้อมูลที่ยังไม่เคยรัน 37 (มีแค่ ปกติ/พิเศษ) — สร้างขนาดใหม่ให้ครบ
  insert into public.options (group_id, name, price_delta_satang, is_default, sort_order)
  select g_size, v.name, 0, false, 0
    from (values ('เล็ก 12 oz'), ('กลาง 16 oz'), ('ใหญ่ 22 oz')) as v(name)
   where not exists (
     select 1 from public.options o
      where o.group_id = g_size and o.name = v.name
   );

  /* 1c) บังคับราคา/ลำดับให้ตรงกับที่ประกาศไว้ทุกครั้งที่รัน — ห้ามลบบล็อกนี้
         insert ด้านบนมี "where not exists" กันแถวซ้ำ พอรันรอบสองมันจะถูกข้ามทั้งก้อน
         การไปแก้ตัวเลขใน values เฉย ๆ จึงไม่มีผลอะไรเลย (บทเรียนจาก 37)
         ถ้าจะเปลี่ยนราคาหรือจำนวนออนซ์ ให้แก้ที่บล็อกนี้ */
  update public.options o
     set price_delta_satang = v.delta,
         sort_order         = v.ord,
         is_active          = true
    from (values
            ('เล็ก 12 oz',    0, 1),
            ('กลาง 16 oz',  500, 2),
            ('ใหญ่ 22 oz', 1000, 3)
         ) as v(name, delta, ord)
   where o.group_id = g_size and o.name = v.name;

  -- ปิดชื่อรุ่นเก่าทุกแบบที่อาจหลงเหลือ (รวมกรณีมีคนเผลอรัน 37 ซ้ำทีหลัง)
  update public.options
     set is_active = false, is_default = false
   where group_id = g_size
     and name in ('ปกติ', 'พิเศษ', 'แก้วเล็ก (S)', 'แก้วกลาง (M)', 'แก้วใหญ่ (L)');

  -- ขนาดยังบังคับเลือกหนึ่งอย่างเสมอ และต้องมี default เดียว
  update public.option_groups set min_select = 1, max_select = 1 where id = g_size;

  update public.options
     set is_default = (name = 'กลาง 16 oz')
   where group_id = g_size and is_active;

  raise notice 'ขนาดแก้ว: เล็ก 12 oz / กลาง 16 oz / ใหญ่ 22 oz (ประวัติออเดอร์เก่าไม่กระทบ)';
end $$;

-- ============================================================
-- 2) เมนูใหม่ต้องได้ตัวเลือกครบ ไม่ว่าร้านจะตั้งชื่อหมวดว่าอะไร
-- ============================================================
do $$
declare
  g       record;
  v_added text[];
begin
  for g in
    select id, name, applies_to_categories
      from public.option_groups
     where product_id is null
       and name in ('ประเภท', 'ขนาด', 'ระดับความหวาน', 'ท็อปปิ้ง')
  loop
    -- applies_to_categories = null แปลว่า "ทุกหมวด" อยู่แล้ว ไม่ต้องยุ่ง
    if g.applies_to_categories is null then
      continue;
    end if;

    /* หมวดของกินไม่เอา — เทียบแบบตัวพิมพ์เล็กเพื่อกัน 'Snack' กับ 'SNACK'
       รายชื่อนี้ตรงกับ CATEGORY_ALIASES ฝั่งหน้าเว็บ (src/utils/orders.js)
       ถ้าเพิ่มหมวดของกินใหม่ ต้องเพิ่มทั้งสองที่ */
    select array_agg(distinct p.category)
      into v_added
      from public.products p
     where p.category is not null
       and lower(trim(p.category)) not in ('snack', 'bakery', 'food', 'ขนม', 'เบเกอรี่', 'ของว่าง')
       and not (p.category = any (g.applies_to_categories));

    if v_added is not null and array_length(v_added, 1) > 0 then
      update public.option_groups
         set applies_to_categories = applies_to_categories || v_added
       where id = g.id;
      raise notice 'กลุ่ม "%": เพิ่มหมวด % เข้าเงื่อนไขแล้ว', g.name, v_added;
    end if;
  end loop;
end $$;

-- ============================================================
-- 3) Realtime ของเมนู
-- ============================================================
-- products มี policy products_read (is_active or sysadmin) อยู่แล้ว
-- options   มี policy options_read (is_active) อยู่แล้ว
-- Realtime ตรวจ RLS รายแถว จึงส่ง event ได้เลยโดยไม่ต้องเพิ่ม policy ใหม่
do $$
declare
  t text;
begin
  foreach t in array array['products', 'options'] loop
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
  -- ปุ่ม "โหลดเมนูใหม่" ในหน้าสั่งเครื่องดื่มยังใช้ได้อยู่ถ้าส่วนนี้ไม่ผ่าน
  raise warning 'เพิ่มเมนูเข้า realtime ไม่สำเร็จ: % — เปิดเองได้ที่ Database > Replication', sqlerrm;
end $$;

-- ============================================================
-- ตรวจผล
-- ============================================================

-- 1. ขนาดแก้วที่เปิดขายอยู่จริง
select o.name                                as ขนาด,
       (o.price_delta_satang / 100.0)        as บวกเพิ่ม_บาท,
       o.is_default                          as ค่าเริ่มต้น
  from public.options o
  join public.option_groups g on g.id = o.group_id
 where g.product_id is null and g.name = 'ขนาด' and o.is_active
 order by o.sort_order;

-- 2. เมนูทุกรายการได้ตัวเลือกกี่กลุ่ม
--    แถวไหนขึ้น 0 ทั้งที่เป็นเครื่องดื่ม = หมวดนั้นยังไม่เข้าเงื่อนไขกลุ่มกลาง
--    แถวไหน is_active = false = นักเรียนจะไม่เห็นเมนูนี้ในหน้าสั่ง (สาเหตุ "เพิ่มแล้วไม่ขึ้น")
select p.name                                      as เมนู,
       p.category                                  as หมวด,
       p.is_active                                 as เปิดขาย,
       (select count(*) from public.product_option_groups(p.id)) as จำนวนกลุ่มตัวเลือก,
       case
         when not p.is_active then 'ไม่ขึ้นในหน้าสั่ง — is_active = false'
         when (select count(*) from public.product_option_groups(p.id)) = 0
           then 'ขึ้นแต่ไม่มีตัวเลือกให้เลือก'
         else 'OK'
       end                                         as สถานะ
  from public.products p
 order by p.is_active desc, p.category, p.name;

-- 3. Realtime พร้อมหรือยัง (ต้องได้ true ทั้งสองช่อง)
select
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public' and tablename = 'products') as realtime_products,
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime'
             and schemaname = 'public' and tablename = 'options')  as realtime_options;
