-- ============================================================
-- 06_seed_real.example.sql — ไฟล์ตัวอย่างสำหรับ repo
--
-- ไฟล์จริงชื่อ 06_seed_real.sql อยู่ใน .gitignore เพราะมีชื่อ-นามสกุล
-- และรหัสนักเรียนจริง ห้าม push ขึ้น GitHub
--
-- วิธีใช้: ก๊อปไฟล์นี้เป็น 06_seed_real.sql แล้วแทนที่ข้อมูลในบล็อก values
-- ============================================================

-- ============================================================
-- 1) ฟังก์ชันสร้าง username
-- ============================================================
-- กฎ: ชื่อจริงเต็ม + 4 ตัวแรกของนามสกุล ตัวพิมพ์เล็กทั้งหมด
create or replace function public.make_username(first_name text, last_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(first_name,''), '\s+', '', 'g'))
      || lower(left(regexp_replace(coalesce(last_name,''),  '\s+', '', 'g'), 4));
$$;

comment on function public.make_username(text, text) is
  'สร้าง username: ชื่อจริงเต็ม + 4 ตัวแรกของนามสกุล ตัวพิมพ์เล็ก';

create or replace function public.make_unique_username(
  first_name text, last_name text, student_code text
)
returns text
language plpgsql
stable
as $$
declare
  v_base  text := public.make_username(first_name, last_name);
  v_email text := v_base || '@sbacnon.ac.th';
begin
  if not exists (select 1 from public.users u where u.email = v_email) then
    return v_base;
  end if;

  if exists (
    select 1
    from public.users u
    join public.student_profiles sp on sp.user_id = u.id
    where u.email = v_email
      and sp.student_code = make_unique_username.student_code
  ) then
    return v_base;
  end if;

  return v_base || right(student_code, 2);
end;
$$;

-- ============================================================
-- 2) ใส่ข้อมูลนักเรียน  ← แก้เฉพาะบล็อก values ด้านล่าง
-- ============================================================
do $$
declare
  r           record;
  v_user_id   uuid;
  v_class_id  bigint;
  v_username  text;
  v_email     text;
  v_balance   integer;
  v_key       text;
  v_amount    constant integer := 10000;  -- 100 บาท = 10000 สตางค์
begin
  for r in
    select *
    from (values
      -- first_name, last_name,  full_name,           student_code, level,    room_no
      ('somchai',  'jaidee',   'somchai jaidee',    'S0001',      'ปวช.3', '6'),
      ('somsri',   'rakdee',   'somsri rakdee',     'S0002',      'ปวช.3', '4')
    ) as t(first_name, last_name, full_name, student_code, level, room_no)
  loop

    insert into public.class_rooms (level, room_no)
    values (r.level, r.room_no)
    on conflict (level, room_no) do nothing;

    select cr.id into v_class_id
    from public.class_rooms cr
    where cr.level = r.level and cr.room_no = r.room_no;

    v_username := public.make_unique_username(r.first_name, r.last_name, r.student_code);
    v_email    := v_username || '@sbacnon.ac.th';

    insert into public.users (email, full_name)
    values (v_email, r.full_name)
    on conflict (email) do nothing;

    select u.id into v_user_id from public.users u where u.email = v_email;

    insert into public.user_roles (user_id, role)
    values (v_user_id, 'student')
    on conflict (user_id, role) do nothing;

    insert into public.student_profiles (user_id, student_code, class_room_id)
    values (v_user_id, r.student_code, v_class_id)
    on conflict do nothing;

    insert into public.user_credentials (user_id, kind, value)
    values (v_user_id, 'code', r.student_code)
    on conflict do nothing;

    v_key := 'seed:initial-topup:' || r.student_code;

    if not exists (
      select 1 from public.wallet_entries w where w.idempotency_key = v_key
    ) then
      select coalesce(
               (select w.balance_after from public.wallet_entries w
                 where w.user_id = v_user_id order by w.id desc limit 1),
               0)
        into v_balance;

      insert into public.wallet_entries (
        user_id, amount_satang, kind, balance_after, idempotency_key
      )
      values (v_user_id, v_amount, 'adjust', v_balance + v_amount, v_key)
      on conflict (idempotency_key) do nothing;
    end if;

  end loop;
end $$;

-- ============================================================
-- 3) ตรวจสอบผลลัพธ์
-- ============================================================
select
  sp.student_code,
  u.full_name,
  u.email,
  cr.level || '/' || cr.room_no as class_room,
  coalesce((select w.balance_after from public.wallet_entries w
             where w.user_id = u.id order by w.id desc limit 1), 0) / 100.0 as balance_baht,
  (u.auth_uid is not null) as auth_linked
from public.users u
join public.student_profiles sp on sp.user_id = u.id
left join public.class_rooms cr on cr.id = sp.class_room_id
order by sp.student_code;
