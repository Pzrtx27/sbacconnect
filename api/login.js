// api/login.js — Vercel Serverless Function
//
// จุดเดียวที่ตรวจรหัสนักเรียน/บุคลากรจริง ๆ ใช้ Firebase Admin SDK (ข้าม Firestore
// rules ได้เพราะเป็นฝั่ง server ที่เชื่อถือได้) แล้ว "mint" custom token ให้ฝั่ง client
// เอาไปแลก signInWithCustomToken — เป็นครั้งแรกที่แอปนี้มี Firebase Auth session จริง
// ก่อนหน้านี้ client ยิง query ตรวจรหัสเองจาก Firestore แบบไม่มี auth เลย ทำให้
// security rules ล็อกไม่ได้ (ไม่มี request.auth ให้เช็ค) — ย้ายมาไว้ที่นี่แก้ปัญหานั้น
//
// ต้องตั้งค่า ENV (Vercel > Project > Settings > Environment Variables):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// (ดู .env.example)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import { usersDocIdFor } from '../src/utils/authId.js';

const REQUIRED_ENV = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];

/** คืนรายชื่อ env ที่ยังไม่ได้ตั้ง — แยกออกมาเพื่อบอกผู้ใช้ให้ชัดว่าขาดอะไร
 *  แทนที่จะโยน error ดิบ ๆ ของ Admin SDK ที่อ่านไม่รู้เรื่อง */
function missingEnv() {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars เก็บ newline เป็น \n ตัวอักษร ต้องแปลงกลับเป็น newline จริง
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text).trim()).digest('hex');
}

// จำกัดจำนวนครั้งที่พยายามล็อกอินผิดแบบง่าย ๆ ใน memory ของ instance นี้
// หมายเหตุ: serverless อาจสร้าง instance ใหม่ได้ตลอด ทำให้ตัวนับนี้รีเซ็ตได้บ่อย
// ป้องกันได้แค่ระดับหนึ่ง ไม่ใช่ rate-limit ที่แน่นอน 100% (ของจริงต้องใช้ Vercel KV/Upstash)
const attempts = new Map(); // key -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 3 * 60 * 1000;

function checkRateLimit(key) {
  const entry = attempts.get(key);
  if (entry?.lockedUntil && Date.now() < entry.lockedUntil) {
    return { locked: true, remainSec: Math.ceil((entry.lockedUntil - Date.now()) / 1000) };
  }
  return { locked: false };
}

function recordFailure(key) {
  const entry = attempts.get(key) || { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  attempts.set(key, entry);
  return entry;
}

function clearFailures(key) {
  attempts.delete(key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const missing = missingEnv();
  if (missing.length) {
    console.error(`[api/login] ยังไม่ได้ตั้งค่า env: ${missing.join(', ')} (ดู .env.example)`);
    res.status(500).json({
      success: false,
      error: `ระบบยังตั้งค่าไม่ครบ (ขาด ${missing.join(', ')}) — ดูวิธีตั้งค่าใน .env.example`,
    });
    return;
  }

  const { userId, nationalId } = req.body || {};
  if (!userId || !nationalId) {
    res.status(400).json({ success: false, error: 'กรุณากรอกรหัสและเลขบัตรประชาชนให้ครบถ้วน' });
    return;
  }

  const rl = checkRateLimit(userId);
  if (rl.locked) {
    res.status(429).json({ success: false, error: `ระบบถูกล็อคชั่วคราว กรุณารอ ${rl.remainSec} วินาที แล้วลองใหม่` });
    return;
  }

  try {
    getAdminApp();
    const db = getFirestore();
    const auth = getAuth();

    const hashedNationalId = sha256(nationalId);
    let userData = null;
    let firebaseUid = null;
    let role = null;

    // 1. ลองหาในฐานะนักเรียนก่อน (ผ่าน hash แล้ว fallback plain text แบบเดิม)
    let studentDoc = null;
    const hashSnap = await db.collection('students').where('national_id_hash', '==', hashedNationalId).get();
    studentDoc = hashSnap.docs.find((d) => d.id === userId) || null;

    if (!studentDoc) {
      const legacySnap = await db.collection('students').where('national_id', '==', nationalId).get();
      studentDoc = legacySnap.docs.find((d) => d.id === userId) || null;
    }

    if (studentDoc) {
      const sData = studentDoc.data();
      const userDoc = await db.collection('users').doc(`user_${userId}`).get();
      const uData = userDoc.exists ? userDoc.data() : {};

      role = (uData.role || 'student').toLowerCase().trim();
      firebaseUid = usersDocIdFor('student', userId);
      userData = {
        id: userId,
        name: sData.full_name || uData.name || 'นักเรียน',
        role,
        class_id: sData.class_id || uData.class || '',
        branch: sData.branch || '',
        year: sData.year || '',
        room: sData.room || '',
        session: sData.session || '',
        card_balance: uData.card_balance || 0,
        email: sData.email || uData.email || '',
      };
    }

    // 2. ไม่เจอในฐานะนักเรียน → ลองหาในฐานะบุคลากร (teacher/academic/barista)
    if (!userData) {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const uData = userDoc.data();
        const isMatch =
          uData.password === nationalId ||
          uData.national_id === nationalId ||
          uData.password_hash === hashedNationalId ||
          uData.national_id_hash === hashedNationalId;

        if (isMatch) {
          role = (uData.role || 'student').toLowerCase().trim();
          firebaseUid = usersDocIdFor(role, userId);
          userData = {
            id: userId,
            name: uData.name || userId,
            role,
            class_id: uData.class || '',
            card_balance: uData.card_balance || 0,
            branch: uData.branch || '',
            year: uData.year || '',
            room: uData.room || '',
            session: uData.session || '',
          };
        }
      }
    }

    if (!userData) {
      const entry = recordFailure(userId);
      if (entry.lockedUntil) {
        res.status(429).json({ success: false, error: 'พยายามเข้าสู่ระบบผิดเกินกำหนด ระบบถูกล็อค 3 นาที' });
        return;
      }
      const remaining = MAX_ATTEMPTS - entry.count;
      res.status(401).json({ success: false, error: `รหัสหรือเลขบัตรประชาชนไม่ถูกต้อง (เหลืออีก ${remaining} ครั้ง)` });
      return;
    }

    clearFailures(userId);

    // custom claim "role" คือสิ่งเดียวที่ Firestore rules เชื่อได้ 100% ว่าไม่ถูกปลอม
    // เพราะมีแค่ server ฝั่งนี้เท่านั้นที่ mint token ได้ (ใช้ private key ที่ client ไม่มีทางเข้าถึง)
    const customToken = await auth.createCustomToken(firebaseUid, { role });

    res.status(200).json({ success: true, token: customToken, user: userData });
  } catch (err) {
    console.error('[api/login] error:', err);
    res.status(500).json({ success: false, error: 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่อีกครั้ง' });
  }
}
