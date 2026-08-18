// import-students.mjs
// นำเข้ารายชื่อนักเรียนจำนวนมากพร้อมกันจาก students.csv (ไม่ต้องคีย์ทีละคนใน Firebase Console)
// วิธีรัน: node import-students.mjs
//
// ใช้ Client SDK ตัวเดียวกับ scripts/seed-db.js (ไม่ใช้ firebase-admin / service account key)
// เพื่อกันปัญหา "ยิงข้อมูลเข้าผิดโปรเจกต์" — ผูกกับ project-992c3 ตรงๆ เหมือนที่เว็บแอปใช้จริง
// รันซ้ำได้เรื่อยๆ: username ซ้ำของเดิมจะถูกอัปเดตทับ ไม่สร้างซ้ำ

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import path from 'path';
import { fileURLToPath } from 'url';
import { firebaseConfig, sha256, normalizeClassId, readCSV } from './_shared.mjs';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function importStudents() {
  const csvPath = path.join(__dirname, 'students.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('❌ ไม่พบไฟล์ students.csv ในโฟลเดอร์นี้');
    process.exit(1);
  }

  const students = readCSV(csvPath);
  console.log(`พบนักเรียน ${students.length} คนในไฟล์ CSV\n`);

  let success = 0;
  let failed = 0;

  for (const s of students) {
    const { username, fullName, classId, password, cardBalance } = s;

    if (!username || !password) {
      console.warn(`⚠️  ข้ามแถวนี้ (ข้อมูลไม่ครบ): ${JSON.stringify(s)}`);
      failed += 1;
      continue;
    }

    try {
      const normalizedClass = normalizeClassId(classId);
      const nationalIdHash = sha256(password);

      await setDoc(doc(db, 'students', username), {
        national_id_hash: nationalIdHash,
        full_name: fullName || username,
        class_id: normalizedClass,
      });

      await setDoc(doc(db, 'users', `user_${username}`), {
        name: fullName || username,
        role: 'student',
        class: normalizedClass,
        card_balance: Number(cardBalance) || 0,
      });

      console.log(`✅ สำเร็จ: ${username} (${fullName}) — ห้อง ${normalizedClass}`);
      success += 1;
    } catch (err) {
      console.error(`❌ ล้มเหลว: ${username} — ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nเสร็จสิ้น — สำเร็จ ${success} คน / ล้มเหลว ${failed} คน`);
  process.exit(0);
}

importStudents();
