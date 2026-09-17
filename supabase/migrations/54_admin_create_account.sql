-- ============================================================
-- 54_admin_create_account.sql — เพิ่มบัญชีครู/นักเรียนจากหน้า Admin
--
-- ภาพรวมของทั้งกระบวนการ
-- -----------------------
-- การสร้างบัญชีมีสองส่วนที่อยู่คนละที่และล้มเหลวแยกกันได้:
--   1) บัญชีเข้าสู่ระบบใน auth.users   — สร้างได้ด้วย service_role key เท่านั้น
--   2) แถวข้อมูลใน users / user_roles / profile — สร้างด้วย SQL ปกติ
--
-- ไฟล์นี้ทำเฉพาะส่วนที่ 2 และทำให้มัน "สำเร็จทั้งหมดหรือไม่สำเร็จเลย"
-- ส่วนที่ 1 อยู่ใน Edge Function `admin-users` ซึ่งถือ service_role ไว้ฝั่งเซิร์ฟเวอร์
-- ถ้าเรียกฟังก์ชันนี้แล้วไม่ผ่าน Edge Function จะลบบัญชี auth ที่เพิ่งสร้างทิ้งให้
-- ไม่ให้เหลือบัญชีล็อกอินที่ไม่มีข้อมูลผูกอยู่ (ล็อกอินผ่านแต่ใช้อะไรไม่ได้เลย)
--
-- ทำไมไม่ให้หน้าเว็บสร้างเอง
--   service_role key ข้าม RLS ได้ทุกข้อ ถ้าอยู่ในโค้ดหน้าเว็บ ตัวแปรจะถูกฝัง
--   ลงไฟล์ JavaScript ที่ใครเปิด DevTools ก็อ่านได้ = เปิดฐานข้อมูลทั้งก้อนให้สาธารณะ
--
-- หมายเหตุเรื่องรหัสผ่าน
--   "รหัสประจำตัว" (student_code / teacher_code) กับ "รหัสผ่าน" เป็นคนละค่ากัน
--   ดูได้จาก import-tool/students.example.csv ที่แยกคอลัมน์ username / password ไว้
--   ฟังก์ชันนี้จึงไม่รับและไม่เห็นรหัสผ่านเลย — รหัสผ่านถูกส่งตรงจาก Edge Function
--   ไปที่ Supabase Auth ซึ่งเก็บเป็นค่าแฮชในตาราง auth.users และอ่านกลับไม่ได้
--
-- รันซ้ำได้ / ต้องรันหลัง 53_admin_console.sql
-- ============================================================

begin;

create or replace function public.admin_create_account_rows(
  p_auth_uid   uuid,
  p_email      text,
  p_full_name  text,
  p_role       text,
  p_code       text,
  p_class_room bigint default null,
  p_department text default null,
  p_actor      uuid   default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_code text := btrim(coalesce(p_code, ''));
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_id   uuid;
begin
  -- ---------- ตรวจข้อมูลก่อนแตะตารางใด ๆ ----------
  if p_role not in ('student', 'teacher') then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ROLE');
  end if;

  if length(v_name) not between 1 and 150 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_NAME');
  end if;

  /* รหัสประจำตัวไม่ใช่รหัสผ่าน จึงไม่บังคับความยาวแบบรหัสผ่าน
     ของจริงสั้นกว่าที่คิด: รหัสนักเรียนเป็นเลข 5 หลัก (66001) และรหัสครูเป็น T0001
     ถ้าตั้งขั้นต่ำไว้ 6 ตัว จะเพิ่มบัญชีตามรูปแบบที่วิทยาลัยใช้จริงไม่ได้เลย */
  if v_code !~ '^[A-Za-z0-9._-]{3,60}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
  end if;

  if v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'INVALID_EMAIL');
  end if;

  if p_auth_uid is null then
    return jsonb_build_object('ok', false, 'error', 'NO_AUTH_UID');
  end if;

  if p_role = 'student' and not exists (select 1 from public.class_rooms where id = p_class_room) then
    return jsonb_build_object('ok', false, 'error', 'INVALID_CLASSROOM');
  end if;

  -- ---------- กันซ้ำ โดยตอบให้ตรงว่าซ้ำที่ช่องไหน ----------
  -- ถ้าปล่อยให้ชน unique constraint เอง ผู้ใช้จะได้ข้อความ Postgres ดิบ ๆ
  -- ที่บอกชื่อ constraint แต่ไม่บอกว่าต้องไปแก้ช่องไหนในฟอร์ม
  if exists (select 1 from public.users where lower(email) = v_mail) then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE_EMAIL');
  end if;

  if p_role = 'student' and exists (select 1 from public.student_profiles where student_code = v_code) then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE_CODE');
  end if;

  if p_role = 'teacher' and exists (select 1 from public.teacher_profiles where teacher_code = v_code) then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE_CODE');
  end if;

  -- ---------- สร้างจริง ----------
  -- ทั้งบล็อกนี้อยู่ในทรานแซกชันเดียวกัน ถ้าอันใดอันหนึ่งพังจะไม่เหลือแถวครึ่ง ๆ กลาง ๆ
  insert into public.users (auth_uid, email, full_name)
  values (p_auth_uid, v_mail, v_name)
  returning id into v_id;

  insert into public.user_roles (user_id, role)
  values (v_id, p_role::app_role);

  if p_role = 'student' then
    insert into public.student_profiles (user_id, student_code, class_room_id)
    values (v_id, v_code, p_class_room);

    /* รหัสสำหรับแตะที่เครื่อง POS ร้านกาแฟ — 06_seed_real.example.sql ใส่แถวนี้ให้ทุกคน
       ถ้าข้ามไป นักเรียนที่เพิ่มจากหน้า Admin จะสั่งเครื่องดื่มหน้าร้านไม่ได้
       ทั้งที่ล็อกอินในแอปได้ปกติ ซึ่งเป็นอาการที่หาสาเหตุยากมาก */
    insert into public.user_credentials (user_id, kind, value)
    values (v_id, 'code', v_code);
  else
    insert into public.teacher_profiles (user_id, teacher_code, department)
    values (v_id, v_code, nullif(btrim(coalesce(p_department, '')), ''));
  end if;

  insert into public.admin_audit (actor_id, action, target, details)
  values (p_actor, 'CREATE_ACCOUNT', v_id::text,
          jsonb_build_object('name', v_name, 'role', p_role, 'email', v_mail));

  return jsonb_build_object('ok', true, 'id', v_id);

exception
  -- ตาข่ายรับกรณีที่สองคนกดพร้อมกันจนหลุดด่านเช็คซ้ำด้านบนไปชนกันที่ constraint
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE');
end;
$$;

comment on function public.admin_create_account_rows(uuid, text, text, text, text, bigint, text, uuid) is
  'สร้างแถวข้อมูลของบัญชีใหม่แบบ all-or-nothing — เรียกได้จาก service_role เท่านั้น (Edge Function admin-users)';

/* ปิดไม่ให้เรียกจากหน้าเว็บโดยตรงเด็ดขาด
   ฟังก์ชันนี้ไม่ได้เช็ค app_has_role('sysadmin') ในตัวเอง เพราะตอน Edge Function เรียก
   ไม่มี JWT ของผู้ใช้ติดมาด้วย การตรวจสิทธิ์จึงอยู่ที่ Edge Function ก่อนเรียกตัวนี้
   ถ้าเปิดให้ authenticated เรียกได้ จะกลายเป็นช่องสร้างบัญชีโดยไม่ตรวจสิทธิ์เลย */
revoke all on function public.admin_create_account_rows(uuid, text, text, text, text, bigint, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_create_account_rows(uuid, text, text, text, text, bigint, text, uuid)
  to service_role;

commit;

-- ============================================================
-- ตรวจผล
-- ============================================================
select 'ฟังก์ชัน admin_create_account_rows' as รายการ,
       case when exists (
         select 1 from pg_proc
          where pronamespace = 'public'::regnamespace
            and proname = 'admin_create_account_rows'
       ) then 'ติดตั้งแล้ว' else 'ยังไม่มี — ตรวจ error ด้านบน' end as ผล
union all
select 'สิทธิ์เรียก (ต้องมีแต่ service_role)',
       coalesce(string_agg(grantee, ', ' order by grantee), 'ไม่มีใครเรียกได้')
  from information_schema.role_routine_grants
 where specific_schema = 'public'
   and routine_name = 'admin_create_account_rows'
union all
select 'ห้องเรียนที่เลือกได้ตอนเพิ่มนักเรียน',
       to_char(count(*), 'FM999999') || ' ห้อง'
  from public.class_rooms;
