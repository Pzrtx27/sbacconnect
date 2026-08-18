// import-staff.mjs
// นำเข้ารายชื่อครู/ฝ่ายวิชาการ/บาริสต้า จำนวนมากพร้อมกันจาก staff.csv
// วิธีรัน: node import-staff.mjs
//
// ต่างจากนักเรียนตรงที่ staff ไม่มี document แยกใน collection "students" —
// เก็บที่ users/{id} โดยตรง (id คือรหัสที่ใช้ล็อกอิน เช่น "teacher", "academic")
// รันซ้ำได้เรื่อยๆ: id ซ้ำของเดิมจะถูกอัปเดตทับ ไม่สร้างซ้ำ

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import path from 'path';
import { fileURLToPath } from 'url';
import { firebaseConfig, sha256, normalizeClassId, readCSV } from './_shared.mjs';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const VALID_ROLES = ['teacher', 'academic', 'barista'];

async function importStaff() {
  const csvPath = path.join(__dirname, 'staff.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('❌ ไม่พบไฟล์ staff.csv ในโฟลเดอร์นี้');
    process.exit(1);
  }

  const rows = readCSV(csvPath);
  console.log(`พบบุคลากร ${rows.length} คนในไฟล์ CSV\n`);

  let success = 0;
  let failed = 0;

  for (const r of rows) {
    const { id, name, role, password, class: classRaw, email } = r;
    const roleNormalized = (role || '').toLowerCase().trim();

    if (!id || !name || !password) {
      console.warn(`⚠️  ข้ามแถวนี้ (ข้อมูลไม่ครบ): ${JSON.stringify(r)}`);
      failed += 1;
      continue;
    }
    if (!VALID_ROLES.includes(roleNormalized)) {
      console.warn(`⚠️  ข้ามแถวนี้ (role "${role}" ไม่ถูกต้อง ต้องเป็น teacher/academic/barista): ${JSON.stringify(r)}`);
      failed += 1;
      continue;
    }

    try {
      await setDoc(doc(db, 'users', id), {
        name,
        role: roleNormalized,
        class: normalizeClassId(classRaw),
        email: email || '',
        password_hash: sha256(password),
      });

      console.log(`✅ สำเร็จ: ${id} (${name}) — role: ${roleNormalized}`);
      success += 1;
    } catch (err) {
      console.error(`❌ ล้มเหลว: ${id} — ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nเสร็จสิ้น — สำเร็จ ${success} คน / ล้มเหลว ${failed} คน`);
  process.exit(0);
}

importStaff();
