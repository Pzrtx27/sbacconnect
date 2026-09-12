-- ============================================================
-- 43_student_fees.sql — ค่าเทอม/ค่าธรรมเนียมค้างชำระ + จ่ายด้วย QR พร้อมเพย์
--
-- ของเดิมในหน้านักเรียน (StudentHome.jsx โมดัล "รายการค้างชำระ") เขียนตายตัวว่า
-- 0 THB และ "ชำระแล้ว" ทั้งสามบรรทัด ไม่ว่านักเรียนคนนั้นจะค้างจริงหรือไม่
-- ค้างจริงก็ไม่มีใครรู้ ชำระแล้วก็ไม่มีหลักฐานในระบบ
--
-- เส้นทางของเงินหนึ่งรายการ:
--   การเงินออกบิล (upsert_student_fee / create_class_fees)  -> unpaid  + แจ้งเตือนนักเรียน
--   นักเรียนสแกน QR พร้อมเพย์แล้วกด "แจ้งชำระเงินแล้ว"        -> pending + แจ้งเตือนการเงิน
--   การเงินเช็คเงินเข้าบัญชีแล้วยืนยัน (set_fee_status)        -> paid    + แจ้งเตือนนักเรียน
--
-- QR สร้างที่ฝั่งหน้าเว็บด้วย src/utils/promptpay.js (มาตรฐาน EMVCo ของ ธปท.)
-- ไม่ได้เก็บเลขบัญชีไว้ในฐานข้อมูล และไม่มีการตัดเงินอัตโนมัติ — ระบบนี้ทำหน้าที่
-- "บันทึกว่าใครค้างเท่าไหร่ และใครแจ้งโอนแล้ว" เท่านั้น การยืนยันยังเป็นคนตรวจ
-- (แนวทางเดียวกับคำขอเติมเงินใน 18_topup_requests.sql)
--
-- รันซ้ำได้ / ต้องรัน 01_schema.sql, 02_functions.sql, 18_topup_requests.sql
-- (ฟังก์ชัน app_is_finance_staff) และ 20_behavior_and_notifications.sql มาก่อน
-- ============================================================

-- ============================================================
-- 1) ตารางรายการค่าธรรมเนียม
-- ============================================================
create table if not exists public.student_fees (
  id              bigint generated always as identity primary key,

  student_user_id uuid    not null references public.users(id) on delete cascade,

  title           text    not null,                 -- 'ค่าเทอม' / 'ค่าอุปกรณ์การเรียน' ...
  term            text    not null default '1/2569',
  amount_satang   integer not null check (amount_satang > 0),
  due_date        date,

  -- unpaid  = ยังไม่จ่าย
  -- pending = นักเรียนแจ้งว่าโอนแล้ว รอการเงินตรวจเงินเข้าบัญชี
  -- paid    = การเงินยืนยันแล้ว
  -- waived  = ยกเว้น/ทุน ไม่ต้องจ่าย
  status          text    not null default 'unpaid'
                    check (status in ('unpaid', 'pending', 'paid', 'waived')),

  note            text,

  created_by      uuid references public.users(id),
  reported_at     timestamptz,                      -- นักเรียนกดแจ้งโอนเมื่อไหร่
  paid_at         timestamptz,
  confirmed_by    uuid references public.users(id),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint student_fees_title_not_blank check (char_length(trim(title)) > 0),

  -- หนึ่งคน หนึ่งเทอม ห้ามมีบิลชื่อซ้ำ — กันออกบิลซ้ำเวลารันสคริปต์ออกบิลทั้งห้องสองรอบ
  unique (student_user_id, term, title)
);

create index if not exists student_fees_student_status_idx
  on public.student_fees (student_user_id, status);
create index if not exists student_fees_status_idx
  on public.student_fees (status) where status in ('unpaid', 'pending');

comment on table public.student_fees is
  'ค่าเทอม/ค่าธรรมเนียมรายคน — เขียนได้ทางเดียวผ่าน RPC security definer นักเรียนอ่านได้เฉพาะของตัวเอง การเงินอ่านได้ทั้งหมด';
comment on column public.student_fees.status is
  'unpaid = ยังไม่จ่าย / pending = นักเรียนแจ้งโอนแล้วรอตรวจ / paid = การเงินยืนยันแล้ว / waived = ยกเว้น';

alter table public.student_fees enable row level security;

-- อ่านอย่างเดียว: ของตัวเอง หรือเป็นการเงิน — การเขียนทุกทางผ่าน RPC ด้านล่างเท่านั้น
-- (เปิด select ให้นักเรียนไว้ด้วย เพื่อให้ Supabase Realtime ส่ง payload ของแถวตัวเองได้)
drop policy if exists student_fees_read on public.student_fees;
create policy student_fees_read on public.student_fees
  for select
  to authenticated
  using (student_user_id = app_current_user_id() or app_is_finance_staff());

grant select on public.student_fees to authenticated;
revoke insert, update, delete on public.student_fees from authenticated;
revoke all on public.student_fees from anon;

-- ============================================================
-- 1.5) ใครออกบิล/ยืนยันการชำระได้
--
-- ฝ่ายการเงิน (cashier/sysadmin) ตามปกติ บวกกรณี "ไม่มี JWT เลย"
-- ซึ่งแปลว่ารันจาก SQL Editor หรือ service role — สิทธิ์ระดับฐานข้อมูลที่ทำอะไรก็ได้
-- อยู่แล้วตั้งแต่ต้น เปิดไว้เพื่อให้การออกบิลจาก SQL Editor ยังส่งแจ้งเตือนหานักเรียนได้
-- แทนที่จะต้องไป insert ตาราง student_fees ตรง ๆ แบบเงียบ ๆ ซึ่งนักเรียนจะไม่รู้เรื่องเลย
--
-- ฝั่งเว็บเข้าช่องนี้ไม่ได้: anon ถูก revoke execute ทุกฟังก์ชันในไฟล์นี้
-- ส่วนคนที่ล็อกอินจริงย่อมมี auth.uid() เสมอ จึงถูกตัดสินด้วยเงื่อนไขแรกเท่านั้น
-- ============================================================
create or replace function public.app_can_manage_fees()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_is_finance_staff() or auth.uid() is null;
$$;

comment on function public.app_can_manage_fees() is
  'true เมื่อผู้เรียกจัดการบิลค่าธรรมเนียมได้ — ฝ่ายการเงิน (cashier/sysadmin) หรือรันจาก SQL Editor/service role ที่ไม่มี JWT';

grant execute on function public.app_can_manage_fees() to authenticated;
revoke all on function public.app_can_manage_fees() from anon;

-- ============================================================
-- 2) ยอดค้างของตัวเอง — ใช้กับการ์ด "รายการค้างชำระ" และโมดัลจ่ายเงิน
-- ============================================================
create or replace function public.my_fees()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    -- "ค้างชำระ" นับ unpaid + pending: เงินที่แจ้งโอนแล้วแต่ยังไม่ถูกยืนยัน
    -- ยังไม่ถือว่าจบ ถ้านับว่าจบตั้งแต่กดแจ้ง นักเรียนจะเข้าใจผิดว่าเคลียร์แล้ว
    'outstanding_satang',
      coalesce((select sum(f.amount_satang) from public.student_fees f
                 where f.student_user_id = app_current_user_id()
                   and f.status in ('unpaid', 'pending')), 0),
    'unpaid_count',
      (select count(*) from public.student_fees f
        where f.student_user_id = app_current_user_id()
          and f.status = 'unpaid'),
    'fees',
      coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id',            f.id,
                   'title',         f.title,
                   'term',          f.term,
                   'amount_satang', f.amount_satang,
                   'due_date',      f.due_date,
                   'status',        f.status,
                   'note',          f.note,
                   'reported_at',   f.reported_at,
                   'paid_at',       f.paid_at,
                   -- เกินกำหนดชำระแล้วหรือยัง (เทียบวันที่ตามเวลาไทย)
                   'is_overdue',    f.due_date is not null
                                      and f.status in ('unpaid', 'pending')
                                      and f.due_date < (now() at time zone 'Asia/Bangkok')::date
                 )
                 -- ที่ยังไม่จ่ายขึ้นก่อนเสมอ ตามด้วยกำหนดชำระที่ใกล้ที่สุด
                 order by case f.status when 'unpaid' then 0 when 'pending' then 1 else 2 end,
                          f.due_date nulls last, f.id
               )
        from public.student_fees f
        where f.student_user_id = app_current_user_id()
      ), '[]'::jsonb)
  );
$$;

comment on function public.my_fees() is
  'รายการค่าธรรมเนียมของผู้เรียกเอง พร้อมยอดค้างรวม — ไม่รับพารามิเตอร์ จึงถามแทนคนอื่นไม่ได้';

grant execute on function public.my_fees() to authenticated;
revoke all on function public.my_fees() from anon;
revoke execute on function public.my_fees() from public;

-- ============================================================
-- 3) นักเรียนแจ้งว่าโอนแล้ว (หลังสแกน QR)
--
-- ไม่แตะยอดเงินใด ๆ ทั้งสิ้น แค่เปลี่ยนสถานะเป็น "รอตรวจ" แล้วบอกการเงิน
-- ============================================================
create or replace function public.report_fee_transfer(
  p_fee_id bigint,
  p_note   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me      uuid := app_current_user_id();
  v_fee     record;
  v_name    text;
  v_amount  text;
begin
  select * into v_fee
  from public.student_fees
  where id = p_fee_id
    and student_user_id = v_me;      -- ของคนอื่นมองไม่เห็นตั้งแต่ตรงนี้

  if v_fee.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  if v_fee.status <> 'unpaid' then
    -- กดซ้ำ/กดตอนจ่ายไปแล้ว ไม่ใช่ความผิดพลาดร้ายแรง แต่ต้องไม่ทับสถานะเดิม
    return jsonb_build_object('ok', false, 'error', 'ALREADY_' || upper(v_fee.status));
  end if;

  update public.student_fees
     set status      = 'pending',
         reported_at = now(),
         note        = coalesce(nullif(trim(p_note), ''), note),
         updated_at  = now()
   where id = p_fee_id;

  select u.full_name into v_name from public.users u where u.id = v_me;
  v_amount := to_char(v_fee.amount_satang / 100.0, 'FM999,999,990.00');

  -- แจ้งการเงินทุกคน (cashier/sysadmin) ว่ามีรายการรอตรวจเงินเข้าบัญชี
  -- distinct: คนที่มีทั้ง cashier และ sysadmin ต้องได้ใบเดียว ไม่ใช่สองใบ
  insert into public.notifications (user_id, type, title, body, data)
  select distinct ur.user_id,
         'fee_reported',
         '💸 มีนักเรียนแจ้งชำระค่าธรรมเนียม',
         coalesce(v_name, 'นักเรียน') || ' แจ้งโอน ' || v_fee.title || ' ' || v_fee.term ||
         ' จำนวน ' || v_amount || ' บาท — ตรวจเงินเข้าบัญชีแล้วกดยืนยันในระบบ',
         jsonb_build_object('fee_id', v_fee.id, 'student_user_id', v_me, 'amount_satang', v_fee.amount_satang)
  from public.user_roles ur
  where ur.role in ('cashier', 'sysadmin');

  return jsonb_build_object('ok', true, 'fee_id', v_fee.id, 'status', 'pending');
end $$;

comment on function public.report_fee_transfer(bigint, text) is
  'นักเรียนแจ้งว่าโอนค่าธรรมเนียมแล้ว — เปลี่ยนสถานะเป็น pending และแจ้งเตือนฝ่ายการเงิน ไม่มีผลกับยอดเงินใด ๆ';

grant execute on function public.report_fee_transfer(bigint, text) to authenticated;
revoke all on function public.report_fee_transfer(bigint, text) from anon;
revoke execute on function public.report_fee_transfer(bigint, text) from public;

-- ============================================================
-- 4) ฝ่ายการเงิน: ยืนยัน/ปฏิเสธ/ยกเว้น
-- ============================================================
create or replace function public.set_fee_status(
  p_fee_id bigint,
  p_status text,
  p_note   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_fee    record;
  v_amount text;
  v_title  text;
  v_body   text;
begin
  if not app_can_manage_fees() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_status not in ('unpaid', 'pending', 'paid', 'waived') then
    return jsonb_build_object('ok', false, 'error', 'BAD_STATUS');
  end if;

  select * into v_fee from public.student_fees where id = p_fee_id;

  if v_fee.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  update public.student_fees
     set status       = p_status,
         note         = coalesce(nullif(trim(p_note), ''), note),
         paid_at      = case when p_status = 'paid' then coalesce(paid_at, now()) else null end,
         confirmed_by = case when p_status in ('paid', 'waived') then app_current_user_id() else null end,
         updated_at   = now()
   where id = p_fee_id;

  v_amount := to_char(v_fee.amount_satang / 100.0, 'FM999,999,990.00');

  -- เงียบไว้ถ้าสถานะไม่ได้เปลี่ยน — กันแจ้งเตือนซ้ำเวลาการเงินกดยืนยันรอบสอง
  if p_status is distinct from v_fee.status then
    if p_status = 'paid' then
      v_title := '✅ ยืนยันการชำระเงินแล้ว';
      v_body  := v_fee.title || ' ' || v_fee.term || ' จำนวน ' || v_amount || ' บาท — ชำระครบแล้ว ขอบคุณครับ/ค่ะ';
    elsif p_status = 'waived' then
      v_title := '🎓 ได้รับการยกเว้นค่าธรรมเนียม';
      v_body  := v_fee.title || ' ' || v_fee.term || ' จำนวน ' || v_amount || ' บาท — ไม่ต้องชำระ';
    elsif p_status = 'unpaid' and v_fee.status = 'pending' then
      v_title := '⚠️ ยังตรวจไม่พบเงินเข้าบัญชี';
      v_body  := v_fee.title || ' ' || v_fee.term || ' จำนวน ' || v_amount ||
                 ' บาท — กรุณาติดต่อฝ่ายการเงินพร้อมสลิปโอนเงิน';
    else
      v_title := '📄 รายการค่าธรรมเนียมถูกปรับสถานะ';
      v_body  := v_fee.title || ' ' || v_fee.term || ' จำนวน ' || v_amount || ' บาท';
    end if;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_fee.student_user_id,
      'fee_' || p_status,
      v_title,
      v_body,
      jsonb_build_object('fee_id', v_fee.id, 'status', p_status, 'amount_satang', v_fee.amount_satang)
    );
  end if;

  return jsonb_build_object('ok', true, 'fee_id', v_fee.id, 'status', p_status);
end $$;

comment on function public.set_fee_status(bigint, text, text) is
  'ฝ่ายการเงินปรับสถานะรายการค่าธรรมเนียม (paid/unpaid/waived) พร้อมแจ้งเตือนนักเรียน — แจ้งเฉพาะตอนสถานะเปลี่ยนจริง';

grant execute on function public.set_fee_status(bigint, text, text) to authenticated;
revoke all on function public.set_fee_status(bigint, text, text) from anon;
revoke execute on function public.set_fee_status(bigint, text, text) from public;

-- ============================================================
-- 5) ฝ่ายการเงิน: ออกบิล (รายคน / ทั้งห้อง)
-- ============================================================
create or replace function public.upsert_student_fee(
  p_student_user_id uuid,
  p_title           text,
  p_amount_satang   integer,
  p_term            text default '1/2569',
  p_due_date        date default null,
  p_note            text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_fee_id  bigint;
  v_created boolean;
  v_amount  text;
begin
  if not app_can_manage_fees() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_amount_satang is null or p_amount_satang <= 0 then
    return jsonb_build_object('ok', false, 'error', 'BAD_AMOUNT');
  end if;

  if not exists (select 1 from public.student_profiles sp where sp.user_id = p_student_user_id) then
    return jsonb_build_object('ok', false, 'error', 'NOT_A_STUDENT');
  end if;

  -- เช็คก่อนว่ามีบิลใบนี้อยู่แล้วไหม แทนการใช้ on conflict + xmax
  -- เพราะต้องแยกให้ออกว่า "ออกบิลใหม่" (ต้องแจ้งเตือน) กับ "แก้ยอดบิลเดิม" (ไม่ต้อง)
  select id into v_fee_id
  from public.student_fees
  where student_user_id = p_student_user_id
    and term            = p_term
    and title           = trim(p_title);

  v_created := v_fee_id is null;

  if v_created then
    insert into public.student_fees
      (student_user_id, title, term, amount_satang, due_date, note, created_by)
    values
      (p_student_user_id, trim(p_title), p_term, p_amount_satang, p_due_date, p_note, app_current_user_id())
    returning id into v_fee_id;
  else
    update public.student_fees
       set amount_satang = p_amount_satang,
           due_date      = coalesce(p_due_date, due_date),
           note          = coalesce(nullif(trim(p_note), ''), note),
           updated_at    = now()
     where id = v_fee_id;
  end if;

  -- แจ้งเตือนเฉพาะตอนออกบิลใหม่ ไม่ใช่ตอนแก้ยอดบิลเดิม
  if v_created then
    v_amount := to_char(p_amount_satang / 100.0, 'FM999,999,990.00');

    insert into public.notifications (user_id, type, title, body, data)
    values (
      p_student_user_id,
      'fee_new',
      '💰 มีรายการค้างชำระใหม่',
      trim(p_title) || ' ' || p_term || ' จำนวน ' || v_amount || ' บาท' ||
      case when p_due_date is null then '' else ' — ครบกำหนด ' || to_char(p_due_date, 'DD/MM/') || (extract(year from p_due_date)::int + 543)::text end,
      jsonb_build_object('fee_id', v_fee_id, 'amount_satang', p_amount_satang, 'term', p_term)
    );
  end if;

  return jsonb_build_object('ok', true, 'fee_id', v_fee_id, 'created', v_created);
end $$;

comment on function public.upsert_student_fee(uuid, text, integer, text, date, text) is
  'ฝ่ายการเงินออกบิลค่าธรรมเนียมให้นักเรียนหนึ่งคน (รันซ้ำได้ — บิลชื่อเดิมของเทอมเดิมคือการแก้ยอด ไม่ใช่ออกใบใหม่)';

grant execute on function public.upsert_student_fee(uuid, text, integer, text, date, text) to authenticated;
revoke all on function public.upsert_student_fee(uuid, text, integer, text, date, text) from anon;
revoke execute on function public.upsert_student_fee(uuid, text, integer, text, date, text) from public;

-- ออกบิลทั้งห้องในคำสั่งเดียว — ค่าเทอมออกพร้อมกันทั้งห้องอยู่แล้ว
create or replace function public.create_class_fees(
  p_class_room_id bigint,
  p_title         text,
  p_amount_satang integer,
  p_term          text default '1/2569',
  p_due_date      date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r         record;
  v_result  jsonb;
  v_created int := 0;
  v_total   int := 0;
begin
  if not app_can_manage_fees() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  for r in
    select sp.user_id
    from public.student_profiles sp
    where sp.class_room_id = p_class_room_id
  loop
    v_result := public.upsert_student_fee(r.user_id, p_title, p_amount_satang, p_term, p_due_date, null);
    v_total  := v_total + 1;
    if (v_result->>'created')::boolean then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'students', v_total, 'created', v_created);
end $$;

comment on function public.create_class_fees(bigint, text, integer, text, date) is
  'ออกบิลค่าธรรมเนียมรายการเดียวกันให้นักเรียนทั้งห้อง — รันซ้ำได้ คนที่มีบิลอยู่แล้วจะถูกอัปเดตยอดแทนการออกใบใหม่';

grant execute on function public.create_class_fees(bigint, text, integer, text, date) to authenticated;
revoke all on function public.create_class_fees(bigint, text, integer, text, date) from anon;
revoke execute on function public.create_class_fees(bigint, text, integer, text, date) from public;

-- ============================================================
-- 6) วิธีใช้สำหรับฝ่ายการเงิน (รันใน SQL Editor)
--
-- ออกบิลค่าเทอมทั้งห้อง (2,500 บาท = 250000 สตางค์) ครบกำหนด 30 ก.ย. 2026:
--   select public.create_class_fees(
--            (select id from public.class_rooms where level = 'ปวช.3' and room_no = '6'),
--            'ค่าเทอม', 250000, '1/2569', date '2026-09-30');
--
-- ดูรายการที่นักเรียนแจ้งโอนแล้วรอตรวจ:
--   select f.id, u.full_name, f.title, f.term, f.amount_satang / 100.0 as บาท, f.reported_at
--   from public.student_fees f join public.users u on u.id = f.student_user_id
--   where f.status = 'pending' order by f.reported_at;
--
-- ยืนยันว่าเงินเข้าบัญชีแล้ว (นักเรียนจะได้แจ้งเตือนทันที):
--   select public.set_fee_status(123, 'paid');
--
-- คืนบิลกลับเป็นค้างชำระ (ตรวจแล้วไม่พบเงินเข้า) หรือยกเว้นให้ทุนนักเรียน:
--   select public.set_fee_status(123, 'unpaid', 'ไม่พบเงินเข้าบัญชีตามที่แจ้ง');
--   select public.set_fee_status(123, 'waived', 'นักเรียนทุน');
--
-- หมายเหตุ: รันจาก SQL Editor ได้เลย (ดูเหตุผลที่ app_can_manage_fees ข้อ 1.5)
-- และนักเรียนจะได้รับแจ้งเตือนจริงทุกครั้ง — ต่างจากการ insert ตารางตรง ๆ ที่เงียบสนิท
-- ถ้าเรียกจากในแอป บัญชีนั้นต้องมี role cashier หรือ sysadmin
-- ============================================================

-- ============================================================
-- 7) เรียลไทม์ — ตอนการเงินกดยืนยัน นักเรียนมักเปิดหน้าค้างรออยู่
--
-- ถ้าไม่เพิ่มตารางเข้า publication นี้ postgres_changes จะเงียบสนิทโดยไม่ error
-- (บทเรียนเดียวกับ 34_realtime_orders.sql) — หน้าเว็บยังมี polling สำรองอยู่
-- แต่จะช้ากว่าหลายวินาที
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_fees'
  ) then
    alter publication supabase_realtime add table public.student_fees;
    raise notice 'เพิ่ม public.student_fees เข้า supabase_realtime แล้ว';
  else
    raise notice 'public.student_fees อยู่ใน supabase_realtime อยู่แล้ว ข้ามไป';
  end if;
exception when others then
  -- ไม่ให้ทั้งไฟล์ล้มเพราะเรื่อง publication อย่างเดียว
  raise warning 'เพิ่ม student_fees เข้า realtime ไม่สำเร็จ: % — ไปเปิดเองที่ Database > Replication ได้', sqlerrm;
end $$;

-- ============================================================
-- ตรวจผล — ต้องได้ "หนึ่งแถวเสมอ" แม้ยังไม่มีบิลสักใบ
--
-- ของเดิมตรงนี้เป็น group by status ซึ่งตอนตารางยังว่างจะคืน 0 rows
-- แล้ว SQL Editor ขึ้นว่า "Success. No rows returned" ซึ่งอ่านแล้วเหมือนรันไม่ติด
-- ทั้งที่สร้างตาราง/ฟังก์ชันครบแล้ว แค่ยังไม่มีใครออกบิล
-- ============================================================
select to_regclass('public.student_fees') is not null                                       as มีตารางแล้ว,
       to_regprocedure('public.my_fees()') is not null                                      as มี_my_fees,
       to_regprocedure('public.report_fee_transfer(bigint,text)') is not null               as มี_report_fee_transfer,
       to_regprocedure('public.set_fee_status(bigint,text,text)') is not null               as มี_set_fee_status,
       to_regprocedure('public.create_class_fees(bigint,text,integer,text,date)') is not null as มี_create_class_fees,
       (select count(*) from public.student_fees)                                           as บิลทั้งหมด,
       (select count(*) from public.student_fees where status in ('unpaid', 'pending'))     as ยังค้างอยู่;

-- ยอดแยกตามสถานะ (จะเริ่มมีแถวหลังออกบิลใบแรก)
select f.status                                    as สถานะ,
       count(*)                                    as จำนวนรายการ,
       sum(f.amount_satang) / 100.0                as รวมเป็นบาท
  from public.student_fees f
 group by f.status
 order by 1;
