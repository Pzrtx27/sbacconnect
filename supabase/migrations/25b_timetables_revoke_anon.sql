-- ============================================================
-- แก้เพิ่มเติมของ 25_timetables.sql — ปิดสิทธิ์ anon
--
-- ตรวจหลังรันจริงแล้วพบว่า anon ยิง /rest/v1/timetables ได้ 200 กลับไป
-- (ผลลัพธ์ว่าง เพราะไม่มี policy ให้ anon — ข้อมูลยังไม่รั่ว)
-- แต่ทุกตารางอื่นในโปรเจกต์นี้ revoke anon ไว้หมด ไฟล์ 25 ตกไปตัวเดียว
--
-- Supabase ให้สิทธิ์ anon กับตารางใหม่ใน public อัตโนมัติ ถ้าไม่ถอน
-- วันหลังถ้ามีใครเผลอเพิ่ม policy ที่ไม่ระบุ role ข้อมูลจะหลุดทันที
-- ปิดประตูชั้นนอกไว้เลยดีกว่า
--
-- รันซ้ำได้ / สั้น ใช้เวลาไม่ถึงวินาที
-- ============================================================

grant select, insert, update, delete on public.timetables to authenticated;
revoke all on public.timetables from anon;

do $$
begin
  raise notice 'ปิดสิทธิ์ anon บน timetables แล้ว';
end $$;
