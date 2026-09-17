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
