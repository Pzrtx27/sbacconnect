import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import crypto from 'crypto';

const firebaseConfig = {
  apiKey: "AIzaSyA59rW3nWXuou_95VQdfMUSvAqfUj5VYYA",
  authDomain: "project-992c3.firebaseapp.com",
  projectId: "project-992c3",
  storageBucket: "project-992c3.firebasestorage.app",
  messagingSenderId: "528055833033",
  appId: "1:528055833033:web:bcc3339a2ca8f3fd24d818",
  measurementId: "G-HB4EBJH440"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Hash function (matching client SHA-256)
function sha256(text) {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

const mockStudents = [
  {
    id: '66001',
    full_name: 'นายสิรวิชญ์ รัศมีเจริญ',
    national_id: '1100100001000',
    email: 'student66001@example.com',
    branch: 'เทคโนโลยีสารสนเทศ',
    year: '3',
    room: '6',
    session: 'เช้า',
    class_id: 'm3_6',
  },
  {
    id: '66002',
    full_name: 'นางสาวสมหญิง ใจดี',
    national_id: '1234567890123',
    email: 'student66002@example.com',
    branch: 'เทคโนโลยีสารสนเทศ',
    year: '3',
    room: '6',
    session: 'เช้า',
    class_id: 'm3_6',
  },
  {
    id: '66003',
    full_name: 'นายวิชัย เก่งมาก',
    national_id: '9876543210987',
    email: 'student66003@example.com',
    branch: 'เทคโนโลยีสารสนเทศ',
    year: '3',
    room: '6',
    session: 'เช้า',
    class_id: 'm3_6',
  },
  {
    id: '66004',
    full_name: 'นางสาววิมลวรรณ แสนดี',
    national_id: '1200200005678',
    email: 'wimonwan.s@sbac.ac.th',
    branch: 'เทคโนโลยีสารสนเทศ',
    year: '3',
    room: '6',
    session: 'เช้า',
    class_id: 'm3_6',
  }
];

const mockStaff = [
  {
    id: 'academic',
    name: 'ฝ่ายวิชาการ SBAC',
    role: 'academic',
    password: '12345',
    class: 'm3_6',
    email: 'academic@sbac.ac.th'
  },
  {
    id: 'teacher',
    name: 'อาจารย์มานี วงศ์ดี',
    role: 'teacher',
    password: '12345',
    class: 'm3_6',
    email: 'mani.w@sbac.ac.th'
  },
  {
    id: 'barista',
    name: 'บาริสต้าประจำร้าน',
    role: 'barista',
    password: '12345',
    class: 'm3_6',
    email: 'barista@sbac.ac.th'
  }
];

const mockTimetable = {
  Monday: {
    1: { subject: 'วิชาคณิตศาสตร์คอมพิวเตอร์', teacher: 'อาจารย์สมควร', room: '401' },
    2: { subject: 'วิชาคณิตศาสตร์คอมพิวเตอร์', teacher: 'อาจารย์สมควร', room: '401' },
    3: { subject: 'วิชาภาษาอังกฤษไอที', teacher: 'Ms. Brown', room: '402' },
    4: { subject: 'วิชาการเขียนโปรแกรมคอมพิวเตอร์', teacher: 'อาจารย์กิตติพงษ์', room: 'IT-LAB 2' },
    5: { subject: 'วิชาการเขียนโปรแกรมคอมพิวเตอร์', teacher: 'อาจารย์กิตติพงษ์', room: 'IT-LAB 2' },
    6: { subject: 'กิจกรรมโฮมรูม', teacher: 'อาจารย์มานี วงศ์ดี', room: '403' }
  },
  Tuesday: {
    1: { subject: 'วิชาความปลอดภัยไซเบอร์', teacher: 'อาจารย์สิรวิชญ์', room: '402' },
    2: { subject: 'วิชาความปลอดภัยไซเบอร์', teacher: 'อาจารย์สิรวิชญ์', room: '402' },
    3: { subject: 'วิชาระบบเครือข่าย', teacher: 'อาจารย์สมชาย', room: 'IT-LAB 1' },
    4: { subject: 'วิชาระบบเครือข่าย', teacher: 'อาจารย์สมชาย', room: 'IT-LAB 1' },
    5: { subject: 'วิชาภาษาไทยเพื่ออาชีพ', teacher: 'อาจารย์เพ็ญศรี', room: '301' },
    6: { subject: 'กิจกรรมแนะแนว', teacher: 'อาจารย์มานี วงศ์ดี', room: '403' }
  },
  Wednesday: {
    1: { subject: 'วิชาโครงงานไอที (Project)', teacher: 'อาจารย์กิตติพงษ์', room: 'IT-LAB 2' },
    2: { subject: 'วิชาโครงงานไอที (Project)', teacher: 'อาจารย์กิตติพงษ์', room: 'IT-LAB 2' },
    3: { subject: 'วิชาโครงงานไอที (Project)', teacher: 'อาจารย์กิตติพงษ์', room: 'IT-LAB 2' },
    4: { subject: 'วิชาการพัฒนาเว็บเบื้องต้น', teacher: 'อาจารย์อลิสา', room: '402' },
    5: { subject: 'วิชาการพัฒนาเว็บเบื้องต้น', teacher: 'อาจารย์อลิสา', room: '402' },
    6: { subject: 'วิชาลูกเสือ/เนตรนารี', teacher: 'อาจารย์ผู้กำกับ', room: 'สนามฟุตบอล' }
  },
  Thursday: {
    1: { subject: 'วิชาพลศึกษาเพื่อสุขภาพ', teacher: 'อาจารย์วินัย', room: 'ยิมเนเซียม' },
    2: { subject: 'วิชาคอมพิวเตอร์กราฟิก', teacher: 'อาจารย์วิภา', room: 'Graphic LAB' },
    3: { subject: 'วิชาคอมพิวเตอร์กราฟิก', teacher: 'อาจารย์วิภา', room: 'Graphic LAB' },
    4: { subject: 'วิชาภาษาอังกฤษธุรกิจ', teacher: 'Mr. Smith', room: '402' },
    5: { subject: 'วิชาภาษาอังกฤษธุรกิจ', teacher: 'Mr. Smith', room: '402' },
    6: { subject: 'กิจกรรมชุมนุม', teacher: 'อาจารย์ประจำชุมนุม', room: 'ห้องชุมนุม' }
  },
  Friday: {
    1: { subject: 'วิชาโครงสร้างข้อมูล', teacher: 'อาจารย์กิตติพงษ์', room: 'IT-LAB 2' },
    2: { subject: 'วิชาโครงสร้างข้อมูล', teacher: 'อาจารย์กิตติพงษ์', room: 'IT-LAB 2' },
    3: { subject: 'วิชาสังคมศึกษาคอมพิวเตอร์', teacher: 'อาจารย์ธวัชชัย', room: '302' },
    4: { subject: 'วิชาการวิเคราะห์ระบบ', teacher: 'อาจารย์ณัฐพล', room: '401' },
    5: { subject: 'วิชาการวิเคราะห์ระบบ', teacher: 'อาจารย์ณัฐพล', room: '401' },
    6: { subject: 'กิจกรรมจิตสาธารณะ', teacher: 'อาจารย์มานี วงศ์ดี', room: '403' }
  }
};

async function seed() {
  console.log('Starting seed process for Firestore...');
  
  // 1. Seed students
  for (const s of mockStudents) {
    const studentHash = sha256(s.national_id);
    
    // Write student details
    await setDoc(doc(db, 'students', s.id), {
      full_name: s.full_name,
      email: s.email,
      branch: s.branch,
      year: s.year,
      room: s.room,
      session: s.session,
      class_id: s.class_id,
      national_id_hash: studentHash,
      updated_at: new Date().toISOString()
    });

    // Write user account
    await setDoc(doc(db, 'users', `user_${s.id}`), {
      name: s.full_name,
      class: s.class_id,
      role: 'student',
      email: s.email,
      card_balance: 500, // Starts with 500 THB
      branch: s.branch,
      year: s.year,
      room: s.room,
      session: s.session,
      national_id_hash: studentHash,
      password_hash: studentHash
    });
    console.log(`Seeded student: ${s.full_name} (${s.id})`);
  }

  // 2. Seed staff/admin accounts
  for (const staff of mockStaff) {
    const staffHash = sha256(staff.password);
    await setDoc(doc(db, 'users', staff.id), {
      name: staff.name,
      role: staff.role,
      class: staff.class,
      email: staff.email,
      password_hash: staffHash,
      national_id_hash: staffHash
    });
    console.log(`Seeded staff: ${staff.name} (${staff.id})`);
  }

  // 3. Seed Timetable
  await setDoc(doc(db, 'timetable', 'm3_6'), mockTimetable);
  console.log('Seeded Class Timetable for room m3_6 (ม.3/6)');

  // 4. Seed config
  await setDoc(doc(db, 'config', 'app'), {
    leave_form_url: 'https://forms.gle/sbacleaveform',
    school_name: 'วิทยาลัยเทคโนโลยีสยามบริหารธุรกิจนนทบุรี (SBAC)'
  });
  console.log('Seeded default app config');

  console.log('🎉 Seeding successfully completed!');
}

seed().catch(console.error);
