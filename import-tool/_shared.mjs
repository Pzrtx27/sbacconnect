// ฟังก์ชันที่ใช้ร่วมกันระหว่าง import-students.mjs และ import-staff.mjs
import crypto from 'crypto';
import fs from 'fs';

export const firebaseConfig = {
  apiKey: "AIzaSyA59rW3nWXuou_95VQdfMUSvAqfUj5VYYA",
  authDomain: "project-992c3.firebaseapp.com",
  projectId: "project-992c3",
  storageBucket: "project-992c3.firebasestorage.app",
  messagingSenderId: "528055833033",
  appId: "1:528055833033:web:bcc3339a2ca8f3fd24d818",
};

// ต้องแฮชด้วยวิธีเดียวกับ src/utils/crypto.js (sha256) เพื่อให้ตอน login เทียบ hash ตรงกัน
export function sha256(text) {
  return crypto.createHash('sha256').update(String(text).trim()).digest('hex');
}

/** แปลงชื่อห้องรูปแบบต่างๆ ที่คนพิมพ์กันทั่วไป ("ปวช.3/6", "ม.3/6", "3/6") ให้เป็นรหัส
 *  ภายในระบบ m{ปี}_{ห้อง} ให้ตรงกับที่ตารางสอน (StudentTimetable.jsx / config/sheets.js) ใช้ค้นหา */
export function normalizeClassId(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^m\d+_\d+$/i.test(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(/(\d+)\D+(\d+)/);
  if (match) return `m${match[1]}_${match[2]}`;
  return trimmed;
}

export function readCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const lines = raw.split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i]; });
    return row;
  });
}
