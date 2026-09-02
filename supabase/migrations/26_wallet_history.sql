-- ============================================================
-- 26_wallet_history.sql — ประวัติเงินเข้า-ออกของกระเป๋าเงิน
--
-- ปัญหาที่แก้:
--   ทุกความเคลื่อนไหวของเงินถูกบันทึกใน wallet_entries ครบมาตลอด
--   (เติมเงิน 'topup_cash'/'topup_qr'/'adjust' และซื้อของ 'purchase')
--   แต่ไม่เคยมีทางให้นักเรียนเปิดดูเลย หน้าเว็บเห็นแค่ยอดคงเหลือก้อนเดียว
--   จาก my_balance() ไม่รู้ว่ายอดนั้นมาจากไหน หายไปไหน
--   นักเรียนที่รู้สึกว่ายอดหาย จึงไม่มีหลักฐานอะไรไปคุยกับเจ้าหน้าที่เลย
--
-- วิธีแก้:
--   RPC my_wallet_history() คืนเฉพาะรายการของคนที่เรียกเท่านั้น
--   เป็น security definer แบบเดียวกับ my_orders() / my_behavior_logs()
--   ไม่ต้องพึ่ง RLS ของ wallet_entries ซึ่งอยู่ใน 03_rls.sql ที่ไม่ได้อยู่ใน repo
--   และไม่ต้อง grant select บนตารางให้ใครเพิ่ม
--
-- หมายเหตุเรื่องคอลัมน์เวลา:
--   01_schema.sql ไม่ได้อยู่ใน repo จึงไม่รู้แน่ว่า wallet_entries มี created_at ไหม
--   (06_seed_real.example.sql เรียงด้วย w.id ไม่ใช่ created_at)
--   จึงอ่านจาก catalog ตอนรันแล้วประกอบฟังก์ชันตามที่มีจริง แทนการเดาแล้วพังตอนเรียก
--
-- รันซ้ำได้
-- ============================================================

do $$
declare
  v_has_created_at boolean;
  v_time_expr      text;
  v_order_expr     text;
begin
  if to_regclass('public.wallet_entries') is null then
    raise exception 'ไม่มีตาราง public.wallet_entries — ต้องรัน 01_schema.sql ก่อน';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallet_entries'
      and column_name = 'created_at'
  ) into v_has_created_at;

  if v_has_created_at then
    v_time_expr  := 'w.created_at';
    v_order_expr := 'w.created_at desc, w.id desc';
    raise notice 'wallet_entries มี created_at — ใช้เป็นเวลาที่แสดง';
  else
    v_time_expr  := 'null::timestamptz';
    v_order_expr := 'w.id desc';
    raise notice 'wallet_entries ไม่มี created_at — เรียงด้วย id และไม่แสดงเวลา';
  end if;

  execute format($fn$
    create or replace function public.my_wallet_history(p_limit integer default 50)
    returns jsonb
    language sql
    stable
    security definer
    set search_path = public
    as $body$
      select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.sort_key desc), '[]'::jsonb)
      from (
        select
          w.id::text                       as id,
          w.amount_satang                  as amount_satang,
          w.balance_after                  as balance_after,
          w.kind                           as kind,
          -- ทิศทางของเงิน ตัดสินจากเครื่องหมายของยอด ไม่ใช่จากชื่อ kind
          -- เพราะ 'adjust' เป็นได้ทั้งเพิ่มและลด (เจ้าหน้าที่ปรับยอด)
          case when w.amount_satang >= 0 then 'in' else 'out' end as direction,
          %s                               as occurred_at,
          w.ref_id::text                   as ref_id,
          w.id                             as sort_key
        from public.wallet_entries w
        where w.user_id = app_current_user_id()
        order by %s
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) t;
    $body$;
  $fn$, v_time_expr, v_order_expr);
end $$;

comment on function public.my_wallet_history(integer) is
  'ประวัติเงินเข้า-ออกของผู้เรียกเอง เรียงใหม่สุดก่อน — direction คำนวณจากเครื่องหมายของ amount_satang';

-- ผู้เรียกเห็นเฉพาะแถวของตัวเองเพราะ where user_id = app_current_user_id()
-- ไม่มีพารามิเตอร์ user_id ให้ปลอมเป็นคนอื่น
grant execute on function public.my_wallet_history(integer) to authenticated;
revoke all on function public.my_wallet_history(integer) from anon;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.wallet_entries;
  raise notice 'my_wallet_history() พร้อมใช้งาน — wallet_entries มีทั้งหมด % แถว', v_n;
end $$;
