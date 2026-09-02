-- ============================================================
-- 27_gate_logs.sql — บันทึกเวลาเข้าโรงเรียน (ขาเข้าอย่างเดียว)
--
-- ปัญหาที่แก้:
--   การ์ด "เวลาเข้า-ออก" บนหน้าแรกของนักเรียนเป็นตัวเลขที่เขียนตายไว้ใน JSX
--   (เข้า 07:42 / ออก 16:30) นักเรียนทุกคนเปิดดูแล้วเห็นเลขชุดเดียวกันหมด
--   และไม่มีตารางรองรับเลยแม้แต่ตารางเดียว ทั้งที่ PRODUCT.md ชูเรื่องนี้เป็นข้อแรก
--
-- ทำไมมีแต่ขาเข้า:
--   ของจริงนักเรียนแตะบัตรตอนเข้าโรงเรียนเท่านั้น ตอนกลับบ้านไม่มีใครแตะ
--   ถ้าออกแบบตารางให้มีคอลัมน์ exited_at ไว้ ข้อมูลจะว่างตลอดกาล
--   แล้วหน้าเว็บต้องเดาว่า null แปลว่า "ยังไม่กลับ" หรือ "กลับแล้วแต่ไม่ได้แตะ"
--   ซึ่งแยกไม่ออก — เก็บเฉพาะสิ่งที่เกิดขึ้นจริงตรงไปตรงมากว่า
--   หนึ่งแถว = หนึ่งครั้งที่เดินผ่านประตูเข้ามา
--
-- รันซ้ำได้ / ไม่ต้องรันไฟล์อื่นก่อน (นอกจาก schema หลัก)
-- ============================================================

create table if not exists public.gate_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.users(id) on delete cascade,
  entered_at  timestamptz not null default now(),

  -- ประตูไหน — โรงเรียนมีหลายทางเข้า อยากรู้ว่าคนไหนเข้าทางไหน
  gate        text        not null default 'ประตูหน้า',

  -- แตะบัตร / สแกน QR / เจ้าหน้าที่บันทึกให้ (กรณีลืมบัตร)
  method      text        not null default 'card',

  recorded_by uuid        references auth.users(id) on delete set null,

  constraint gate_logs_method_valid check (method in ('card', 'qr', 'manual'))
);

-- หน้าเว็บถามเสมอว่า "ของคนนี้ ล่าสุดกี่ครั้ง" — index ตามนั้น
create index if not exists gate_logs_user_time_idx
  on public.gate_logs (user_id, entered_at desc);

comment on table public.gate_logs is
  'เวลาเข้าโรงเรียน — ขาเข้าอย่างเดียว ไม่เก็บขาออก เพราะของจริงไม่มีใครแตะบัตรตอนกลับ';
comment on column public.gate_logs.entered_at is
  'เวลาที่เดินผ่านประตูเข้ามา หนึ่งแถวคือหนึ่งครั้ง';

-- ============================================================
-- RLS
-- ============================================================
alter table public.gate_logs enable row level security;

drop policy if exists gate_logs_read_own on public.gate_logs;
drop policy if exists gate_logs_read_staff on public.gate_logs;

-- นักเรียนเห็นเฉพาะของตัวเอง
create policy gate_logs_read_own on public.gate_logs
  for select to authenticated
  using (user_id = public.app_current_user_id());

-- ครู/ฝ่ายวิชาการเห็นทั้งหมด (ใช้ดูว่าใครมาสาย ใครยังไม่มา)
create policy gate_logs_read_staff on public.gate_logs
  for select to authenticated
  using (public.app_is_teaching_staff() or public.app_is_academic_staff());

-- ไม่มี policy INSERT/UPDATE/DELETE โดยตั้งใจ
-- ทางเขียนมีทางเดียวคือ record_gate_entry() ด้านล่าง (แนวเดียวกับ repair_tickets)
-- ถ้าเปิดให้ insert ตรงได้ นักเรียนจะปั๊มเวลาเข้าเรียนของตัวเองย้อนหลังได้
grant select on public.gate_logs to authenticated;
revoke all on public.gate_logs from anon;

-- ============================================================
-- บันทึกการเข้า — เจ้าหน้าที่/เครื่องสแกนเท่านั้น
--
-- ที่ไม่ให้นักเรียนเรียกเองเด็ดขาด: ถ้าเรียกได้ ก็นั่งอยู่บ้านแล้วกดว่ามาโรงเรียนแล้วได้
-- การเช็คชื่อทั้งระบบจะไม่มีความหมายทันที
-- ============================================================
create or replace function public.record_gate_entry(
  p_user_id uuid,
  p_gate    text default 'ประตูหน้า',
  p_method  text default 'card'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := public.app_current_user_id();
  v_recent public.gate_logs%rowtype;
  v_row    public.gate_logs%rowtype;
begin
  if not (public.app_is_teaching_staff() or public.app_is_academic_staff()) then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'ไม่ได้ระบุนักเรียน');
  end if;

  if p_method is not null and p_method not in ('card', 'qr', 'manual') then
    return jsonb_build_object('ok', false, 'error', 'วิธีบันทึกไม่ถูกต้อง');
  end if;

  -- แตะบัตรซ้ำภายใน 5 นาทีถือเป็นครั้งเดิม
  -- เครื่องอ่านบัตรอ่านติดกันสองสามครั้งเป็นเรื่องปกติ ถ้านับหมดประวัติจะรก
  -- และดูเหมือนนักเรียนเดินเข้าออกทั้งวัน
  select * into v_recent
  from public.gate_logs
  where user_id = p_user_id
    and entered_at > now() - interval '5 minutes'
  order by entered_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'id', v_recent.id,
      'entered_at', v_recent.entered_at
    );
  end if;

  insert into public.gate_logs (user_id, gate, method, recorded_by)
  values (p_user_id, coalesce(nullif(p_gate, ''), 'ประตูหน้า'), coalesce(p_method, 'card'), v_actor)
  returning * into v_row;

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'id', v_row.id, 'entered_at', v_row.entered_at
  );
end $$;

comment on function public.record_gate_entry(uuid, text, text) is
  'บันทึกเวลาเข้าโรงเรียนของนักเรียนหนึ่งคน — เจ้าหน้าที่เท่านั้น กันแตะซ้ำภายใน 5 นาที';

grant execute on function public.record_gate_entry(uuid, text, text) to authenticated;
revoke all on function public.record_gate_entry(uuid, text, text) from anon;

-- ============================================================
-- ประวัติการเข้าของตัวเอง
-- ไม่รับพารามิเตอร์ user_id จึงไม่มีทางขอดูของคนอื่น
-- ============================================================
create or replace function public.my_gate_logs(p_limit integer default 14)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'entered_at', t.entered_at,
    'gate', t.gate,
    'method', t.method
  ) order by t.entered_at desc), '[]'::jsonb)
  from (
    select g.id, g.entered_at, g.gate, g.method
    from public.gate_logs g
    where g.user_id = public.app_current_user_id()
    order by g.entered_at desc
    limit greatest(1, least(coalesce(p_limit, 14), 100))
  ) t;
$$;

comment on function public.my_gate_logs(integer) is
  'ประวัติเวลาเข้าโรงเรียนของผู้เรียกเอง เรียงใหม่สุดก่อน';

grant execute on function public.my_gate_logs(integer) to authenticated;
revoke all on function public.my_gate_logs(integer) from anon;

do $$
begin
  raise notice 'gate_logs พร้อมใช้งาน — บันทึกด้วย record_gate_entry() อ่านด้วย my_gate_logs()';
end $$;
