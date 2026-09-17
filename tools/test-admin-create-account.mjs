// รันกับฐานข้อมูลจำลองเท่านั้น: PGLITE_MODULE=/path/to/pglite/dist/index.js node tools/test-admin-create-account.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const readMigration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const signature = 'public.admin_create_account_rows(uuid,text,text,text,text,bigint,text,uuid)';

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
  `);
  // PGlite มี gen_random_uuid() อยู่แล้ว แต่ไม่ได้เปิดส่วนขยาย pgcrypto ของ Supabase
  await db.exec((await readMigration('01_schema.sql')).replace('create extension if not exists pgcrypto;', ''));
  // ใช้ DDL จริงของ audit โดยไม่ติดตั้งฟังก์ชัน Admin อื่นที่อยู่นอกขอบเขตการทดสอบ
  const adminMigration = await readMigration('53_admin_console.sql');
  const auditDDL = adminMigration.match(/create table if not exists public\.admin_audit\s*\([\s\S]*?\n\);/);
  assert.ok(auditDDL, 'admin_audit DDL exists');
  await db.exec(auditDDL[0]);
  const migration = await readMigration('54_admin_create_account.sql');
  await db.exec(migration);
  const rerun = await db.exec(migration);
  assert.equal(rerun.at(-1).rows[1]['ผล'], 'service_role');

  await db.exec("insert into class_rooms (level, room_no) values ('test', '1')");
  let nextId = 0;
  async function create(overrides = {}) {
    const uid = `00000000-0000-0000-0000-${String(++nextId).padStart(12, '0')}`;
    await db.query('insert into auth.users values ($1)', [uid]);
    const p = {
      auth: uid, email: `test${nextId}@sbacnon.ac.th`, name: 'Test Account',
      role: 'student', code: String(66000 + nextId), classroom: 1, department: null, actor: null,
      ...overrides,
    };
    const result = await db.query(`select ${signature.split('(')[0]}(
      $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::bigint,$7::text,$8::uuid
    ) as result`, Object.values(p));
    return result.rows[0].result;
  }
  async function counts() {
    const result = await db.query(`select
      (select count(*) from users) as users,
      (select count(*) from user_roles) as roles,
      (select count(*) from student_profiles) as students,
      (select count(*) from teacher_profiles) as teachers,
      (select count(*) from user_credentials) as credentials,
      (select count(*) from admin_audit) as audit`);
    return result.rows[0];
  }

  const student = await create({ email: ' STUDENT@SBACNON.AC.TH ', name: ' Student ', code: '66001' });
  assert.equal(student.ok, true);
  const profile = await db.query(`select u.email, u.full_name, r.role, s.student_code, c.value, c.is_active
    from users u join user_roles r on r.user_id = u.id
    join student_profiles s on s.user_id = u.id
    join user_credentials c on c.user_id = u.id where u.id = $1`, [student.id]);
  assert.deepEqual(profile.rows[0], {
    email: 'student@sbacnon.ac.th', full_name: 'Student', role: 'student',
    student_code: '66001', value: '66001', is_active: true,
  });
  const teacher = await create({ role: 'teacher', code: 'T0001', classroom: null, department: ' IT ' });
  assert.equal(teacher.ok, true);
  assert.equal((await db.query('select department from teacher_profiles where user_id = $1', [teacher.id])).rows[0].department, 'IT');

  for (const [params, expected] of [
    [{ role: null }, 'INVALID_ROLE'],
    [{ role: 'sysadmin' }, 'INVALID_ROLE'],
    [{ name: '' }, 'INVALID_NAME'],
    [{ code: 'ab' }, 'INVALID_CODE'],
    [{ email: 'test@localhost' }, 'INVALID_EMAIL'],
    [{ auth: null }, 'NO_AUTH_UID'],
    [{ classroom: 999 }, 'INVALID_CLASSROOM'],
    [{ email: 'STUDENT@sbacnon.ac.th' }, 'DUPLICATE_EMAIL'],
    [{ code: '66001' }, 'DUPLICATE_CODE'],
    [{ role: 'teacher', code: 'T0001' }, 'DUPLICATE_CODE'],
  ]) {
    const before = await counts();
    assert.equal((await create(params)).error, expected);
    assert.deepEqual(await counts(), before);
  }

  await db.query("insert into user_credentials (user_id, kind, value) values ($1, 'code', '77777')", [teacher.id]);
  assert.equal((await create({ code: '77777' })).error, 'DUPLICATE_CODE');
  await db.exec("update user_credentials set is_active = false where value = '77777'");
  assert.equal((await create({ code: '77777' })).ok, true);

  // บังคับให้ล้มเหลวตอนเขียน audit ซึ่งอยู่หลัง profile และ POS เพื่อพิสูจน์ว่าไม่เหลือข้อมูลครึ่งเดียว
  await db.exec(`create function fail_test_audit() returns trigger language plpgsql as $$
    begin raise unique_violation; end $$;
    create trigger fail_audit before insert on admin_audit for each row execute function fail_test_audit();`);
  const beforeFailure = await counts();
  assert.equal((await create()).error, 'DUPLICATE');
  assert.deepEqual(await counts(), beforeFailure);
  await db.exec('drop trigger fail_audit on admin_audit');

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query(`select public.admin_create_account_rows(null,'x','x','student','66099')`), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  // service_role ไม่มีสิทธิ์เขียน auth.users ใน fixture แต่ต้องเรียก SECURITY DEFINER ได้
  const allowed = await db.query("select public.admin_create_account_rows(null,'x','x',null,'66099') as result");
  assert.equal(allowed.rows[0].result.error, 'INVALID_ROLE');
  await db.exec('reset role');
  console.log('PASS: repeatable migration, profiles, POS, validation, rollback, and API permissions');
} finally {
  await db.close();
}
