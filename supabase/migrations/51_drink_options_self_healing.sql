-- ============================================================
-- 51_drink_options_self_healing.sql
--   เมนูเครื่องดื่มต้องมีตัวเลือกให้เลือกเสมอ โดยไม่ต้องกลับมารัน SQL อีก
--
-- อาการที่แก้:
--   กดเข้าไปในเมนูแล้วไม่มีขนาดแก้ว ไม่มีระดับความหวาน ไม่มีท็อปปิ้งให้เลือก
--   (รายงานมาว่า "มุมมองครูสั่งกาแฟไม่มีรายละเอียดให้เลือก")
--
-- เรื่องที่ต้องเข้าใจก่อน — ไม่ได้เกี่ยวกับ role เลย:
--   ครูกับนักเรียนใช้หน้า CoffeePage ไฟล์เดียวกัน ไม่มีเงื่อนไข role สักบรรทัด
--   และ menu_with_options() ก็ไม่ได้กรองตามผู้เรียกเช่นกัน
--   ตัวเลือกจะ "ขึ้น" หรือ "ไม่ขึ้น" ขึ้นกับ "เมนูตัวไหน" ล้วน ๆ ไม่ใช่ "ใครเปิด"
--   ใครก็ตามที่กดเมนูซึ่งหมวดไม่อยู่ใน applies_to_categories จะไม่เห็นตัวเลือก
--   เหมือนกันหมด คนที่เจอก่อนแค่บังเอิญกดเมนูตัวนั้น
--
-- ทำไม 39_cup_oz_and_menu_realtime.sql ยังไม่พอ:
--   ไฟล์ 39 กวาดหมวดที่ "มีอยู่ ณ ตอนรัน" เข้า applies_to_categories ให้ครั้งเดียว
--   ซึ่งแก้ของที่ค้างอยู่ได้จริง แต่พอร้านเพิ่มเมนูหมวดใหม่ในวันถัดไป
--   (เช่น 'smoothie' หรือ 'ชาไทย') อาการเดิมกลับมาทันทีและไม่มีใครรู้
--   จนกว่าจะมีคนบ่น — แล้วก็ต้องมีคนมารัน SQL ให้อีกรอบ
--
-- ไฟล์นี้จึงเปลี่ยนจาก "กวาดครั้งเดียว" เป็น "ต่อสายไว้ให้มันตามเอง":
--   trigger บนตาราง products เติมหมวดใหม่เข้ากลุ่มตัวเลือกให้อัตโนมัติ
--   ตั้งแต่วินาทีที่บันทึกเมนู ไม่ต้องแตะ SQL อีก และหน้า Admin เพิ่มเมนูได้เลย
--
-- ของกินไม่เอาด้วย: ขนมปังไม่ควรมีตัวเลือก "ปั่น" หรือ "หวานน้อย"
--   รายชื่อหมวดของกินต้องตรงกับ CATEGORY_ALIASES ใน src/utils/orders.js
--   ถ้าเพิ่มหมวดของกินใหม่ ต้องเพิ่มทั้งสองที่
--
-- รันซ้ำได้ / รันหลัง 11_menu_options.sql (ไม่จำเป็นต้องรัน 39 มาก่อน
-- เพราะท้ายไฟล์นี้กวาดของเดิมให้ครบอยู่แล้ว)
-- ============================================================

begin;

-- ---------- หมวดที่ถือว่าเป็นของกิน ไม่ใช่เครื่องดื่ม ----------
-- แยกเป็นฟังก์ชันเพื่อให้ trigger กับบล็อกกวาดของเดิมใช้กติกาเดียวกันเป๊ะ
-- ถ้าแก้รายชื่อ แก้ที่นี่ที่เดียวแล้วมีผลทั้งสองทาง
create or replace function public.is_food_category(p_category text)
returns boolean
language sql immutable
set search_path = public
as $$
  select lower(trim(coalesce(p_category, ''))) in
         ('snack', 'bakery', 'food', 'ขนม', 'เบเกอรี่', 'ของว่าง');
$$;

-- ---------- ชื่อกลุ่มตัวเลือกกลางของเครื่องดื่ม ----------
create or replace function public.drink_option_group_names()
returns text[]
language sql immutable
as $$
  select array['ประเภท', 'ขนาด', 'ระดับความหวาน', 'ท็อปปิ้ง'];
$$;

-- ---------- ตัวเติมหมวดเข้ากลุ่มตัวเลือก ----------
/* security definer เพราะ option_groups ถูก revoke สิทธิ์ insert/update/delete
   จาก authenticated ไว้ตั้งแต่ 11_menu_options.sql — ตัว trigger จึงต้องมีสิทธิ์ของตัวเอง

   ปลอดภัยเพราะสองชั้น:
     1) products เขียนได้เฉพาะ sysadmin เท่านั้น (policy products_admin_write ใน 03_rls.sql)
        คนที่จุดชนวน trigger นี้ได้จึงเป็นผู้ดูแลระบบอยู่แล้ว
     2) ฟังก์ชันนี้ทำได้อย่างเดียวคือ "เติมชื่อหมวดของแถวที่เพิ่งบันทึก"
        ลบหมวด แก้ราคา หรือแตะตารางอื่นไม่ได้เลย */
create or replace function public.sync_drink_option_categories()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_category text := nullif(trim(coalesce(new.category, '')), '');
begin
  -- ไม่มีหมวด หรือเป็นของกิน = ไม่ต้องมีตัวเลือกเครื่องดื่ม
  if v_category is null or public.is_food_category(v_category) then
    return new;
  end if;

  /* applies_to_categories is null แปลว่า "ใช้ได้ทุกหมวด" อยู่แล้ว จึงข้ามไป
     ถ้าไปต่อท้ายอาร์เรย์ที่เป็น null จะได้ null กลับมา = กลุ่มนั้นหายไปจากทุกเมนู */
  update public.option_groups
     set applies_to_categories = applies_to_categories || v_category
   where product_id is null
     and name = any (public.drink_option_group_names())
     and applies_to_categories is not null
     and not (v_category = any (applies_to_categories));

  return new;
end;
$$;

drop trigger if exists products_sync_drink_options on public.products;
create trigger products_sync_drink_options
  after insert or update of category on public.products
  for each row
  execute function public.sync_drink_option_categories();

-- ---------- กวาดของเดิมให้ครบ ----------
-- เผื่อยังไม่เคยรันไฟล์ 39 หรือมีเมนูที่เพิ่มไว้ก่อนมี trigger ตัวนี้
do $$
declare
  g       record;
  v_added text[];
begin
  for g in
    select id, name, applies_to_categories
      from public.option_groups
     where product_id is null
       and name = any (public.drink_option_group_names())
       and applies_to_categories is not null
  loop
    select array_agg(distinct p.category)
      into v_added
      from public.products p
     where p.category is not null
       and trim(p.category) <> ''
       and not public.is_food_category(p.category)
       and not (p.category = any (g.applies_to_categories));

    if v_added is not null and array_length(v_added, 1) > 0 then
      update public.option_groups
         set applies_to_categories = applies_to_categories || v_added
       where id = g.id;
      raise notice 'กลุ่ม "%": เพิ่มหมวด % แล้ว', g.name, v_added;
    end if;
  end loop;
end $$;

commit;

-- ============================================================
-- ตรวจผล — ทุกแถวควรขึ้นว่า "ครบ" ยกเว้นหมวดของกินที่ขึ้นว่า "ของกิน"
-- ถ้ายังมีแถวไหนขึ้นว่า "ขาด" แปลว่ากลุ่มตัวเลือกกลางหายไป ให้รัน 11_menu_options.sql ก่อน
-- ============================================================
select
  p.category                                   as หมวด,
  count(*)                                     as จำนวนเมนู,
  (select count(*)
     from public.option_groups g
    where g.product_id is null
      and g.is_active
      and g.name = any (public.drink_option_group_names())
      and (g.applies_to_categories is null
           or p.category = any (g.applies_to_categories)))   as กลุ่มตัวเลือกที่ใช้ได้,
  case
    when public.is_food_category(p.category) then 'ของกิน — ไม่ต้องมีตัวเลือก'
    when (select count(*)
            from public.option_groups g
           where g.product_id is null
             and g.is_active
             and g.name = any (public.drink_option_group_names())
             and (g.applies_to_categories is null
                  or p.category = any (g.applies_to_categories))) >= 4
      then 'ครบ'
    else 'ขาด — ตัวเลือกจะไม่ขึ้นในหน้าสั่งซื้อ'
  end                                          as สถานะ
from public.products p
where p.is_active
group by p.category
order by 4 desc, 1;
