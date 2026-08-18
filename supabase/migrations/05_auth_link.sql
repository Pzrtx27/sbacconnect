-- 05_auth_link.sql — ผูกบัญชีใน auth.users เข้ากับแถวใน public.users
--
-- ปัญหาที่แก้: ทุกแถวใน public.users มี auth_uid เป็น null จึงยังไม่มีใครล็อกอินเข้าใช้งานได้
--
-- นโยบายที่ยึดตาม:
--   * จับคู่ด้วย email เท่านั้น
--   * ถ้าไม่มีแถวที่ email ตรงกัน "ห้ามสร้างแถวใหม่" — แอดมินต้องเป็นคนเซ็ตข้อมูลนักเรียนไว้ล่วงหน้า
--     (คนนอกที่สมัครเองจะได้บัญชี auth แต่ไม่ผูกกับ public.users → หน้าเว็บต้อง sign out ให้ ดูงานที่ 3)
--   * ไม่เขียนทับ auth_uid ที่ผูกไว้แล้ว (กันกรณีล็อกอินซ้ำ / มีคนสมัครด้วย email ซ้ำ)
--
-- ไฟล์นี้รันซ้ำได้ทั้งไฟล์ (create or replace + drop if exists)
-- หมายเหตุ: การสร้าง trigger บน auth.users ต้องรันด้วยสิทธิ์ระดับ owner
--           ซึ่ง SQL Editor บนเว็บ Supabase มีให้อยู่แล้ว

-- ============================================================
-- 1) ฟังก์ชันจับคู่
-- ============================================================
-- security definer: จำเป็น เพราะ trigger ทำงานภายใต้ context ของ auth
-- แต่ต้องไปเขียน public.users ซึ่ง RLS เปิดอยู่
-- set search_path: ล็อก schema กัน search_path hijacking (แนวปฏิบัติมาตรฐานของ security definer)
create or replace function public.handle_auth_user_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_matched_id  uuid;
  v_email       text;
begin
  -- normalize: ตัดช่องว่างหัวท้าย + ทำเป็นตัวพิมพ์เล็ก
  -- กันเคสแอดมินพิมพ์อีเมลใน dashboard เป็นตัวใหญ่ แต่ใน users เก็บเป็นตัวเล็ก
  v_email := lower(trim(new.email));

  if v_email is null or v_email = '' then
    return new;
  end if;

  -- ผูกเฉพาะแถวที่ยังว่างอยู่ (auth_uid is null)
  -- ถ้าผูกไว้แล้วจะไม่แตะเลย → ล็อกอินซ้ำกี่รอบก็ไม่พังและไม่เขียนทับ
  update public.users u
     set auth_uid = new.id
   where lower(trim(u.email)) = v_email
     and u.auth_uid is null
  returning u.id into v_matched_id;

  -- ตั้งใจไม่ทำอะไรต่อเมื่อหาไม่เจอ (v_matched_id is null)
  -- ห้าม insert แถวใหม่เด็ดขาดตามนโยบาย — แค่ปล่อยผ่านให้ auth สมัครสำเร็จตามปกติ
  return new;

exception
  -- ไม่ว่าจะเกิดอะไรขึ้นก็ห้ามทำให้การสมัคร/ล็อกอินล้มเหลว
  -- (ถ้า trigger throw error ผู้ใช้จะล็อกอินไม่ได้เลย ซึ่งแย่กว่าการที่ auth_uid ยังไม่ผูก)
  when others then
    raise warning '[handle_auth_user_link] ผูก auth_uid ไม่สำเร็จสำหรับ % : %', v_email, sqlerrm;
    return new;
end;
$$;

comment on function public.handle_auth_user_link() is
  'ผูก auth.users.id เข้ากับ public.users.auth_uid โดยจับคู่จาก email — ไม่สร้างแถวใหม่ ไม่เขียนทับของเดิม';

-- ============================================================
-- 2) Trigger ตอนสมัครใหม่ (INSERT)
-- ============================================================
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_auth_user_link();

-- ============================================================
-- 3) Trigger ตอนอัปเดต (UPDATE)
-- ============================================================
-- ครอบคลุมเคสสำคัญ: แอดมินสร้าง user ใน dashboard "ก่อน" รันไฟล์นี้
-- หรือสร้าง public.users ทีหลัง (ไฟล์ 06) — พอผู้ใช้ยืนยันอีเมล/ล็อกอินครั้งแรก
-- auth.users จะถูก update แล้ว trigger นี้จะจับคู่ให้เอง
-- ถ้าผูกไปแล้วฟังก์ชันจะ match 0 แถว = แทบไม่มีต้นทุน
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row
  execute function public.handle_auth_user_link();

-- ============================================================
-- 4) Backfill — ผูกย้อนหลังให้บัญชีที่มีอยู่แล้ว
-- ============================================================
-- ถ้าสร้างบัญชีใน Authentication > Users ไปก่อนหน้านี้แล้ว trigger จะไม่ทำงานย้อนหลังให้
-- บล็อกนี้เลยไล่ผูกให้ทีเดียว รันซ้ำได้ (แถวที่ผูกแล้วจะไม่ถูกแตะ)
update public.users u
   set auth_uid = a.id
  from auth.users a
 where lower(trim(u.email)) = lower(trim(a.email))
   and u.auth_uid is null;

-- ============================================================
-- 5) ตรวจสอบผลลัพธ์
-- ============================================================

-- 5.1 สรุปภาพรวม: ผูกครบหรือยัง
select
  count(*)                        as total_users,
  count(auth_uid)                 as linked,
  count(*) - count(auth_uid)      as not_linked,
  case
    when count(*) = 0 then 'ยังไม่มีข้อมูลใน public.users — ต้องรัน 06_seed_real.sql ก่อน'
    when count(*) = count(auth_uid) then 'OK: ผูก auth_uid ครบทุกคนแล้ว'
    else 'ยังผูกไม่ครบ — ดูรายชื่อในตารางถัดไป'
  end                             as status
from public.users;

-- 5.2 รายคน: ใครผูกแล้ว / ใครยังไม่ผูก และเพราะอะไร
select
  u.email,
  u.full_name,
  (u.auth_uid is not null)                      as linked,
  (a.id is not null)                            as has_auth_account,
  case
    when u.auth_uid is not null      then 'ผูกแล้ว'
    when a.id is null                then 'ยังไม่ได้สร้างบัญชีใน Authentication > Users'
    else                                  'มีบัญชี auth แล้วแต่ยังไม่ผูก — ลองรันไฟล์นี้ซ้ำอีกครั้ง'
  end                                           as note
from public.users u
left join auth.users a
  on lower(trim(a.email)) = lower(trim(u.email))
order by linked, u.email;

-- 5.3 บัญชี auth ที่ไม่มีแถวใน public.users (คนนอก/พิมพ์อีเมลผิด)
-- ตามนโยบายคนกลุ่มนี้จะล็อกอินเข้าแอปไม่ได้ (หน้าเว็บจะ sign out ให้ทันที)
select
  a.email                                       as auth_email_ไม่มีในระบบ,
  a.created_at
from auth.users a
left join public.users u
  on lower(trim(u.email)) = lower(trim(a.email))
where u.id is null
order by a.created_at desc;
