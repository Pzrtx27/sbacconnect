// ============================================================
// admin-users — สร้างบัญชีเข้าสู่ระบบให้ครู/นักเรียน จากหน้า Admin
//
// ทำไมต้องเป็น Edge Function ไม่ใช่โค้ดในหน้าเว็บ
// ------------------------------------------------
// การสร้างบัญชีใน auth.users ต้องใช้ service_role key ซึ่งข้าม RLS ได้ทุกข้อ
// ถ้าคีย์นั้นอยู่ในโค้ดหน้าเว็บ มันจะถูกฝังลงไฟล์ JavaScript ที่ส่งให้เบราว์เซอร์
// ใครเปิด DevTools ก็อ่านได้ = เปิดฐานข้อมูลทั้งก้อนให้สาธารณะ
// ไฟล์นี้จึงรันฝั่งเซิร์ฟเวอร์ คีย์ไม่เคยออกจากเครื่อง Supabase เลย
//
// ลำดับการทำงาน
// --------------
//   1) ตรวจว่าคนเรียกเป็น sysadmin จริง (จาก JWT ที่แนบมา ไม่ใช่จากค่าที่ body ส่งมา)
//   2) สร้างบัญชีใน auth.users ด้วย service_role
//   3) สร้างแถวข้อมูลผ่าน rpc admin_create_account_rows() แบบ all-or-nothing
//   4) ถ้าขั้นที่ 3 ไม่ผ่าน ลบบัญชีที่เพิ่งสร้างในขั้นที่ 2 ทิ้ง
//      ไม่งั้นจะเหลือบัญชีที่ล็อกอินผ่านแต่ไม่มีข้อมูลผูกอยู่ ซึ่งเข้าแอปแล้วเจอ
//      "บัญชีนี้ยังไม่ถูกลงทะเบียน" โดยไม่มีใครรู้ว่าเกิดจากอะไร
//
// วิธี deploy (ไม่ต้องมี CLI ก็ได้)
//   Supabase Dashboard > Edge Functions > Deploy a new function
//   ตั้งชื่อ admin-users แล้ววางไฟล์นี้ทั้งไฟล์
//   ตัวแปร SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//   Supabase ใส่ให้เองอัตโนมัติ ไม่ต้องตั้งเพิ่ม
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EMAIL_DOMAIN = 'sbacnon.ac.th';

// หน้าเว็บอยู่คนละโดเมนกับ Edge Function เบราว์เซอร์จึงยิง preflight มาก่อนเสมอ
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** ชื่อผู้ใช้ -> อีเมล — ต้องตรงกับ toEmail() ใน src/utils/identity.js เป๊ะ
 *  ถ้าสองที่นี้ไม่ตรงกัน บัญชีจะถูกสร้างด้วยอีเมลที่หน้าล็อกอินไม่มีทางประกอบขึ้นมาได้ */
function toEmail(input: string): string {
  const cleaned = String(input || '').trim().toLowerCase();
  if (!cleaned) return '';
  return cleaned.includes('@') ? cleaned : `${cleaned}@${EMAIL_DOMAIN}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ ok: false, error: 'FUNCTION_NOT_CONFIGURED' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ ok: false, error: 'NO_TOKEN' }, 401);

  // ---------- 1) คนเรียกเป็นใคร ----------
  // อ่านตัวตนจาก JWT เท่านั้น ไม่เชื่อค่าใด ๆ ที่ body ส่งมาบอกว่าตัวเองเป็นใคร
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: authData, error: authErr } = await caller.auth.getUser();
  if (authErr || !authData?.user) return json({ ok: false, error: 'INVALID_TOKEN' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ---------- 2) คนเรียกเป็น sysadmin ที่ยังใช้งานอยู่จริงไหม ----------
  const { data: actor, error: actorErr } = await admin
    .from('users')
    .select('id, is_active, user_roles(role)')
    .eq('auth_uid', authData.user.id)
    .maybeSingle();

  const roles: string[] = (actor?.user_roles ?? []).map((r: { role: string }) => r.role);
  if (actorErr || !actor || !actor.is_active || !roles.includes('sysadmin')) {
    return json({ ok: false, error: 'FORBIDDEN' }, 403);
  }

  // ---------- 3) อ่านและตรวจข้อมูลที่ส่งมา ----------
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ ok: false, error: 'BAD_REQUEST' }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'BAD_REQUEST' }, 400);
  }

  const role = String(body.role ?? '');
  const password = String(body.password ?? '');
  const email = toEmail(String(body.username ?? ''));

  if (role !== 'student' && role !== 'teacher') return json({ ok: false, error: 'INVALID_ROLE' }, 400);
  if (!email) return json({ ok: false, error: 'INVALID_EMAIL' }, 400);

  // Supabase Auth ปฏิเสธรหัสผ่านสั้นกว่า 6 ตัวอยู่แล้ว ตรวจก่อนเพื่อไม่ต้องยิงไปเสียเที่ยว
  if (password.length < 8) return json({ ok: false, error: 'WEAK_PASSWORD' }, 400);

  // ---------- 4) สร้างบัญชีเข้าสู่ระบบ ----------
  // email_confirm: true เพราะระบบนี้ไม่มีการส่งอีเมลยืนยัน
  // ถ้าไม่ตั้ง บัญชีจะค้างสถานะรอยืนยันและล็อกอินไม่ได้เลย
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    const already = String(createErr?.message ?? '').toLowerCase().includes('already');
    return json({ ok: false, error: already ? 'DUPLICATE_EMAIL' : 'AUTH_CREATE_FAILED' }, 400);
  }

  // ---------- 5) สร้างแถวข้อมูล ----------
  const { data: result, error: rpcErr } = await admin.rpc('admin_create_account_rows', {
    p_auth_uid: created.user.id,
    p_email: email,
    p_full_name: String(body.full_name ?? ''),
    p_role: role,
    p_code: String(body.code ?? ''),
    p_class_room: body.class_room ? Number(body.class_room) : null,
    p_department: body.department ? String(body.department) : null,
    p_actor: actor.id,
  });

  // ---------- 6) ถอยให้สุดถ้าขั้นที่ 5 ไม่ผ่าน ----------
  if (rpcErr || !result?.ok) {
    const { error: cleanupErr } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupErr) {
      // ลบไม่สำเร็จ = เหลือบัญชีกำพร้าจริง ๆ ต้องบอกให้คนไปตามเก็บ ไม่ใช่เงียบ
      console.error('[admin-users] ลบบัญชีที่สร้างค้างไม่สำเร็จ auth_uid=', created.user.id, cleanupErr.message);
      return json({ ok: false, error: 'ORPHAN_AUTH_USER', auth_uid: created.user.id }, 500);
    }
    return json({ ok: false, error: result?.error ?? 'DB_INSERT_FAILED' }, 400);
  }

  return json({ ok: true, id: result.id, email });
});
