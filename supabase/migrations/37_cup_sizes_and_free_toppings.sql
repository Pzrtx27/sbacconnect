-- ============================================================
-- 37_cup_sizes_and_free_toppings.sql — ขนาดเป็นขนาดแก้ว + ท็อปปิ้งไม่จำกัดจำนวน
--
-- สองเรื่องที่แก้:
--   1) กลุ่ม "ขนาด" เดิมเป็น ปกติ / พิเศษ ซึ่งไม่ได้บอกอะไรกับคนสั่งเลย
--      ว่าได้กี่ออนซ์ แก้วใหญ่แค่ไหน — เปลี่ยนเป็นขนาดแก้ว เล็ก/กลาง/ใหญ่
--   2) กลุ่ม "ท็อปปิ้ง" เดิมจำกัด max_select = 3 — ปลดออกให้ใส่กี่อย่างก็ได้
--
-- ทำไม "ปิด" ตัวเลือกเดิมแทนที่จะลบทิ้ง:
--   order_item_options เก็บว่าออเดอร์เก่าแต่ละแก้วเลือกอะไรไว้ โดยอ้าง options.id
--   ถ้าลบแถวเดิม ประวัติออเดอร์ที่ลูกค้าเคยสั่ง "พิเศษ" จะเพี้ยนหรือหายไปด้วย
--   menu_with_options() กรอง o.is_active อยู่แล้ว (12_order_v2.sql บรรทัด 90)
--   ปิดธงจึงหายจากเมนูทันทีโดยประวัติยังอ่านได้ครบ
--
-- เรื่องราคา — ไล่ขึ้นตามขนาดแก้ว ไม่มีตัวไหนติดลบ:
--   แก้วเล็ก (S) = +0  /  แก้วกลาง (M) = +5  /  แก้วใหญ่ (L) = +10
--   แก้วเล็กเป็นราคาฐาน แล้วจ่ายเพิ่มถ้าอยากได้แก้วใหญ่ขึ้น
--   ต่างจากรอบแรกที่ตั้ง S ลด 5 บาท ซึ่งทำให้ราคาฐานของเมนูดูสูงเกินจริง
--
--   ถ้าราคาจริงไม่ใช่แบบนี้ แก้ที่ตาราง options ได้เลย ไม่ต้องแก้โค้ดแล้ว deploy ใหม่
--   (นั่นคือเหตุผลที่ 11_menu_options.sql เก็บตัวเลือกเป็นตารางตั้งแต่แรก)
--
-- รันซ้ำได้ / ต้องรันหลัง 11_menu_options.sql
-- ============================================================

do $$
declare
  g_size bigint;
  g_top  bigint;
  n_top  integer;
begin
  -- ---------- 1) ขนาดแก้ว ----------
  select id into g_size
    from public.option_groups
   where product_id is null and name = 'ขนาด';

  if g_size is null then
    raise notice 'ไม่พบกลุ่ม "ขนาด" — ข้ามส่วนนี้ (ต้องรัน 11_menu_options.sql ก่อน)';
  else
    -- ปิดของเดิมที่ไม่ใช่ชื่อขนาดแก้ว (ปกติ / พิเศษ) แต่ไม่แตะประวัติ
    update public.options
       set is_active = false, is_default = false
     where group_id = g_size
       and name in ('ปกติ', 'พิเศษ');

    -- เพิ่มขนาดแก้วถ้ายังไม่มี — เช็คทีละชื่อ ไฟล์นี้จึงรันซ้ำได้
    insert into public.options (group_id, name, price_delta_satang, is_default, sort_order)
    select g_size, v.name, v.delta, v.is_def, v.ord
      from (values
              ('แก้วเล็ก (S)',     0, false, 1),
              ('แก้วกลาง (M)',   500, true,  2),
              ('แก้วใหญ่ (L)',  1000, false, 3)
           ) as v(name, delta, is_def, ord)
     where not exists (
       select 1 from public.options o
        where o.group_id = g_size and o.name = v.name
     );

    /* บังคับราคาให้ตรงกับที่ประกาศไว้ทุกครั้งที่รัน — ห้ามลบบล็อกนี้

       insert ด้านบนมี "where not exists" กันแถวซ้ำ พอรันรอบสองแถวมีอยู่แล้ว
       มันจะถูกข้ามทั้งก้อน การแก้ตัวเลขใน values เฉย ๆ จึงไม่มีผลอะไรเลย
       (เจอตอนแก้ราคารอบสองจริง ๆ ไม่ใช่ปัญหาสมมติ)

       ตัวเลขสองชุดต้องตรงกันเสมอ ถ้าแก้ราคาให้แก้ทั้งบนและล่าง */
    update public.options o
       set price_delta_satang = v.delta,
           sort_order         = v.ord
      from (values
              ('แก้วเล็ก (S)',     0, 1),
              ('แก้วกลาง (M)',   500, 2),
              ('แก้วใหญ่ (L)',  1000, 3)
           ) as v(name, delta, ord)
     where o.group_id = g_size and o.name = v.name;

    -- รันซ้ำ: ถ้าเคยถูกปิดไว้ด้วยมือ ให้กลับมาใช้งานได้และคุมค่า default ให้เหลือตัวเดียว
    update public.options
       set is_active = true
     where group_id = g_size
       and name in ('แก้วเล็ก (S)', 'แก้วกลาง (M)', 'แก้วใหญ่ (L)');

    update public.options
       set is_default = (name = 'แก้วกลาง (M)')
     where group_id = g_size and is_active;

    -- ขนาดยังต้องเลือกหนึ่งอย่างเสมอ ไม่เปลี่ยน
    update public.option_groups
       set min_select = 1, max_select = 1
     where id = g_size;

    raise notice 'ขนาด: เปลี่ยนเป็นขนาดแก้ว เล็ก/กลาง/ใหญ่ แล้ว (ปกติ/พิเศษ ถูกปิด ประวัติยังอยู่ครบ)';
  end if;

  -- ---------- 2) ท็อปปิ้งไม่จำกัดจำนวน ----------
  select id into g_top
    from public.option_groups
   where product_id is null and name = 'ท็อปปิ้ง';

  if g_top is null then
    raise notice 'ไม่พบกลุ่ม "ท็อปปิ้ง" — ข้ามส่วนนี้';
  else
    /* 99 = "ไม่จำกัด" ในทางปฏิบัติ
       สคีมาไม่มีค่าพิเศษสำหรับ unlimited (max_select เป็น integer not null)
       และตั้งเป็นจำนวนท็อปปิ้งปัจจุบันไม่ได้ เพราะพอร้านเพิ่มรายการใหม่
       เพดานจะค้างที่ตัวเลขเก่าแล้วกลายเป็นจำกัดอีกโดยไม่มีใครรู้
       ฝั่งหน้าเว็บไม่โชว์เลข 99 ให้ผู้ใช้เห็น — เขียนว่า "เลือกกี่อย่างก็ได้" แทน
       (ดู CoffeePage.jsx ตรงป้ายบอกกติกาของแต่ละกลุ่ม) */
    update public.option_groups
       set min_select = 0, max_select = 99
     where id = g_top;

    select count(*) into n_top
      from public.options
     where group_id = g_top and is_active;

    raise notice 'ท็อปปิ้ง: ปลดเพดานแล้ว เลือกได้ทั้ง % รายการพร้อมกัน', n_top;
  end if;
end $$;

-- ============================================================
-- ตรวจผล
-- ============================================================
select g.name                                as กลุ่ม,
       g.min_select                          as เลือกอย่างน้อย,
       g.max_select                          as เลือกได้มากสุด,
       string_agg(o.name || ' (' || round(o.price_delta_satang / 100.0, 2) || ')',
                  ', ' order by o.sort_order) as ตัวเลือกที่เปิดใช้
  from public.option_groups g
  join public.options o on o.group_id = g.id and o.is_active
 where g.product_id is null
   and g.name in ('ขนาด', 'ท็อปปิ้ง')
 group by g.id, g.name, g.min_select, g.max_select
 order by g.name;
