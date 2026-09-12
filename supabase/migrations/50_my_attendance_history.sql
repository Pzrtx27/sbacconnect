-- ============================================================
-- 50) นักเรียนดูประวัติการเช็คชื่อของตัวเองได้
--
-- ครูประจำชั้นบันทึก มา/สาย/ขาด/ลา ลง attendance_homeroom ทุกวัน
-- และนักเรียนได้แจ้งเตือนรายวันเมื่อสถานะเปลี่ยน
-- แต่ไม่มีหน้าไหนในแอปที่สรุปให้เจ้าตัวดูย้อนหลังได้เลย
--
-- คำถามที่ตอบไม่ได้ตอนนี้: "เทอมนี้ฉันขาดไปกี่วันแล้ว"
-- ซึ่งเป็นตัวเลขที่มีผลกับการจบการศึกษา และเป็นข้อมูลของตัวเขาเอง
--
-- policy attendance_homeroom_read_own (41_homeroom_attendance.sql) เปิดให้อ่าน
-- ของตัวเองได้อยู่แล้ว แต่ทำเป็น RPC ตามแบบ my_* ตัวอื่นในโปรเจกต์
-- เพราะต้องนับสรุปฝั่ง DB และไม่รับ user id จึงถามแทนคนอื่นไม่ได้
--
-- รันซ้ำได้
-- ============================================================
create or replace function public.my_attendance_history(p_limit integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_me    uuid := app_current_user_id();
  v_limit int  := greatest(1, least(coalesce(p_limit, 60), 200));
  v_rows  jsonb;
  v_sum   record;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;

  -- สรุปทั้งหมดที่มี ไม่ใช่แค่ช่วงที่ส่งกลับไปแสดง
  -- ไม่งั้นตัวเลข "ขาด 3 วัน" จะหมายถึง "ขาด 3 วันใน 60 วันล่าสุด" ซึ่งคนละความหมาย
  select
    count(*)                                          as total,
    count(*) filter (where status = 'present')        as present,
    count(*) filter (where status = 'late')           as late,
    count(*) filter (where status = 'absent')         as absent,
    count(*) filter (where status = 'leave')          as leave_count
  into v_sum
  from public.attendance_homeroom
  where student_user_id = v_me;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.attend_date desc), '[]'::jsonb)
    into v_rows
  from (
    select a.attend_date, a.status
    from public.attendance_homeroom a
    where a.student_user_id = v_me
    order by a.attend_date desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'ok', true,
    'days', v_rows,
    'summary', jsonb_build_object(
      'total',   v_sum.total,
      'present', v_sum.present,
      'late',    v_sum.late,
      'absent',  v_sum.absent,
      'leave',   v_sum.leave_count
    )
  );
end $fn$;

comment on function public.my_attendance_history(integer) is
  'ประวัติการเช็คชื่อเข้าแถวของผู้เรียกเอง พร้อมสรุปรวมทั้งหมด — ไม่รับ user id จึงดูแทนคนอื่นไม่ได้';

grant execute on function public.my_attendance_history(integer) to authenticated;
revoke all     on function public.my_attendance_history(integer) from anon;
revoke execute on function public.my_attendance_history(integer) from public;

-- ============================================================
-- ตรวจผล
-- ============================================================
do $$
begin
  if to_regprocedure('public.my_attendance_history(integer)') is null then
    raise warning 'ไม่พบ my_attendance_history';
  elsif has_function_privilege('anon', 'public.my_attendance_history(integer)', 'execute') then
    raise warning 'anon ยังเรียก my_attendance_history ได้';
  else
    raise notice 'ผ่าน — นักเรียนดูประวัติเช็คชื่อของตัวเองได้ และ anon เรียกไม่ได้';
  end if;
end $$;
