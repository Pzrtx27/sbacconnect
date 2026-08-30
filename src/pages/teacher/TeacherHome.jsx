import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import { readJSON, writeJSON } from '../../utils/storage';
import { supabase } from '../../config/supabase';
import { 
  Calendar, 
  Coffee, 
  AlertCircle, 
  Clock, 
  UserCheck, 
  ClipboardCheck, 
  Award, 
  CheckCircle2, 
  Search, 
  ChevronRight,
  TrendingUp,
  UserX,
  XCircle
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

  // Substitutions state
  const [substitutions, setSubstitutions] = useState([
    {
      id: 'sub_1',
      day: 'วันจันทร์',
      period: '3',
      class_id: 'm3_6',
      subject: 'English for Project Work',
      original_teacher: 'อ.มานี',
      room: 'ห้อง 1503'
    }
  ]);

  // Modal control
  const [activeModal, setActiveModal] = useState(null);

  // Leave Requests state
  const [leaveRequests, setLeaveRequests] = useState([]);
  
  // Homeroom state
  const [homeroomStatus, setHomeroomStatus] = useState({});
  const [isHomeroomSubmitted, setIsHomeroomSubmitted] = useState(false);

  // Behavior state — ค้นหา/เลือกนักเรียนจริงผ่าน RPC search_students (แทนรายชื่อ mock เดิม)
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [behaviorCategories, setBehaviorCategories] = useState([]);
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
    // Load student leaves from local storage
    const storedLeaves = readJSON('sbac_leave_requests', []);
    setLeaveRequests(storedLeaves);

    // Load homeroom status
    const storedHomeroom = readJSON('sbac_homeroom_attendance', {});
    setHomeroomStatus(storedHomeroom.status || {});
    setIsHomeroomSubmitted(storedHomeroom.submitted || false);
  }, [activeModal]);

  // โหลดหมวดหมู่พฤติกรรม + นับรายการวันนี้ ครั้งเดียวตอนเข้าหน้า
  useEffect(() => {
    supabase
      .from('behavior_categories')
      .select('id, code, action_type, label, default_points, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('[behavior] โหลดหมวดหมู่ไม่สำเร็จ:', error);
        else setBehaviorCategories(data || []);
      });

    loadTodayLogCount();
  }, [loadTodayLogCount]);

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

  // Student Leave Action
  const handleLeaveDecision = (ticketId, status) => {
    const updated = leaveRequests.map(req => {
      if (req.id === ticketId) {
        return { ...req, status };
      }
      return req;
    });
    writeJSON('sbac_leave_requests', updated);
    setLeaveRequests(updated);
    showToast(status === 'approved' ? 'อนุมัติใบลาเรียบร้อยแล้ว' : 'ปฏิเสธใบลาเรียบร้อยแล้ว', 'success');
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

  const pendingLeavesCount = leaveRequests.filter(req => req.status === 'pending').length;

  return (
    <div className="space-y-6 xl:max-w-4xl">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-sbac-navy to-sbac-blue p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-white/5 rounded-full -mr-10 -mt-10 pointer-events-none" />
        <div className="relative space-y-1 z-10">
          <span className="text-[10px] bg-white/20 text-white font-extrabold px-3 py-1 rounded-full inline-block uppercase tracking-wider mb-2">
            อาจารย์ผู้สอน (Faculty Panel)
          </span>
          <h2 className="text-2xl font-extrabold">{user?.name}</h2>
          <p className="text-xs text-white/80">
            อาจารย์ผู้ดูแลแผนกวิชาคอมพิวเตอร์ประจำชั้น ม.3/6 • SBAC Nonthaburi
          </p>
        </div>
      </div>

      {/* Substitution Notifications */}
      {substitutions.length > 0 && (
        <div className="space-y-3">
          <span className="text-xs font-extrabold text-sbac-red flex items-center gap-1">
            <AlertCircle size={16} />
            รายการสอนแทนวันนี้ (Substitution Alerts)
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
              <div className="flex-1 space-y-1 min-w-0">
                <div className={`text-[10px] font-extrabold uppercase tracking-wider ${isDark ? 'text-accent-rose' : 'text-accent-rose'}`}>
                  คาบที่ {sub.period} • {sub.day}
                </div>
                <div className={`text-sm font-extrabold truncate ${textPrimary}`}>
                  สอนแทน: {sub.subject}
                </div>
                <p className={`text-[10px] font-semibold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                  ระดับชั้น ปวช. 3/6 • {sub.room}
                </p>
                <div className={`text-[9px] font-bold pt-1 ${isDark ? 'text-accent-rose' : 'text-accent-rose'}`}>
                  * ครูประจำวิชาเดิม: {sub.original_teacher}
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
                <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ลงเวลาเช็คชื่อเข้าแถวหน้าเสาธง</div>
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
                <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>พิจารณาใบลาป่วย/ลากิจของเด็ก</div>
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
                <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>เช็คและตัด/เพิ่มคะแนนพฤติกรรม (พร้อมคอมเมนต์)</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`text-[9px] font-semibold text-accent-amber`}>
                  จัดการแต้มวินัย & คอมเมนต์
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
                <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ดูตารางคาบสอนรายวัน</div>
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
                  <Coffee size={24} />
                </div>
                <div>
                  <div className={`text-sm font-extrabold ${textPrimary}`}>สั่งเครื่องดื่มแผนกบาริสต้า (Barista Shop)</div>
                  <div className={`text-[10px] ${textMuted}`}>สั่งชากาแฟออนไลน์ ส่งตรงถึงห้องเรียนและห้องพักครู</div>
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
            <span className={`text-xs font-extrabold uppercase tracking-wider ${textPrimary}`}>
              รายงานสถานะห้องเรียน ปวช. 3/6 วันนี้
            </span>
          </div>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-white/5 text-content-muted' : 'bg-slate-200/50 text-content-muted'}`}>
            ข้อมูลเรียลไทม์
          </span>
        </div>

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
        title="เช็คชื่อเข้าแถวโฮมรูม ม.3/6"
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
                  isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50/50 border-slate-100'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-extrabold ${textPrimary}`}>{student.name}</span>
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
            รายการใบลาป่วย หรือลากิจที่นักเรียนยื่นผ่านแอปพลิเคชัน SBAC CONNECT
          </p>

          {leaveRequests.length === 0 ? (
            <div className={`rounded-2xl p-8 border text-center transition-all ${
              isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-100'
            }`}>
              <CheckCircle2 size={36} className="text-accent-emerald mx-auto mb-2" />
              <p className={`text-sm font-extrabold ${textPrimary}`}>ไม่มีคำขอลาที่ค้างอยู่</p>
              <p className={`text-xs mt-1 ${textMuted}`}>นักเรียนในความดูแลของคุณไม่มีการยื่นใบลาในขณะนี้</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {leaveRequests.map(req => (
                <div 
                  key={req.id} 
                  className={`p-4 border rounded-2xl space-y-2.5 transition-all relative overflow-hidden ${
                    isDark ? 'bg-slate-900 border-white/5' : 'bg-slate-50 border-slate-100'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`text-xs font-extrabold ${textPrimary}`}>{req.studentName}</span>
                      <span className={`text-[9px] font-semibold block ${textMuted}`}>สาขา {req.branch} • ID: {req.studentId}</span>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      req.type === 'sick' ? 'bg-emerald-500/10 text-accent-emerald' : 'bg-indigo-500/10 text-brand'
                    }`}>
                      {req.type === 'sick' ? '🏥 ลาป่วย' : '📋 ลากิจ'}
                    </span>
                  </div>

                  <div className={`p-2.5 rounded-xl text-xs space-y-1 ${
                    isDark ? 'bg-white/[0.02]' : 'bg-surface-card shadow-sm'
                  }`}>
                    <div className="font-semibold">
                      <span className={textMuted}>วันที่ลา: </span>
                      <span className={textSecondary}>{req.startDate} {req.endDate ? `ถึง ${req.endDate}` : ''}</span>
                    </div>
                    <div className="font-semibold">
                      <span className={textMuted}>เหตุผล: </span>
                      <span className={textSecondary}>{req.reason}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <span className={`text-[9px] font-bold ${textMuted}`}>
                      ส่งเมื่อ {new Date(req.timestamp).toLocaleDateString('th-TH')}
                    </span>

                    {req.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLeaveDecision(req.id, 'rejected')}
                          className="bg-rose-500/10 text-accent-rose hover:bg-rose-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1 border border-rose-500/20"
                        >
                          <UserX size={12} /> ปฏิเสธ
                        </button>
                        <button
                          onClick={() => handleLeaveDecision(req.id, 'approved')}
                          className="bg-emerald-500 text-white hover:bg-emerald-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1"
                        >
                          <CheckCircle2 size={12} /> อนุมัติ
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs font-extrabold flex items-center gap-1 ${
                        req.status === 'approved' ? 'text-accent-emerald' : 'text-accent-rose'
                      }`}>
                        {req.status === 'approved' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {req.status === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
              <p className={`text-[10px] font-semibold mt-1.5 ${textMuted}`}>กำลังค้นหา...</p>
            )}

            {!selectedStudent && !searchingStudents && studentQuery.trim().length >= 2 && studentResults.length === 0 && (
              <p className={`text-[10px] font-semibold mt-1.5 ${textMuted}`}>ไม่พบนักเรียนที่ตรงกับ "{studentQuery.trim()}"</p>
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
                    <div className={`text-xs font-extrabold ${textPrimary}`}>{s.full_name}</div>
                    <div className={`text-[9px] font-semibold mt-0.5 ${textMuted}`}>
                      รหัส {s.student_code || '—'} • {s.class_label || 'ไม่มีข้อมูลห้อง'} • ปัจจุบัน {s.score} แต้ม
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedStudent && (
              <div className={`mt-2 flex items-center justify-between gap-2 p-3 rounded-xl border ${isDark ? 'bg-white/[0.02] border-white/10' : 'bg-slate-50 border-slate-100'}`}>
                <div className="min-w-0">
                  <div className={`text-xs font-extrabold truncate ${textPrimary}`}>{selectedStudent.full_name}</div>
                  <div className={`text-[9px] font-semibold mt-0.5 ${textMuted}`}>
                    รหัส {selectedStudent.student_code || '—'} • {selectedStudent.class_label || 'ไม่มีข้อมูลห้อง'} • ปัจจุบัน {selectedStudent.score} แต้ม
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleChangeStudent}
                  className="shrink-0 text-[10px] font-extrabold text-brand px-2 py-1"
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
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                behaviorActionType === 'deduct'
                  ? 'bg-rose-500 text-white border-rose-500 shadow-sm'
                  : isDark
                  ? 'bg-white/5 border-white/10 text-accent-rose hover:bg-white/10'
                  : 'bg-rose-50 border-rose-100 text-accent-rose hover:bg-rose-100/50'
              }`}
            >
              ⚠️ ตัดคะแนนความประพฤติ
            </button>
            <button
              onClick={() => { setBehaviorActionType('add'); setBehaviorReason(''); setSelectedCategoryId(null); }}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all text-center ${
                behaviorActionType === 'add'
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                  : isDark
                  ? 'bg-white/5 border-white/10 text-accent-emerald hover:bg-white/10'
                  : 'bg-emerald-50 border-emerald-100 text-accent-emerald hover:bg-emerald-100/50'
              }`}
            >
              ⭐ เพิ่มคะแนนความดี
            </button>
          </div>

          {/* Presets List — หมวดหมู่ความผิด/ความดีสำเร็จรูปจาก behavior_categories */}
          <div>
            <label className={`text-xs font-bold block mb-2 ${textPrimary}`}>รายการบันทึกสำเร็จรูป (Presets)</label>
            <div className="grid grid-cols-2 gap-2">
              {behaviorCategories
                .filter(cat => cat.action_type === behaviorActionType)
                .map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handlePickCategory(cat)}
                    className={`p-2.5 rounded-xl border text-[10px] font-bold text-left transition-all ${
                      selectedCategoryId === cat.id
                        ? 'border-sbac-blue bg-sbac-blue-50/20 text-brand'
                        : isDark
                        ? 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] text-content-secondary'
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
    </div>
  );
}
