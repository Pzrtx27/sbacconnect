-- ============================================================
-- 03_rls.sql — ปิดทุกประตู เหลือทางเข้าเดียวคือฟังก์ชัน
-- ============================================================

alter table users            enable row level security;
alter table user_roles       enable row level security;
alter table student_profiles enable row level security;
alter table teacher_profiles enable row level security;
alter table class_rooms      enable row level security;
alter table user_credentials enable row level security;
alter table products         enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table wallet_entries   enable row level security;
alter table audit_log        enable row level security;

-- ---------- users ----------
drop policy if exists users_self_select on users;
create policy users_self_select on users
  for select to authenticated
  using (auth_uid = auth.uid() or app_has_role('sysadmin'));

-- ---------- user_roles ----------
drop policy if exists roles_self_select on user_roles;
create policy roles_self_select on user_roles
  for select to authenticated
  using (user_id = app_current_user_id() or app_has_role('sysadmin'));

-- ---------- profiles ----------
drop policy if exists student_self_select on student_profiles;
create policy student_self_select on student_profiles
  for select to authenticated
  using (user_id = app_current_user_id()
         or app_has_role('teacher') or app_has_role('academic'));

drop policy if exists teacher_self_select on teacher_profiles;
create policy teacher_self_select on teacher_profiles
  for select to authenticated
  using (user_id = app_current_user_id() or app_has_role('academic'));

-- ---------- class_rooms ----------
drop policy if exists rooms_read on class_rooms;
create policy rooms_read on class_rooms
  for select to authenticated using (true);

-- ---------- บัตร ----------
drop policy if exists cred_self_select on user_credentials;
create policy cred_self_select on user_credentials
  for select to authenticated
  using (user_id = app_current_user_id() or app_has_role('sysadmin'));

-- ---------- สินค้า ----------
drop policy if exists products_read on products;
create policy products_read on products
  for select to authenticated using (is_active or app_has_role('sysadmin'));

drop policy if exists products_admin_write on products;
create policy products_admin_write on products
  for all to authenticated
  using (app_has_role('sysadmin')) with check (app_has_role('sysadmin'));

-- ---------- ออเดอร์ ----------
drop policy if exists orders_self_select on orders;
create policy orders_self_select on orders
  for select to authenticated using (user_id = app_current_user_id());

drop policy if exists order_items_self_select on order_items;
create policy order_items_self_select on order_items
  for select to authenticated
  using (exists (select 1 from orders o
                 where o.id = order_id and o.user_id = app_current_user_id()));

-- ---------- เงิน ----------
-- ดูได้เฉพาะของตัวเอง ไม่มีใครดูของคนอื่นได้ แม้แต่ sysadmin
drop policy if exists wallet_self_select on wallet_entries;
create policy wallet_self_select on wallet_entries
  for select to authenticated using (user_id = app_current_user_id());

-- ---------- audit ----------
drop policy if exists audit_no_read on audit_log;
create policy audit_no_read on audit_log
  for select to authenticated using (app_has_role('sysadmin'));

-- ============================================================
-- ปิดการเขียนตรง — ทางเข้าเดียวคือฟังก์ชัน security definer
-- ============================================================
revoke insert, update, delete on wallet_entries from authenticated, anon;
revoke insert, update, delete on orders         from authenticated, anon;
revoke insert, update, delete on order_items    from authenticated, anon;
revoke insert, update, delete on user_roles     from authenticated, anon;
revoke all on audit_log from authenticated, anon;

grant execute on function my_balance()                        to authenticated;
grant execute on function place_order(text, jsonb, text)       to authenticated;
grant execute on function topup_cash(uuid, integer, text)      to authenticated;

revoke all on function place_order(text, jsonb, text) from anon;
revoke all on function topup_cash(uuid, integer, text) from anon;

-- หมายเหตุ: เครื่อง POS และจุดเติมเงินต้องมี role ของตัวเองในภายหลัง
-- ห้ามใช้ service_role key ฝังในอุปกรณ์เด็ดขาด
