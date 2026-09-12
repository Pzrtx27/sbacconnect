-- ============================================================
-- 29_delete_notifications.sql — ลบการแจ้งเตือนของตัวเอง
--
-- ปัญหาที่แก้:
--   แจ้งเตือนทำได้แค่ "ทำเครื่องหมายว่าอ่านแล้ว" (20_behavior_and_notifications.sql)
--   ลบไม่ได้เลย รายการจึงกองสะสมไปเรื่อย ๆ ไม่มีวันหมด
--   คนที่ถูกตัดคะแนนบ่อยหรือแจ้งซ่อมบ่อยจะเปิดกระดิ่งมาเจอรายการเป็นร้อย
--   ทั้งที่เรื่องจบไปนานแล้ว
--
-- แนวทางเดียวกับของเดิมทั้งหมด:
--   ตาราง notifications ให้สิทธิ์ authenticated แค่ select เท่านั้น
--   การเขียนทุกอย่างวิ่งผ่าน SECURITY DEFINER ที่กรอง user_id = app_current_user_id()
--   จึงไม่มีทางลบของคนอื่นแม้ยิง RPC ตรงจาก DevTools
--   (ไม่มีพารามิเตอร์ user_id ให้ปลอม)
--
-- รันซ้ำได้ / ต้องรัน 20_behavior_and_notifications.sql มาก่อน
-- ============================================================

-- ---------- ลบใบเดียว ----------
create or replace function public.delete_notification(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.notifications
   where id = p_id
     and user_id = app_current_user_id();

  -- ไม่เจอ = ไม่ใช่ของเรา หรือถูกลบไปแล้ว ตอบเหมือนกันทั้งสองกรณี
  -- ไม่บอกแยกว่า "มีอยู่แต่ไม่ใช่ของคุณ" เพราะนั่นคือการยืนยันว่า id นี้มีจริง
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- ---------- ลบทั้งหมดของตัวเอง ----------
create or replace function public.delete_all_notifications(p_only_read boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_me    uuid := app_current_user_id();
  v_count int;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  -- p_only_read = true ไว้เผื่ออยากล้างเฉพาะที่อ่านแล้ว เก็บอันที่ยังไม่อ่านไว้
  -- ค่าเริ่มต้นเป็น false (ลบหมด) เพราะปุ่มบนหน้าเว็บถามยืนยันก่อนอยู่แล้ว
  delete from public.notifications
   where user_id = v_me
     and (not p_only_read or is_read);

  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_count);
end $$;

comment on function public.delete_notification(uuid) is
  'ลบการแจ้งเตือนใบเดียว — ลบได้เฉพาะของตัวเอง';
comment on function public.delete_all_notifications(boolean) is
  'ลบการแจ้งเตือนทั้งหมดของตัวเอง (p_only_read = true ลบเฉพาะที่อ่านแล้ว)';

grant execute on function public.delete_notification(uuid) to authenticated;
grant execute on function public.delete_all_notifications(boolean) to authenticated;
revoke all on function public.delete_notification(uuid) from anon;
revoke all on function public.delete_all_notifications(boolean) from anon;

do $$
begin
  raise notice 'ลบแจ้งเตือนพร้อมใช้งาน: delete_notification() / delete_all_notifications()';
end $$;
