-- ============================================================
-- 48) รัดขอบเขตการอ่านคะแนน + ปิดช่องคะแนนรั่วทาง realtime
--
-- แก้สองเรื่องที่ 40_gradebook.sql เปิดกว้างเกินจำเป็น
-- รันหลังไฟล์ 40 (และ 46 ถ้ามี) รันซ้ำได้
-- ============================================================

-- ------------------------------------------------------------
-- 1) ครูอ่านคะแนนได้เฉพาะวิชาที่ตัวเองรับผิดชอบ ไม่ใช่ทั้งวิทยาลัย
--
-- ของเดิม:
--     using (student_user_id = app_current_user_id() or app_is_teaching_staff())
--
-- ฝั่งนักเรียนถูกต้องแล้วและบรรลุผลจริง — นักเรียนอ่านคะแนนเพื่อนไม่ได้
-- ปัญหาอยู่ที่กิ่งหลัง: app_is_teaching_staff() = teacher หรือ academic หรือ sysadmin
-- ไม่ผูกกับห้องหรือวิชาเลย ครูคนไหนก็ยิง GET /rest/v1/student_scores?select=*
-- ได้คะแนนทุกช่องของนักเรียนทุกคนทั้งวิทยาลัย และ score_logs ก็ได้เหตุผล
-- ที่ครูคนอื่นเขียนถึงเด็กคนอื่นทั้งหมด ("ลอกข้อสอบ", "ไม่ส่งงาน")
--
-- ที่ทำให้เรื่องนี้เป็นปัญหาไม่ใช่แค่ความเห็น: ไฟล์ 41 ในชุดเดียวกันตั้งหลักตรงข้ามไว้เอง
--   "ถ้าเปิด policy ให้ครูอ่านทั้งตาราง = ครูทุกคนเห็นสถานะเด็กทั้งวิทยาลัยโดยไม่จำเป็น"
-- คะแนนอ่อนไหวกว่าสถานะเข้าแถว แต่ได้การป้องกันที่หลวมกว่า
--
-- ทำไมไม่ถอดกิ่งครูทิ้งไปเลย:
--   หน้าสมุดคะแนนของครู subscribe realtime บนตารางนี้อยู่ (useGradebook.js:192)
--   ถ้าครูอ่านแถวไม่ได้เลย Supabase Realtime จะไม่ส่ง event ให้ = กรอกคะแนนแล้ว
--   หน้าจอครูอีกเครื่องไม่ขยับ ซึ่งเป็นอาการที่โปรเจกต์นี้พยายามกำจัดมาตลอด
--   จึงรัดให้แคบลงแทนที่จะตัดทิ้ง: เห็นเฉพาะวิชาที่ตัวเองมีสิทธิ์กรอก
--   (ฝ่ายวิชาการ/แอดมินยังเห็นทุกวิชา เพราะ app_can_grade_subject มีกิ่งนั้นอยู่แล้ว)
-- ------------------------------------------------------------
drop policy if exists student_scores_read on public.student_scores;
create policy student_scores_read on public.student_scores
  for select to authenticated
  using (
    student_user_id = app_current_user_id()
    or app_can_grade_subject(subject_id)
  );

drop policy if exists score_logs_read on public.score_logs;
create policy score_logs_read on public.score_logs
  for select to authenticated
  using (
    student_user_id = app_current_user_id()
    or app_can_grade_subject(subject_id)
  );

-- ------------------------------------------------------------
-- 2) subject_gradebook() — ตรวจสิทธิ์ระดับวิชา ไม่ใช่แค่ "เป็นครูหรือเปล่า"
--
-- ของเดิมด่านเดียวคือ app_is_teaching_staff() แล้วคืนตารางคะแนนเต็มรูป
-- พร้อมชื่อและรหัสนักเรียนของห้องนั้น ครูคนไหนก็ดึงของทุกห้องทุกวิชาได้
-- ส่วน can_grade ที่ฟังก์ชันคืนมาเป็น "ธงให้หน้าเว็บปิดปุ่ม" ไม่ใช่ด่าน
--
-- ไม่แตะส่วนอื่นของฟังก์ชันเลย เปลี่ยนแค่บรรทัดด่าน
-- ------------------------------------------------------------
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'subject_gradebook'
  limit 1;

  if v_src is null then
    raise warning 'ยังไม่มี subject_gradebook() — รัน 40_gradebook.sql ก่อน แล้วค่อยรันไฟล์นี้ใหม่';
    return;
  end if;

  if position('app_can_grade_subject(p_subject_id)' in v_src) > 0 then
    raise notice 'subject_gradebook() มีด่านระดับวิชาแล้ว ข้ามไป';
    return;
  end if;

  -- แทนที่ด่านเดิมด้วยด่านระดับวิชา โดยไม่แตะตรรกะที่เหลือ
  declare
    v_new text := replace(
      v_src,
      'if not app_is_teaching_staff() then',
      'if not app_can_grade_subject(p_subject_id) then'
    );
  begin
    -- ถ้าแทนที่ไม่ติด (ของเดิมเขียนคนละรูปแบบ) ต้องดังไว้ ไม่ใช่ execute ของเดิมกลับเข้าไปเฉย ๆ
    -- แล้วขึ้น notice ว่าสำเร็จทั้งที่ไม่ได้แก้อะไรเลย
    if v_new = v_src then
      raise warning 'แทนที่ด่านใน subject_gradebook() ไม่ติด — ต้องแก้มือให้ใช้ app_can_grade_subject(p_subject_id)';
      return;
    end if;

    execute v_new;
    raise notice 'รัดด่าน subject_gradebook() ให้ตรวจสิทธิ์ระดับวิชาแล้ว';
  end;
end $$;

-- ------------------------------------------------------------
-- 3) ปิดช่องคะแนนรั่วตอนครูล้างคะแนน (เหตุการณ์ DELETE ทาง realtime)
--
-- apply_score_change() ลบแถวจริงเมื่อครูล้างคะแนน (40_gradebook.sql)
-- และตารางนี้ถูกตั้ง replica identity full ไว้ = เหตุการณ์ DELETE จะพ่วง
-- แถวเก่าทั้งแถวออกไป (student_user_id, item_id, score, note)
--
-- Supabase Realtime กรอง RLS ได้กับ INSERT/UPDATE แต่ไม่กรอง DELETE
-- เพราะแถวถูกลบไปแล้ว ประเมิน policy ไม่ได้ นักเรียนที่เปิดหน้าคะแนนค้างไว้
-- จึงมีโอกาสได้คะแนนของเพื่อนทุกครั้งที่ครูล้างคะแนนใครสักคน
-- ขัดกับบรรทัดที่ไฟล์ 40 เขียนไว้เองว่า "นักเรียนต้องไม่เห็นคะแนนเพื่อนแม้แต่แถวเดียว"
--
-- แก้ที่ replica identity แทนการเลิกลบแถว เพราะ:
--   คอมเมนต์ในไฟล์ 40 บอกว่าตั้ง full ไว้เพื่อให้หน้าเว็บ "กรองตามนักเรียนได้"
--   แต่ไล่โค้ดฝั่งเว็บแล้วไม่มีที่ไหนใช้ payload เลย — useRealtimeTable เรียกแค่
--   () => onChange() เพื่อสั่งโหลดใหม่ผ่าน RPC และไม่มีใครส่ง filter มาสักที่
--   เจตนานั้นจึงไม่เคยถูกเขียนจริง ลดเหลือ default (ส่งแค่ primary key)
--   จึงไม่กระทบฟีเจอร์ใด ๆ แต่ปิดช่องรั่วทั้งช่อง
--
-- subjects กับ score_items ไม่แตะ — เป็นโครงสร้างรายวิชา ไม่มีข้อมูลรายบุคคล
-- ------------------------------------------------------------
alter table public.student_scores replica identity default;

-- ============================================================
-- ตรวจผล
-- ============================================================
do $$
declare
  v_bad int := 0;
  v_ident char;
  v_using text;
begin
  select relreplident into v_ident from pg_class where relname = 'student_scores';
  if v_ident is distinct from 'd' then
    raise warning 'student_scores replica identity ยังไม่ใช่ default (ได้ %)', v_ident;
    v_bad := v_bad + 1;
  end if;

  for v_using in
    select pg_get_expr(pol.polqual, pol.polrelid)
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    where c.relname in ('student_scores', 'score_logs')
  loop
    if position('app_is_teaching_staff' in v_using) > 0 then
      raise warning 'ยังมี policy ที่เปิดให้เจ้าหน้าที่สอนอ่านทั้งตาราง: %', v_using;
      v_bad := v_bad + 1;
    end if;
  end loop;

  if v_bad = 0 then
    raise notice 'ผ่าน — ครูอ่านคะแนนได้เฉพาะวิชาที่รับผิดชอบ และ DELETE ไม่พ่วงคะแนนออกไปแล้ว';
  end if;
end $$;
