-- ============================================================
-- 11_menu_options.sql — โมดูล B ส่วนที่ 1: ตัวเลือกเครื่องดื่ม
--
-- ปัญหาที่แก้ (ข้อ 02 ในแผน):
--   หน้าสั่งกาแฟเลือกได้แค่ "ตัวเมนู" กับ "จำนวน" เท่านั้น
--   ออเดอร์ที่เด้งเข้าหน้าร้านจึงบอกไม่ได้ว่าเอาร้อนหรือเย็น หวานเท่าไร ใส่ไข่มุกไหม
--   → บาริสต้าใช้งานจริงไม่ได้เลย ต้องเดินไปถามคนสั่งอยู่ดี
--
-- ทำไมเก็บตัวเลือกเป็นตาราง ไม่ใช่ hard-code ในโค้ด:
--   1) ร้านเพิ่ม/ลดท็อปปิ้ง เปลี่ยนราคาเองได้ ไม่ต้องแก้โค้ดแล้ว deploy ใหม่
--   2) แต่ละเมนูมีตัวเลือกไม่เหมือนกัน — ขนมปังไม่มี "ปั่น"
--   3) ราคาส่วนต่างอยู่ใน DB → ฟังก์ชันสั่งซื้อคำนวณเองได้ ไม่ต้องเชื่อราคาจากเบราว์เซอร์
--
-- หน่วยเงิน: satang (integer) ทั้งหมด ตามที่โปรเจกต์นี้ใช้อยู่แล้ว
--   ห้ามใช้ numeric/float กับเงิน — ปัดเศษเพี้ยนสะสมแล้วยอดไม่ตรง
--   (แผนเขียนเป็น numeric(8,2) แต่ของจริงในโปรเจกต์คือ price_satang จึงยึดของจริง)
--
-- รันซ้ำได้ทั้งไฟล์ ต้องรันหลัง 09
-- ============================================================

-- ============================================================
-- 1) เติมคอลัมน์ที่ขาดในตารางเดิม
-- ============================================================

-- รูปเมนู — ตอนนี้หน้าเว็บเดาอีโมจิจากชื่อสินค้าเอา (src/utils/orders.js: productEmoji)
-- มีคอลัมน์นี้แล้วค่อยอัปโหลดรูปขึ้น Supabase Storage แล้วเอา public url มาใส่
alter table public.products add column if not exists image_url text;

-- หมายเหตุถึงบาริสต้า ระดับทั้งออเดอร์ เช่น "ขอถุงแยก 2 ใบ"
alter table public.orders add column if not exists note text;
alter table public.orders drop constraint if exists orders_note_len;
alter table public.orders add constraint orders_note_len
  check (note is null or char_length(note) <= 300);

-- หมายเหตุระดับรายแก้ว เช่น "แก้วนี้ไม่ใส่หลอด"
alter table public.order_items add column if not exists note text;
alter table public.order_items drop constraint if exists order_items_note_len;
alter table public.order_items add constraint order_items_note_len
  check (note is null or char_length(note) <= 200);

-- ---------- pickup_token: สำหรับงาน QR ของเพื่อน (ข้อ 06 ในแผน) ----------
-- pickup_code เดิมเป็นเลข 4 หลัก เดาได้ง่ายมาก (มีแค่ 10,000 ค่า)
-- ใช้เป็นตัวยืนยันการรับของไม่ได้ ใครสุ่มเลขก็ปิดออเดอร์ชาวบ้านได้
-- จึงเพิ่ม token สุ่ม 128 บิตแยกอีกตัว เอาไว้ฝังใน QR โดยเฉพาะ
alter table public.orders add column if not exists pickup_token text;

-- backfill ให้ออเดอร์เก่าที่สร้างก่อนมีคอลัมน์นี้
update public.orders
   set pickup_token = encode(gen_random_bytes(16), 'hex')
 where pickup_token is null;

alter table public.orders alter column pickup_token set default encode(gen_random_bytes(16), 'hex');
alter table public.orders alter column pickup_token set not null;

create unique index if not exists orders_pickup_token_key on public.orders (pickup_token);

-- ============================================================
-- 2) กลุ่มตัวเลือก
-- ============================================================
create table if not exists public.option_groups (
  id          bigint generated always as identity primary key,

  -- null = กลุ่มกลาง ใช้ได้กับหลายเมนู (ดู applies_to_categories)
  -- ใส่ค่า = กลุ่มเฉพาะของเมนูนั้นเมนูเดียว
  product_id  bigint references public.products(id) on delete cascade,

  name        text    not null,

  -- ใช้เฉพาะกลุ่มกลาง: หมวดสินค้าที่กลุ่มนี้ใช้ได้ (null = ทุกหมวด)
  -- นี่คือตัวที่กันไม่ให้ "ขนมปัง" มีตัวเลือก "ปั่น"
  applies_to_categories text[],

  -- บังคับเลือกกี่อย่าง / เลือกได้มากสุดกี่อย่าง
  --   ประเภท ร้อน/เย็น/ปั่น = (1,1) บังคับเลือก 1
  --   ท็อปปิ้ง               = (0,3) ไม่บังคับ เลือกได้ไม่เกิน 3
  min_select  integer not null default 1,
  max_select  integer not null default 1,

  sort_order  integer not null default 0,
  is_active   boolean not null default true,

  constraint option_groups_select_range check (min_select >= 0 and max_select >= min_select),
  constraint option_groups_name_len     check (char_length(trim(name)) between 1 and 60)
);

create index if not exists option_groups_product_idx on public.option_groups (product_id);

comment on table public.option_groups is
  'กลุ่มตัวเลือกของเมนู เช่น ประเภท / ขนาด / ความหวาน / ท็อปปิ้ง — product_id null คือกลุ่มกลางใช้ร่วมหลายเมนู';

-- ============================================================
-- 3) ตัวเลือกในแต่ละกลุ่ม
-- ============================================================
create table if not exists public.options (
  id                 bigint generated always as identity primary key,
  group_id           bigint  not null references public.option_groups(id) on delete cascade,
  name               text    not null,

  -- ส่วนต่างราคา บวกจากราคาเมนูหลัก ติดลบได้ (เช่น ไม่เอาแก้ว ลด 2 บาท)
  price_delta_satang integer not null default 0,

  is_default         boolean not null default false,
  sort_order         integer not null default 0,
  is_active          boolean not null default true,

  constraint options_name_len   check (char_length(trim(name)) between 1 and 60),
  constraint options_delta_sane check (price_delta_satang between -100000 and 100000)
);

create index if not exists options_group_idx on public.options (group_id);

-- ============================================================
-- 4) ตัวเลือกที่ถูกเลือกจริงในแต่ละออเดอร์
-- ============================================================
-- order_items.id ในฐานข้อมูลนี้อาจเป็น bigint หรือ uuid (แล้วแต่ 01_schema.sql เดิม)
-- จึงอ่านชนิดจริงจาก catalog แล้วค่อยสร้างตาราง — ไม่เดาเอาเองแล้ว FK พังทีหลัง
do $$
declare
  v_type text;
begin
  if to_regclass('public.order_item_options') is not null then
    raise notice 'public.order_item_options มีอยู่แล้ว ข้ามการสร้าง';
    return;
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into v_type
  from pg_attribute a
  where a.attrelid = 'public.order_items'::regclass
    and a.attname  = 'id'
    and a.attnum   > 0
    and not a.attisdropped;

  if v_type is null then
    raise exception 'หา public.order_items.id ไม่เจอ — ต้องรัน 01_schema.sql ก่อน';
  end if;

  execute format($ddl$
    create table public.order_item_options (
      order_item_id      %s      not null references public.order_items(id) on delete cascade,
      option_id          bigint  not null references public.options(id),

      -- snapshot: คัดลอกชื่อกับราคา ณ วินาทีที่สั่ง
      -- ถ้าเก็บแค่ option_id แล้ววันหลังร้านขึ้นราคา "ปั่น" จาก 10 เป็น 15 บาท
      -- ยอดของออเดอร์เก่าทุกใบจะขยับตามไปด้วย รายงานยอดขายย้อนหลังผิดทันที
      -- ระบบ POS จริงเก็บ snapshot กันหมดด้วยเหตุผลนี้
      option_name        text    not null,
      price_delta_satang integer not null default 0,
      group_name         text,

      primary key (order_item_id, option_id)
    )$ddl$, v_type);

  raise notice 'สร้าง public.order_item_options (order_item_id ชนิด %) แล้ว', v_type;
end $$;

comment on table public.order_item_options is
  'ตัวเลือกที่ลูกค้าเลือกจริงในแต่ละแก้ว เก็บ snapshot ชื่อ+ราคา ห้ามอ่านราคาย้อนจากตาราง options';

-- FK ไป options เป็นแบบ restrict โดยตั้งใจ:
-- ถ้าร้านจะเลิกขายท็อปปิ้งตัวไหน ให้ตั้ง is_active = false ไม่ใช่ลบทิ้ง
-- (ลบทิ้งแล้วประวัติออเดอร์เก่าจะอ้างอิงของที่ไม่มีอยู่)

-- ============================================================
-- 5) RLS
-- ============================================================
alter table public.option_groups      enable row level security;
alter table public.options            enable row level security;
alter table public.order_item_options enable row level security;

-- เมนูกับตัวเลือกเป็นข้อมูลสาธารณะสำหรับคนในระบบ — อ่านได้ทุกคนที่ล็อกอิน
drop policy if exists option_groups_read on public.option_groups;
create policy option_groups_read on public.option_groups
  for select using (is_active);

drop policy if exists options_read on public.options;
create policy options_read on public.options
  for select using (is_active);

-- เห็นตัวเลือกของออเดอร์ตัวเอง / เจ้าหน้าที่หน้าร้านเห็นทั้งหมด
-- ต้องมี policy นี้ ไม่งั้นหน้า "ออเดอร์ของฉัน" จะแสดงแค่ชื่อเมนูเปล่า ๆ
drop policy if exists order_item_options_read on public.order_item_options;
create policy order_item_options_read on public.order_item_options
  for select using (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_options.order_item_id
        and (o.user_id = app_current_user_id() or app_is_pos_staff())
    )
  );

-- เขียนได้เฉพาะฟังก์ชัน security definer (place_order_v2) เท่านั้น
-- ไม่เปิด insert/update/delete ให้ client เลย — ราคาจะได้ปลอมไม่ได้
grant select on public.option_groups      to authenticated;
grant select on public.options            to authenticated;
grant select on public.order_item_options to authenticated;

revoke insert, update, delete on public.option_groups      from authenticated;
revoke insert, update, delete on public.options            from authenticated;
revoke insert, update, delete on public.order_item_options from authenticated;

revoke all on public.option_groups      from anon;
revoke all on public.options            from anon;
revoke all on public.order_item_options from anon;

-- ============================================================
-- 6) ข้อมูลตั้งต้นของตัวเลือก
-- ============================================================
-- !! ตรงนี้คือส่วนที่ต้องไปเช็คกับร้านจริงแล้วมาแก้ !!
--    ราคาข้างล่างเป็นค่าที่แผนตั้งไว้ ยังไม่ได้ยืนยันกับร้าน
--    และ DRINK_CATEGORIES ต้องตรงกับค่าใน products.category ของจริง
--    ดูค่าจริงได้จากคำสั่งตรวจสอบท้ายไฟล์
do $$
declare
  -- หมวดที่ถือว่าเป็น "เครื่องดื่ม" — ใส่ทั้งชื่อไทยและอังกฤษไว้ก่อนเพราะยังไม่รู้ว่า seed เดิมใช้แบบไหน
  drink_cats text[] := array['coffee','tea','soda','drink','กาแฟ','ชา','โซดา','เครื่องดื่ม','นม'];
  g_type  bigint;
  g_size  bigint;
  g_sweet bigint;
  g_top   bigint;
begin
  -- ---------- ประเภท: ร้อน / เย็น / ปั่น ----------
  select id into g_type from public.option_groups
   where product_id is null and name = 'ประเภท';

  if g_type is null then
    insert into public.option_groups (product_id, name, applies_to_categories, min_select, max_select, sort_order)
    values (null, 'ประเภท', drink_cats, 1, 1, 10)
    returning id into g_type;

    insert into public.options (group_id, name, price_delta_satang, is_default, sort_order) values
      (g_type, 'ร้อน',  0,    true,  1),
      (g_type, 'เย็น',  500,  false, 2),
      (g_type, 'ปั่น',  1000, false, 3);
  end if;

  -- ---------- ขนาด: ปกติ / พิเศษ ----------
  select id into g_size from public.option_groups
   where product_id is null and name = 'ขนาด';

  if g_size is null then
    insert into public.option_groups (product_id, name, applies_to_categories, min_select, max_select, sort_order)
    values (null, 'ขนาด', drink_cats, 1, 1, 20)
    returning id into g_size;

    insert into public.options (group_id, name, price_delta_satang, is_default, sort_order) values
      (g_size, 'ปกติ',  0,    true,  1),
      (g_size, 'พิเศษ', 1000, false, 2);
  end if;

  -- ---------- ระดับความหวาน ----------
  select id into g_sweet from public.option_groups
   where product_id is null and name = 'ระดับความหวาน';

  if g_sweet is null then
    insert into public.option_groups (product_id, name, applies_to_categories, min_select, max_select, sort_order)
    values (null, 'ระดับความหวาน', drink_cats, 1, 1, 30)
    returning id into g_sweet;

    insert into public.options (group_id, name, price_delta_satang, is_default, sort_order) values
      (g_sweet, 'ไม่หวาน',   0, false, 1),
      (g_sweet, 'หวานน้อย',  0, false, 2),
      (g_sweet, 'หวานปกติ',  0, true,  3),
      (g_sweet, 'หวานมาก',   0, false, 4);
  end if;

  -- ---------- ท็อปปิ้ง: ไม่บังคับ เลือกได้ไม่เกิน 3 ----------
  select id into g_top from public.option_groups
   where product_id is null and name = 'ท็อปปิ้ง';

  if g_top is null then
    insert into public.option_groups (product_id, name, applies_to_categories, min_select, max_select, sort_order)
    values (null, 'ท็อปปิ้ง', drink_cats, 0, 3, 40)
    returning id into g_top;

    insert into public.options (group_id, name, price_delta_satang, is_default, sort_order) values
      (g_top, 'ไข่มุก',     1000, false, 1),
      (g_top, 'วิปครีม',    1000, false, 2),
      (g_top, 'ช็อตเพิ่ม',  1000, false, 3),
      (g_top, 'เจลลี่',     1000, false, 4);
  end if;
end $$;

-- ============================================================
-- ตรวจสอบ + สิ่งที่ต้องไปแก้เอง
-- ============================================================

-- 6.1 หมวดสินค้าที่มีอยู่จริง — เอาไปเทียบกับ applies_to_categories ข้างบน
--     ถ้าหมวดเครื่องดื่มของจริงไม่อยู่ในลิสต์ เมนูนั้นจะไม่มีตัวเลือกให้เลือกเลย
select
  category                                    as หมวดในตาราง_products,
  count(*)                                    as จำนวนเมนู,
  case
    when category = any (
      select unnest(applies_to_categories) from public.option_groups
       where product_id is null and name = 'ประเภท'
    ) then 'OK: หมวดนี้มีตัวเลือกให้เลือก'
    else 'ยังไม่มีตัวเลือก — ถ้าเป็นเครื่องดื่มต้องเพิ่มหมวดนี้เข้า applies_to_categories'
  end                                         as สถานะ
from public.products
group by category
order by category;

-- 6.2 ตัวเลือกทั้งหมดที่ตั้งไว้ พร้อมราคา — เอาไปเทียบกับราคาจริงของร้าน
select
  og.name                                     as กลุ่ม,
  o.name                                      as ตัวเลือก,
  (o.price_delta_satang / 100.0)              as ส่วนต่างราคา_บาท,
  og.min_select || '-' || og.max_select       as เลือกได้,
  o.is_default                                as ค่าเริ่มต้น
from public.options o
join public.option_groups og on og.id = o.group_id
order by og.sort_order, o.sort_order;
