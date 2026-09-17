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
