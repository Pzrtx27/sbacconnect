import { createClient } from '@supabase/supabase-js';

/* ใช้ anon key เท่านั้น — ห้ามใส่ service_role key ในโค้ดฝั่งหน้าบ้านเด็ดขาด
   เพราะ service_role ข้าม RLS ได้ทุกข้อ ตัวที่กันจริงคือ RLS ใน supabase/migrations/03_rls.sql
   ซึ่งกรองให้แต่ละคนเห็นเฉพาะข้อมูลของตัวเอง */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    '[supabase] ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — ดูวิธีตั้งค่าใน .env.example'
  );
}

export const supabase = createClient(url || '', anonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);

export default supabase;
