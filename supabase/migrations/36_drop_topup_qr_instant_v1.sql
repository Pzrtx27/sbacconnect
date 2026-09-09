-- ============================================================
-- 36_drop_topup_qr_instant_v1.sql — ลบฟังก์ชันเติมเงินตัวเก่าทิ้งถาวร
--
-- ที่มา:
--   topup_qr_instant(numeric, text, text) จาก 19_topup_qr_instant.sql
--   เชื่อยอดที่ผู้ใช้พิมพ์ 100% ไม่ตรวจว่าไฟล์สลิปมีอยู่จริง และไม่มีอะไร
--   กันการเรียกซ้ำเลย = เปิด DevTools ยิงวนลูปได้เงินไม่จำกัด
--
--   30_topup_instant_guarded.sql เลือก "ถอนสิทธิ์แต่ไม่ drop" เพราะกลัวมีคนอ้างถึงอยู่
--   ตรวจแล้วไม่มีใครอ้างถึงจริง: ฝั่งหน้าเว็บเรียกแค่ topup_qr_instant_v2
--   (src/components/wallet/TopUpSlipForm.jsx) และไม่มีฟังก์ชันใน DB ตัวไหนเรียกมัน
--
--   การเก็บไว้เฉย ๆ อันตรายกว่าที่คิด เพราะทั้ง 19 และ 24 มีคำสั่ง
--   create or replace + grant execute ให้ authenticated อยู่ในตัว
--   ทุกไฟล์ในโปรเจกต์นี้เขียนกำกับว่า "รันซ้ำได้" และรันด้วยมือผ่าน SQL Editor
--   ถ้าวันหลังมีใครไล่รันใหม่ ช่องโหว่จะกลับมาเงียบ ๆ ไม่มี error ไม่มี log
--
--   ปิดครบสามทางแล้ว:
--     - ไฟล์นี้ลบฟังก์ชันทิ้ง
--     - ไฟล์ 24 ถอดบล็อกที่สร้างมันใหม่ออก เหลือแค่หน้าที่จริงคือแก้ล็อกแถว
--     - ไฟล์ 19 ใส่คำเตือน "ห้ามรันซ้ำ" ไว้หัวไฟล์ เก็บเป็นบันทึกประวัติอย่างเดียว
--
-- ตัวที่ใช้งานจริงคือ topup_qr_instant_v2(numeric, text, text, text) — ไม่ถูกแตะ
--
-- รันซ้ำได้ / ถ้าเผลอรัน 19 หรือ 24 เวอร์ชันเก่า ให้รันไฟล์นี้ซ้ำอีกรอบ
-- ============================================================

drop function if exists public.topup_qr_instant(numeric, text, text);

-- ============================================================
-- ตรวจผล — ต้องไม่เหลือตัวเก่า และต้องยังมีตัวใหม่อยู่
-- ============================================================
do $$
begin
  if to_regprocedure('public.topup_qr_instant(numeric, text, text)') is not null then
    raise exception 'ลบไม่สำเร็จ — topup_qr_instant() ตัวเก่ายังอยู่';
  end if;

  if to_regprocedure('public.topup_qr_instant_v2(numeric, text, text, text)') is null then
    raise exception 'หา topup_qr_instant_v2() ไม่เจอ — ต้องรัน 30_topup_instant_guarded.sql ก่อน';
  end if;

  raise notice 'ลบ topup_qr_instant() ตัวเก่าถาวรแล้ว';
  raise notice 'topup_qr_instant_v2() ยังอยู่ครบ — หน้าเติมเงินทำงานปกติ';
end $$;
