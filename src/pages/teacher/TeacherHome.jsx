import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import LiveClock from '../../components/ui/LiveClock';
import GlassCard from '../../components/layout/GlassCard';
import ProfileBanner from '../../components/layout/ProfileBanner';
import { READING_WIDTH } from '../../utils/layout';
import CoffeeCup from '../../components/ui/icons/CoffeeCup';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import TopUpSlipForm from '../../components/wallet/TopUpSlipForm';
import BehaviorLogList from '../../components/behavior/BehaviorLogList';
import BehaviorLogEditModal from '../../components/behavior/BehaviorLogEditModal';
import LeaveRequestList from '../../components/leave/LeaveRequestList';
import TeacherGradebookPanel from '../../components/score/TeacherGradebookPanel';
import { formatBaht } from '../../utils/identity';
import { supabase } from '../../config/supabase';
import { useBehaviorCategories } from '../../hooks/useBehaviorCategories';
import { useBehaviorLogs } from '../../hooks/useBehaviorLogs';
import { useLeaveRequests } from '../../hooks/useLeaveRequests';
import { useHomeroomAttendance, ATTENDANCE_OPTIONS, attendanceErrorMessage } from '../../hooks/useHomeroomAttendance';
import { useRealtimeTable } from '../../hooks/useRealtimeTable';
import { fetchSubstitutionsForDate, todayISO, classLabel, PERIOD_TIMES } from '../../utils/timetable';
import { buildBehaviorEntries, sumBehaviorPoints } from '../../utils/behavior';
import {
  Calendar,
  AlertCircle,
  BookOpen,
  Clock,
  UserCheck,
  ClipboardCheck,
  Award,
  CheckCircle2,
  Search,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  UserX,
  XCircle,
  QrCode,
  History,
  Wallet,
  Check,
  X
} from 'lucide-react';

/* สีของปุ่มสถานะการเข้าแถว — id ต้องตรงกับ ATTENDANCE_OPTIONS ใน useHomeroomAttendance
   (ค่าเดียวกับ constraint status ของตาราง attendance_homeroom ใน 41_homeroom_attendance.sql) */
const ATTENDANCE_STYLES = {
  present: 'peer-checked:bg-emerald-500 peer-checked:text-white text-accent-emerald bg-emerald-500/5',
  late: 'peer-checked:bg-amber-500 peer-checked:text-white text-accent-amber bg-amber-500/5',
  absent: 'peer-checked:bg-rose-500 peer-checked:text-white text-accent-rose bg-rose-500/5',
  leave: 'peer-checked:bg-indigo-500 peer-checked:text-white text-brand bg-indigo-500/5',
};

// สีเดียวกันแต่ใช้กับตัวเลขสรุปรายห้อง (ไม่มีสถานะติ๊ก จึงเหลือแค่สีตัวอักษร)
const ATTENDANCE_TEXT = {
  present: 'text-accent-emerald',
  late: 'text-accent-amber',
  absent: 'text-accent-rose',
  leave: 'text-brand',
};

export default function TeacherHome() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  /* รายการสอนแทน "ของวันนี้" จากตาราง substitutions จริง (31_substitutions.sql)

     ของเดิมตรงนี้เป็น mock ที่ hardcode ไว้ 1 แถว (อ.มานี / English for Project Work)
     และไม่มีใครเรียก setSubstitutions เลยสักที่ กล่องแจ้งเตือนจึงขึ้นค้างตลอดเวลา
     ไม่ว่าจะมีการสั่งสอนแทนจริงหรือไม่ ครูเลยเลิกสนใจกล่องนี้ไปโดยปริยาย

     ตอนนี้ดึงเฉพาะแถวที่ sub_date = วันนี้ ถ้าไม่มีก็เป็น [] แล้วกล่องหายไปเอง
     ใช้ todayISO() ซึ่งคิดตามเวลาไทยเสมอ ไม่ใช่ timezone ของเครื่อง */
  const [substitutions, setSubstitutions] = useState([]);
  const [subsLoaded, setSubsLoaded] = useState(false);

  const loadSubstitutions = useCallback(async () => {
    const rows = await fetchSubstitutionsForDate(todayISO());
    setSubstitutions(rows);
    setSubsLoaded(true);
  }, []);

  // ฝ่ายวิชาการสั่งสอนแทนกะทันหันตอนคาบกำลังจะเริ่ม ครูต้องเห็นโดยไม่ต้องรีเฟรช
  useRealtimeTable({ table: 'substitutions', onChange: loadSubstitutions });

  /* โหลดรอบแรกแบบไม่พึ่ง realtime — useRealtimeTable เรียก onChange ตอน SUBSCRIBED
     ซึ่งถ้า websocket ต่อไม่ติด (เน็ตโรงเรียน/ชนเพดาน connection) จะต้องรอถึงรอบ poll
     ครูอาจเปิดหน้ามาแล้วไม่เห็นรายการสอนแทนของตัวเองในช่วงนั้น */
  useEffect(() => {
    loadSubstitutions();
  }, [loadSubstitutions]);

  // Modal control
  const [activeModal, setActiveModal] = useState(null);

  // Leave Requests — คิวรออนุมัติขั้นที่ 1 ของครูประจำชั้น (22_leave_requests.sql)
  const { requests: pendingLeaveRequests, loading: pendingLeaveLoading, teacherDecide } = useLeaveRequests('pending_teacher');

  /* เช็คชื่อเข้าแถว — รายชื่อจริงของห้องที่ตัวเองเป็นครูประจำชั้น (41_homeroom_attendance.sql)
     โหลดตั้งแต่เข้าหน้า ไม่รอเปิดโมดัล เพราะป้าย "ค้างการเช็คชื่อ" บนการ์ดต้องบอกความจริง
     ตั้งแต่แรกเห็น ของเดิมอ่านจาก localStorage เครื่องใครเครื่องมัน ครูสลับเครื่องแล้วเพี้ยน */
  const attendance = useHomeroomAttendance(true);

  // Behavior state — ค้นหา/เลือกนักเรียนจริงผ่าน RPC search_students (แทนรายชื่อ mock เดิม)
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const { byActionType: behaviorCategoriesByType } = useBehaviorCategories();
  /* เลือก preset ได้หลายรายการพร้อมกัน — นักเรียนคนหนึ่งไม่ได้ผิดกฎข้อเดียวต่อวัน
     (มาสาย + แต่งกายไม่เรียบร้อย เกิดพร้อมกันเป็นเรื่องปกติ)

     เก็บเป็น array ไม่ใช่ Set เพราะต้องการ "ลำดับที่กด" ไว้เรียงในรายการสรุป
     และ state ของ React ต้องเป็นค่าใหม่ทุกครั้งอยู่แล้ว การ copy array จึงไม่ได้แพงกว่า

     แต่ละ preset ที่เลือกจะกลายเป็น behavior_logs หนึ่งแถวของตัวเอง ไม่ใช่รวมเป็นแถวเดียว
     เพราะแถวเดียวจะเสีย category_id (มีได้ค่าเดียว) ซึ่งเป็นตัวที่รายงานใช้แยกประเภทความผิด
     และครูจะลบเฉพาะรายการที่บันทึกผิดไม่ได้ ต้องลบทิ้งทั้งก้อน */
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  /* คะแนนที่ปรับเองรายรายการ — key เป็น category id, ไม่มีคีย์ = ใช้ default_points ของ preset
     ของเดิมมีช่องคะแนนช่องเดียว พอเลือกได้หลายรายการจึงต้องแยกช่องของใครของมัน */
  const [behaviorPointsById, setBehaviorPointsById] = useState({});
  const [behaviorReason, setBehaviorReason] = useState('');
  const [behaviorPoints, setBehaviorPoints] = useState('5');
  const [behaviorActionType, setBehaviorActionType] = useState('deduct'); // 'add' | 'deduct'
  const [submittingBehavior, setSubmittingBehavior] = useState(false);
  const [todayLogCount, setTodayLogCount] = useState(0);

  // นับรายการวินัยที่ตัวเองบันทึกวันนี้ — ใช้แสดงในการ์ดสรุปสถานะห้องเรียนด้านล่าง
  const loadTodayLogCount = useCallback(async () => {
    if (!user?.uid) return;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from('behavior_logs')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_user_id', user.uid)
      .gte('created_at', startOfToday.toISOString());

    if (error) console.error('[behavior] นับรายการวันนี้ไม่สำเร็จ:', error);
    else setTodayLogCount(count || 0);
  }, [user?.uid]);

  /* นาฬิกาบนการ์ดสรุปข้ามไปวันใหม่แล้ว (เที่ยงคืน) แต่ครูเปิดหน้าค้างไว้ตั้งแต่เมื่อวาน
     ยอดเช็คชื่อและจำนวนรายการวินัยบนจอยังเป็นของเมื่อวานอยู่ — โหลดใหม่ให้ตรงกับวันที่จริง
     ไม่งั้นเช้าวันถัดมาการ์ดจะขึ้นว่า "เช็คชื่อครบแล้ว" ทั้งที่ยังไม่ได้เช็คของวันนั้น */
  const handleDateRollover = useCallback(() => {
    attendance.reloadClasses();
    attendance.reload();
    loadTodayLogCount();
  }, [attendance, loadTodayLogCount]);

  // นับรายการวินัยที่ตัวเองบันทึกวันนี้ ครั้งเดียวตอนเข้าหน้า (หมวดหมู่โหลดผ่าน useBehaviorCategories แล้ว)
  useEffect(() => {
    loadTodayLogCount();
  }, [loadTodayLogCount]);

  // ประวัติรายการที่ตัวเองบันทึก — แก้ไข/ลบได้ (21_behavior_crud_and_academic.sql)
  const { logs: myLogs, loading: myLogsLoading, updateLog, deleteLog } = useBehaviorLogs();
  const { confirm, confirmDialog } = useConfirm();
  const [editingLog, setEditingLog] = useState(null);

  const handleDeleteLog = async (log) => {
    const ok = await confirm({
      title: 'ลบรายการนี้?',
      message: `"${log.reason}" (${log.action_type === 'add' ? '+' : '-'}${log.points} คะแนน) ของ ${log.student_name}`,
      detail: 'ระบบจะเก็บหลักฐานไว้ตรวจสอบย้อนหลัง ไม่ได้ลบถาวร และคะแนนของนักเรียนจะกลับมาทันที',
      confirmLabel: 'ลบรายการ',
      danger: true,
    });
    if (ok) deleteLog(log.id);
  };

  // ค้นหานักเรียนแบบ debounce — พิมพ์อย่างน้อย 2 ตัวอักษรถึงเริ่มยิง RPC
  useEffect(() => {
    const q = studentQuery.trim();
    if (selectedStudent || q.length < 2) {
      setStudentResults([]);
      return undefined;
    }

    setSearchingStudents(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_students', { p_query: q, p_limit: 15 });
      setSearchingStudents(false);
      if (error) {
        console.error('[behavior] ค้นหานักเรียนไม่สำเร็จ:', error);
        setStudentResults([]);
        return;
      }
      setStudentResults(data?.ok ? data.students || [] : []);
    }, 300);

    return () => clearTimeout(handle);
  }, [studentQuery, selectedStudent]);

  /* บันทึกการเช็คชื่อ — RPC เดียวจบทั้ง upsert ผลเช็คชื่อและแจ้งเตือนนักเรียน
     แจ้งเตือนเฉพาะคนที่สถานะเปลี่ยนจากของเดิม (เงื่อนไขอยู่ฝั่ง DB) ครูกดบันทึกซ้ำ
     เพื่อแก้ของเด็กคนเดียว เด็กที่เหลือจึงไม่โดนเด้งแจ้งเตือนซ้ำทั้งห้อง */
  const handleHomeroomSave = async () => {
    const result = await attendance.save();

    if (!result.ok) {
      showToast(attendanceErrorMessage(result.error), 'error');
      return;
    }

    showToast(
      result.notified > 0
        ? `บันทึกการเช็คชื่อ ${result.saved} คน — แจ้งเตือนนักเรียนแล้ว ${result.notified} คน`
        : `บันทึกการเช็คชื่อ ${result.saved} คน (สถานะเหมือนเดิม ไม่มีแจ้งเตือนใหม่)`,
      'success',
    );
    setActiveModal(null);
  };

  /* กด preset = สลับเลือก/ไม่เลือก (กดซ้ำเพื่อเอาออก)
     ของเดิมกดแล้วไปเขียนทับช่อง "เหตุผล" กับ "คะแนน" ให้ ซึ่งเลือกได้ทีละอันโดยปริยาย
     ตอนนี้ preset แต่ละอันเป็นรายการของตัวเอง จึงไม่ยุ่งกับช่องพิมพ์เองอีก
     ช่องพิมพ์เองกลายเป็น "รายการเพิ่มเติม" ที่ใช้ตอนความผิดไม่มีใน preset */
  const toggleCategory = (cat) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(cat.id) ? prev.filter((id) => id !== cat.id) : [...prev, cat.id]
    );
  };

  // ล้างรายการที่เลือกไว้ทั้งหมด — ใช้ตอนสลับ ตัดคะแนน/เพิ่มคะแนน และตอนบันทึกสำเร็จ
  const clearBehaviorSelection = () => {
    setSelectedCategoryIds([]);
    setBehaviorPointsById({});
    setBehaviorReason('');
    setBehaviorPoints('5');
  };

  const handlePickStudent = (student) => {
    setSelectedStudent(student);
    setStudentQuery(student.full_name);
    setStudentResults([]);
  };

  const handleChangeStudent = () => {
    setSelectedStudent(null);
    setStudentQuery('');
  };

  /* รายการที่จะบันทึกทั้งหมดในครั้งนี้ = preset ที่เลือกไว้ (ตามลำดับที่กด) + รายการที่พิมพ์เอง
     คำนวณจาก state ตรง ๆ ไม่เก็บเป็น state อีกชุด จะได้ไม่มีสองแหล่งที่หลุดจากกันได้
     ตัวประกอบรายการอยู่ที่ utils/behavior.js เพราะมีเคสมุมพอที่จะต้องทดสอบแยกได้ */
  const behaviorCategories = behaviorCategoriesByType(behaviorActionType);
  const behaviorEntries = buildBehaviorEntries(
    selectedCategoryIds,
    behaviorCategories,
    behaviorPointsById,
    behaviorReason,
    behaviorPoints,
  );
  const behaviorTotalPoints = sumBehaviorPoints(behaviorEntries);

  /* Student Behavior Action — บันทึกจริงผ่าน RPC submit_behavior_log
     (insert behavior_logs + สร้างแจ้งเตือนให้นักเรียนในธุรกรรมเดียวกัน ดู 20_behavior_and_notifications.sql)

     ยิงทีละรายการเรียงกันไป ไม่ใช่ Promise.all — RPC คำนวณคะแนนคงเหลือใหม่ทุกครั้ง
     ยิงพร้อมกันแล้วแจ้งเตือนที่นักเรียนได้รับจะบอกคะแนนคงเหลือสลับลำดับกันมั่ว
     และถ้ามีรายการไหนพลาด เราต้องรู้ว่าพลาดรายการไหนเพื่อคงไว้ให้กดใหม่ได้ */
  const handleBehaviorSave = async () => {
    if (!selectedStudent) {
      showToast('กรุณาค้นหาและเลือกนักเรียนก่อน', 'error');
      return;
    }
    if (behaviorEntries.length === 0) {
      showToast('กรุณาเลือกรายการสำเร็จรูป หรือพิมพ์เหตุผลเองอย่างน้อยหนึ่งรายการ', 'error');
      return;
    }
    const invalid = behaviorEntries.find((entry) => !(Math.round(Number(entry.points)) > 0));
    if (invalid) {
      showToast(`กรุณาระบุคะแนนของ "${invalid.label}" ให้มากกว่า 0`, 'error');
      return;
    }

    setSubmittingBehavior(true);

    const failed = [];
    let savedPoints = 0;
    let lastError = null;

    for (const entry of behaviorEntries) {
      const points = Math.round(Number(entry.points));
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.rpc('submit_behavior_log', {
        p_student_user_id: selectedStudent.user_id,
        p_category_id: entry.categoryId,
        p_reason: entry.label,
        p_points: points,
        p_action_type: behaviorActionType,
      });

      if (error || !data?.ok) {
        console.error('[behavior] บันทึกไม่สำเร็จ:', entry.label, error || data?.error);
        failed.push(entry);
        lastError = data?.error;
        continue;
      }
      savedPoints += points;
    }

    setSubmittingBehavior(false);

    const sign = behaviorActionType === 'add' ? '+' : '-';
    const savedCount = behaviorEntries.length - failed.length;

    /* บันทึกทีละรายการแปลว่าพลาดกลางทางได้ ต้องบอกตรง ๆ ว่าอันไหนเข้าแล้วอันไหนยัง
       แล้วคงเฉพาะรายการที่ยังไม่เข้าไว้ในฟอร์ม กดบันทึกซ้ำจะได้ไม่ซ้ำของที่เข้าไปแล้ว */
    if (failed.length > 0) {
      const errorMessages = {
        FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์บันทึกพฤติกรรมนักเรียน',
        STUDENT_NOT_FOUND: 'ไม่พบข้อมูลนักเรียนคนนี้ในระบบ',
      };
      const detail = errorMessages[lastError] || 'กรุณาลองใหม่อีกครั้ง';

      setSelectedCategoryIds(failed.filter((entry) => entry.categoryId).map((entry) => entry.categoryId));
      if (!failed.some((entry) => entry.key === 'custom')) {
        setBehaviorReason('');
        setBehaviorPoints('5');
      }

      showToast(
        savedCount > 0
          ? `บันทึกได้ ${savedCount} จาก ${behaviorEntries.length} รายการ — ที่เหลือยังค้างอยู่ในฟอร์ม (${detail})`
          : `บันทึกไม่สำเร็จทั้ง ${behaviorEntries.length} รายการ — ${detail}`,
        'error',
      );

      if (savedCount > 0) loadTodayLogCount();
      return;
    }

    showToast(
      `อัปเดตพฤติกรรม ${selectedStudent.full_name} ${sign}${savedPoints} คะแนน` +
        `${behaviorEntries.length > 1 ? ` (${behaviorEntries.length} รายการ)` : ''} สำเร็จ — แจ้งเตือนนักเรียนแล้ว`,
      'success'
    );

    // Reset form
    setSelectedStudent(null);
    setStudentQuery('');
    clearBehaviorSelection();
    setActiveModal(null);
    loadTodayLogCount();
  };

  // Helper colors
  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgSubtle = isDark ? 'bg-neutral-900/60' : 'bg-slate-50/50';
  const borderSubtle = isDark ? 'border-white/10' : 'border-slate-100';
  const bgInput = isDark ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50' : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  const pendingLeavesCount = pendingLeaveRequests.length;

  return (
    <div className={`space-y-6 ${READING_WIDTH}`}>
      {/* หัวหน้าแรก — ตัวเดียวกับฝั่งนักเรียน (ProfileBanner)
          บรรทัดบรรยายเดิมเขียนไว้ตายตัวว่า "แผนกวิชาคอมพิวเตอร์ประจำชั้น ปวช.3/6"
          ครูทุกคนจึงเห็นข้อความเดียวกันหมดไม่ว่าจะสอนแผนกไหน — เปลี่ยนเป็นค่าจริง
          จาก teacher_profiles ช่องไหนที่ฝ่ายทะเบียนยังไม่ได้กรอกจะขึ้นขีดแทน */}
      <ProfileBanner
        roleLabel="อาจารย์ผู้สอน (Faculty Panel)"
        name={user?.name}
        balanceSatang={user?.balance_satang || 0}
        onWalletClick={() => setActiveModal('balance')}
        facts={[
          { label: 'รหัสอาจารย์', value: user?.teacher_code },
          { label: 'แผนกวิชา', value: user?.department },
          { label: 'วิทยาลัย', value: 'SBAC นนทบุรี' },
        ]}
      />

      {/* รายการสอนแทนของวันนี้ — ขึ้นเฉพาะตอนมีจริง
          subsLoaded กันไม่ให้กล่องกะพริบขึ้นมาแวบหนึ่งตอนยังโหลดไม่เสร็จ */}
      {subsLoaded && substitutions.length > 0 && (
        <div className="space-y-3">
          <span className="text-xs font-bold text-sbac-red flex items-center gap-1">
            <AlertCircle size={16} />
            รายการสอนแทนวันนี้ ({substitutions.length} คาบ)
          </span>

          {substitutions.map(sub => (
            <div 
              key={sub.id} 
              className={`border rounded-2xl p-4 flex gap-4 items-start shadow-sm transition-colors duration-300 ${
                isDark 
                  ? 'bg-rose-900/20 border-rose-800/30' 
                  : 'bg-rose-50 border-rose-100'
              }`}
            >
              <div className={`p-2.5 rounded-xl shrink-0 ${isDark ? 'bg-rose-900/40 text-accent-rose' : 'bg-rose-100 text-accent-rose'}`}>
                <Clock size={20} />
              </div>
              {/* ทุกค่ามาจากแถวจริงในตาราง substitutions
                  ของเดิม hardcode "ระดับชั้น ปวช. 3/6" ไว้ ซึ่งผิดทันทีถ้าเป็นห้องอื่น */}
              <div className="flex-1 space-y-1 min-w-0">
                <div className="text-[11px] font-bold text-accent-rose">
                  คาบที่ {sub.period}
                  {PERIOD_TIMES[sub.period] && ` • ${PERIOD_TIMES[sub.period]} น.`}
                </div>
                <div className={`text-sm font-extrabold truncate ${textPrimary}`}>
                  {sub.subject || 'ไม่ระบุวิชา'}
                </div>
                <p className={`text-[11px] font-semibold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                  {classLabel(sub.class_id)}
                  {sub.substitute_room && ` • ย้ายไปห้อง ${sub.substitute_room}`}
                </p>
                <div className="text-[11px] font-bold pt-1 text-accent-rose">
                  สอนแทนโดย {sub.substitute_teacher || 'ยังไม่ระบุ'}
                  {sub.original_teacher && (
                    <span className={`font-semibold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                      {' '}(แทน {sub.original_teacher})
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Teacher Tools Menu */}
      <div className="space-y-4">
        <span className={`text-sm font-extrabold block ${textPrimary}`}>🎯 เครื่องมือและแผงควบคุมอาจารย์</span>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Homeroom Attendance Tool */}
          <GlassCard onClick={() => setActiveModal('homeroom')}>
            <div className="flex flex-col h-full justify-between min-h-[115px]">
              <div>
                <UserCheck className="text-accent-emerald mb-2" size={24} />
                <div className={`text-sm font-extrabold ${textPrimary}`}>เช็คเข้าแถว</div>
                <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>
                  {attendance.overview.activeCount > 1
                    ? `ดูแล ${attendance.overview.activeCount} ห้อง`
                    : attendance.classLabel
                      ? `ห้อง ${attendance.classLabel} • ${attendance.summary.total} คน`
                      : 'ลงเวลาเช็คชื่อเข้าแถวหน้าเสาธง'}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  attendance.overview.allDone
                    ? 'bg-emerald-500/10 text-accent-emerald border border-emerald-500/20'
                    : 'bg-amber-500/10 text-accent-amber border border-amber-500/20'
                }`}>
                  {attendance.overview.allDone ? 'เช็คชื่อเข้าแถวแล้ว' : 'ค้างการเช็คชื่อเข้าแถว'}
                </span>
                <ChevronRight size={14} className={textMuted} />
              </div>
            </div>
          </GlassCard>

          {/* Student Leaves Approval Tool */}
          <GlassCard onClick={() => setActiveModal('leaves')}>
            <div className="flex flex-col h-full justify-between min-h-[115px]">
              <div>
                <ClipboardCheck className="text-brand mb-2" size={24} />
                <div className={`text-sm font-extrabold ${textPrimary}`}>อนุมัติใบลาเรียน</div>
                <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>พิจารณาใบลาป่วย/ลากิจของเด็ก</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                {pendingLeavesCount > 0 ? (
                  <span className="text-[9px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-500 text-white animate-pulse">
                    รออนุมัติ {pendingLeavesCount} ใบ
                  </span>
                ) : (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 text-content-muted`}>
                    ไม่มีคำขอค้างอยู่
                  </span>
                )}
                <ChevronRight size={14} className={textMuted} />
              </div>
            </div>
          </GlassCard>

          {/* Student Behavior Score Manager */}
          <GlassCard onClick={() => setActiveModal('behavior')}>
            <div className="flex flex-col h-full justify-between min-h-[115px]">
              <div>
                <Award className="text-accent-amber mb-2" size={24} />
                <div className={`text-sm font-extrabold ${textPrimary}`}>เช็คคะแนนพฤติกรรม</div>
                <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>เช็คและตัด/เพิ่มคะแนนพฤติกรรม (พร้อมคอมเมนต์)</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`text-[9px] font-semibold text-accent-amber`}>
                  จัดการแต้มวินัย & คอมเมนต์
                </span>
                <ChevronRight size={14} className={textMuted} />
              </div>
            </div>
          </GlassCard>

          {/* Behavior Log History — แก้ไข/ลบรายการที่ตัวเองบันทึกได้ (21_behavior_crud_and_academic.sql) */}
          <GlassCard onClick={() => setActiveModal('myLogs')}>
            <div className="flex flex-col h-full justify-between min-h-[115px]">
              <div>
                <History className="text-brand mb-2" size={24} />
                <div className={`text-sm font-extrabold ${textPrimary}`}>ประวัติที่ฉันบันทึก</div>
                <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>แก้ไข / ลบรายการตัด-เพิ่มคะแนนย้อนหลัง</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`text-[9px] font-semibold text-brand`}>
                  {myLogs.length} รายการ
                </span>
                <ChevronRight size={14} className={textMuted} />
              </div>
            </div>
          </GlassCard>

          {/* Gradebook — คะแนนระหว่างภาค T1-T5 (40_gradebook.sql)
              ทางเข้าเดียวของครูสำหรับกรอก/ให้/ตัดคะแนน ซึ่งเดิมไม่มีอยู่ในระบบเลย
              นักเรียนเห็นแต่ตัวเลขที่ hardcode ไว้ในหน้าเว็บ */}
          <GlassCard onClick={() => setActiveModal('gradebook')}>
            <div className="flex flex-col h-full justify-between min-h-[115px]">
              <div>
                <BookOpen className="text-accent-emerald mb-2" size={24} />
                <div className={`text-sm font-extrabold ${textPrimary}`}>คะแนนระหว่างภาค</div>
                <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>กรอก / ให้ / ตัดคะแนน T1-T5 รายหัวข้อ</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[9px] font-semibold text-accent-emerald">
                  สมุดคะแนนรายวิชา
                </span>
                <ChevronRight size={14} className={textMuted} />
              </div>
            </div>
          </GlassCard>

          {/* Timetable view */}
          <GlassCard onClick={() => navigate('/timetable')}>
            <div className="flex flex-col h-full justify-between min-h-[115px]">
              <div>
                <Calendar className="text-brand mb-2" size={24} />
                <div className={`text-sm font-extrabold ${textPrimary}`}>ตารางสอนของฉัน</div>
                <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>ดูตารางคาบสอนรายวัน</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`text-[9px] text-brand font-semibold`}>
                  เปิดดู
                </span>
                <ChevronRight size={14} className={textMuted} />
              </div>
            </div>
          </GlassCard>

          {/* Order Barista Coffee */}
          <GlassCard className="col-span-2" onClick={() => navigate('/coffee')}>
            <div className="flex items-center justify-between w-full p-1.5">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${isDark ? 'bg-amber-950/40 text-accent-amber' : 'bg-amber-50 text-accent-amber'}`}>
                  <CoffeeCup size={24} />
                </div>
                <div>
                  <div className={`text-sm font-extrabold ${textPrimary}`}>สั่งเครื่องดื่มแผนกบาริสต้า (Barista Shop)</div>
                  <div className={`text-[11px] ${textMuted}`}>สั่งชากาแฟออนไลน์ ส่งตรงถึงห้องเรียนและห้องพักครู</div>
                </div>
              </div>
              <ChevronRight size={16} className={textMuted} />
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Classroom Status Summary Panel */}
      <div className={`rounded-3xl border p-5 space-y-4 transition-colors duration-300 ${bgSubtle} ${borderSubtle}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <TrendingUp size={16} className="text-accent-emerald mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className={`text-xs font-bold ${textPrimary}`}>
                รายงานสถานะห้องเรียนวันนี้
              </span>
              {/* วันที่/เวลาไทยเดินจริง — ยอดบนการ์ดคือ "ของวันนี้" ตามเวลาไทย
                  ข้ามเที่ยงคืนทั้งที่เปิดหน้าค้างไว้ ตัวเลขจะโหลดใหม่เองผ่าน onDateChange */}
              <LiveClock
                className={`text-[11px] font-semibold tabular-nums ${textMuted}`}
                onDateChange={handleDateRollover}
              />
            </div>
          </div>
          {/* ป้ายรวมนับเป็น "ห้อง" ไม่ใช่รายคน ครูที่ดูแลหลายห้องจะได้รู้ว่ายังเหลือห้องไหน */}
          {attendance.overview.activeCount > 0 && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
              attendance.overview.allDone
                ? 'bg-emerald-500/15 text-accent-emerald border border-emerald-500/25'
                : 'bg-amber-500/15 text-accent-amber border border-amber-500/25'
            }`}>
              {attendance.overview.allDone
                ? 'เช็คชื่อครบแล้ว'
                : `เช็คชื่อแล้ว ${attendance.overview.doneCount}/${attendance.overview.activeCount} ห้อง`}
            </span>
          )}
        </div>

        {attendance.error && (
          <p className="text-[11px] font-semibold leading-relaxed text-content-muted">
            {attendanceErrorMessage(attendance.error)}
          </p>
        )}

        {/* หนึ่งกล่องต่อหนึ่งห้อง แยกยอดครบทั้งสี่สถานะ
            ของเดิมโชว์แค่ "มาเรียน" กับ "ขาดเรียน" ห้องที่เช็คว่าสาย/ลาทั้งห้อง
            จึงขึ้น 0 ทั้งสองช่องทั้งที่เช็คชื่อครบแล้ว — ตัวเลขหายไปเฉย ๆ */}
        {attendance.overview.rooms.length > 0 && (
          <div className="space-y-3">
            {attendance.overview.rooms.map((room) => (
              <div
                key={room.id}
                className={`p-3 rounded-2xl border space-y-2.5 transition-all ${
                  isDark ? 'bg-neutral-900/60 border-white/10' : 'bg-surface-card border-slate-100 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold ${textPrimary}`}>
                    {room.label}
                    {/* ห้องที่ยังไม่มีครูประจำชั้น ระบบเปิดให้ครูคนไหนก็ได้เช็คชื่อไปก่อน
                        (เหตุผลเดียวกับใบลาใน 22_leave_requests.sql) บอกไว้จะได้ไม่งงว่าห้องนี้มาจากไหน */}
                    {room.is_fallback && (
                      <span className="text-[9px] font-bold ml-1.5 text-accent-amber">• ยังไม่ผูกครูประจำชั้น</span>
                    )}
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    room.done
                      ? 'bg-emerald-500/10 text-accent-emerald border border-emerald-500/20'
                      : 'bg-amber-500/10 text-accent-amber border border-amber-500/20'
                  }`}>
                    เช็คแล้ว {room.marked}/{room.student_count} คน
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {ATTENDANCE_OPTIONS.map((opt) => (
                    <div key={opt.id} className={`py-2 rounded-xl text-center ${isDark ? 'bg-white/[0.03]' : 'bg-slate-50'}`}>
                      <span className={`text-base font-extrabold block ${ATTENDANCE_TEXT[opt.id]}`}>{room[opt.id]}</span>
                      <span className={`text-[9px] font-bold block mt-0.5 ${textMuted}`}>{opt.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
          isDark ? 'bg-neutral-900/60 border-white/10' : 'bg-surface-card border-slate-100 shadow-sm'
        }`}>
          <span className={`text-[11px] font-bold ${textMuted}`}>รายการวินัยที่บันทึกวันนี้</span>
          <span className="text-lg font-extrabold text-brand">{todayLogCount}</span>
        </div>
      </div>

      {/* MODAL: Homeroom Attendance */}
      <Modal
        isOpen={activeModal === 'homeroom'}
        onClose={() => setActiveModal(null)}
        title={attendance.classLabel ? `เช็คชื่อเข้าแถวโฮมรูม ${attendance.classLabel}` : 'เช็คชื่อเข้าแถวโฮมรูม'}
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <p className={`text-xs ${textMuted}`}>
              ทำเครื่องหมายสถานะนักเรียนสำหรับการทำกิจกรรมหน้าเสาธงและการเข้าชั้นเรียนวันนี้ —
              กดบันทึกแล้วนักเรียนแต่ละคนจะได้รับแจ้งเตือนสถานะของตัวเองทันที
            </p>
            {/* เวลาปัจจุบันตรงนี้ไม่ใช่ของประดับ — ตอนตัดสินว่าใคร "สาย" ครูต้องเทียบกับเวลาจริง */}
            <LiveClock className={`text-[11px] font-bold tabular-nums block ${textPrimary}`} />
          </div>

          {/* ครูที่ดูแลหลายห้อง (หรือฝ่ายวิชาการที่เห็นทุกห้อง) ต้องเลือกห้องก่อน
              ครูที่มีห้องเดียวจะไม่เห็นแถวนี้ เพราะไม่มีอะไรให้เลือก */}
          {attendance.classes.length > 1 && (
            <select
              value={attendance.classId || ''}
              onChange={(e) => attendance.setClassId(Number(e.target.value))}
              className={`w-full border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none ${bgInput}`}
            >
              {attendance.classes.map((c) => (
                <option key={c.id} value={c.id}>{c.label} ({c.student_count} คน)</option>
              ))}
            </select>
          )}

          {attendance.loading ? (
            <div className="space-y-3" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`h-20 rounded-2xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
              ))}
            </div>
          ) : attendance.error ? (
            <div className={`p-4 rounded-2xl border text-xs font-semibold leading-relaxed ${
              isDark ? 'bg-amber-500/5 border-amber-500/20 text-accent-amber' : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              {attendanceErrorMessage(attendance.error)}
            </div>
          ) : attendance.students.length === 0 ? (
            <div className={`p-4 rounded-2xl border text-xs font-semibold text-center ${
              isDark ? 'bg-white/[0.03] border-white/10 text-content-secondary' : 'bg-slate-50 border-slate-100 text-ink-muted'
            }`}>
              ห้องนี้ยังไม่มีรายชื่อนักเรียนในระบบ — ให้ฝ่ายทะเบียนนำเข้ารายชื่อก่อน
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-bold ${textMuted}`}>
                  ติ๊กแล้ว {attendance.summary.marked}/{attendance.summary.total} คน
                </span>
                {/* วันปกติคือ "มากันทั้งห้อง ยกเว้นสองสามคน" — ติ๊กทีละคนสี่สิบครั้งไม่มีใครทำจริง */}
                <button
                  type="button"
                  onClick={() => attendance.markAll('present')}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-accent-emerald border border-emerald-500/20 active:scale-95 transition-all"
                >
                  ติ๊ก "มา" ทั้งห้อง
                </button>
              </div>

              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                {attendance.students.map(student => (
                  <div
                    key={student.user_id}
                    className={`p-3 rounded-2xl border flex flex-col gap-2.5 transition-all ${
                      isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50/50 border-slate-100'
                    }`}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className={`text-xs font-bold ${textPrimary}`}>{student.full_name}</span>
                      <span className={`text-[9px] font-semibold shrink-0 ${textMuted}`}>รหัส {student.student_code}</span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {ATTENDANCE_OPTIONS.map(opt => (
                        <label key={opt.id} className="cursor-pointer select-none">
                          <input
                            type="radio"
                            name={`attendance-${student.user_id}`}
                            value={opt.id}
                            checked={attendance.draft[student.user_id] === opt.id}
                            onChange={() => attendance.setStatus(student.user_id, opt.id)}
                            className="hidden peer"
                          />
                          {/* min-h-11 = 44px ตามเกณฑ์เป้าแตะ ของเดิม py-1.5 ได้สูงจริง 34px
                              ครูประจำชั้นกดปุ่มชุดนี้วันละราว 40 ครั้ง (คนละปุ่มต่อนักเรียนหนึ่งคน)
                              บนมือถือขณะยืนหน้าแถว การพลาดแต่ละครั้งแปลว่าต้องกดแก้อีกรอบ
                              และ PRODUCT.md ระบุ "เป้าแตะเล็ก" ไว้เป็นสิ่งที่ต้องเลี่ยงโดยตรง */}
                          <div className={`min-h-11 px-1 rounded-xl flex items-center justify-center text-center text-xs font-bold border border-transparent transition-all active:scale-95 ${ATTENDANCE_STYLES[opt.id]} peer-checked:shadow-sm`}>
                            {opt.label}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            onClick={handleHomeroomSave}
            disabled={attendance.saving || attendance.loading || attendance.students.length === 0}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-button flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 size={16} />
            {attendance.saving ? 'กำลังบันทึกและแจ้งเตือน...' : 'บันทึกการลงเวลาเรียน'}
          </button>
        </div>
      </Modal>

      {/* MODAL: Student Leave Requests */}
      <Modal 
        isOpen={activeModal === 'leaves'} 
        onClose={() => setActiveModal(null)} 
        title="อนุมัติการลาเรียนของนักเรียน"
        icon={ClipboardCheck}
        tone="amber"
      >
        <div className="space-y-4">
          <p className={`text-xs ${textMuted}`}>
            ใบลาของนักเรียนในห้องที่คุณเป็นครูประจำชั้น — อนุมัติแล้วจะส่งต่อให้ฝ่ายวิชาการอนุมัติอีกขั้นหนึ่ง
          </p>
          <LeaveRequestList
            requests={pendingLeaveRequests}
            loading={pendingLeaveLoading}
            mode="teacher"
            onDecide={(req, approve, reason) => teacherDecide(req.id, approve, reason)}
          />
        </div>
      </Modal>

      {/* MODAL: Student Behavior Manage */}
      <Modal 
        isOpen={activeModal === 'behavior'} 
        onClose={() => setActiveModal(null)} 
        title="จัดการพฤติกรรมและความประพฤติ"
        icon={Award}
        tone="rose"
      >
        <div className="space-y-4">
          {/* Select Student — ค้นหานักเรียนจริงจากฐานข้อมูล (ชื่อ หรือ รหัสประจำตัว) */}
          <div>
            <label className={`text-xs font-bold block mb-1.5 ${textPrimary}`}>ค้นหานักเรียนสำหรับการจัดการ</label>
            <div className="relative">
              <Search size={14} className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${textMuted}`} />
              <input
                type="text"
                value={studentQuery}
                onChange={e => { setStudentQuery(e.target.value); setSelectedStudent(null); }}
                placeholder="พิมพ์ชื่อหรือรหัสนักเรียน อย่างน้อย 2 ตัวอักษร"
                className={`w-full border rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold focus:outline-none ${bgInput}`}
              />
            </div>

            {searchingStudents && (
              <p className={`text-[11px] font-semibold mt-1.5 ${textMuted}`}>กำลังค้นหา...</p>
            )}

            {!selectedStudent && !searchingStudents && studentQuery.trim().length >= 2 && studentResults.length === 0 && (
              <p className={`text-[11px] font-semibold mt-1.5 ${textMuted}`}>ไม่พบนักเรียนที่ตรงกับ "{studentQuery.trim()}"</p>
            )}

            {!selectedStudent && studentResults.length > 0 && (
              <div className={`mt-2 max-h-40 overflow-y-auto rounded-xl border divide-y ${isDark ? 'border-white/10 divide-white/5' : 'border-slate-100 divide-slate-100'}`}>
                {studentResults.map(s => (
                  <button
                    key={s.user_id}
                    type="button"
                    onClick={() => handlePickStudent(s)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                  >
                    <div className={`text-xs font-bold ${textPrimary}`}>{s.full_name}</div>
                    <div className={`text-[9px] font-semibold mt-0.5 ${textMuted}`}>
                      รหัส {s.student_code || '—'} • {s.class_label || 'ไม่มีข้อมูลห้อง'} • ปัจจุบัน {s.score} แต้ม
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedStudent && (
              <div className={`mt-2 flex items-center justify-between gap-2 p-3 rounded-xl border ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-100'}`}>
                <div className="min-w-0">
                  <div className={`text-xs font-bold truncate ${textPrimary}`}>{selectedStudent.full_name}</div>
                  <div className={`text-[9px] font-semibold mt-0.5 ${textMuted}`}>
                    รหัส {selectedStudent.student_code || '—'} • {selectedStudent.class_label || 'ไม่มีข้อมูลห้อง'} • ปัจจุบัน {selectedStudent.score} แต้ม
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleChangeStudent}
                  className="shrink-0 text-[11px] font-bold text-brand px-2 py-1"
                >
                  เปลี่ยน
                </button>
              </div>
            )}
          </div>

          {/* Action Type (Add / Deduct) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              /* สลับฝั่งแล้วต้องล้างของที่เลือกไว้ — preset ของฝั่งตัดคะแนนกับฝั่งความดี
                 เป็นคนละชุดกัน ถ้าปล่อยค้างไว้จะกลายเป็นเลือกความผิดไว้แต่กดบันทึกเป็นความดี */
              onClick={() => { setBehaviorActionType('deduct'); clearBehaviorSelection(); }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 text-center ${
                behaviorActionType === 'deduct'
                  ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                  : isDark
                  ? 'bg-white/5 border-white/10 text-accent-rose hover:bg-white/10'
                  : 'bg-rose-50 border-rose-100 text-accent-rose hover:bg-rose-100/50'
              }`}
            >
              <TrendingDown size={16} aria-hidden="true" />
              ตัดคะแนนความประพฤติ
            </button>
            <button
              onClick={() => { setBehaviorActionType('add'); clearBehaviorSelection(); }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 text-center ${
                behaviorActionType === 'add'
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                  : isDark
                  ? 'bg-white/5 border-white/10 text-accent-emerald hover:bg-white/10'
                  : 'bg-emerald-50 border-emerald-100 text-accent-emerald hover:bg-emerald-100/50'
              }`}
            >
              <TrendingUp size={16} aria-hidden="true" />
              เพิ่มคะแนนความดี
            </button>
          </div>

          {/* Presets List — หมวดหมู่ความผิด/ความดีสำเร็จรูปจาก behavior_categories
              เลือกได้หลายอัน กดซ้ำเพื่อเอาออก ใช้ role="group" + aria-pressed
              จะได้อ่านออกว่าเป็นปุ่มสองสถานะ ไม่ใช่ปุ่มสั่งงานที่กดแล้วจบ */}
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <label className={`text-xs font-bold ${textPrimary}`}>รายการบันทึกสำเร็จรูป (Presets)</label>
              <span className={`text-[10px] font-semibold ${textMuted}`}>เลือกได้หลายรายการ</span>
            </div>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="รายการบันทึกสำเร็จรูป">
              {behaviorCategories.map(cat => {
                const picked = selectedCategoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    aria-pressed={picked}
                    className={`relative p-2.5 pr-7 rounded-xl border text-[11px] font-bold text-left transition-all ${
                      picked
                        ? 'border-sbac-blue bg-sbac-blue-50/20 text-brand'
                        : isDark
                        ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-content-secondary'
                        : 'border-slate-100 bg-surface-card hover:bg-slate-50 text-slate-600 shadow-sm'
                    }`}
                  >
                    {/* เครื่องหมายถูกมุมขวา — สีกรอบอย่างเดียวบอกไม่ได้ว่า "เลือกได้หลายอัน"
                        และคนตาบอดสีแยกกรอบน้ำเงินกับกรอบเทาในโหมดมืดได้ยาก */}
                    {picked && (
                      <Check size={13} className="absolute top-2 right-2 text-brand" aria-hidden="true" />
                    )}
                    <div className="truncate">{cat.label}</div>
                    <div className={`text-[9px] mt-0.5 font-extrabold ${behaviorActionType === 'add' ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                      {behaviorActionType === 'add' ? '+' : '-'}{cat.default_points} คะแนน
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Input details — ช่องนี้คือ "รายการเพิ่มเติมที่ไม่มีใน preset"
              ไม่ใช่ช่องที่ preset เขียนทับอีกต่อไป พิมพ์ไว้ = ได้อีกหนึ่งรายการ */}
          <div className="space-y-3 pt-1">
            <div>
              <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>
                เพิ่มรายการอื่นที่ไม่มีใน Presets
              </label>
              <input
                type="text"
                value={behaviorReason}
                onChange={e => setBehaviorReason(e.target.value)}
                placeholder="พิมพ์ระบุเหตุผล เช่น ทะเลาะวิวาท, มีจิตอาสาช่วยขยะ"
                className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
              />
            </div>

            {/* ช่องคะแนนของรายการที่พิมพ์เอง — โผล่เมื่อพิมพ์แล้วเท่านั้น
                ของ preset แต่ละอันมีช่องของตัวเองอยู่ในรายการสรุปด้านล่าง */}
            {behaviorReason.trim() && (
              <div>
                <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>จำนวนคะแนนของรายการที่พิมพ์เอง</label>
                <input
                  type="number"
                  min="1"
                  value={behaviorPoints}
                  onChange={e => setBehaviorPoints(e.target.value)}
                  className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
                />
              </div>
            )}
          </div>

          {/* สรุปรายการที่จะบันทึก — กดปุ่มบันทึกทีเดียวได้หลายรายการ
              จึงต้องเห็นก่อนกดว่ากำลังจะลงอะไรบ้าง รวมกี่คะแนน และแก้คะแนนรายอันได้ตรงนี้ */}
          {behaviorEntries.length > 0 && (
            <div className={`rounded-xl border p-3 space-y-2 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-bold ${textPrimary}`}>
                  รายการที่จะบันทึก ({behaviorEntries.length})
                </span>
                <span className={`text-xs font-extrabold ${behaviorActionType === 'add' ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                  รวม {behaviorActionType === 'add' ? '+' : '-'}{behaviorTotalPoints} คะแนน
                </span>
              </div>

              {behaviorEntries.map(entry => (
                <div key={entry.key} className="flex items-center gap-2">
                  <span className={`text-[11px] font-semibold flex-1 min-w-0 truncate ${textSecondary}`}>
                    {entry.label}
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={entry.points}
                    aria-label={`คะแนนของ ${entry.label}`}
                    onChange={e => {
                      if (entry.key === 'custom') setBehaviorPoints(e.target.value);
                      else setBehaviorPointsById(prev => ({ ...prev, [entry.categoryId]: e.target.value }));
                    }}
                    className={`w-16 shrink-0 border rounded-lg px-2 py-1 text-[11px] font-bold text-center focus:outline-none ${bgInput}`}
                  />
                  <button
                    type="button"
                    aria-label={`เอา ${entry.label} ออกจากรายการ`}
                    onClick={() => {
                      if (entry.key === 'custom') { setBehaviorReason(''); setBehaviorPoints('5'); }
                      else setSelectedCategoryIds(prev => prev.filter(id => id !== entry.categoryId));
                    }}
                    className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isDark ? 'text-content-muted hover:bg-white/10' : 'text-ink-muted hover:bg-slate-200/60'}`}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}

              {/* บอกให้รู้ล่วงหน้าว่าจะกลายเป็นหลายแถวในประวัติ ไม่ใช่แถวเดียวที่รวมคะแนนไว้
                  ครูจะได้ไม่แปลกใจตอนเห็นรายการแยกกันในประวัติและในแจ้งเตือนของนักเรียน */}
              {behaviorEntries.length > 1 && (
                <p className={`text-[10px] font-semibold leading-relaxed pt-1 ${textMuted}`}>
                  บันทึกแยกเป็น {behaviorEntries.length} รายการในประวัติ (ลบทีละรายการได้ภายหลัง)
                  และนักเรียนจะได้รับแจ้งเตือน {behaviorEntries.length} ฉบับ
                </p>
              )}
            </div>
          )}

          {/* Submit Behavior Log */}
          <button
            onClick={handleBehaviorSave}
            disabled={submittingBehavior || !selectedStudent || behaviorEntries.length === 0}
            className={`w-full text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
              behaviorActionType === 'add' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
            }`}
          >
            <Award size={16} />
            {submittingBehavior
              ? 'กำลังบันทึก...'
              : behaviorEntries.length > 1
                ? `ลงบันทึกพฤติกรรมนักเรียน (${behaviorEntries.length} รายการ)`
                : 'ลงบันทึกพฤติกรรมนักเรียน'}
          </button>
        </div>
      </Modal>

      {/* MODAL: Wallet — เหมือนฝั่งนักเรียนทุกประการ (ดูข้อ 3 ของงาน) */}
      <Modal
        isOpen={activeModal === 'balance'}
        onClose={() => setActiveModal(null)}
        title="ยอดเงินบัตร"
        icon={Wallet}
        tone="emerald"
      >
        <div className="space-y-6">
          <div className={`text-center py-4 rounded-2xl border transition-colors ${
            isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={`text-5xl font-extrabold block ${textPrimary}`}>
              {formatBaht(user?.balance_satang || 0)}
            </span>
            <span className={`text-xs font-bold mt-2 block ${textMuted}`}>THB</span>
          </div>

          <button
            type="button"
            onClick={() => setActiveModal('topup')}
            className="w-full flex items-center justify-center gap-2 bg-sbac-blue hover:bg-sbac-navy text-white text-sm font-extrabold py-3.5 rounded-2xl shadow-lg shadow-sbac-blue/30 active:scale-[0.98] transition-all"
          >
            <QrCode size={18} aria-hidden="true" />
            เติมเงินด้วย QR พร้อมเพย์
          </button>

          <div className={`rounded-2xl border p-4 ${
            isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={`text-xs font-bold block ${textPrimary}`}>เติมเงินอย่างไร</span>
            <p className={`text-[12px] font-semibold leading-relaxed mt-1 ${textMuted}`}>
              โอนผ่าน QR พร้อมเพย์แล้วแนบสลิปด้านบน หรือเติมเงินสดได้ที่จุดบริการการเงิน
              อาคาร 1 ชั้น 1 — เจ้าหน้าที่จะแตะบัตรแล้วเติมให้ในระบบ ยอดขึ้นในแอปทันที
            </p>
          </div>
        </div>
      </Modal>

      {/* MODAL: เติมเงินด้วย QR พร้อมเพย์ + แนบสลิป — คอมโพเนนต์เดียวกับฝั่งนักเรียนเป๊ะ (คำขอเติมเงินไม่แยก role) */}
      <Modal
        isOpen={activeModal === 'topup'}
        onClose={() => setActiveModal(null)}
        title="เติมเงินด้วย QR + สลิป"
        icon={QrCode}
        tone="brand"
      >
        <TopUpSlipForm />
      </Modal>

      {/* MODAL: ประวัติที่ฉันบันทึก — แก้ไข/ลบได้ (21_behavior_crud_and_academic.sql) */}
      <Modal
        isOpen={activeModal === 'myLogs'}
        onClose={() => setActiveModal(null)}
        title="ประวัติที่ฉันบันทึก"
        icon={History}
        tone="cyan"
      >
        <BehaviorLogList
          logs={myLogs}
          loading={myLogsLoading}
          showStudentName
          onEdit={setEditingLog}
          onDeleteRequest={handleDeleteLog}
        />
      </Modal>

      {/* MODAL: สมุดคะแนนระหว่างภาค (40_gradebook.sql) */}
      <Modal
        isOpen={activeModal === 'gradebook'}
        onClose={() => setActiveModal(null)}
        title="คะแนนระหว่างภาค"
        icon={BookOpen}
        tone="brand"
      >
        <TeacherGradebookPanel />
      </Modal>

      <BehaviorLogEditModal
        log={editingLog}
        onClose={() => setEditingLog(null)}
        onSave={(logId, payload) => updateLog(logId, payload)}
      />

      {confirmDialog}
    </div>
  );
}
