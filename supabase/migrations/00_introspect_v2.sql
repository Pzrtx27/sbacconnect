-- 00_introspect_v2.sql — อ่านอย่างเดียว ปลอดภัย 100%
--
-- ทำไมต้องมีเวอร์ชัน 2:
--   SQL Editor ของ Supabase แสดงผลเฉพาะ "คำสั่งสุดท้าย" เท่านั้น
--   ไฟล์ 00 เดิมมี 6 คำสั่ง จึงเห็นแค่อันท้ายสุด
--   ไฟล์นี้ยุบทุกอย่างเหลือ "คำสั่งเดียว คืน 1 แถว 1 คอลัมน์" เป็น JSON
--
-- วิธีใช้: วางทั้งไฟล์ → Run → คลิกที่ช่องผลลัพธ์ → ก๊อปข้อความทั้งหมดส่งกลับมา
--         (หรือกดปุ่ม Export > JSON แล้วส่งไฟล์มา)

select jsonb_build_object(

  -- คอลัมน์ทั้งหมดของตารางที่ต้องใช้
  'columns', (
    select jsonb_agg(jsonb_build_object(
      't', table_name,
      'c', column_name,
      'type', data_type,
      'null', is_nullable,
      'default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'users','user_roles','student_profiles','teacher_profiles',
        'class_rooms','user_credentials','products',
        'orders','order_items','wallet_entries','audit_log'
      )
  ),

  -- ค่าที่ใช้ได้ของ enum ทุกตัว
  'enums', (
    select jsonb_object_agg(enum_name, vals)
    from (
      select t.typname as enum_name,
             jsonb_agg(e.enumlabel order by e.enumsortorder) as vals
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      group by t.typname
    ) s
  ),

  -- ลายเซ็นฟังก์ชัน (ต้องรู้ชื่อ/ลำดับพารามิเตอร์ก่อนเรียกใช้)
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_arguments(p.oid),
      'returns', pg_get_function_result(p.oid)
    ) order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_current_user_id','app_has_role','app_balance',
        'my_balance','place_order','topup_cash','make_username'
      )
  ),

  -- PK / UNIQUE / FK — จำเป็นสำหรับเขียน on conflict ให้ถูกคอลัมน์
  'constraints', (
    select jsonb_agg(jsonb_build_object(
      't', table_name,
      'name', constraint_name,
      'type', constraint_type,
      'cols', cols
    ) order by table_name)
    from (
      select tc.table_name,
             tc.constraint_name,
             tc.constraint_type,
             string_agg(kcu.column_name, ',' order by kcu.ordinal_position) as cols
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.table_schema = tc.table_schema
      where tc.table_schema = 'public'
        and tc.constraint_type in ('PRIMARY KEY','UNIQUE','FOREIGN KEY')
        and tc.table_name in (
          'users','user_roles','student_profiles','class_rooms',
          'user_credentials','wallet_entries','orders','order_items'
        )
      group by tc.table_name, tc.constraint_name, tc.constraint_type
    ) s
  ),

  -- ข้อมูลอ้างอิงที่มีอยู่จริง (ต้องรู้ว่า class_rooms เก็บห้องยังไง)
  'class_rooms', (select jsonb_agg(to_jsonb(c)) from public.class_rooms c),
  'products',    (select jsonb_agg(to_jsonb(p)) from public.products p),

  -- ตัวอย่าง users ที่มีอยู่ 9 แถว (ปิดบังอีเมลบางส่วน ไม่เอาข้อมูลส่วนตัวออกมาเกินจำเป็น)
  'users_sample', (
    select jsonb_agg(jsonb_build_object(
      'email_masked', left(u.email, 3) || '***@' || split_part(u.email, '@', 2),
      'has_auth_uid', (u.auth_uid is not null)
    ))
    from public.users u
  )

) as schema_dump;
