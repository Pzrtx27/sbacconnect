import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import ProfileBanner from '../../components/layout/ProfileBanner';
import { READING_WIDTH } from '../../utils/layout';
import CoffeeCup from '../../components/ui/icons/CoffeeCup';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import TopUpSlipForm from '../../components/wallet/TopUpSlipForm';
import BehaviorLogList from '../../components/behavior/BehaviorLogList';
import BehaviorLogEditModal from '../../components/behavior/BehaviorLogEditModal';
import LeaveRequestList from '../../components/leave/LeaveRequestList';
import { readJSON, writeJSON } from '../../utils/storage';
import { formatBaht } from '../../utils/identity';
import { supabase } from '../../config/supabase';
import { useBehaviorCategories } from '../../hooks/useBehaviorCategories';
import { useBehaviorLogs } from '../../hooks/useBehaviorLogs';
import { useLeaveRequests } from '../../hooks/useLeaveRequests';
import { useRealtimeTable } from '../../hooks/useRealtimeTable';
import { fetchSubstitutionsForDate, todayISO, classLabel, PERIOD_TIMES } from '../../utils/timetable';
import {
  Calendar,
  AlertCircle,
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
  History
} from 'lucide-react';

/* รายชื่อตัวอย่างสำหรับหน้าครู — เป็นข้อมูลสมมติทั้งหมด
   ห้ามใส่ชื่อ-นามสกุลจริงของนักเรียนตรงนี้ เพราะ repo นี้เป็น public
   ของจริงต้องดึงจากตาราง student_profiles ผ่าน Supabase (ยังไม่ได้ทำ) */
const STUDENTS = [
  { id: 'student01', name: 'นักเรียนตัวอย่าง 1', class: 'ปวช.3/6', branch: 'เทคโนโลยีสารสนเทศ', role: 'student' },
  { id: 'student02', name: 'นักเรียนตัวอย่าง 2', class: 'ปวช.3/6', branch: 'เทคโนโลยีสารสนเทศ', role: 'student' },
  { id: 'student03', name: 'นักเรียนตัวอย่าง 3', class: 'ปวช.3/4', branch: 'เทคโนโลยีสารสนเทศ', role: 'student' },
];

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

  // Homeroom state
  const [homeroomStatus, setHomeroomStatus] = useState({});
  const [isHomeroomSubmitted, setIsHomeroomSubmitted] = useState(false);

  // Behavior state — ค้นหา/เลือกนักเรียนจริงผ่าน RPC search_students (แทนรายชื่อ mock เดิม)
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const { byActionType: behaviorCategoriesByType } = useBehaviorCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
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

  useEffect(() => {
    // Load homeroom status
    const storedHomeroom = readJSON('sbac_homeroom_attendance', {});
    setHomeroomStatus(storedHomeroom.status || {});
    setIsHomeroomSubmitted(storedHomeroom.submitted || false);
  }, [activeModal]);

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

  // Save Homeroom Attendance
  const handleHomeroomSave = () => {
    const allStudentsChecked = STUDENTS.every(s => homeroomStatus[s.id]);
    if (!allStudentsChecked) {
      showToast('กรุณาระบุสถานะการเข้าเรียนของนักเรียนให้ครบถ้วน', 'error');
      return;
    }
    const data = {
      submitted: true,
      status: homeroomStatus,
      date: new Date().toLocaleDateString()
    };
    writeJSON('sbac_homeroom_attendance', data);
    setIsHomeroomSubmitted(true);
    showToast('บันทึกการเช็คชื่อโฮมรูมสำเร็จ', 'success');
    setActiveModal(null);
  };

  // เลือกหมวดหมู่สำเร็จรูป — เติมเหตุผล/คะแนนให้อัตโนมัติ แล้วผูก category_id ไว้ส่งไปด้วย
  const handlePickCategory = (cat) => {
    setSelectedCategoryId(cat.id);
    setBehaviorReason(cat.label);
    setBehaviorPoints(String(cat.default_points));
  };

  // พิมพ์เหตุผลเอง = เลิกผูกกับหมวดหมู่สำเร็จรูปที่เคยเลือกไว้
  const handleReasonInput = (value) => {
    setBehaviorReason(value);
    setSelectedCategoryId(null);
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

  // Student Behavior Action — บันทึกจริงผ่าน RPC submit_behavior_log
  // (insert behavior_logs + สร้างแจ้งเตือนให้นักเรียนในธุรกรรมเดียวกัน ดู 20_behavior_and_notifications.sql)
  const handleBehaviorSave = async () => {
    if (!selectedStudent) {
      showToast('กรุณาค้นหาและเลือกนักเรียนก่อน', 'error');
      return;
    }
    if (!behaviorReason.trim()) {
      showToast('กรุณาระบุหรือเลือกเหตุผลของรายการ', 'error');
      return;
    }
    const scoreVal = Math.round(Number(behaviorPoints));
    if (!scoreVal || scoreVal <= 0) {
      showToast('กรุณาระบุคะแนนที่ถูกต้อง', 'error');
      return;
    }

    setSubmittingBehavior(true);
    const { data, error } = await supabase.rpc('submit_behavior_log', {
      p_student_user_id: selectedStudent.user_id,
      p_category_id: selectedCategoryId,
      p_reason: behaviorReason.trim(),
      p_points: scoreVal,
      p_action_type: behaviorActionType,
    });
    setSubmittingBehavior(false);

    if (error || !data?.ok) {
      const errorMessages = {
        FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์บันทึกพฤติกรรมนักเรียน',
        STUDENT_NOT_FOUND: 'ไม่พบข้อมูลนักเรียนคนนี้ในระบบ',
      };
      showToast(errorMessages[data?.error] || 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
      return;
    }

    showToast(
      `อัปเดตพฤติกรรม ${selectedStudent.full_name} ${behaviorActionType === 'add' ? '+' : '-'}${scoreVal} คะแนนสำเร็จ — แจ้งเตือนนักเรียนแล้ว`,
      'success'
    );

    // Reset form
    setSelectedStudent(null);
    setStudentQuery('');
    setSelectedCategoryId(null);
    setBehaviorReason('');
    setBehaviorPoints('5');
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
                <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>ลงเวลาเช็คชื่อเข้าแถวหน้าเสาธง</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  isHomeroomSubmitted
                    ? 'bg-emerald-500/10 text-accent-emerald border border-emerald-500/20'
                    : 'bg-amber-500/10 text-accent-amber border border-amber-500/20'
                }`}>
                  {isHomeroomSubmitted ? 'เช็คชื่อเข้าแถวแล้ว' : 'ค้างการเช็คชื่อเข้าแถว'}
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-accent-emerald" />
            <span className={`text-xs font-bold ${textPrimary}`}>
              รายงานสถานะห้องเรียน ปวช. 3/6 วันนี้
            </span>
          </div>
          {/* ป้ายเดิมเขียนว่า "ข้อมูลเรียลไทม์" ทั้งที่รายชื่อเป็นข้อมูลสมมติ 3 คน
              และการเช็คชื่อบันทึกลง localStorage เครื่องเดียว ไม่ได้แตะ Supabase เลย
              คนดูตอนนำเสนอจะเชื่อว่าเป็นของจริงแล้วถามต่อ — บอกตามจริงดีกว่า */}
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-accent-amber border border-amber-500/25">
            ข้อมูลตัวอย่าง
          </span>
        </div>

        <p className="text-[11px] font-semibold leading-relaxed text-content-muted">
          รายชื่อชุดนี้เป็นข้อมูลสมมติสำหรับสาธิตหน้าจอ และผลการเช็คชื่อบันทึกไว้ในเครื่องนี้เท่านั้น
          ยังไม่ได้เชื่อมกับรายชื่อนักเรียนจริงในฐานข้อมูล
        </p>

        <div className="grid grid-cols-3 gap-3">
          <div className={`p-3 rounded-2xl border text-center transition-all ${isDark ? 'bg-neutral-900/60 border-white/10' : 'bg-surface-card border-slate-100 shadow-sm'}`}>
            <span className="text-lg font-extrabold text-accent-emerald">
              {STUDENTS.filter(s => homeroomStatus[s.id] === 'present').length} / {STUDENTS.length}
            </span>
            <span className={`text-[9px] font-bold block mt-1 ${textMuted}`}>มาเรียน</span>
          </div>
          <div className={`p-3 rounded-2xl border text-center transition-all ${isDark ? 'bg-neutral-900/60 border-white/10' : 'bg-surface-card border-slate-100 shadow-sm'}`}>
            <span className="text-lg font-extrabold text-accent-rose">
              {STUDENTS.filter(s => homeroomStatus[s.id] === 'absent').length}
            </span>
            <span className={`text-[9px] font-bold block mt-1 ${textMuted}`}>ขาดเรียน</span>
          </div>
          <div className={`p-3 rounded-2xl border text-center transition-all ${isDark ? 'bg-neutral-900/60 border-white/10' : 'bg-surface-card border-slate-100 shadow-sm'}`}>
            <span className="text-lg font-extrabold text-brand">
              {todayLogCount}
            </span>
            <span className={`text-[9px] font-bold block mt-1 ${textMuted}`}>รายการวินัยที่บันทึกวันนี้</span>
          </div>
        </div>
      </div>

      {/* MODAL: Homeroom Attendance */}
      <Modal 
        isOpen={activeModal === 'homeroom'} 
        onClose={() => setActiveModal(null)} 
        title="เช็คชื่อเข้าแถวโฮมรูม ปวช.3/6"
      >
        <div className="space-y-5">
          <p className={`text-xs ${textMuted}`}>
            ทำเครื่องหมายสถานะนักเรียนสำหรับการทำกิจกรรมหน้าเสาธงและการเข้าชั้นเรียนวันนี้
          </p>

          <div className="space-y-4">
            {STUDENTS.map(student => (
              <div 
                key={student.id} 
                className={`p-3 rounded-2xl border flex flex-col gap-2.5 transition-all ${
                  isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50/50 border-slate-100'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-bold ${textPrimary}`}>{student.name}</span>
                  <span className={`text-[9px] font-semibold ${textMuted}`}>รหัส {student.id} • {student.branch}</span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'present', label: 'มา', color: 'peer-checked:bg-emerald-500 peer-checked:text-white text-accent-emerald bg-emerald-500/5' },
                    { id: 'late', label: 'สาย', color: 'peer-checked:bg-amber-500 peer-checked:text-white text-accent-amber bg-amber-500/5' },
                    { id: 'absent', label: 'ขาด', color: 'peer-checked:bg-rose-500 peer-checked:text-white text-accent-rose bg-rose-500/5' },
                    { id: 'sick', label: 'ลา', color: 'peer-checked:bg-indigo-500 peer-checked:text-white text-brand bg-indigo-500/5' }
                  ].map(opt => (
                    <label key={opt.id} className="cursor-pointer select-none">
                      <input 
                        type="radio" 
                        name={`attendance-${student.id}`} 
                        value={opt.id}
                        checked={homeroomStatus[student.id] === opt.id}
                        onChange={() => setHomeroomStatus({ ...homeroomStatus, [student.id]: opt.id })}
                        className="hidden peer"
                      />
                      <div className={`py-1.5 rounded-xl text-center text-xs font-bold border border-transparent transition-all active:scale-95 ${opt.color} peer-checked:shadow-sm`}>
                        {opt.label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={handleHomeroomSave}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-button flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 size={16} />
            บันทึกการลงเวลาเรียน
          </button>
        </div>
      </Modal>

      {/* MODAL: Student Leave Requests */}
      <Modal 
        isOpen={activeModal === 'leaves'} 
        onClose={() => setActiveModal(null)} 
        title="อนุมัติการลาเรียนของนักเรียน"
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
              onClick={() => { setBehaviorActionType('deduct'); setBehaviorReason(''); setSelectedCategoryId(null); }}
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
              onClick={() => { setBehaviorActionType('add'); setBehaviorReason(''); setSelectedCategoryId(null); }}
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

          {/* Presets List — หมวดหมู่ความผิด/ความดีสำเร็จรูปจาก behavior_categories */}
          <div>
            <label className={`text-xs font-bold block mb-2 ${textPrimary}`}>รายการบันทึกสำเร็จรูป (Presets)</label>
            <div className="grid grid-cols-2 gap-2">
              {behaviorCategoriesByType(behaviorActionType)
                .map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handlePickCategory(cat)}
                    className={`p-2.5 rounded-xl border text-[11px] font-bold text-left transition-all ${
                      selectedCategoryId === cat.id
                        ? 'border-sbac-blue bg-sbac-blue-50/20 text-brand'
                        : isDark
                        ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-content-secondary'
                        : 'border-slate-100 bg-surface-card hover:bg-slate-50 text-slate-600 shadow-sm'
                    }`}
                  >
                    <div className="truncate">{cat.label}</div>
                    <div className={`text-[9px] mt-0.5 font-extrabold ${behaviorActionType === 'add' ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                      {behaviorActionType === 'add' ? '+' : '-'}{cat.default_points} คะแนน
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {/* Input details */}
          <div className="space-y-3 pt-1">
            <div>
              <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>ระบุรายละเอียด / เหตุผลอื่น ๆ</label>
              <input
                type="text"
                value={behaviorReason}
                onChange={e => handleReasonInput(e.target.value)}
                placeholder="พิมพ์ระบุเหตุผล เช่น ทะเลาะวิวาท, มีจิตอาสาช่วยขยะ"
                className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
              />
            </div>

            <div>
              <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>จำนวนคะแนน</label>
              <input
                type="number"
                min="1"
                value={behaviorPoints}
                onChange={e => setBehaviorPoints(e.target.value)}
                className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
              />
            </div>
          </div>

          {/* Submit Behavior Log */}
          <button
            onClick={handleBehaviorSave}
            disabled={submittingBehavior || !selectedStudent}
            className={`w-full text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
              behaviorActionType === 'add' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
            }`}
          >
            <Award size={16} />
            {submittingBehavior ? 'กำลังบันทึก...' : 'ลงบันทึกพฤติกรรมนักเรียน'}
          </button>
        </div>
      </Modal>

      {/* MODAL: Wallet — เหมือนฝั่งนักเรียนทุกประการ (ดูข้อ 3 ของงาน) */}
      <Modal
        isOpen={activeModal === 'balance'}
        onClose={() => setActiveModal(null)}
        title="💳 ยอดเงินบัตร"
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
        title="📷 เติมเงินด้วย QR + สลิป"
      >
        <TopUpSlipForm />
      </Modal>

      {/* MODAL: ประวัติที่ฉันบันทึก — แก้ไข/ลบได้ (21_behavior_crud_and_academic.sql) */}
      <Modal
        isOpen={activeModal === 'myLogs'}
        onClose={() => setActiveModal(null)}
        title="ประวัติที่ฉันบันทึก"
      >
        <BehaviorLogList
          logs={myLogs}
          loading={myLogsLoading}
          showStudentName
          onEdit={setEditingLog}
          onDeleteRequest={handleDeleteLog}
        />
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
