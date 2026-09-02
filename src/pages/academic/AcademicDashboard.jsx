import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import BehaviorLogList from '../../components/behavior/BehaviorLogList';
import BehaviorLogEditModal from '../../components/behavior/BehaviorLogEditModal';
import LeaveRequestList from '../../components/leave/LeaveRequestList';
import { useBehaviorLogs } from '../../hooks/useBehaviorLogs';
import { useLeaveRequests } from '../../hooks/useLeaveRequests';
import RepairTicketQueue from '../../components/repair/RepairTicketQueue';
import {
  Calendar,
  Settings,
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
  ClipboardCheck,
  CalendarDays,
  Users,
  CloudDownload
} from 'lucide-react';
import { sha256, encryptAES } from '../../utils/crypto';
import EventManager from './EventManager';
import BehaviorDeductionWizard from './BehaviorDeductionWizard';
import HomeroomAssignmentPanel from './HomeroomAssignmentPanel';
import TabNav from '../../components/layout/TabNav';
import {
  DAYS,
  DAY_LABELS,
  DAY_LABELS_SHORT,
  PERIODS,
  fetchTimetable,
  fetchClassIds,
  subscribeTimetable,
  saveSlot,
  clearSubstitution,
  importFromSheet,
  isSheetConfigured,
  classLabel,
} from '../../utils/timetable';

/** กล่องอธิบายขั้นตอนการทำงานที่ต้องรู้ก่อนกดปุ่ม
 *  ไม่ใช่คำเตือนว่าพัง — ของที่พังถูกแก้หรือถอดออกไปหมดแล้ว */
function WorkflowNotice({ isDark, title, children }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-xs leading-relaxed ${
        isDark ? 'bg-sbac-blue/10 border-sbac-blue/25 text-slate-200' : 'bg-sbac-blue-50 border-sbac-blue/20 text-ink-secondary'
      }`}
    >
      <strong className={`font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>{title}</strong>
      <div className="mt-1">{children}</div>
    </div>
  );
}

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

  /* ห้องที่มีตารางอยู่จริง อ่านจาก DB ไม่ใช่รายชื่อ 20 ห้องที่เขียนตายไว้ในโค้ด */
  const [classIds, setClassIds] = useState([]);
  const [classIdsLoading, setClassIdsLoading] = useState(true);

  // Preview State
  const [timetableData, setTimetableData] = useState({});
  const [timetableLoading, setTimetableLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState(false);
  const [importing, setImporting] = useState(false);

  /* แท็บที่เปิดอยู่ — เริ่มที่ "รอดำเนินการ" เพราะเป็นคำถามแรกของทุกเช้า
     ว่ามีใบลา/ใบแจ้งซ่อมค้างอยู่กี่รายการ ไม่ใช่การมาแก้ตารางสอน */
  const [activeTab, setActiveTab] = useState('inbox');

  const { confirm: confirmImport, confirmDialog: importConfirmDialog } = useConfirm();

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

  /* ดาวน์โหลดไฟล์ที่เข้ารหัสแล้ว เพื่อเอาไปเข้าระบบผ่าน import-tool/
   *
   * ของเดิมปุ่มนี้เขียนตรงเข้า Firestore collection 'students' และ 'users'
   * ซึ่งนอกจากจะ throw ทันที (config ถูกปิด) ยังเป็นการเอาชื่อจริงและเลขบัตรประชาชน
   * ของนักเรียนไปวางบนโปรเจกต์ที่เปิดให้ใครก็อ่านได้
   *
   * งานส่วนที่มีค่าจริงคือ อ่านไฟล์ + แปลงชื่อคอลัมน์ + hash/เข้ารหัส ซึ่งทำในเบราว์เซอร์
   * ล้วน ๆ ไม่ต้องพึ่ง backend เลย จึงเก็บไว้ทั้งหมด แล้วเปลี่ยนปลายทางเป็นไฟล์
   * ให้เจ้าหน้าที่เอาเข้าฐานข้อมูลด้วย import-tool ที่ถือ service_role ถูกที่ถูกทาง
   *
   * เลขบัตรตัวจริงไม่ถูกเขียนลงไฟล์ ยกเว้นผู้ใช้เลือกโหมด "ไม่เข้ารหัส" เอง */
  const exportEncrypted = async () => {
    if (parsedStudents.length === 0) {
      showToast('ยังไม่ได้เลือกไฟล์รายชื่อ', 'error');
      return;
    }
    if (encryptionMode === 'aes256' && !secretKey) {
      showToast('กรุณากรอกคีย์หลักสำหรับการเข้ารหัส AES', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const rows = [];
      let skipped = 0;

      for (const raw of parsedStudents) {
        const norm = normalizeStudent(raw);
        // ไม่มีรหัสนักเรียนหรือเลขบัตร = ผูกกับใครไม่ได้ ข้ามไปแล้วรายงานตอนท้าย
        if (!norm.student_id || !norm.national_id) {
          skipped++;
          continue;
        }

        let secret;
        if (encryptionMode === 'aes256') {
          secret = await encryptAES(norm.national_id, secretKey);
        } else if (encryptionMode === 'none') {
          secret = norm.national_id;
        } else {
          secret = await sha256(norm.national_id);
        }

        rows.push([
          norm.student_id, norm.full_name, secret, norm.email,
          norm.branch, norm.year, norm.room, norm.session, norm.class_id,
        ]);
      }

      if (rows.length === 0) {
        showToast('ไม่มีแถวไหนมีทั้งรหัสนักเรียนและเลขบัตร', 'warning');
        return;
      }

      // ชื่อคอลัมน์บอกตรง ๆ ว่าค่าข้างในถูกแปลงมาแบบไหน คนเปิดไฟล์ทีหลังจะได้ไม่ต้องเดา
      const secretHeader =
        encryptionMode === 'aes256' ? 'national_id_encrypted'
        : encryptionMode === 'none' ? 'national_id'
        : 'national_id_hash';

      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv =
        `student_id,full_name,${secretHeader},email,branch,year,room,session,class_id\n` +
        rows.map((r) => r.map(esc).join(',')).join('\n');

      // นำหน้าด้วย BOM (U+FEFF) ให้ Excel เปิดภาษาไทยไม่เป็นตัวยึกยือ
      const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sbac_students_${encryptionMode}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(
        skipped > 0
          ? `ดาวน์โหลด ${rows.length} รายชื่อแล้ว (ข้าม ${skipped} แถวที่ข้อมูลไม่ครบ)`
          : `ดาวน์โหลด ${rows.length} รายชื่อเรียบร้อย`,
        'success'
      );
    } catch (err) {
      console.error('[academic] เข้ารหัสและส่งออกไม่สำเร็จ:', err);
      showToast('เข้ารหัสไม่สำเร็จ ตรวจสอบคีย์แล้วลองใหม่อีกครั้ง', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  /* ตารางสอนอ่านจาก Supabase แล้ว subscribe realtime ต่อ (25_timetables.sql)
     ของเดิมเป็น onSnapshot ของ Firestore ที่ throw ทันทีเพราะ config ถูกปิดไป
     ตอนนี้ที่ฝ่ายวิชาการกดบันทึก นักเรียนที่เปิดหน้าตารางอยู่จะเห็นทันที
     เพราะทั้งสองฝั่ง subscribe แถวชุดเดียวกัน */
  const reloadTimetable = useCallback(async () => {
    setTimetableLoading(true);
    try {
      setTimetableData(await fetchTimetable(selectedClassId));
    } catch (err) {
      console.error('[academic] โหลดตารางสอนไม่สำเร็จ:', err);
      showToast('โหลดตารางสอนไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
      setTimetableData({});
    } finally {
      setTimetableLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    reloadTimetable();
    return subscribeTimetable(selectedClassId, setTimetableData);
  }, [selectedClassId, reloadTimetable]);

  /* โหลดรายชื่อห้องครั้งเดียวตอนเข้าหน้า
     ถ้าห้องที่เลือกไว้ (ค่าเริ่มต้น m3_6) ไม่มีอยู่จริง ให้เด้งไปห้องแรกที่มี
     ไม่งั้นเปิดหน้ามาเจอตารางว่างทั้งที่ห้องอื่นมีข้อมูล */
  const loadClassIds = useCallback(async () => {
    setClassIdsLoading(true);
    try {
      const ids = await fetchClassIds();
      setClassIds(ids);
      if (ids.length > 0 && !ids.includes(selectedClassId)) setSelectedClassId(ids[0]);
    } catch (err) {
      console.error('[academic] โหลดรายชื่อห้องไม่สำเร็จ:', err);
      setClassIds([]);
    } finally {
      setClassIdsLoading(false);
    }
    // เจตนาไม่ใส่ selectedClassId ใน deps — ต้องการให้เช็คแค่ตอนโหลดครั้งแรก
    // ถ้าใส่ไป การกดเลือกห้องแต่ละครั้งจะไปยิงโหลดรายชื่อห้องใหม่ทุกครั้ง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadClassIds();
  }, [loadClassIds]);

  /* ย้ายค่าของคาบที่เลือกเข้าฟอร์ม
     ต้องเคลียร์ช่องครูสอนแทนเมื่อคาบนั้นไม่ได้ถูกสั่งสอนแทน ไม่งั้นชื่อครูจากคาบก่อนหน้า
     จะค้างอยู่ในช่อง แล้วกดบันทึกทีเดียวกลายเป็นสั่งสอนแทนคาบที่ไม่ได้ตั้งใจ */
  useEffect(() => {
    const slot = timetableData[day]?.[period] || {};
    setSubject(slot.subject || '');
    setOrigTeacher(slot.teacher || '');
    setSubTeacher(slot.is_substituted ? slot.substitute_teacher || '' : '');
    setRoom(slot.is_substituted && slot.substitute_room ? slot.substitute_room : slot.room || '');
    setRoomMode(slot.is_substituted && slot.substitute_room ? 'new' : 'same');
  }, [day, period, timetableData]);

  const currentSlot = timetableData[day]?.[period] || null;

  /* หมวดของหน้านี้ เรียงตามความถี่ที่ฝ่ายวิชาการต้องใช้จริง ไม่ใช่ตามลำดับที่โค้ดเคยเขียนไว้
     "รอดำเนินการ" มาก่อนเพราะเป็นคำถามแรกของทุกเช้าว่ามีอะไรค้างรออยู่บ้าง
     และตัวเลขบนแท็บตอบคำถามนั้นให้ตั้งแต่ยังไม่ได้กดเข้าไป */
  const TABS = [
    { id: 'inbox', label: 'รอดำเนินการ', icon: ClipboardCheck, badge: pendingAcademicLeaves.length },
    { id: 'timetable', label: 'ตารางสอน', icon: Calendar },
    { id: 'students', label: 'นักเรียน', icon: Users },
    { id: 'events', label: 'กิจกรรม', icon: CalendarDays },
    { id: 'import', label: 'นำเข้าข้อมูล', icon: FileSpreadsheet },
  ];

  /* บันทึกคาบ — ทำได้สองอย่างในปุ่มเดียว
     กรอกครูสอนแทน = สั่งสอนแทน / เว้นว่าง = แก้ตารางปกติ
     แยกเป็นสองปุ่มแล้วผู้ใช้ต้องเดาว่าจะกดอันไหน ซึ่งไม่มีข้อมูลพอจะเดาถูก */
  const handleSaveSlot = async () => {
    if (!subject.trim()) {
      showToast('กรุณากรอกชื่อวิชาก่อนบันทึก', 'error');
      return;
    }

    const substituting = Boolean(subTeacher.trim());
    setSavingSlot(true);
    try {
      await saveSlot(selectedClassId, day, period, {
        subject: subject.trim(),
        teacher: origTeacher.trim(),
        room: roomMode === 'new' ? room.trim() : currentSlot?.room || room.trim(),
        is_substituted: substituting,
        substitute_teacher: substituting ? subTeacher.trim() : '',
        substitute_room: substituting && roomMode === 'new' ? room.trim() : '',
      });
      showToast(
        substituting
          ? `สั่งสอนแทน ${DAY_LABELS[day]} คาบ ${period} เรียบร้อย นักเรียนเห็นแล้ว`
          : `บันทึก ${DAY_LABELS[day]} คาบ ${period} เรียบร้อย`,
        'success'
      );
    } catch (err) {
      console.error('[academic] บันทึกตารางสอนไม่สำเร็จ:', err);
      showToast(
        err?.code === '42501'
          ? 'บัญชีนี้ไม่มีสิทธิ์แก้ตารางสอน (เฉพาะฝ่ายวิชาการ)'
          : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง',
        'error'
      );
    } finally {
      setSavingSlot(false);
    }
  };

  const handleClearSubstitution = async () => {
    setSavingSlot(true);
    try {
      await clearSubstitution(selectedClassId, day, period);
      showToast(`ยกเลิกการสอนแทน ${DAY_LABELS[day]} คาบ ${period} แล้ว`, 'success');
    } catch (err) {
      console.error('[academic] ยกเลิกการสอนแทนไม่สำเร็จ:', err);
      showToast('ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    } finally {
      setSavingSlot(false);
    }
  };

  /* ดูดทั้งเทอมจาก Google Sheet
     ต้นเทอมตารางเปลี่ยนทั้งใบ กรอกทีละคาบ 35 คาบต่อห้องคือความทรมาน
     แก้ในชีตแล้วกดปุ่มเดียวเร็วกว่ามาก ส่วนสั่งสอนแทนระหว่างเทอมค่อยใช้ฟอร์ม
     (ชีตอ่านได้อย่างเดียว เขียนกลับไม่ได้ จึงสั่งสอนแทนผ่านชีตไม่ได้) */
  const handleImportSheet = async () => {
    const ok = await confirmImport({
      title: `นำเข้าตารางห้อง ${classLabel(selectedClassId)}?`,
      message: 'ระบบจะดึงตารางทั้งแท็บจาก Google Sheet มาทับของเดิมในฐานข้อมูล',
      detail: 'คาบที่สั่งสอนแทนไว้ในห้องนี้จะถูกทับด้วยค่าจากชีต และนักเรียนจะเห็นตารางใหม่ทันที',
      confirmLabel: 'นำเข้าทับ',
      danger: true,
    });
    if (!ok) return;

    setImporting(true);
    try {
      const count = await importFromSheet(selectedClassId);
      showToast(`นำเข้าตารางสอน ${count} คาบเรียบร้อย`, 'success');
    } catch (err) {
      console.error('[academic] นำเข้าจากชีตไม่สำเร็จ:', err);
      showToast(err.message || 'นำเข้าจากชีตไม่สำเร็จ', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <h2 className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
          }`}>
          <Settings size={24} className="text-brand" />
          Academic Panel
        </h2>
        <span className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors duration-300 ${isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-secondary'
          }`}>
          ห้อง {classLabel(selectedClassId)}
        </span>
      </div>

      {/* แท็บ — เดิมเป็นหน้าเดียวยาว 7 หมวดรวด บนมือถือกว่าจะเลื่อนถึงใบลาที่รออนุมัติ
          ต้องผ่านฟอร์มตารางสอน ตัวอัปโหลด Excel และตารางพรีวิวรายชื่อทั้งหมดก่อน */}
      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'inbox' && (
        <div
          role="tabpanel"
          id="panel-inbox"
          aria-labelledby="tab-inbox"
          tabIndex={-1}
          className="space-y-6"
        >
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

        {/* คิวใบแจ้งซ่อมจริงจากผู้ช่วย SBAC Connect (23_repair_tickets.sql) */}
        <RepairTicketQueue />
        </div>
      )}

      {activeTab === 'timetable' && (
        <div
          role="tabpanel"
          id="panel-timetable"
          aria-labelledby="tab-timetable"
          tabIndex={-1}
          className="space-y-6"
        >
            {/* เลือกห้อง
                เดิมเป็น dropdown สาขา 12 สาขา + ห้อง 20 ห้อง ทั้งที่:
                  - ตัวเลือกสาขาไม่เคยถูกใช้กรองหรือบันทึกอะไรเลย เอาไปโชว์เป็นข้อความบนหัวอย่างเดียว
                  - มีตารางจริงแค่สองห้อง อีก 18 ห้องเลือกไปก็เจอหน้าว่างโดยไม่มีคำอธิบาย
                    ซึ่งดูเหมือนระบบพัง ทั้งที่คือห้องนั้นยังไม่มีใครใส่ตาราง
                ตอนนี้แสดงเฉพาะห้องที่มีตารางอยู่จริงในฐานข้อมูล */}
        <div className={`rounded-3xl border p-5 shadow-sm space-y-3 transition-colors duration-300 ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
          }`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
              }`}>
              <Settings size={18} className="text-brand" />
              ห้องที่กำลังจัดการ
            </h3>
            <span className="text-[10px] font-bold text-content-muted">
              {classIds.length > 0 ? `${classIds.length} ห้อง` : ''}
            </span>
          </div>

          {classIdsLoading ? (
            <div className="flex gap-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={`h-11 w-24 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}
                />
              ))}
            </div>
          ) : classIds.length === 0 ? (
            /* ยังไม่มีห้องไหนมีตารางเลย — บอกทางออกไปเลย ไม่ใช่ปล่อยให้หน้าว่าง */
            <p className="text-xs font-semibold text-content-muted leading-relaxed">
              ยังไม่มีห้องไหนมีตารางสอนในระบบ — กดปุ่ม
              <span className="font-extrabold"> นำเข้าตารางทั้งเทอมจาก Google Sheet </span>
              ด้านล่าง หรือรัน <code className="font-mono">25_timetables.sql</code> เพื่อใส่ข้อมูลตั้งต้น
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedClassId(id)}
                  aria-pressed={selectedClassId === id}
                  className={`min-h-[44px] px-5 rounded-xl text-sm font-extrabold border transition-all active:scale-95 ${
                    selectedClassId === id
                      ? 'bg-sbac-blue text-white border-sbac-blue shadow-button'
                      : isDark
                        ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                        : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {classLabel(id)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timetable modification form */}
        <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
          }`}>
          <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
            }`}>
            <Calendar size={18} className="text-brand" />
            แก้ไขตารางสอน
            {/* ป้ายนี้เคยเขียนว่า Real-time ทั้งที่เขียนลง Firebase ที่ปิดไปแล้ว
                ตอนนี้เป็นของจริง จึงบอกให้ชัดว่าปลายทางคือใคร */}
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/25">
              นักเรียนเห็นทันที
            </span>
          </h3>

          {/* เลือกวันแบบปุ่ม ไม่ใช่ dropdown — มีแค่ 5 ตัวเลือกและต้องสลับไปมาบ่อย
              การกดสองครั้ง (เปิด dropdown แล้วเลือก) ทุกครั้งไม่คุ้มกับที่ประหยัดได้ */}
          <div>
            <span className={`text-xs font-bold block mb-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>วัน</span>
            <div className="grid grid-cols-5 gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  aria-pressed={day === d}
                  className={`min-h-[44px] rounded-xl text-xs font-extrabold border transition-all active:scale-95 ${
                    day === d
                      ? 'bg-sbac-blue text-white border-sbac-blue shadow-button'
                      : isDark
                        ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                        : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {DAY_LABELS_SHORT[d]}
                </button>
              ))}
            </div>
          </div>

          {/* คาบเรียนก็เช่นกัน แถมแต่ละปุ่มยังบอกได้ด้วยว่าคาบไหนมีวิชาแล้ว
              และคาบไหนถูกสั่งสอนแทนอยู่ — เดิมเป็นช่อง number ที่ไม่บอกอะไรเลย */}
          <div>
            <span className={`text-xs font-bold block mb-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>คาบที่</span>
            <div className="grid grid-cols-8 gap-1.5">
              {PERIODS.map((p) => {
                const slot = timetableData[day]?.[p];
                const selected = period === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    aria-pressed={selected}
                    aria-label={`คาบ ${p}${slot ? ` — ${slot.subject}` : ' — ยังว่าง'}`}
                    className={`relative min-h-[44px] rounded-xl text-xs font-extrabold border transition-all active:scale-95 ${
                      selected
                        ? 'bg-sbac-blue text-white border-sbac-blue shadow-button'
                        : slot
                          ? isDark
                            ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                            : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                          : isDark
                            ? 'bg-transparent text-content-muted border-white/5 border-dashed hover:bg-white/5'
                            : 'bg-transparent text-ink-light border-slate-200 border-dashed hover:bg-slate-50'
                    }`}
                  >
                    {p}
                    {slot?.is_substituted && (
                      <span
                        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent-rose"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* สรุปว่าคาบที่เลือกอยู่ตอนนี้เป็นอะไร — กันการแก้ผิดคาบ
              ซึ่งเป็นความผิดพลาดที่ตรวจไม่เจอจนกว่านักเรียนจะเดินไปผิดห้อง */}
          <div
            aria-live="polite"
            className={`rounded-2xl border px-4 py-3 text-xs ${
              isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'
            }`}
          >
            {timetableLoading ? (
              <span className="text-content-muted font-semibold">กำลังโหลดตาราง...</span>
            ) : currentSlot ? (
              <div className="space-y-1">
                <div className={`font-extrabold ${isDark ? 'text-white' : 'text-ink'}`}>
                  {currentSlot.subject || 'ยังไม่ระบุวิชา'}
                </div>
                <div className="text-content-muted font-semibold">
                  {currentSlot.teacher || 'ไม่ระบุครู'}
                  {currentSlot.room && ` · ห้อง ${currentSlot.room}`}
                </div>
                {currentSlot.is_substituted && (
                  <div className="text-accent-rose font-extrabold">
                    สอนแทนโดย {currentSlot.substitute_teacher || 'ไม่ระบุ'}
                    {currentSlot.substitute_room && ` · ย้ายไปห้อง ${currentSlot.substitute_room}`}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-content-muted font-semibold">
                {DAY_LABELS[day]} คาบ {period} ยังว่าง — กรอกด้านล่างเพื่อเพิ่มวิชา
              </span>
            )}
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

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleSaveSlot}
              disabled={savingSlot}
              className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-3 rounded-xl text-xs transition-all shadow-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sbac-blue"
            >
              <RefreshCw size={14} className={savingSlot ? 'animate-spin' : undefined} />
              {savingSlot
                ? 'กำลังบันทึก...'
                : subTeacher.trim()
                  ? `สั่งสอนแทน ${DAY_LABELS[day]} คาบ ${period}`
                  : `บันทึก ${DAY_LABELS[day]} คาบ ${period}`}
            </button>

            {/* ปุ่มยกเลิกสอนแทนโผล่เฉพาะตอนที่คาบนี้ถูกสั่งสอนแทนอยู่จริง
                เดิมปุ่ม "คืนค่าคาบนี้" ขึ้นตลอดเวลา กดตอนไม่มีอะไรให้คืนก็ไม่เกิดอะไร
                ซึ่งทำให้คนกดไม่แน่ใจว่าระบบทำงานหรือเปล่า */}
            {currentSlot?.is_substituted && (
              <button
                onClick={handleClearSubstitution}
                disabled={savingSlot}
                className={`w-full border-2 font-extrabold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${isDark
                  ? 'border-white/10 text-content-secondary hover:bg-white/5'
                  : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
                  }`}
              >
                <Undo size={14} />
                ยกเลิกการสอนแทน กลับเป็นครูเดิม
              </button>
            )}

            {/* นำเข้าทั้งเทอมจากชีต — งานต้นเทอม ไม่ใช่งานประจำวัน
                จึงวางไว้ล่างสุดและใช้สไตล์รอง ไม่แย่งความสนใจจากปุ่มบันทึก */}
            <button
              onClick={handleImportSheet}
              disabled={importing || !isSheetConfigured(selectedClassId)}
              title={
                isSheetConfigured(selectedClassId)
                  ? undefined
                  : 'ห้องนี้ยังไม่ได้ตั้งค่า gid ของแท็บใน src/config/sheets.js'
              }
              className={`w-full border font-extrabold py-2.5 rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${isDark
                ? 'border-white/10 text-content-muted hover:bg-white/5'
                : 'border-slate-200 text-content-muted hover:bg-slate-50'
                }`}
            >
              <CloudDownload size={13} className={importing ? 'animate-pulse' : undefined} />
              {importing ? 'กำลังนำเข้า...' : 'นำเข้าตารางทั้งเทอมจาก Google Sheet'}
            </button>
          </div>
        </div>
        </div>
      )}

      {activeTab === 'students' && (
        <div
          role="tabpanel"
          id="panel-students"
          aria-labelledby="tab-students"
          tabIndex={-1}
          className="space-y-6"
        >
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
        </div>
      )}

      {activeTab === 'events' && (
        <div
          role="tabpanel"
          id="panel-events"
          aria-labelledby="tab-events"
          tabIndex={-1}
          className="space-y-6"
        >
          {/* ปฏิทินกิจกรรม เขียนลงตาราง events ใน Supabase ตัวเดียวกับที่นักเรียนอ่าน */}
          <EventManager />
        </div>
      )}

      {activeTab === 'import' && (
        <div
          role="tabpanel"
          id="panel-import"
          aria-labelledby="tab-import"
          tabIndex={-1}
          className="space-y-6"
        >
        {/* Excel sync panel — เต็มความกว้างเสมอ เพราะมีตารางพรีวิวรายชื่อนักเรียนอยู่ข้างใน */}
        <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
          }`}>
          <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
            }`}>
            <FileSpreadsheet size={18} className="text-brand" />
            นำเข้าข้อมูลด้วย Excel / CSV + เข้ารหัสข้อมูล
          </h3>

          <WorkflowNotice isDark={isDark} title="ทำงานเป็นสองขั้น">
            หน้านี้อ่านไฟล์และเข้ารหัสเลขบัตรให้ในเบราว์เซอร์ แล้วได้ไฟล์ที่เข้ารหัสแล้วออกมา
            จากนั้นนำไฟล์นั้นเข้าฐานข้อมูลด้วย <code className="font-mono">import-tool/</code>
            <span className="block mt-1 opacity-80">
              ที่ต้องแยกสองขั้นเพราะการสร้างบัญชีนักเรียนต้องใช้ service_role key ซึ่งห้ามอยู่ในหน้าเว็บ
              ใครเปิด devtools ก็อ่านได้ และคีย์นั้นข้าม RLS ได้ทุกข้อ
            </span>
          </WorkflowNotice>

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
                onClick={exportEncrypted}
                disabled={isProcessing}
                className={`w-full text-white font-extrabold py-3.5 rounded-xl text-xs transition-all shadow-button flex items-center justify-center gap-2 select-none bg-gradient-to-r from-sbac-blue to-sbac-navy hover:to-sbac-blue disabled:opacity-40 disabled:cursor-not-allowed ${isProcessing ? 'cursor-wait' : 'cursor-pointer'
                  }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>กำลังเข้ารหัส...</span>
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    <span>ดาวน์โหลดไฟล์ที่เข้ารหัสแล้ว ({parsedStudents.length} รายชื่อ)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
        </div>
      )}

      {/* โมดัล/กล่องยืนยัน mount ไว้เสมอ ไม่ผูกกับแท็บ
          ไม่งั้นสลับแท็บระหว่างที่กล่องเปิดอยู่ = กล่องหายไปพร้อม promise ที่ยังไม่ถูก resolve */}
      <BehaviorLogEditModal
        log={editingBehaviorLog}
        onClose={() => setEditingBehaviorLog(null)}
        onSave={(logId, payload) => updateBehaviorLog(logId, payload)}
      />

      {behaviorConfirmDialog}
      {importConfirmDialog}
    </div>
  );
}