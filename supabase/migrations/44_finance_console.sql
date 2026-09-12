-- ============================================================
-- 44_finance_console.sql — ของที่หน้าจอฝ่ายการเงินต้องใช้ (43 มีแต่ฝั่งนักเรียน)
--
-- 43_student_fees.sql ทำฝั่งนักเรียนครบแล้ว (เห็นบิลตัวเอง จ่าย QR แจ้งโอน)
-- แต่ฝั่งการเงินยังต้องเปิด SQL Editor ออกบิลและกดยืนยันเอง ซึ่งใช้จริงไม่ไหว
--
-- ไฟล์นี้เพิ่มสามอย่างที่หน้าจอต้องใช้:
--   1) list_student_fees()        — คิวงาน: ใครแจ้งโอนแล้วรอตรวจ / ใครยังค้าง
--   2) list_fee_class_students()  — รายชื่อทั้งห้องพร้อมยอดค้าง ใช้ตอนเลือกคนออกบิล
--   3) create_fees_for_students() — ออกบิลให้คนที่ติ๊กเลือกไว้ (ทั้งห้องหรือบางคน)
--
-- ทั้งสามตัวใช้ app_can_manage_fees() ตัวเดียวกับไฟล์ 43 (cashier/sysadmin
-- หรือรันจาก SQL Editor) — ไม่ได้เปิดสิทธิ์ใหม่ให้ใครเพิ่ม
--
-- ชื่อนักเรียนอยู่ในตาราง users ที่ RLS กันไว้ (users_self_select) ฝ่ายการเงิน
-- จึง join หาชื่อเองจากหน้าเว็บไม่ได้ ต้องผ่าน security definer เท่านั้น
--
-- รันซ้ำได้ / ต้องรัน 43_student_fees.sql มาก่อน
-- ============================================================

-- ============================================================
-- 1) คิวงานของฝ่ายการเงิน
--
-- p_status: 'pending' = รอตรวจ, 'unpaid' = ยังไม่จ่าย, null = ทุกสถานะ
-- ============================================================
create or replace function public.list_student_fees(
  p_status        text   default null,
  p_class_room_id bigint default null,
  p_limit         int    default 300
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_fees  jsonb;
begin
  if not app_can_manage_fees() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  /* เรียงซ้ำอีกรอบใน jsonb_agg ด้วย — order by ในซับเควรีมีไว้คู่กับ limit
     (เลือกว่าเอาแถวไหน) แต่ Postgres ไม่รับประกันว่า aggregate จะเก็บลำดับนั้นไว้ */
  select coalesce(
           jsonb_agg(row_to_json(x)::jsonb
             order by case x.status when 'pending' then 0 when 'unpaid' then 1 else 2 end,
                      x.reported_at nulls last,
                      x.due_date nulls last,
                      x.student_name),
           '[]'::jsonb)
    into v_fees
  from (
    select f.id,
           f.student_user_id,
           u.full_name                      as student_name,
           sp.student_code,
           cr.level || '/' || cr.room_no    as class_label,
           f.title,
           f.term,
           f.amount_satang,
           f.due_date,
           f.status,
           f.note,
           f.reported_at,
           f.paid_at,
           (f.due_date is not null
             and f.status in ('unpaid', 'pending')
             and f.due_date < v_today)      as is_overdue
    from public.student_fees f
    join public.users u on u.id = f.student_user_id
    left join public.student_profiles sp on sp.user_id = f.student_user_id
    left join public.class_rooms cr on cr.id = sp.class_room_id
    where (p_status is null or f.status = p_status)
      and (p_class_room_id is null or sp.class_room_id = p_class_room_id)
    -- รอตรวจขึ้นก่อน แล้วค่อยเรียงตามคนที่แจ้งมาก่อน/ครบกำหนดก่อน
    order by case f.status when 'pending' then 0 when 'unpaid' then 1 else 2 end,
             f.reported_at nulls last,
             f.due_date nulls last,
             u.full_name
    limit greatest(1, least(coalesce(p_limit, 300), 1000))
  ) x;

  return jsonb_build_object(
    'ok', true,
    'fees', v_fees,
    -- ยอดรวมนับจากทั้งระบบเสมอ ไม่ใช่เฉพาะที่อยู่ใน limit — ไม่งั้นตัวเลขบนหัวจอจะหลอกตา
    'summary', (
      select jsonb_build_object(
        'pending_count',   count(*) filter (where f.status = 'pending'),
        'pending_satang',  coalesce(sum(f.amount_satang) filter (where f.status = 'pending'), 0),
        'unpaid_count',    count(*) filter (where f.status = 'unpaid'),
        'unpaid_satang',   coalesce(sum(f.amount_satang) filter (where f.status = 'unpaid'), 0),
        'overdue_count',   count(*) filter (where f.status in ('unpaid', 'pending')
                                              and f.due_date is not null
                                              and f.due_date < v_today),
        'paid_satang',     coalesce(sum(f.amount_satang) filter (where f.status = 'paid'), 0)
      )
      from public.student_fees f
    )
  );
end $$;

comment on function public.list_student_fees(text, bigint, int) is
  'คิวงานฝ่ายการเงิน — รายการค่าธรรมเนียมพร้อมชื่อ/รหัส/ห้องของนักเรียน กรองตามสถานะและห้องได้ พร้อมยอดรวมทั้งระบบ';

grant execute on function public.list_student_fees(text, bigint, int) to authenticated;
revoke all on function public.list_student_fees(text, bigint, int) from anon;
revoke execute on function public.list_student_fees(text, bigint, int) from public;

-- ============================================================
-- 2) รายชื่อทั้งห้องพร้อมยอดค้าง — ใช้ตอนเลือกว่าจะออกบิลให้ใครบ้าง
--
-- ไม่ใช้ list_students_by_classroom() ที่มีอยู่แล้ว เพราะตัวนั้นบังคับ
-- app_is_teaching_staff() ซึ่งฝ่ายการเงิน (cashier) ไม่ผ่าน และมันคืนคะแนน
-- ความประพฤติมาด้วย ซึ่งไม่ใช่เรื่องที่ฝ่ายการเงินควรเห็น
-- ============================================================
create or replace function public.list_fee_class_students(p_class_room_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_students jsonb;
begin
  if not app_can_manage_fees() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_class_room_id is null then
    return jsonb_build_object('ok', true, 'students', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
    into v_students
  from (
    select u.id          as user_id,
           u.full_name,
           sp.student_code,
           coalesce((select sum(f.amount_satang)
                       from public.student_fees f
                      where f.student_user_id = u.id
                        and f.status in ('unpaid', 'pending')), 0) as outstanding_satang
    from public.student_profiles sp
    join public.users u on u.id = sp.user_id
    where sp.class_room_id = p_class_room_id
    order by sp.student_code, u.full_name
  ) x;

  return jsonb_build_object('ok', true, 'students', v_students);
end $$;

comment on function public.list_fee_class_students(bigint) is
  'รายชื่อนักเรียนในห้องพร้อมยอดค้างชำระรวมของแต่ละคน — ใช้ในหน้าออกบิลของฝ่ายการเงิน';

grant execute on function public.list_fee_class_students(bigint) to authenticated;
revoke all on function public.list_fee_class_students(bigint) from anon;
revoke execute on function public.list_fee_class_students(bigint) from public;

-- ============================================================
-- 3) ออกบิลให้นักเรียนที่เลือกไว้
--
-- create_class_fees() ของไฟล์ 43 ออกให้ "ทั้งห้อง" เสมอ ซึ่งพอมีเด็กทุน
-- หรือเด็กที่จ่ายไปแล้วตั้งแต่ต้นเทอม ก็ต้องมาไล่ลบทีหลัง
-- ตัวนี้รับรายชื่อที่ติ๊กมาจากหน้าจอโดยตรง
-- ============================================================
create or replace function public.create_fees_for_students(
  p_student_ids   uuid[],
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
  v_id      uuid;
  v_result  jsonb;
  v_created int := 0;
  v_total   int := 0;
  v_failed  int := 0;
begin
  if not app_can_manage_fees() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'NO_STUDENTS');
  end if;

  if p_amount_satang is null or p_amount_satang <= 0 then
    return jsonb_build_object('ok', false, 'error', 'BAD_AMOUNT');
  end if;

  if p_title is null or char_length(trim(p_title)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'BAD_TITLE');
  end if;

  foreach v_id in array p_student_ids loop
    -- ใช้ตัวเดิมของไฟล์ 43 ทั้งดุ้น จะได้แจ้งเตือนนักเรียนด้วยข้อความชุดเดียวกัน
    v_result := public.upsert_student_fee(v_id, p_title, p_amount_satang, p_term, p_due_date, null);
    v_total  := v_total + 1;

    if coalesce((v_result->>'ok')::boolean, false) then
      if coalesce((v_result->>'created')::boolean, false) then
        v_created := v_created + 1;
      end if;
    else
      -- ข้ามคนที่ไม่ใช่นักเรียน (uuid หลุดมาจากที่อื่น) แทนที่จะล้มทั้งชุด
      v_failed := v_failed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'students', v_total,
    'created',  v_created,      -- บิลใบใหม่ (นักเรียนได้แจ้งเตือน)
    'updated',  v_total - v_created - v_failed,   -- มีบิลเดิมอยู่แล้ว = แก้ยอดให้
    'failed',   v_failed
  );
end $$;

comment on function public.create_fees_for_students(uuid[], text, integer, text, date) is
  'ออกบิลค่าธรรมเนียมให้นักเรียนหลายคนตามรายชื่อที่เลือก — คนที่มีบิลชื่อเดิมของเทอมเดิมอยู่แล้วจะถูกแก้ยอดแทนการออกใบใหม่';

grant execute on function public.create_fees_for_students(uuid[], text, integer, text, date) to authenticated;
revoke all on function public.create_fees_for_students(uuid[], text, integer, text, date) from anon;
revoke execute on function public.create_fees_for_students(uuid[], text, integer, text, date) from public;

-- ============================================================
-- ให้สิทธิ์เข้าหน้า /finance
--
-- หน้าจอฝ่ายการเงินขึ้นเฉพาะบัญชีที่มี role cashier หรือ sysadmin ใน user_roles
-- (กติกาเดียวกับ app_can_manage_fees) — บัญชีอื่นจะไม่เห็นแม้แต่ปุ่มทางเข้า
--
-- เพิ่มสิทธิ์ให้บัญชีหนึ่ง (แก้อีเมลให้ตรงกับของจริง):
--   insert into public.user_roles (user_id, role)
--   select u.id, 'cashier' from public.users u
--    where u.email = 'academic01@sbacnon.ac.th'
--   on conflict (user_id, role) do nothing;
--
-- ดูว่าตอนนี้ใครเข้าหน้าการเงินได้บ้าง:
--   select u.email, u.full_name, ur.role
--     from public.user_roles ur join public.users u on u.id = ur.user_id
--    where ur.role in ('cashier', 'sysadmin') order by u.email;
-- ============================================================

-- ============================================================
-- ตรวจผล — ต้องได้ true ทั้งสามช่อง
-- ============================================================
select to_regprocedure('public.list_student_fees(text,bigint,int)') is not null              as มี_list_student_fees,
       to_regprocedure('public.list_fee_class_students(bigint)') is not null                 as มี_list_fee_class_students,
       to_regprocedure('public.create_fees_for_students(uuid[],text,integer,text,date)') is not null as มี_create_fees_for_students;
