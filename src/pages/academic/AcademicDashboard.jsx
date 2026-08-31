import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../config/firebase.js';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, onSnapshot } from 'firebase/firestore';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import BehaviorLogList from '../../components/behavior/BehaviorLogList';
import BehaviorLogEditModal from '../../components/behavior/BehaviorLogEditModal';
import LeaveRequestList from '../../components/leave/LeaveRequestList';
import { useBehaviorLogs } from '../../hooks/useBehaviorLogs';
import { useLeaveRequests } from '../../hooks/useLeaveRequests';
import {
  Calendar,
  Settings,
  Send,
  RefreshCw,
  Undo,
  FileSpreadsheet,
  Upload,
  Download,
  Key,
  ShieldAlert,
  Eye,
  EyeOff,
  Award,
  ListChecks,
  ClipboardCheck
} from 'lucide-react';
import { sha256, encryptAES, decryptAES } from '../../utils/crypto';
import EventManager from './EventManager';
import BehaviorDeductionWizard from './BehaviorDeductionWizard';
import HomeroomAssignmentPanel from './HomeroomAssignmentPanel';

export default function AcademicDashboard() {
  const { user } = useAuth();

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Substitution Form State
  const [day, setDay] = useState('Monday');
  const [period, setPeriod] = useState(3);
  const [subject, setSubject] = useState('');
  const [origTeacher, setOrigTeacher] = useState('');
  const [subTeacher, setSubTeacher] = useState('');
  const [roomMode, setRoomMode] = useState('same'); // 'same' or 'new'
  const [room, setRoom] = useState('');

  /* ฟอร์มประกาศกิจกรรมเดิมถูกย้ายไป <EventManager /> ทั้งก้อน
     ของเดิมเขียนลง Firebase collection 'events' ซึ่งปิดไปแล้ว และเป็นคนละที่กับ
     ปฏิทินที่นักเรียนเห็นด้วย — ตอนนี้ทั้งสองฝั่งใช้ตาราง events ใน Supabase ร่วมกัน */

  // Selected class room/branch states
  const [selectedClassId, setSelectedClassId] = useState('m3_6');
  const [selectedBranch, setSelectedBranch] = useState('เทคโนโลยีสารสนเทศ');

  // Preview State
  const [timetableData, setTimetableData] = useState({});

  // Excel Sync and Encryption States
  const [encryptionMode, setEncryptionMode] = useState('sha256'); // 'sha256' | 'aes256' | 'none'
  const [secretKey, setSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [parsedStudents, setParsedStudents] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // จัดการรายการตัด/เพิ่มคะแนนพฤติกรรมทั้งหมด (ทุกครู) — role academic เป็น overseer
  // ตาม list_behavior_logs() ใน 21_behavior_crud_and_academic.sql จึงแก้ไข/ลบได้ทุกรายการ
  const { logs: allBehaviorLogs, loading: allBehaviorLogsLoading, updateLog: updateBehaviorLog, deleteLog: deleteBehaviorLog } = useBehaviorLogs();
  const { confirm: confirmBehaviorDelete, confirmDialog: behaviorConfirmDialog } = useConfirm();
  const [editingBehaviorLog, setEditingBehaviorLog] = useState(null);

  const handleDeleteBehaviorLog = async (log) => {
    const ok = await confirmBehaviorDelete({
      title: 'ลบรายการนี้?',
      message: `"${log.reason}" (${log.action_type === 'add' ? '+' : '-'}${log.points} คะแนน) ของ ${log.student_name} — บันทึกโดย ${log.teacher_name}`,
      detail: 'ระบบจะเก็บหลักฐานไว้ตรวจสอบย้อนหลัง ไม่ได้ลบถาวร และคะแนนของนักเรียนจะกลับมาทันที',
      confirmLabel: 'ลบรายการ',
      danger: true,
    });
    if (ok) deleteBehaviorLog(log.id);
  };

  // อนุมัติใบลาขั้นที่ 2 (ขั้นสุดท้าย) — เห็นเฉพาะที่ครูประจำชั้นอนุมัติผ่านมาแล้ว (22_leave_requests.sql)
  const { requests: pendingAcademicLeaves, loading: pendingAcademicLeavesLoading, academicDecide } = useLeaveRequests('pending_academic');

  // Dynamic Loader for SheetJS (xlsx) from CDN
  const loadXLSX = () => {
    return new Promise((resolve, reject) => {
      if (window.XLSX) {
        resolve(window.XLSX);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.onload = () => resolve(window.XLSX);
      script.onerror = (err) => reject(err);
      document.body.appendChild(script);
    });
  };

  // Robust Native CSV Parser
  const parseCSVData = (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];

    // Headers are in the first line
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const list = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = [];
      let current = '';
      let inQuotes = false;
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^["']|["']$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^["']|["']$/g, ''));

      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      list.push(row);
    }
    return list;
  };

  // Normalizer for uploaded columns
  const normalizeStudent = (row) => {
    const getVal = (keys) => {
      for (const key of keys) {
        if (row[key] !== undefined) return String(row[key]).trim();
      }
      return '';
    };

    const student_id = getVal(['student_id', 'id', 'รหัสนักเรียน', 'รหัสประจำตัว']);
    const full_name = getVal(['full_name', 'name', 'ชื่อ-นามสกุล', 'ชื่อ', 'ชื่อเต็ม']);
    const national_id = getVal(['national_id', 'citizen_id', 'เลขบัตรประชาชน', 'บัตรประชาชน']);
    const email = getVal(['email', 'อีเมล']);
    const branch = getVal(['branch', 'สาขา', 'สาขาวิชา']) || 'เทคโนโลยีสารสนเทศ';
    const year = getVal(['year', 'ชั้นปี', 'ปี']) || '3';
    const room = getVal(['room', 'ห้อง', 'ชั้น']) || '6';
    const session = getVal(['session', 'ภาคเรียน', 'รอบ']) || 'เช้า';
    const class_id = getVal(['class_id', 'class', 'รหัสห้องเรียน']) || `m${year}_${room}`;

    return { student_id, full_name, national_id, email, branch, year, room, session, class_id };
  };

  // File loading router
  const handleExcelFile = async (file) => {
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      if (file.name.endsWith('.csv')) {
        reader.onload = (e) => {
          const text = e.target.result;
          const rows = parseCSVData(text);
          setParsedStudents(rows);
          showToast(`โหลดไฟล์สำเร็จ: พบนักเรียน ${rows.length} คน`, 'success');
          setIsProcessing(false);
        };
        reader.readAsText(file, 'UTF-8');
      } else {
        const XLSX = await loadXLSX();
        reader.onload = (e) => {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet);
          setParsedStudents(json);
          showToast(`โหลดไฟล์สำเร็จ: พบนักเรียน ${json.length} คน`, 'success');
          setIsProcessing(false);
        };
        reader.readAsArrayBuffer(file);
      }
    } catch (err) {
      console.error(err);
      showToast('ล้มเหลวในการอ่านไฟล์', 'error');
      setIsProcessing(false);
    }
  };

  // Excel template generator
  const downloadTemplate = () => {
    const headers = 'student_id,full_name,national_id,email,branch,year,room,session,class_id\n';
    // ข้อมูลสมมติล้วน — ห้ามใส่ชื่อ/เลขบัตรจริงของนักเรียน เพราะ repo นี้เป็น public
    const sample1 = '66001,นายสมชาย ใจดี,1100100001000,student66001@example.com,เทคโนโลยีสารสนเทศ,3,6,เช้า,m3_6\n';
    const sample2 = '66002,นางสาวสมหญิง เรียนดี,1234567890123,student66002@example.com,เทคโนโลยีสารสนเทศ,3,6,เช้า,m3_6\n';

    const blob = new Blob([headers + sample1 + sample2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sbac_student_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('ดาวน์โหลดไฟล์เทมเพลตเรียบร้อย', 'info');
  };

  // Sync rows to Firestore with hashing/encryption
  const syncToFirebase = async () => {
    if (parsedStudents.length === 0) {
      showToast('ไม่มีข้อมูลนักเรียนที่จะบันทึก', 'error');
      return;
    }
    if (encryptionMode === 'aes256' && !secretKey) {
      showToast('กรุณากรอกคีย์หลักสำหรับการเข้ารหัส AES', 'error');
      return;
    }

    setIsProcessing(true);
    let successCount = 0;

    try {
      for (let i = 0; i < parsedStudents.length; i++) {
        const norm = normalizeStudent(parsedStudents[i]);
        if (!norm.student_id || !norm.national_id) {
          continue;
        }

        const hash = await sha256(norm.national_id);

        const studentPayload = {
          full_name: norm.full_name,
          email: norm.email,
          branch: norm.branch,
          year: norm.year,
          room: norm.room,
          session: norm.session,
          class_id: norm.class_id,
          national_id_hash: hash,
          updated_at: new Date().toISOString()
        };

        if (encryptionMode === 'aes256') {
          const encrypted = await encryptAES(norm.national_id, secretKey);
          studentPayload.national_id_encrypted = encrypted;
        } else if (encryptionMode === 'none') {
          studentPayload.national_id = norm.national_id;
        }

        await setDoc(doc(db, 'students', norm.student_id), studentPayload, { merge: true });

        const userPayload = {
          name: norm.full_name,
          class: norm.class_id,
          role: 'student',
          email: norm.email,
          card_balance: 500,
          branch: norm.branch,
          year: norm.year,
          room: norm.room,
          session: norm.session,
        };

        if (encryptionMode === 'none') {
          userPayload.national_id = norm.national_id;
          userPayload.password = norm.national_id;
        } else {
          userPayload.national_id_hash = hash;
          userPayload.password_hash = hash;
        }

        await setDoc(doc(db, 'users', `user_${norm.student_id}`), userPayload, { merge: true });
        successCount++;
      }

      showToast(`นำเข้าข้อมูลสำเร็จ ${successCount} รายการ!`, 'success');
      setParsedStudents([]);
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการนำเข้าข้อมูล', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Export current student list with optional decryption
  const exportDatabase = async () => {
    if (encryptionMode === 'aes256' && !secretKey) {
      showToast('กรุณากรอกคีย์หลักเพื่อถอดรหัสข้อมูลก่อนส่งออก', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const querySnapshot = await getDocs(collection(db, 'students'));
      const rows = [];

      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        let decryptedNationalId = 'ถอดรหัสไม่ได้ (ไม่มีคีย์)';

        if (data.national_id) {
          decryptedNationalId = data.national_id;
        } else if (data.national_id_encrypted && secretKey) {
          const decrypted = await decryptAES(data.national_id_encrypted, secretKey);
          if (decrypted) {
            decryptedNationalId = decrypted;
          }
        } else if (data.national_id_hash) {
          decryptedNationalId = `[เข้ารหัสแบบ HASH: ${data.national_id_hash.substring(0, 8)}...]`;
        }

        rows.push({
          student_id: docSnap.id,
          full_name: data.full_name || '',
          national_id: decryptedNationalId,
          email: data.email || '',
          branch: data.branch || '',
          year: data.year || '',
          room: data.room || '',
          session: data.session || '',
          class_id: data.class_id || ''
        });
      }

      if (rows.length === 0) {
        showToast('ไม่มีข้อมูลนักเรียนในระบบ', 'warning');
        setIsProcessing(false);
        return;
      }

      const headers = 'student_id,full_name,national_id,email,branch,year,room,session,class_id\n';
      const csvContent = rows.map(r =>
        `"${r.student_id}","${r.full_name}","${r.national_id}","${r.email}","${r.branch}","${r.year}","${r.room}","${r.session}","${r.class_id}"`
      ).join('\n');

      const blob = new Blob(["\ufeff" + headers + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sbac_students_export.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`ส่งออกข้อมูลนักเรียน ${rows.length} คน เรียบร้อย`, 'success');
    } catch (err) {
      console.error(err);
      showToast('ล้มเหลวในการดึงข้อมูลและส่งออก', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    /* ฟีเจอร์กลุ่มนี้ยังผูกกับ Firebase ซึ่งถูกปิดไปแล้ว (ดู src/config/firebase.js)
       ครอบ try/catch ไว้เพื่อให้หน้าไม่ล่มทั้งหน้า และแสดงคำเตือนแทน
       ถ้าจะใช้งานจริงต้องย้ายมา Supabase ก่อน (ต้องสร้างตาราง timetable/substitutions/events) */
    try {
      const unsub = onSnapshot(doc(db, 'timetable', selectedClassId), (docSnap) => {
        setTimetableData(docSnap.exists() ? docSnap.data() : {});
      }, (err) => {
        console.warn('Timetable preview snapshot failed', err);
      });
      return () => unsub();
    } catch (err) {
      console.warn('[academic] ฟีเจอร์ตารางสอนถูกปิด (Firebase disabled):', err.message);
      setTimetableData({});
      return undefined;
    }
  }, [selectedClassId]);

  // Handle form updates when day/period changes
  useEffect(() => {
    const dayData = timetableData[day] || {};
    const periodData = dayData[period] || {};
    setSubject(periodData.subject || '');
    setOrigTeacher(periodData.teacher || '');
    setSubTeacher(periodData.substitute_teacher || '');
    setRoom(periodData.room || '');
  }, [day, period, timetableData]);

  const saveSubstitute = async () => {
    try {
      const classId = selectedClassId;
      const docRef = doc(db, 'timetable', classId);

      const updatePayload = {
        [`${day}.${period}.subject`]: subject,
        [`${day}.${period}.teacher`]: origTeacher,
        [`${day}.${period}.is_substituted`]: true,
        [`${day}.${period}.substitute_teacher`]: subTeacher,
        [`${day}.${period}.substitute_room`]: roomMode === 'new' ? room : null,
        [`${day}.${period}.updated_at`]: new Date().toISOString()
      };

      await updateDoc(docRef, updatePayload);
      showToast('อัปเดตตารางสอนเรียบร้อย', 'success');

      // Add to substitutions list for teacher alerts
      await addDoc(collection(db, 'substitutions'), {
        day,
        period,
        class_id: classId,
        subject,
        original_teacher: origTeacher,
        substitute_teacher: subTeacher,
        room: roomMode === 'new' ? room : 'ห้องเดิมตามตาราง',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Update failed:', err);
      showToast('อัปเดตตารางล้มเหลว', 'error');
    }
  };

  const resetSubstitute = async () => {
    try {
      const classId = selectedClassId;
      const docRef = doc(db, 'timetable', classId);

      const updatePayload = {
        [`${day}.${period}.is_substituted`]: false,
        [`${day}.${period}.substitute_teacher`]: null,
        [`${day}.${period}.substitute_room`]: null,
        [`${day}.${period}.updated_at`]: new Date().toISOString()
      };

      await updateDoc(docRef, updatePayload);
      showToast('คืนค่าตารางเรียบร้อย', 'success');
    } catch (err) {
      console.error('Reset failed:', err);
      showToast('คืนค่าล้มเหลว', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
          }`}>
          <Settings size={24} className="text-brand" />
          Academic Panel
        </h2>
        <span className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors duration-300 ${isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-secondary'
          }`}>
          ห้อง {selectedClassId.replace('m', 'ม.').replace('_', '/')} ({selectedBranch})
        </span>
      </div>

      {/* หน้านี้ใช้งานบนคอมที่โต๊ะทำงาน ไม่ใช่บนมือถือ
          บนจอกว้างจึงแยกเป็นสองคอลัมน์: ซ้ายคืองานตารางสอน ขวาคือปฏิทินกิจกรรม
          items-start กันไม่ให้การ์ดสั้นถูกยืดตามการ์ดยาวในแถวเดียวกัน */}
      <div className="grid gap-6 xl:grid-cols-2 items-start">
        <div className="space-y-6">
          {/* Select Branch and Class Room */}
      <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
        }`}>
        <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
          }`}>
          <Settings size={18} className="text-brand" />
          เลือกห้องเรียนและสาขาวิชาที่จะจัดการ
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>สาขาวิชา (12 สาขา)</label>
            <select
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              className={`w-full rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-white/10 text-white focus:border-sbac-blue-light/50 focus:bg-slate-900'
                : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue focus:bg-surface-card'
                }`}
            >
              <option value="เทคโนโลยีสารสนเทศ">เทคโนโลยีสารสนเทศ (IT)</option>
              <option value="คอมพิวเตอร์ธุรกิจ">คอมพิวเตอร์ธุรกิจ</option>
              <option value="ดิจิทัลมีเดีย">ดิจิทัลมีเดีย</option>
              <option value="กราฟิกดีไซน์">กราฟิกดีไซน์</option>
              <option value="การบัญชี">การบัญชี</option>
              <option value="การตลาด">การตลาด</option>
              <option value="โลจิสติกส์">โลจิสติกส์</option>
              <option value="การท่องเที่ยว">การท่องเที่ยว</option>
              <option value="การโรงแรม">การโรงแรม</option>
              <option value="อาหารและโภชนาการ">อาหารและโภชนาการ</option>
              <option value="ช่างยนต์">ช่างยนต์</option>
              <option value="ไฟฟ้ากำลัง">ไฟฟ้ากำลัง</option>
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>ห้องเรียน (20 ห้อง)</label>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className={`w-full rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-white/10 text-white focus:border-sbac-blue-light/50 focus:bg-slate-900'
                : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue focus:bg-surface-card'
                }`}
            >
              <optgroup label="มัธยมศึกษาปีที่ 1">
                <option value="m1_1">ม.1/1</option>
                <option value="m1_2">ม.1/2</option>
                <option value="m1_3">ม.1/3</option>
                <option value="m1_4">ม.1/4</option>
              </optgroup>
              <optgroup label="มัธยมศึกษาปีที่ 2">
                <option value="m2_1">ม.2/1</option>
                <option value="m2_2">ม.2/2</option>
                <option value="m2_3">ม.2/3</option>
                <option value="m2_4">ม.2/4</option>
              </optgroup>
              <optgroup label="มัธยมศึกษาปีที่ 3">
                <option value="m3_1">ม.3/1</option>
                <option value="m3_2">ม.3/2</option>
                <option value="m3_3">ม.3/3</option>
                <option value="m3_4">ม.3/4</option>
                <option value="m3_5">ม.3/5</option>
                <option value="m3_6">ม.3/6</option>
                <option value="m3_7">ม.3/7</option>
                <option value="m3_8">ม.3/8</option>
                <option value="m3_9">ม.3/9</option>
                <option value="m3_10">ม.3/10</option>
                <option value="m3_11">ม.3/11</option>
                <option value="m3_12">ม.3/12</option>
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Timetable modification form */}
      <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
        }`}>
        <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
          }`}>
          <Calendar size={18} className="text-brand" />
          แก้ไขตารางสอน (Real-time)
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>วัน</label>
            <select
              value={day}
              onChange={e => setDay(e.target.value)}
              className={`w-full rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-white/10 text-white focus:border-sbac-blue-light/50 focus:bg-slate-900'
                : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue focus:bg-surface-card'
                }`}
            >
              <option value="Monday">จันทร์</option>
              <option value="Tuesday">อังคาร</option>
              <option value="Wednesday">พุธ</option>
              <option value="Thursday">พฤหัสบดี</option>
              <option value="Friday">ศุกร์</option>
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>คาบที่ (1–6)</label>
            <input
              type="number"
              value={period}
              onChange={e => setPeriod(Number(e.target.value))}
              min={1}
              max={6}
              className={`w-full rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-white/10 text-white focus:border-sbac-blue-light/50 focus:bg-slate-900'
                : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue focus:bg-surface-card'
                }`}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>ชื่อวิชา</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50 focus:bg-slate-900'
                : 'bg-slate-50 border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-surface-card'
                }`}
              placeholder="ระบุวิชาเรียน"
            />
          </div>

          <div>
            <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>ครูประจำวิชา (เดิม)</label>
            <input
              type="text"
              value={origTeacher}
              onChange={e => setOrigTeacher(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50 focus:bg-slate-900'
                : 'bg-slate-50 border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-surface-card'
                }`}
              placeholder="ระบุครูผู้สอนเดิม"
            />
          </div>

          <div>
            <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>ครูสอนแทน</label>
            <input
              type="text"
              value={subTeacher}
              onChange={e => setSubTeacher(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                ? 'bg-slate-900 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50 focus:bg-slate-900'
                : 'bg-slate-50 border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-surface-card'
                }`}
              placeholder="ระบุชื่อครูสอนแทน"
            />
          </div>

          <div>
            <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>ห้องเรียน</label>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setRoomMode('same')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all ${roomMode === 'same'
                  ? 'bg-sbac-blue text-white border-sbac-blue shadow-sm'
                  : isDark
                    ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                    : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                  }`}
              >
                ห้องเดิมตามตาราง
              </button>
              <button
                onClick={() => setRoomMode('new')}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all ${roomMode === 'new'
                  ? 'bg-sbac-blue text-white border-sbac-blue shadow-sm'
                  : isDark
                    ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                    : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                  }`}
              >
                เปลี่ยนห้องใหม่
              </button>
            </div>
            {roomMode === 'new' && (
              <input
                type="text"
                value={room}
                onChange={e => setRoom(e.target.value)}
                className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                  ? 'bg-slate-900 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50 focus:bg-slate-900'
                  : 'bg-slate-50 border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-surface-card'
                  }`}
                placeholder="ระบุเลขห้องเรียนใหม่"
              />
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={saveSubstitute}
            className="flex-1 bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-3 rounded-xl text-xs transition-all shadow-button flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={14} />
            อัปเดตตาราง
          </button>
          <button
            onClick={resetSubstitute}
            className={`flex-1 border-2 font-extrabold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${isDark
              ? 'border-white/10 text-content-secondary hover:bg-white/5'
              : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
              }`}
          >
            <Undo size={14} />
            คืนค่าคาบนี้
          </button>
        </div>
      </div>

        </div>

        {/* ปฏิทินกิจกรรม เขียนลงตาราง events ใน Supabase ตัวเดียวกับที่นักเรียนอ่าน */}
        <EventManager />
      </div>

      {/* Excel sync panel — เต็มความกว้างเสมอ เพราะมีตารางพรีวิวรายชื่อนักเรียนอยู่ข้างใน */}
      <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
        }`}>
        <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
          }`}>
          <FileSpreadsheet size={18} className="text-brand" />
          นำเข้าข้อมูลด้วย Excel / CSV + เข้ารหัสข้อมูล
        </h3>

        <p className={`text-xs leading-relaxed transition-colors duration-300 ${isDark ? 'text-content-muted' : 'text-content-muted'
          }`}>
          เชื่อมต่อข้อมูลรายชื่อนักเรียนจากระบบทะเบียน Excel พร้อมตัวเลือกเข้ารหัสเลขบัตรประชาชน (National ID) ด้วย SHA-256 Hashing หรือ AES-256
        </p>

        {/* Action Buttons for Template / Database Export */}
        <div className="flex gap-2">
          <button
            onClick={downloadTemplate}
            className={`flex-1 border font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${isDark
              ? 'border-white/10 text-content-secondary hover:bg-white/5'
              : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
              }`}
          >
            <Download size={14} />
            ดาวน์โหลดเทมเพลต CSV
          </button>
          <button
            onClick={exportDatabase}
            disabled={isProcessing}
            className={`flex-1 border font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${isDark
              ? 'border-white/10 text-content-secondary hover:bg-white/5'
              : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
              }`}
          >
            <Send size={14} className="rotate-180" />
            ส่งออกและถอดรหัส (Export)
          </button>
        </div>

        {/* Encryption Settings */}
        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-100'
          } space-y-3`}>
          <div className="flex items-center gap-1.5">
            <Key size={14} className="text-brand" />
            <span className={`text-xs font-extrabold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
              การตั้งค่าความปลอดภัยและการเข้ารหัส
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'sha256', label: 'SHA-256 Hash', desc: 'ปลอดภัยที่สุด (ถอดกลับไม่ได้)' },
              { id: 'aes256', label: 'AES-256 GCM', desc: 'สองทาง (ถอดรหัสคืนได้)' },
              { id: 'none', label: 'ไม่เข้ารหัส', desc: 'เก็บแบบธรรมดา (ไม่แนะนำ)' }
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setEncryptionMode(mode.id)}
                className={`px-2 py-3 rounded-xl border text-left transition-all ${encryptionMode === mode.id
                  ? 'bg-sbac-blue/10 border-sbac-blue text-brand ring-2 ring-sbac-blue/20'
                  : isDark
                    ? 'bg-neutral-900 border-white/10 hover:bg-neutral-800 text-content-secondary'
                    : 'bg-surface-card border-slate-200 hover:bg-slate-50 text-slate-600'
                  }`}
              >
                <div className="text-xs font-extrabold">{mode.label}</div>
                <div className="text-[9px] opacity-75 mt-0.5 leading-tight">{mode.desc}</div>
              </button>
            ))}
          </div>

          {/* Key Passphrase input for AES mode */}
          {encryptionMode === 'aes256' && (
            <div className="space-y-1 animate-slide-down">
              <label className={`text-[10px] font-bold block ${isDark ? 'text-slate-200' : 'text-slate-600'}`}>
                คีย์หลักความปลอดภัย (Encryption Passphrase) <span className="text-accent-rose">*จำเป็นในการถอดรหัส</span>
              </label>
              <div className="relative">
                <input
                  type={showSecretKey ? 'text' : 'password'}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className={`w-full rounded-xl pl-4 pr-10 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                    ? 'bg-neutral-900 border-white/15 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50'
                    : 'bg-surface-card border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue'
                    }`}
                  placeholder="ป้อนรหัสผ่านคีย์ส่วนตัวของคุณ..."
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 text-content-muted hover:text-slate-600`}
                >
                  {showSecretKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {encryptionMode === 'none' && (
            <div className="text-[10px] text-accent-amber font-bold bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 flex items-start gap-1.5 animate-slide-down">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>
                คำเตือน: การไม่เข้ารหัสข้อมูลส่วนบุคคล (National ID) ขัดต่อพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA) และลดระดับความปลอดภัยของวิทยาลัย
              </span>
            </div>
          )}
        </div>

        {/* Drag & Drop File Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleExcelFile(file);
          }}
          className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all duration-200 ${dragOver
            ? 'bg-sbac-blue/5 border-sbac-blue scale-[1.01]'
            : isDark
              ? 'border-white/15 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/30'
              : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 hover:border-slate-400'
            }`}
          onClick={() => document.getElementById('excelFileInput').click()}
        >
          <input
            id="excelFileInput"
            type="file"
            accept=".csv, .xlsx, .xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) handleExcelFile(file);
            }}
          />
          <Upload size={32} className={`mx-auto mb-2.5 transition-colors ${dragOver ? 'text-brand' : 'text-content-muted'
            }`} />
          <div className="text-xs font-extrabold text-ink-secondary dark:text-slate-200">
            ลากและวางไฟล์ หรือคลิกเพื่ออัปโหลด
          </div>
          <div className="text-[10px] text-content-muted mt-1">
            รองรับไฟล์ Excel (.xlsx, .xls) และ CSV (.csv)
          </div>
        </div>

        {/* Parsed List Preview */}
        {parsedStudents.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center px-1">
              <span className={`text-xs font-extrabold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                ตัวอย่างผลลัพธ์การเข้ารหัส ({parsedStudents.length} รายชื่อ)
              </span>
              <button
                onClick={() => setParsedStudents([])}
                className="text-[10px] font-bold text-accent-rose hover:underline"
              >
                ล้างข้อมูล
              </button>
            </div>

            <div className={`rounded-2xl border max-h-48 overflow-y-auto divide-y ${isDark ? 'bg-slate-950/40 border-white/5 divide-white/5' : 'bg-slate-50 border-slate-100 divide-slate-100'
              }`}>
              {parsedStudents.slice(0, 5).map((row, idx) => {
                const norm = normalizeStudent(row);
                const maskedId = norm.national_id
                  ? `${norm.national_id.substring(0, 5)}******${norm.national_id.substring(norm.national_id.length - 2)}`
                  : 'ไม่มีข้อมูล';

                return (
                  <div key={idx} className="p-3 text-[10px] flex items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-extrabold text-ink-secondary dark:text-slate-200 truncate flex items-center gap-1.5">
                        <span className="bg-sbac-blue/10 dark:bg-sbac-blue/20 text-brand px-1.5 py-0.5 rounded font-mono font-medium">
                          {norm.student_id || 'N/A'}
                        </span>
                        <span>{norm.full_name || 'ไม่ระบุชื่อ'}</span>
                      </div>
                      <div className="text-content-muted flex items-center gap-1 truncate font-mono text-[9px]">
                        <span>เลขบัตร: {maskedId}</span>
                        <span className="opacity-40">|</span>
                        <span>ห้อง: {norm.class_id}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${encryptionMode === 'sha256'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-accent-emerald'
                        : encryptionMode === 'aes256'
                          ? 'bg-sky-500/10 border-sky-500/20 text-accent-cyan'
                          : 'bg-amber-500/10 border-amber-500/20 text-accent-amber'
                        }`}>
                        {encryptionMode === 'sha256' ? 'SHA-256 Hashed' : encryptionMode === 'aes256' ? 'AES Encrypted' : 'Plain Text'}
                      </span>
                    </div>
                  </div>
                );
              })}
              {parsedStudents.length > 5 && (
                <div className="p-2 text-center text-[9px] text-content-muted font-semibold bg-slate-900/10 dark:bg-white/[0.01]">
                  และนักเรียนคนอื่น ๆ อีก {parsedStudents.length - 5} รายการ
                </div>
              )}
            </div>

            <button
              onClick={syncToFirebase}
              disabled={isProcessing}
              className={`w-full text-white font-extrabold py-3.5 rounded-xl text-xs transition-all shadow-button flex items-center justify-center gap-2 select-none bg-gradient-to-r from-sbac-blue to-sbac-navy hover:to-sbac-blue cursor-pointer ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''
                }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>กำลังดำเนินการและอัปโหลด...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={16} />
                  <span>บันทึกข้อมูลและส่งขึ้นระบบ (Firestore)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ============================================================
          จัดการพฤติกรรมและการตัดคะแนนนักเรียน (ฝ่ายวิชาการ)
          - Workflow แบบ step-by-step อยู่ใน BehaviorDeductionWizard.jsx
          - รายการทั้งหมด: role academic เห็น/แก้ไข/ลบได้ทุกรายการของทุกครู
            (list_behavior_logs() กรองสิทธิ์ให้แล้วฝั่ง DB — ดู 21_behavior_crud_and_academic.sql)
          ============================================================ */}
      <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${
        isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
      }`}>
        <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
          <Award size={18} className="text-brand" />
          จัดการพฤติกรรมและการตัดคะแนนนักเรียน
        </h3>

        <div className="grid gap-4 xl:grid-cols-[280px_1fr] items-start">
          <BehaviorDeductionWizard />

          <div className="space-y-3">
            <span className={`text-xs font-extrabold flex items-center gap-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
              <ListChecks size={14} />
              รายการทั้งหมด ({allBehaviorLogs.length})
            </span>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <BehaviorLogList
                logs={allBehaviorLogs}
                loading={allBehaviorLogsLoading}
                showStudentName
                onEdit={setEditingBehaviorLog}
                onDeleteRequest={handleDeleteBehaviorLog}
              />
            </div>
          </div>
        </div>
      </div>

      <BehaviorLogEditModal
        log={editingBehaviorLog}
        onClose={() => setEditingBehaviorLog(null)}
        onSave={(logId, payload) => updateBehaviorLog(logId, payload)}
      />

      {behaviorConfirmDialog}

      {/* ============================================================
          อนุมัติใบลา (ขั้นสุดท้าย) + กำหนดครูประจำชั้น (22_leave_requests.sql)
          ============================================================ */}
      <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${
        isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
      }`}>
        <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
          <ClipboardCheck size={18} className="text-brand" />
          อนุมัติใบลา (ขั้นสุดท้าย)
        </h3>

        <div className="grid gap-4 xl:grid-cols-[280px_1fr] items-start">
          <HomeroomAssignmentPanel />

          <div className="space-y-3">
            <span className={`text-xs font-extrabold flex items-center gap-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
              <ListChecks size={14} />
              รอฝ่ายวิชาการอนุมัติ ({pendingAcademicLeaves.length})
            </span>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <LeaveRequestList
                requests={pendingAcademicLeaves}
                loading={pendingAcademicLeavesLoading}
                mode="academic"
                onDecide={(req, approve, reason) => academicDecide(req.id, approve, reason)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
