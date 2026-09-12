-- ============================================================
-- 08_seed_staff.sql — บัญชีบุคลากร (ไม่ใช่นักเรียน)
-- ไฟล์ตัวอย่างสำหรับ repo — ก๊อปเป็น 08_seed_staff.sql แล้วแก้ชื่อผู้ใช้จริง
-- 
--
-- ไฟล์นี้สร้างเฉพาะ "ข้อมูลในฐานข้อมูล" เท่านั้น
-- ส่วน "รหัสผ่าน" ต้องไปตั้งใน Authentication > Users > Add user แยกต่างหาก
-- (Supabase เก็บรหัสผ่านไว้ในระบบ auth ของตัวเอง ไม่ได้เก็บในตารางเรา)
--
-- รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ ไม่เติมเงินซ้ำ
-- ============================================================

do $$
declare
  r            record;
  v_user_id    uuid;
  v_balance    integer;
  v_key        text;
  v_amount     constant integer := 10000;  -- 100 บาท (ให้ไว้ทดสอบซื้อของ)
begin
  for r in
    select *
    from (values
      -- username,      full_name,            role,        teacher_code, ให้เงินไหม
      ('academic01',  'ฝ่ายวิชาการ (ตัวอย่าง)', 'academic',  null,         false),
      ('barista01',   'บาริสต้า (ตัวอย่าง)',   'pos',       null,         false),
      ('teacher01',   'อาจารย์ (ตัวอย่าง)',    'teacher',   'T0001',      true)
    ) as t(username, full_name, role, teacher_code, give_money)
  loop
    ------------------------------------------------------------
    -- 1) แถวใน users (อีเมลรูปแบบเดียวกับนักเรียน)
    ------------------------------------------------------------
    insert into public.users (email, full_name)
    values (r.username || '@sbacnon.ac.th', r.full_name)
    on conflict (email) do nothing;

    select u.id into v_user_id
    from public.users u
    where u.email = r.username || '@sbacnon.ac.th';

    ------------------------------------------------------------
    -- 2) สิทธิ์ (role)
    ------------------------------------------------------------
    insert into public.user_roles (user_id, role)
    values (v_user_id, r.role::app_role)
    on conflict (user_id, role) do nothing;

    -- บาริสต้าให้สิทธิ์ cashier ด้วย จะได้เติมเงินสดให้นักเรียนที่เคาน์เตอร์ได้
    -- (topup_cash() บังคับว่าต้องมี role 'cashier' เท่านั้น)
    if r.role = 'pos' then
      insert into public.user_roles (user_id, role)
      values (v_user_id, 'cashier')
      on conflict (user_id, role) do nothing;
    end if;

    ------------------------------------------------------------
    -- 3) โปรไฟล์ครู (teacher_code เป็น not null + unique)
    ------------------------------------------------------------
    if r.teacher_code is not null then
      insert into public.teacher_profiles (user_id, teacher_code, department)
      values (v_user_id, r.teacher_code, 'เทคโนโลยีสารสนเทศ')
      on conflict do nothing;
    end if;

    ------------------------------------------------------------
    -- 4) เงินตั้งต้น (เฉพาะคนที่ต้องซื้อของทดสอบ)
    ------------------------------------------------------------
    if r.give_money then
      v_key := 'seed:staff-topup:' || r.username;

      if not exists (select 1 from public.wallet_entries w where w.idempotency_key = v_key) then
        select coalesce((select w.balance_after
                           from public.wallet_entries w
                          where w.user_id = v_user_id
                          order by w.id desc limit 1), 0)
          into v_balance;

        insert into public.wallet_entries (
          user_id, amount_satang, kind, balance_after, idempotency_key
        )
        values (v_user_id, v_amount, 'adjust', v_balance + v_amount, v_key)
        on conflict (idempotency_key) do nothing;
      end if;
    end if;

    raise notice 'staff: % (%) -> %@sbacnon.ac.th', r.full_name, r.role, r.username;
  end loop;
end $$;

-- ============================================================
-- ตรวจสอบ
-- ============================================================
select
  split_part(u.email, '@', 1)                        as ชื่อผู้ใช้,
  u.full_name                                        as ชื่อ,
  string_agg(ur.role::text, ', ' order by ur.role)   as สิทธิ์,
  to_char(coalesce((select w.balance_after
                      from public.wallet_entries w
                     where w.user_id = u.id
                     order by w.id desc limit 1), 0) / 100.0,
          'FM999,990.00')                            as ยอดเงิน_บาท,
  case when u.auth_uid is not null
       then 'พร้อมใช้งาน'
       else 'ยังต้องสร้างบัญชีใน Authentication > Users'
  end                                                as สถานะ
from public.users u
join public.user_roles ur on ur.user_id = u.id
where split_part(u.email, '@', 1) in ('academic01', 'barista01', 'teacher01')
group by u.id, u.email, u.full_name, u.auth_uid
order by ชื่อผู้ใช้;
