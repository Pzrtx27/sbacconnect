-- ============================================================================
-- RUN_51_TO_53.sql  —  migration 51 ถึง 53 รวมไว้ในไฟล์เดียว วางรวดเดียวจบ
--
-- สร้างโดยต่อไฟล์ต้นฉบับเข้าด้วยกันตามลำดับ ไม่ได้แก้เนื้อใน SQL แม้แต่ตัวเดียว
--
-- ในไฟล์นี้มีอะไรบ้าง
-- -------------------
--   51) เมนูเครื่องดื่มได้ตัวเลือกครบเองโดยไม่ต้องกลับมารัน SQL
--   52) เลือกครูสอนแทนจากรายชื่อบัญชีจริง + ปิดช่องรายชื่อครูรั่ว
--   53) หน้าผู้ดูแลระบบ: บัญชีผู้ใช้ เงื่อนไขของระบบ และปูมการแก้ไข
--
-- ต้องรันไฟล์ 01 ถึง 50 มาก่อนแล้ว (โดยเฉพาะ 11_menu_options, 22_leave_requests,
-- 31_substitutions ซึ่งสามไฟล์นี้อ้างถึงโดยตรง)
--
-- ทุกส่วนเขียนแบบ idempotent รันซ้ำได้ไม่พัง
--
-- วิธีรัน: Supabase Dashboard > SQL Editor > วางทั้งไฟล์ > Run
-- SQL Editor แสดงผลเฉพาะคำสั่งสุดท้าย จึงจะเห็นตารางตรวจผลของไฟล์ 53
-- ถ้าอยากดูผลตรวจของ 51 กับ 52 ให้รันทีละไฟล์แทน
-- ============================================================================



-- ###########################################################################
-- ###  เริ่มไฟล์: 51_drink_options_self_healing.sql
-- ###########################################################################

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


-- ###########################################################################
-- ###  เริ่มไฟล์: 52_substitute_picker.sql
-- ###########################################################################

-- ============================================================
-- 52_substitute_picker.sql
--   เลือกครูสอนแทนจากรายชื่อบัญชีจริง แทนการพิมพ์ชื่อเอง
--
-- ปัญหาที่แก้
-- ------------
-- หน้าวิชาการให้ "พิมพ์ชื่อครูสอนแทน" เป็นข้อความอิสระ
-- พิมพ์ผิดหนึ่งตัวอักษรแล้วไม่มีอะไรทัก — TeacherHome หาคาบสอนแทนของตัวเอง
-- ด้วยการเทียบชื่อแบบข้อความ (looksLikeSameTeacher) ครูที่ถูกสั่งสอนแทน
-- จึงไม่เห็นคาบนั้นเลย และไม่มีใครรู้จนกว่าจะมีคนไม่มาสอน
--
-- ขอบเขตของไฟล์นี้ (ทำครึ่งแรกก่อนตามที่ตกลง)
-- ------------------------------------------------
-- ทำ:     เลือกจากรายชื่อบัญชีครูจริง + คัดครูที่บันทึกวันลาไว้ออกจากรายการ
-- ยังไม่ทำ: คัดครูที่ "ติดสอนห้องอื่นอยู่แล้ว" ออก
--
-- เหตุผลที่ยังทำไม่ได้: ตารางสอนประจำภาคอ่านจาก Google Sheet และเก็บชื่อครู
-- เป็นข้อความ ไม่ได้ผูกกับ id บัญชี ระบบจึงไม่มีทางรู้แน่ชัดว่าคาบนี้ใครสอนอยู่
-- ถ้าจะให้คัดกรองได้จริงต้องย้ายตารางสอนเข้า Supabase ก่อน (งานคนละก้อน)
-- ระหว่างนี้หน้าเว็บจะเขียนกำกับไว้ตรง ๆ ว่ากรองอะไรให้แล้วและยังไม่ได้กรองอะไร
--
-- รันซ้ำได้ / ต้องรันหลัง 31_substitutions.sql และ 22_leave_requests.sql
-- ============================================================

begin;

-- ============================================================
-- 1) ปิดช่องรายชื่อครูรั่ว
-- ============================================================
/* list_teachers() กับ list_classrooms_with_homeroom() ใน 22_leave_requests.sql
   เป็น security definer และ grant ให้ authenticated แต่ "ไม่มีการเช็คสิทธิ์ในตัวฟังก์ชันเลย"
   ทั้งที่คอมเมนต์เหนือฟังก์ชันเขียนไว้ว่า "role academic/sysadmin เท่านั้น"
   และคอมเมนต์ใต้ grant ยังเขียนว่า "เช็คซ้ำในฟังก์ชันเองก็จริง"

   ผลจริง: นักเรียนที่ล็อกอินคนไหนก็ยิง rpc สองตัวนี้ได้ ได้รายชื่อครูทั้งวิทยาลัย
   พร้อม user id (uuid) และรายชื่อห้องพร้อมครูประจำชั้นครบทุกห้อง
   uuid ที่หลุดไปคือคีย์ที่ตารางอื่นใช้อ้างถึงคน จึงไม่ควรแจกฟรี

   ไฟล์นี้เติมเช็คให้ตรงกับที่คอมเมนต์อ้างไว้ */

-- ครู/วิชาการ/แอดมิน = บุคลากร ใช้แยกจาก "นักเรียน" ที่ไม่ควรเห็นข้อมูลบุคลากร
create or replace function public.app_is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select app_has_role('teacher') or app_has_role('academic') or app_has_role('sysadmin');
$$;

grant execute on function public.app_is_staff() to authenticated;
revoke all on function public.app_is_staff() from anon;

/* list_teachers ต้องเปิดถึง role teacher ด้วย ไม่ใช่แค่วิชาการ
   เพราะ SubjectManager ในสมุดคะแนน (TeacherGradebookPanel) เรียกตัวนี้
   และหน้านั้นเปิดให้ครูใช้จาก TeacherHome ถ้ารัดแค่ academic ครูจะใช้ไม่ได้ทันที */
create or replace function public.list_teachers()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not app_is_staff() then
    raise exception 'FORBIDDEN' using hint = 'เฉพาะบุคลากรเท่านั้น';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'full_name', u.full_name)
                     order by u.full_name)
      from public.users u
      join public.user_roles ur on ur.user_id = u.id and ur.role = 'teacher'
     where u.is_active
  ), '[]'::jsonb);
end;
$$;

-- ห้องเรียนพร้อมครูประจำชั้น ใช้เฉพาะหน้าวิชาการ จึงรัดแคบกว่า
create or replace function public.list_classrooms_with_homeroom()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not app_is_academic_staff() then
    raise exception 'FORBIDDEN' using hint = 'เฉพาะฝ่ายวิชาการและผู้ดูแลระบบ';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', cr.id,
             'label', cr.level || ' ห้อง ' || cr.room_no,
             'homeroom_teacher_id', cr.homeroom_teacher_id,
             'homeroom_teacher_name', t.full_name
           ) order by cr.level, cr.room_no)
      from public.class_rooms cr
      left join public.users t on t.id = cr.homeroom_teacher_id
  ), '[]'::jsonb);
end;
$$;

-- ============================================================
-- 2) ช่วงเวลาที่ครูไม่พร้อมสอน
-- ============================================================
/* แยกจาก leave_requests ตั้งใจ — ตารางนั้นเป็นใบลา "ของนักเรียน"
   (submit_leave_request ตอบ STUDENT_ONLY ถ้าคนยื่นไม่มีแถวใน student_profiles)
   และมีขั้นตอนอนุมัติสองชั้นที่ไม่เกี่ยวกับเรื่องนี้

   ตารางนี้ตอบคำถามเดียว: "วันนี้คาบนี้ ครูคนนี้ว่างไหม"
   จึงไม่เก็บเหตุผลหรือเอกสารส่วนตัวของครู เก็บแค่ช่วงเวลา */
create table if not exists public.teacher_absences (
  id              uuid        primary key default gen_random_uuid(),
  teacher_user_id uuid        not null references public.users(id) on delete cascade,

  start_date      date        not null,
  end_date        date        not null,

  -- ช่วงคาบที่ไม่พร้อมสอนในแต่ละวันของช่วงวันที่นี้
  -- ลาทั้งวัน = 1 ถึง 12 / ลาครึ่งเช้า = 1 ถึง 4 แล้วแต่ตารางคาบของวิทยาลัย
  first_period    smallint    not null default 1  check (first_period between 1 and 12),
  last_period     smallint    not null default 12 check (last_period  between 1 and 12),

  note            text        not null default '',

  -- default ไว้เพื่อให้หน้าเว็บ insert ได้โดยไม่ต้องรู้ users.id ของตัวเอง
  -- (หน้าเว็บถือแต่ auth uid ซึ่งคนละคีย์กับ users.id)
  created_by      uuid        default app_current_user_id()
                                references public.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint teacher_absences_date_order   check (end_date >= start_date),
  constraint teacher_absences_period_order check (last_period >= first_period)
);

create index if not exists teacher_absences_lookup
  on public.teacher_absences (teacher_user_id, start_date, end_date);

comment on table public.teacher_absences is
  'ช่วงเวลาที่ครูไม่พร้อมสอน — ใช้คัดครูออกจากรายการสอนแทน ไม่ใช่ใบลาและไม่มีขั้นอนุมัติ';

alter table public.teacher_absences enable row level security;

drop policy if exists teacher_absences_read on public.teacher_absences;
create policy teacher_absences_read on public.teacher_absences
  for select to authenticated
  using (app_is_academic_staff() or teacher_user_id = app_current_user_id());

drop policy if exists teacher_absences_write on public.teacher_absences;
create policy teacher_absences_write on public.teacher_absences
  for all to authenticated
  using (app_is_academic_staff()) with check (app_is_academic_staff());

grant select, insert, update, delete on public.teacher_absences to authenticated;
revoke all on public.teacher_absences from anon;

-- ============================================================
-- 3) ผูกการสอนแทนกับบัญชีครูจริง
-- ============================================================
/* เพิ่มคอลัมน์ใหม่แทนการแก้ substitute_teacher เดิมให้เป็น uuid
   เพราะ substitute_teacher (ข้อความ) ถูกอ่านอยู่ 8 ที่ทั่วแอป
   ทั้งตารางนักเรียน หน้าครู ผู้ช่วย AI และประวัติสอนแทนย้อนหลัง
   ถ้าเปลี่ยนชนิดคอลัมน์ ของเก่าทั้งหมดพังพร้อมกันและประวัติอ่านไม่ออก

   ของใหม่เขียนทั้งสองช่อง: id ไว้ให้ระบบใช้ ชื่อไว้ให้คนอ่านและให้โค้ดเดิมทำงานต่อได้
   ชื่อที่คัดลอกไว้ยังทำให้ประวัติเก่าอ่านรู้เรื่องแม้ครูคนนั้นจะลาออกไปแล้ว */
alter table public.substitutions
  add column if not exists substitute_teacher_id uuid references public.users(id) on delete set null;

comment on column public.substitutions.substitute_teacher_id is
  'บัญชีครูสอนแทน — null ได้สำหรับแถวเก่าที่บันทึกไว้ตอนยังพิมพ์ชื่อเอง';

-- ============================================================
-- 4) รายชื่อครูที่เลือกเป็นครูสอนแทนได้
-- ============================================================
/* คัดออกเฉพาะครูที่มีช่วงลาคาบทับกับคาบที่กำลังจัด
   ยังไม่ได้คัดครูที่ติดสอนห้องอื่น — ดูเหตุผลที่หัวไฟล์
   หน้าเว็บต้องเขียนกำกับให้ผู้ใช้รู้ ไม่ใช่ปล่อยให้เข้าใจว่ากรองครบแล้ว */
create or replace function public.available_substitute_teachers(
  p_date   date,
  p_period integer
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not app_is_academic_staff() then
    raise exception 'FORBIDDEN' using hint = 'เฉพาะฝ่ายวิชาการและผู้ดูแลระบบ';
  end if;

  if p_date is null or p_period is null or p_period not between 1 and 12 then
    raise exception 'INVALID_SLOT' using hint = 'ต้องระบุวันที่และคาบ 1–12';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'user_id',      u.id,
             'full_name',    u.full_name,
             'teacher_code', coalesce(tp.teacher_code, ''),
             'department',   coalesce(tp.department, '')
           ) order by u.full_name)
      from public.users u
      join public.user_roles ur on ur.user_id = u.id and ur.role = 'teacher'
      left join public.teacher_profiles tp on tp.user_id = u.id
     where u.is_active
       and not exists (
         select 1
           from public.teacher_absences a
          where a.teacher_user_id = u.id
            and p_date between a.start_date and a.end_date
            and p_period between a.first_period and a.last_period
       )
  ), '[]'::jsonb);
end;
$$;

comment on function public.available_substitute_teachers(date, integer) is
  'ครูที่เลือกเป็นครูสอนแทนได้ในวันและคาบที่ระบุ — คัดเฉพาะคนที่บันทึกช่วงลาไว้ ยังไม่คัดคนที่ติดสอนห้องอื่น';

revoke all on function public.available_substitute_teachers(date, integer) from public, anon;
grant execute on function public.available_substitute_teachers(date, integer) to authenticated;

commit;

-- ============================================================
-- ตรวจผล
-- ============================================================
select 'ตาราง teacher_absences'          as รายการ,
       to_char(count(*), 'FM999999')      as ผล
  from public.teacher_absences
union all
select 'คอลัมน์ substitute_teacher_id',
       case when exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'substitutions'
            and column_name = 'substitute_teacher_id'
       ) then 'มีแล้ว' else 'ยังไม่มี — ตรวจ error ด้านบน' end
union all
select 'list_teachers มีเช็คสิทธิ์',
       case when (select prosrc from pg_proc where proname = 'list_teachers'
                   and pronamespace = 'public'::regnamespace) like '%app_is_staff%'
            then 'ปิดช่องแล้ว' else 'ยังเปิดอยู่ — ตรวจ error ด้านบน' end
union all
select 'ครูที่เลือกได้วันนี้ คาบ 1',
       to_char(jsonb_array_length(
         public.available_substitute_teachers((now() at time zone 'Asia/Bangkok')::date, 1)
       ), 'FM999999') || ' คน';


-- ###########################################################################
-- ###  เริ่มไฟล์: 53_admin_console.sql
-- ###########################################################################

-- ============================================================
-- 53_admin_console.sql — หน้า Admin: บัญชีผู้ใช้ และเงื่อนไขของระบบ
--
-- ที่มา
-- -----
-- โรงเรียนต้องแก้เงื่อนไขเองได้โดยไม่ต้องกลับมาแก้โค้ดแล้ว deploy ใหม่
-- ตัวอย่างที่ขอมาตรง ๆ คือ "วันนี้กติกาคือลาเกิน 5 วันต้องแนบใบลา
-- พรุ่งนี้อาจเปลี่ยนเป็น 3 วันหรือ 7 วัน" ซึ่งตอนนี้ฝังอยู่ในไฟล์ js
--
-- โครงของไฟล์นี้
-- --------------
--   1) school_settings — ตารางแถวเดียว เก็บเงื่อนไขที่ Admin แก้ได้
--   2) admin_audit     — ปูมว่าใครเปลี่ยนอะไรเมื่อไร
--   3) RPC จัดการบัญชี — ดูรายชื่อ / แก้ข้อมูล / ระงับ / เปิดใช้งาน
--
-- สิ่งที่ไฟล์นี้ "ไม่" ทำ: สร้างหรือลบบัญชีเข้าสู่ระบบ (auth.users)
--   งานนั้นต้องใช้ service_role key ซึ่งห้ามอยู่ในโค้ดฝั่งเบราว์เซอร์เด็ดขาด
--   (ตัวแปร VITE_* ถูกฝังลงไฟล์ js ที่ใครเปิด devtools ก็อ่านได้
--    และ service_role ข้าม RLS ได้ทุกข้อ = เปิดฐานข้อมูลทั้งก้อนให้สาธารณะ)
--   การระงับบัญชีในไฟล์นี้ใช้วิธีปิดธง users.is_active ซึ่งพอสำหรับตัดสิทธิ์
--   เพราะ AuthContext ปฏิเสธโปรไฟล์ที่ is_active = false ตั้งแต่ตอนโหลด
--
-- รันซ้ำได้ / ต้องรันหลัง 22_leave_requests.sql
-- ============================================================

begin;

-- ============================================================
-- 1) เงื่อนไขของระบบ
-- ============================================================
create table if not exists public.school_settings (
  -- primary key ที่บังคับให้เป็น true เสมอ = มีได้แถวเดียวตลอดกาล
  -- ง่ายและกันพลาดกว่าการใช้ id ปกติแล้วมาเขียน trigger ห้ามเพิ่มแถวที่สอง
  id                          boolean     primary key default true check (id),

  school_name                 text        not null default 'SBAC CONNECT'
                                check (length(btrim(school_name)) between 1 and 100),

  -- ลา "เกิน" กี่วันถึงต้องแนบเอกสาร (เกิน = มากกว่า ไม่ใช่ตั้งแต่)
  -- 0 = ต้องแนบทุกใบ / 365 = ไม่ต้องแนบเลยในทางปฏิบัติ
  leave_attachment_after_days integer     not null default 5
                                check (leave_attachment_after_days between 0 and 365),

  -- true = นับวันปฏิทิน (เสาร์อาทิตย์นับด้วย) ตรงกับที่หน้าเว็บทำอยู่ตอนนี้
  leave_count_weekends        boolean     not null default true,

  /* กันสองคนกดบันทึกทับกัน — ฝั่งเว็บส่งเลขเวอร์ชันที่ตัวเองอ่านมาด้วย
     ถ้าไม่ตรงแปลว่ามีคนแก้ไปก่อนแล้ว ต้องโหลดใหม่ก่อนบันทึก
     ไม่งั้นคนที่กดทีหลังจะลบการแก้ของคนแรกทิ้งโดยไม่มีใครรู้ */
  version                     integer     not null default 1,
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid        references public.users(id) on delete set null
);

insert into public.school_settings (id) values (true)
on conflict (id) do nothing;

alter table public.school_settings enable row level security;

/* อ่านได้ทุกคนที่ล็อกอิน เพราะหน้าฟอร์มใบลาของนักเรียนต้องรู้ว่ากติกากี่วัน
   ไม่มีอะไรเป็นความลับในตารางนี้ มีแต่กติกาที่ประกาศให้ทุกคนรู้อยู่แล้ว */
drop policy if exists school_settings_read on public.school_settings;
create policy school_settings_read on public.school_settings
  for select to authenticated using (true);

-- เขียนผ่าน RPC เท่านั้น ไม่เปิด policy เขียนตรงให้ใคร
grant select on public.school_settings to authenticated;
revoke insert, update, delete on public.school_settings from authenticated;
revoke all on public.school_settings from anon;

-- ============================================================
-- 2) ปูมการเปลี่ยนแปลง
-- ============================================================
create table if not exists public.admin_audit (
  id         bigint generated always as identity primary key,
  actor_id   uuid        references public.users(id) on delete set null,
  action     text        not null,
  target     text        not null default '',
  details    jsonb       not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_recent on public.admin_audit (id desc);

comment on table public.admin_audit is
  'ปูมการกระทำของผู้ดูแลระบบ — เขียนจากในฟังก์ชันเท่านั้น ไม่มี policy เขียนตรง';

alter table public.admin_audit enable row level security;

drop policy if exists admin_audit_read on public.admin_audit;
create policy admin_audit_read on public.admin_audit
  for select to authenticated using (app_has_role('sysadmin'));

grant select on public.admin_audit to authenticated;
revoke insert, update, delete on public.admin_audit from authenticated;
revoke all on public.admin_audit from anon;

-- ============================================================
-- 3) บันทึกเงื่อนไขใหม่
-- ============================================================
create or replace function public.admin_save_settings(
  p_school_name   text,
  p_after_days    integer,
  p_count_weekends boolean,
  p_version       integer
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me      uuid := app_current_user_id();
  v_updated integer;
begin
  if not app_has_role('sysadmin') then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if length(btrim(coalesce(p_school_name, ''))) not between 1 and 100 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_NAME');
  end if;

  if p_after_days is null or p_after_days not between 0 and 365 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DAYS');
  end if;

  update public.school_settings
     set school_name                 = btrim(p_school_name),
         leave_attachment_after_days = p_after_days,
         leave_count_weekends        = coalesce(p_count_weekends, true),
         version                     = version + 1,
         updated_at                  = now(),
         updated_by                  = v_me
   where id = true
     and version = p_version;

  get diagnostics v_updated = row_count;

  -- 0 แถว = เลขเวอร์ชันไม่ตรง แปลว่ามีคนแก้ไปก่อนหน้านี้แล้ว
  if v_updated = 0 then
    return jsonb_build_object('ok', false, 'error', 'STALE_VERSION');
  end if;

  insert into public.admin_audit (actor_id, action, target, details)
  values (v_me, 'SAVE_SETTINGS', 'school_settings',
          jsonb_build_object('after_days', p_after_days,
                             'count_weekends', p_count_weekends,
                             'school_name', btrim(p_school_name)));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_save_settings(text, integer, boolean, integer) from public, anon;
grant execute on function public.admin_save_settings(text, integer, boolean, integer) to authenticated;

-- ============================================================
-- 4) รายชื่อบัญชีทั้งหมด
-- ============================================================
create or replace function public.admin_list_users()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not app_has_role('sysadmin') then
    raise exception 'FORBIDDEN' using hint = 'เฉพาะผู้ดูแลระบบ';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',          u.id,
             'full_name',   u.full_name,
             'email',       u.email,
             'is_active',   u.is_active,
             'has_login',   u.auth_uid is not null,
             'roles',       coalesce(r.roles, array[]::text[]),
             'code',        coalesce(sp.student_code, tp.teacher_code, ''),
             'class_room_id', sp.class_room_id,
             'class_label', case when cr.id is null then ''
                                 else cr.level || '/' || cr.room_no end,
             'department',  coalesce(tp.department, '')
           ) order by u.full_name)
      from public.users u
      left join lateral (
        select array_agg(ur.role::text order by ur.role) as roles
          from public.user_roles ur where ur.user_id = u.id
      ) r on true
      left join public.student_profiles sp on sp.user_id = u.id
      left join public.teacher_profiles tp on tp.user_id = u.id
      left join public.class_rooms     cr on cr.id = sp.class_room_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- ============================================================
-- 5) แก้ข้อมูล / ระงับ / เปิดใช้งานบัญชี
-- ============================================================
create or replace function public.admin_change_account(
  p_id         uuid,
  p_action     text,
  p_full_name  text    default null,
  p_class_room bigint  default null,
  p_department text    default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me     uuid := app_current_user_id();
  v_target public.users%rowtype;
  v_roles  text[];
begin
  if not app_has_role('sysadmin') then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  -- for update: จองแถวไว้ กันสอง Admin กดพร้อมกันแล้วผลลัพธ์ปนกัน
  select * into v_target from public.users where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  -- ห้ามแก้บัญชีตัวเอง — กัน Admin ระงับตัวเองจนไม่มีใครเข้าระบบได้อีก
  if p_id = v_me then
    return jsonb_build_object('ok', false, 'error', 'SELF');
  end if;

  select array_agg(role::text) into v_roles from public.user_roles where user_id = p_id;
  v_roles := coalesce(v_roles, array[]::text[]);

  /* จัดการได้เฉพาะบัญชีครูและนักเรียน
     บัญชีเจ้าหน้าที่ (academic / sysadmin / cashier / pos) ต้องแก้จาก Supabase โดยตรง
     เพื่อไม่ให้หน้าเว็บกลายเป็นช่องยึดระบบถ้าบัญชี Admin หลุดไปสักบัญชี */
  if v_roles = array[]::text[] or exists (
    select 1 from unnest(v_roles) as role where role not in ('teacher', 'student')
  ) then
    return jsonb_build_object('ok', false, 'error', 'STAFF_ACCOUNT');
  end if;

  if p_action = 'edit' then
    if length(btrim(coalesce(p_full_name, ''))) not between 1 and 150 then
      return jsonb_build_object('ok', false, 'error', 'INVALID_NAME');
    end if;

    update public.users set full_name = btrim(p_full_name) where id = p_id;

    -- นักเรียนต้องมีห้องเสมอ ไม่งั้นใบลาไม่รู้จะส่งให้ครูประจำชั้นคนไหน
    if exists (select 1 from public.student_profiles where user_id = p_id) then
      if not exists (select 1 from public.class_rooms where id = p_class_room) then
        return jsonb_build_object('ok', false, 'error', 'INVALID_CLASSROOM');
      end if;
      update public.student_profiles set class_room_id = p_class_room where user_id = p_id;
    end if;

    if exists (select 1 from public.teacher_profiles where user_id = p_id) then
      update public.teacher_profiles
         set department = nullif(btrim(coalesce(p_department, '')), '')
       where user_id = p_id;
    end if;

  elsif p_action = 'suspend' then
    /* ครูที่ยังผูกงานค้างอยู่ ระงับไม่ได้จนกว่าจะย้ายงานออกก่อน
       ไม่งั้นห้องเรียนจะเหลือครูประจำชั้นที่เข้าระบบไม่ได้ ใบลาค้างไม่มีคนอนุมัติ
       และคาบสอนแทนข้างหน้าจะชี้ไปหาคนที่ไม่มีสิทธิ์เข้าแล้ว */
    if exists (select 1 from public.class_rooms where homeroom_teacher_id = p_id) then
      return jsonb_build_object('ok', false, 'error', 'IS_HOMEROOM');
    end if;
    if exists (
      select 1 from public.substitutions
       where substitute_teacher_id = p_id
         and sub_date >= (now() at time zone 'Asia/Bangkok')::date
    ) then
      return jsonb_build_object('ok', false, 'error', 'HAS_SUBSTITUTION');
    end if;

    update public.users set is_active = false where id = p_id;

  elsif p_action = 'activate' then
    update public.users set is_active = true where id = p_id;

  else
    return jsonb_build_object('ok', false, 'error', 'INVALID_ACTION');
  end if;

  insert into public.admin_audit (actor_id, action, target, details)
  values (v_me, upper(p_action) || '_ACCOUNT', p_id::text,
          jsonb_build_object('name', v_target.full_name,
                             'was_active', v_target.is_active));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_change_account(uuid, text, text, bigint, text) from public, anon;
grant execute on function public.admin_change_account(uuid, text, text, bigint, text) to authenticated;

-- ============================================================
-- 6) เพิ่มห้องเรียน
-- ============================================================
create or replace function public.admin_add_classroom(p_level text, p_room text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id bigint;
begin
  if not app_has_role('sysadmin') then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if coalesce(btrim(p_level), '') = '' or coalesce(btrim(p_room), '') !~ '^[1-9][0-9]{0,2}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ROOM');
  end if;

  insert into public.class_rooms (level, room_no)
  values (btrim(p_level), btrim(p_room))
  on conflict (level, room_no) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE');
  end if;

  insert into public.admin_audit (actor_id, action, target)
  values (app_current_user_id(), 'ADD_CLASSROOM', btrim(p_level) || '/' || btrim(p_room));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.admin_add_classroom(text, text) from public, anon;
grant execute on function public.admin_add_classroom(text, text) to authenticated;

commit;

-- ============================================================
-- ตรวจผล
-- ============================================================
select 'เงื่อนไขปัจจุบัน' as รายการ,
       school_name || ' · ลาเกิน ' || leave_attachment_after_days || ' วันต้องแนบเอกสาร'
         || ' · เวอร์ชัน ' || version as ค่า
  from public.school_settings
union all
select 'จำนวนบัญชีทั้งหมด', to_char(count(*), 'FM999999') || ' บัญชี' from public.users
union all
select 'ฟังก์ชันที่ติดตั้งแล้ว',
       string_agg(proname, ', ' order by proname)
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('admin_list_users', 'admin_change_account',
                   'admin_save_settings', 'admin_add_classroom');
