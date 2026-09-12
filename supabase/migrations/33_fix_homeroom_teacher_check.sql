-- ============================================================
-- 33_fix_homeroom_teacher_check.sql — ครูมองไม่เห็นใบลาที่นักเรียนยื่นมา
--
-- อาการ: นักเรียนกดยื่นใบลาสำเร็จ (ขึ้น "ยื่นใบลาเรียบร้อยแล้ว")
--   แต่ฝั่งครูเปิดคิว "รออนุมัติ" แล้วว่างเปล่า ใบลาค้างไม่มีใครอนุมัติได้
--
-- สาเหตุ: app_is_homeroom_teacher_of() ใน 22_leave_requests.sql ใช้ inner join
--
--     from public.student_profiles sp
--     join public.class_rooms cr on cr.id = sp.class_room_id
--     where sp.user_id = p_student_user_id
--       and (cr.homeroom_teacher_id = app_current_user_id()
--            or (cr.homeroom_teacher_id is null and app_has_role('teacher')))
--
--   ถ้านักเรียนคนนั้นยังไม่ถูกผูกกับห้อง (sp.class_room_id is null)
--   inner join จะไม่คืนแถวเลย ฟังก์ชันจึงตอบ false ทันที
--   แปลว่าเงื่อนไข fallback บรรทัดสุดท้ายไม่มีโอกาสได้ทำงาน
--
--   ซึ่งขัดกับเจตนาที่เขียนไว้ใน comment ของฟังก์ชันเองว่า
--   "ถ้าห้องนั้นยังไม่ผูกครูประจำชั้นไว้ จะยอมให้ role teacher คนไหนก็ได้อนุมัติแทนไปก่อน
--    กันใบลาค้างเพราะแอดมินยังตั้งค่าไม่ครบ"
--
--   เจตนาถูกแล้ว แต่ inner join ทำให้ครอบไม่ถึงเคส "ยังไม่ผูกห้อง"
--   ซึ่งเป็นเคสที่ตั้งค่าไม่ครบยิ่งกว่า "ผูกห้องแล้วแต่ยังไม่ตั้งครูประจำชั้น" อีก
--
-- แก้: เปลี่ยนเป็น left join
--   นักเรียนไม่มีห้อง -> cr ทุกคอลัมน์เป็น null -> cr.homeroom_teacher_id is null เป็นจริง
--   -> ครูคนไหนก็อนุมัติได้ ตรงตามเจตนาเดิมทุกประการ
--
-- ไม่กระทบเคสที่ตั้งค่าครบแล้ว: ห้องที่ผูกครูประจำชั้นไว้ ยังคงเห็นได้เฉพาะครูคนนั้น
--
-- รันซ้ำได้ / ต้องรัน 22_leave_requests.sql มาก่อน
-- ============================================================

create or replace function public.app_is_homeroom_teacher_of(p_student_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.student_profiles sp
    -- left join: นักเรียนที่ยังไม่ถูกผูกห้องต้องไม่ทำให้เงื่อนไขตายตั้งแต่ต้น
    left join public.class_rooms cr on cr.id = sp.class_room_id
    where sp.user_id = p_student_user_id
      and (
        cr.homeroom_teacher_id = app_current_user_id()
        -- ครอบสองเคส: ห้องยังไม่ตั้งครูประจำชั้น และ นักเรียนยังไม่ถูกผูกห้อง
        or (cr.homeroom_teacher_id is null and app_has_role('teacher'))
      )
  );
$$;

comment on function public.app_is_homeroom_teacher_of(uuid) is
  'true เมื่อผู้เรียกเป็นครูประจำชั้นของนักเรียนคนนี้ — ถ้าห้องนั้นยังไม่ผูกครูประจำชั้น '
  'หรือนักเรียนยังไม่ถูกผูกกับห้องเลย จะยอมให้ role teacher คนไหนก็ได้อนุมัติแทนไปก่อน '
  'กันใบลาค้างเพราะแอดมินยังตั้งค่าไม่ครบ';

grant execute on function public.app_is_homeroom_teacher_of(uuid) to authenticated;
revoke all on function public.app_is_homeroom_teacher_of(uuid) from anon;

-- ============================================================
-- ตรวจสอบ — ใบลาล่าสุด 10 ใบ พร้อมคำตอบว่าใครเห็นใบไหน
-- ============================================================
-- ถ้าหลังรันไฟล์นี้แล้วครูยังไม่เห็น ให้ดูคอลัมน์ "ใครเห็นใบลานี้"
-- จะบอกตรง ๆ ว่าติดที่ตั้งค่าห้อง/ครูประจำชั้น ไม่ใช่ที่ตัวฟังก์ชันแล้ว
select
  to_char(lr.created_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI')  as ยื่นเมื่อ,
  s.full_name                                                          as นักเรียน,
  lr.status                                                            as สถานะ,
  coalesce(cr.level || ' ห้อง ' || cr.room_no, '— ยังไม่ผูกห้อง —')      as ห้อง,
  case
    when sp.user_id is null
      then 'บัญชีนี้ไม่มี student_profile — ยื่นใบลาไม่ได้ตั้งแต่แรก'
    when sp.class_room_id is null
      then 'ครูคนไหนก็เห็น (นักเรียนยังไม่ผูกห้อง) — ต้องรันไฟล์นี้ก่อนถึงจะเห็น'
    when cr.homeroom_teacher_id is null
      then 'ครูคนไหนก็เห็น (ห้องนี้ยังไม่ตั้งครูประจำชั้น)'
    else 'เฉพาะ ' || coalesce(t.full_name, '(หา user ไม่เจอ)') || ' เท่านั้น'
  end                                                                  as ใครเห็นใบลานี้
from public.leave_requests lr
join public.users s on s.id = lr.student_user_id
left join public.student_profiles sp on sp.user_id = lr.student_user_id
left join public.class_rooms cr on cr.id = sp.class_room_id
left join public.users t on t.id = cr.homeroom_teacher_id
order by lr.created_at desc
limit 10;
