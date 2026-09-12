-- ============================================================
-- 01_schema.sql  — โครงสร้างตาราง เฟส 1
-- รันซ้ำได้ ไม่พัง
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- enum ----------
do $$ begin
  create type app_role as enum
    ('student','teacher','academic','cashier','pos','sysadmin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type credential_kind as enum ('rfid_uid','qr_token','code');
exception when duplicate_object then null; end $$;

do $$ begin
  create type wallet_kind as enum
    ('topup_cash','topup_qr','purchase','refund','adjust');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('paid','preparing','done','cancelled');
exception when duplicate_object then null; end $$;

-- ---------- ผู้ใช้ ----------
create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  auth_uid   uuid unique references auth.users(id) on delete set null,
  email      text unique not null,
  full_name  text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists class_rooms (
  id              bigint generated always as identity primary key,
  level           text not null,
  room_no         text not null,
  advisor_user_id uuid references users(id),
  unique (level, room_no)
);

-- หนึ่งคนมีได้หลาย role
create table if not exists user_roles (
  user_id  uuid not null references users(id) on delete cascade,
  role     app_role not null,
  scope_id bigint,
  primary key (user_id, role)
);

create table if not exists student_profiles (
  user_id        uuid primary key references users(id) on delete cascade,
  student_code   text unique not null,
  class_room_id  bigint references class_rooms(id),
  guardian_email text
);

create table if not exists teacher_profiles (
  user_id      uuid primary key references users(id) on delete cascade,
  teacher_code text unique not null,
  department   text
);

-- บัตร / QR / เลขประจำตัว — รองรับหลายชนิด ไม่ล็อกกับเทคโนโลยีเดียว
create table if not exists user_credentials (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references users(id) on delete cascade,
  kind      credential_kind not null,
  value     text not null,
  is_active boolean not null default true,
  added_at  timestamptz not null default now()
);

create unique index if not exists user_credentials_active_uq
  on user_credentials (kind, value) where is_active;

-- ---------- ร้านค้า ----------
create table if not exists products (
  id            bigint generated always as identity primary key,
  name          text not null,
  price_satang  integer not null check (price_satang >= 0),
  category      text,
  is_active     boolean not null default true,
  stock         integer
);

create table if not exists orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  total_satang integer not null check (total_satang >= 0),
  status       order_status not null default 'paid',
  pickup_code  text not null,
  created_at   timestamptz not null default now()
);

create index if not exists orders_user_idx on orders (user_id, created_at desc);

create table if not exists order_items (
  id                bigint generated always as identity primary key,
  order_id          uuid not null references orders(id) on delete cascade,
  product_id        bigint not null references products(id),
  qty               integer not null check (qty > 0),
  unit_price_satang integer not null check (unit_price_satang >= 0)
);

-- ---------- สมุดบัญชีเงิน ----------
-- ยอดคงเหลือ = balance_after ของแถวล่าสุด ไม่มีคอลัมน์ balance ที่บวกลบทับได้
create table if not exists wallet_entries (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references users(id),
  amount_satang   integer not null check (amount_satang <> 0),
  kind            wallet_kind not null,
  ref_id          uuid,
  balance_after   integer not null check (balance_after >= 0),
  idempotency_key text not null,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

-- หัวใจของการกันตัดเงินซ้ำ
create unique index if not exists wallet_entries_idem_uq
  on wallet_entries (idempotency_key);

create index if not exists wallet_entries_user_idx
  on wallet_entries (user_id, id desc);

-- ---------- audit ----------
create table if not exists audit_log (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid references users(id),
  action         text not null,
  target_table   text,
  target_id      text,
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);
