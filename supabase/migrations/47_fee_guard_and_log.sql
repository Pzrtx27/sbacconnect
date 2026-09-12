-- ============================================================
-- 47) กันการออกบิลซ้ำทับยอดบิลที่จ่ายแล้ว + ปูมค่าธรรมเนียม
--
-- ปัญหาที่แก้
-- ------------
-- upsert_student_fee() ของไฟล์ 43 หาบิลด้วย (student_user_id, term, trim(title))
-- ถ้าเจอก็ update amount_satang ทับทันที "โดยไม่ดู status เลย"
-- บิลที่ status = 'paid' จึงถูกแก้ยอดได้ ทั้งที่นักเรียนจ่ายเงินไปแล้วจริง
-- และสถานะยังคงเป็น paid อยู่เหมือนเดิม = ยอดที่จ่ายกับยอดที่ระบบบันทึกไม่ตรงกัน
--
-- สามอย่างประกอบกันจนเกิดง่ายมาก:
--   1. ฟังก์ชันไม่ดู status
--   2. หน้าจอออกบิล (IssueFeesPanel) ติ๊กนักเรียน "ทุกคน" มาให้ล่วงหน้า
--   3. ไม่มีปูมค่าธรรมเนียมเลย (ต่างจากคะแนนที่มี score_logs)
-- กด "ออกบิล" ด้วยยอดใหม่ทีเดียว บิลที่จ่ายแล้วทั้งห้องเปลี่ยนยอดเงียบ ๆ
-- แล้วไม่มีทางรู้ย้อนหลังว่าเดิมเท่าไหร่ ใครแก้ ตอนไหน
--
-- ไฟล์นี้แก้ทั้งสามข้อ: ปิดทางเขียนทับ / รายงานจำนวนที่ข้าม / มีปูม
-- รันซ้ำได้ ปลอดภัย
-- ============================================================

-- ------------------------------------------------------------
-- 1) ปูมค่าธรรมเนียม — เทียบเคียง score_logs ของสมุดคะแนน
--
-- เก็บทั้งยอดเดิมและยอดใหม่ ไม่ใช่แค่ "มีการแก้เกิดขึ้น"
-- เพราะคำถามที่ต้องตอบให้ได้คือ "ตกลงเด็กคนนี้ต้องจ่ายเท่าไหร่กันแน่"
-- ------------------------------------------------------------
create table if not exists public.student_fee_logs (
  id              bigint generated always as identity primary key,

  fee_id          bigint not null references public.student_fees(id) on delete cascade,
  student_user_id uuid   not null references public.users(id) on delete cascade,

  -- create = ออกบิลใบใหม่ / amount = แก้ยอด / status = เปลี่ยนสถานะ
  action          text   not null check (action in ('create', 'amount', 'status')),

  old_amount_satang integer,
  new_amount_satang integer,
  old_status        text,
  new_status        text,

  reason          text,
  actor_user_id   uuid references public.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists student_fee_logs_fee_idx
  on public.student_fee_logs (fee_id, created_at desc);
create index if not exists student_fee_logs_student_idx
  on public.student_fee_logs (student_user_id, created_at desc);

comment on table public.student_fee_logs is
  'ปูมการออก/แก้ยอด/เปลี่ยนสถานะบิลค่าธรรมเนียม — ตอบคำถามว่าใครแก้อะไรเมื่อไหร่';

alter table public.student_fee_logs enable row level security;

drop policy if exists student_fee_logs_read_own on public.student_fee_logs;

-- นักเรียนดูปูมบิลของตัวเองได้ ต้องตรวจสอบได้ว่ายอดเปลี่ยนตอนไหน
-- เจ้าหน้าที่การเงินอ่านผ่าน RPC ที่คุมขอบเขต ไม่เปิด policy ให้อ่านทั้งตาราง
-- (หลักเดียวกับ attendance_homeroom ใน 41_homeroom_attendance.sql)
create policy student_fee_logs_read_own on public.student_fee_logs
  for select to authenticated
  using (student_user_id = app_current_user_id());

grant select on public.student_fee_logs to authenticated;
revoke insert, update, delete on public.student_fee_logs from authenticated;
revoke all on public.student_fee_logs from anon;

-- ------------------------------------------------------------
-- 1.5) ปิดช่อง "ไม่มี JWT = มีสิทธิ์เต็ม" ใน app_can_manage_fees()
--
-- ของเดิมเขียนว่า
--     select app_is_finance_staff() or auth.uid() is null;
--
-- เจตนาคืออยากให้รันจาก SQL Editor ได้ ซึ่งสมเหตุสมผล
-- แต่ auth.uid() คืน null ในทุกกรณีที่ JWT ไม่มี claim sub — รวม anon key ด้วย
-- ไม่ใช่เฉพาะ SQL Editor ฟังก์ชันนี้จึงตอบ true ให้ anon
--
-- ตอนนี้ยังเข้าไม่ถึงจริง เพราะทุก RPC ที่กินตัวนี้ถอน anon กับ public ครบแล้ว
-- แต่ความปลอดภัยของเงินค่าเทอมทั้งระบบไปแขวนอยู่กับการที่คนเขียน RPC ตัวถัดไป
-- จะไม่ลืมบรรทัด revoke — ซึ่งไฟล์ 40 ในชุดเดียวกันนี้ลืมทั้ง 15 ตัวมาแล้ว
-- ลืมบรรทัดเดียวบน set_fee_status = ใครก็ได้บนอินเทอร์เน็ตปิดหนี้ค่าเทอมให้ตัวเองได้
--
-- session_user คือสิ่งที่ต้องการจริง: role ที่ "เชื่อมต่อเข้ามา" ไม่ใช่ที่ SET ROLE ไปแล้ว
-- และ SECURITY DEFINER ไม่เปลี่ยนค่านี้ (ต่างจาก current_user)
-- PostgREST เชื่อมด้วย authenticator เสมอ จึงเข้ากิ่งนี้ไม่ได้ทั้ง anon และ authenticated
-- ส่วน SQL Editor เชื่อมด้วย postgres จึงยังออกบิลจาก SQL Editor ได้เหมือนเดิม
--
-- ถ้าโปรเจกต์ของคุณ session_user ไม่ใช่ postgres ให้รัน  select session_user;
-- ใน SQL Editor แล้วเติมค่าที่ได้ลงในลิสต์
-- ------------------------------------------------------------
create or replace function public.app_can_manage_fees()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_is_finance_staff()
      or session_user in ('postgres', 'supabase_admin');
$$;

comment on function public.app_can_manage_fees() is
  'true เมื่อผู้เรียกเป็นฝ่ายการเงิน/แอดมิน หรือรันจาก SQL Editor โดยตรง — ไม่ใช่ "ไม่มี JWT" ซึ่งครอบ anon ด้วย';

grant execute on function public.app_can_manage_fees() to authenticated;
revoke all     on function public.app_can_manage_fees() from anon;
revoke execute on function public.app_can_manage_fees() from public;

-- ------------------------------------------------------------
-- 2) ออกบิล — ไม่แตะบิลที่ชำระแล้วหรือยกเว้นแล้ว
--
-- ทางเลือกที่ไม่เอา:
--   เขียนทับเงียบ ๆ  -> ของเดิม ทำข้อมูลเสียหายแบบตามแก้ไม่ได้
--   ตอบ error แล้วล้มทั้งชุด -> ออกบิลทั้งห้องพังเพราะมีคนจ่ายไปแล้วคนเดียว
-- ที่เลือก: ข้ามคนนั้นแล้วรายงานกลับไปว่าข้ามกี่คน
-- ฝ่ายการเงินจึงเห็นว่า "ออกใหม่ 12 / แก้ยอด 3 / ข้าม 5" แทนที่จะเห็นแค่ตัวเลขรวม
-- ------------------------------------------------------------
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
  v_fee     record;
  v_fee_id  bigint;
  v_created boolean;
  v_amount  text;
  v_me      uuid := app_current_user_id();
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

  -- ล็อกแถวไว้ก่อนอ่าน กันสองเครื่องกดออกบิลพร้อมกันแล้วเขียนทับกันเอง
  select * into v_fee
  from public.student_fees
  where student_user_id = p_student_user_id
    and term            = p_term
    and title           = trim(p_title)
  for update;

  v_created := v_fee.id is null;

  -- บิลที่จบแล้ว ห้ามแตะยอด — คืน ok เพื่อไม่ให้ชุดทั้งห้องล้ม แต่ติดธง skipped
  if not v_created and v_fee.status in ('paid', 'waived') then
    return jsonb_build_object(
      'ok',      true,
      'fee_id',  v_fee.id,
      'created', false,
      'skipped', true,
      'reason',  case when v_fee.status = 'paid' then 'ALREADY_PAID' else 'ALREADY_WAIVED' end,
      'amount_satang', v_fee.amount_satang
    );
  end if;

  if v_created then
    insert into public.student_fees
      (student_user_id, title, term, amount_satang, due_date, note, created_by)
    values
      (p_student_user_id, trim(p_title), p_term, p_amount_satang, p_due_date, p_note, v_me)
    returning id into v_fee_id;

    insert into public.student_fee_logs
      (fee_id, student_user_id, action, new_amount_satang, new_status, actor_user_id)
    values
      (v_fee_id, p_student_user_id, 'create', p_amount_satang, 'unpaid', v_me);
  else
    v_fee_id := v_fee.id;

    update public.student_fees
       set amount_satang = p_amount_satang,
           due_date      = coalesce(p_due_date, due_date),
           note          = coalesce(nullif(trim(p_note), ''), note),
           updated_at    = now()
     where id = v_fee_id;

    -- ลงปูมเฉพาะตอนยอดเปลี่ยนจริง กดออกบิลซ้ำด้วยยอดเดิมไม่ต้องมีแถวขยะ
    if v_fee.amount_satang is distinct from p_amount_satang then
      insert into public.student_fee_logs
        (fee_id, student_user_id, action, old_amount_satang, new_amount_satang, old_status, new_status, actor_user_id)
      values
        (v_fee_id, p_student_user_id, 'amount', v_fee.amount_satang, p_amount_satang, v_fee.status, v_fee.status, v_me);
    end if;
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

  return jsonb_build_object('ok', true, 'fee_id', v_fee_id, 'created', v_created, 'skipped', false);
end $$;

comment on function public.upsert_student_fee(uuid, text, integer, text, date, text) is
  'ฝ่ายการเงินออกบิลค่าธรรมเนียมให้นักเรียนหนึ่งคน — บิลที่ชำระแล้ว/ยกเว้นแล้วจะถูกข้าม ไม่เขียนทับยอด';

grant execute on function public.upsert_student_fee(uuid, text, integer, text, date, text) to authenticated;
revoke all     on function public.upsert_student_fee(uuid, text, integer, text, date, text) from anon;
revoke execute on function public.upsert_student_fee(uuid, text, integer, text, date, text) from public;

-- ------------------------------------------------------------
-- 3) ออกบิลหลายคน — นับ skipped แยกออกมา
-- ------------------------------------------------------------
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
  v_skipped int := 0;
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
    v_result := public.upsert_student_fee(v_id, p_title, p_amount_satang, p_term, p_due_date, null);
    v_total  := v_total + 1;

    if coalesce((v_result->>'ok')::boolean, false) then
      if coalesce((v_result->>'skipped')::boolean, false) then
        v_skipped := v_skipped + 1;
      elsif coalesce((v_result->>'created')::boolean, false) then
        v_created := v_created + 1;
      end if;
    else
      v_failed := v_failed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'students', v_total,
    'created',  v_created,
    'skipped',  v_skipped,   -- จ่ายแล้ว/ยกเว้นแล้ว ไม่แตะยอด
    'updated',  v_total - v_created - v_skipped - v_failed,
    'failed',   v_failed
  );
end $$;

comment on function public.create_fees_for_students(uuid[], text, integer, text, date) is
  'ออกบิลให้นักเรียนหลายคนตามรายชื่อที่เลือก — คนที่ชำระแล้ว/ยกเว้นแล้วจะถูกข้ามและรายงานกลับเป็น skipped';

grant execute on function public.create_fees_for_students(uuid[], text, integer, text, date) to authenticated;
revoke all     on function public.create_fees_for_students(uuid[], text, integer, text, date) from anon;
revoke execute on function public.create_fees_for_students(uuid[], text, integer, text, date) from public;

-- ------------------------------------------------------------
-- 4) ออกบิลทั้งห้อง — นับ skipped เหมือนกัน
-- ------------------------------------------------------------
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
  v_skipped int := 0;
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

    if coalesce((v_result->>'skipped')::boolean, false) then
      v_skipped := v_skipped + 1;
    elsif coalesce((v_result->>'created')::boolean, false) then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true, 'students', v_total, 'created', v_created, 'skipped', v_skipped
  );
end $$;

grant execute on function public.create_class_fees(bigint, text, integer, text, date) to authenticated;
revoke all     on function public.create_class_fees(bigint, text, integer, text, date) from anon;
revoke execute on function public.create_class_fees(bigint, text, integer, text, date) from public;

-- ------------------------------------------------------------
-- 5) รายชื่อนักเรียนในห้อง — บอกด้วยว่าใครมีบิลชื่อนี้ของเทอมนี้อยู่แล้ว
--
-- ของเดิมคืนแค่ยอดค้างรวม หน้าจอจึงไม่มีทางรู้ว่าใครจ่ายบิลใบนี้ไปแล้ว
-- แล้วติ๊กทุกคนมาให้ล่วงหน้า ซึ่งเป็นเหตุให้กดออกบิลทับได้ง่าย
--
-- ต้อง drop ก่อน เพราะเพิ่มพารามิเตอร์ = ลายเซ็นใหม่
-- ถ้าไม่ drop จะมีสองตัวชื่อเดียวกันแล้ว PostgREST เลือกไม่ถูก
-- ------------------------------------------------------------
drop function if exists public.list_fee_class_students(bigint);

create or replace function public.list_fee_class_students(
  p_class_room_id bigint,
  p_term          text default null,
  p_title         text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_students jsonb;
  v_title    text := nullif(trim(coalesce(p_title, '')), '');
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
                        and f.status in ('unpaid', 'pending')), 0) as outstanding_satang,
           -- สถานะของบิล "ชื่อนี้ เทอมนี้" โดยเฉพาะ — null = ยังไม่เคยออกให้คนนี้
           (select f.status
              from public.student_fees f
             where f.student_user_id = u.id
               and v_title is not null
               and p_term is not null
               and f.term  = p_term
               and f.title = v_title
             limit 1)                                             as existing_status
    from public.student_profiles sp
    join public.users u on u.id = sp.user_id
    where sp.class_room_id = p_class_room_id
    order by sp.student_code, u.full_name
  ) x;

  return jsonb_build_object('ok', true, 'students', v_students);
end $$;

comment on function public.list_fee_class_students(bigint, text, text) is
  'รายชื่อนักเรียนในห้อง พร้อมยอดค้างรวม และสถานะบิลชื่อ/เทอมที่ระบุ (existing_status) สำหรับหน้าออกบิล';

grant execute on function public.list_fee_class_students(bigint, text, text) to authenticated;
revoke all     on function public.list_fee_class_students(bigint, text, text) from anon;
revoke execute on function public.list_fee_class_students(bigint, text, text) from public;

-- ------------------------------------------------------------
-- 6) เปลี่ยนสถานะ — ของเดิมทั้งดุ้น บวกการลงปูม
--
-- ชื่อพารามิเตอร์ต้องคงเป็น p_note เหมือนเดิมห้ามเปลี่ยน
-- PostgREST เรียก RPC ด้วยชื่อพารามิเตอร์ (useFinanceFees.js ส่ง p_note มา)
-- เปลี่ยนชื่อเมื่อไหร่ฝั่งเว็บพังทันทีโดยที่ SQL ยังรันผ่าน
--
-- ตรรกะแจ้งเตือนคัดลอกมาจากไฟล์ 43 ทั้งหมดโดยไม่แก้ เพราะทำงานถูกอยู่แล้ว
-- ที่เพิ่มคือบล็อก insert ลง student_fee_logs ท้ายสุดเท่านั้น
-- ------------------------------------------------------------
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

  -- ล็อกแถวก่อน กันการเงินสองเครื่องกดยืนยันใบเดียวกันพร้อมกัน
  select * into v_fee from public.student_fees where id = p_fee_id for update;

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

    -- ปูม: ใครเปลี่ยนสถานะบิลใบไหน จากอะไรเป็นอะไร ด้วยเหตุผลอะไร
    insert into public.student_fee_logs
      (fee_id, student_user_id, action, old_status, new_status,
       old_amount_satang, new_amount_satang, reason, actor_user_id)
    values
      (v_fee.id, v_fee.student_user_id, 'status', v_fee.status, p_status,
       v_fee.amount_satang, v_fee.amount_satang, nullif(trim(coalesce(p_note, '')), ''), app_current_user_id());
  end if;

  return jsonb_build_object('ok', true, 'fee_id', v_fee.id, 'status', p_status);
end $$;

comment on function public.set_fee_status(bigint, text, text) is
  'ฝ่ายการเงินปรับสถานะรายการค่าธรรมเนียม พร้อมแจ้งเตือนนักเรียนและลงปูมใน student_fee_logs';

grant execute on function public.set_fee_status(bigint, text, text) to authenticated;
revoke all     on function public.set_fee_status(bigint, text, text) from anon;
revoke execute on function public.set_fee_status(bigint, text, text) from public;

-- ============================================================
-- ตรวจผล
-- ============================================================
do $$
declare
  v_bad int := 0;
  r record;
begin
  if to_regclass('public.student_fee_logs') is null then
    raise warning 'ไม่พบตาราง student_fee_logs'; v_bad := v_bad + 1;
  end if;

  for r in
    select p.oid::regprocedure::text as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('upsert_student_fee','create_fees_for_students','create_class_fees',
                        'list_fee_class_students','set_fee_status')
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    raise warning 'anon ยังเรียกได้: %', r.f; v_bad := v_bad + 1;
  end loop;

  if v_bad = 0 then
    raise notice 'ผ่าน — บิลที่ชำระแล้วถูกกันไว้ ปูมพร้อมใช้ และ anon เรียก RPC การเงินไม่ได้';
  end if;
end $$;
