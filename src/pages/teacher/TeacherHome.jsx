import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import { readJSON, writeJSON } from '../../utils/storage';
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

  // Behavior state
  const [selectedStudentId, setSelectedStudentId] = useState('66001');
  const [behaviorLogs, setBehaviorLogs] = useState([]);
  const [behaviorReason, setBehaviorReason] = useState('');
  const [behaviorPoints, setBehaviorPoints] = useState('5');
  const [behaviorActionType, setBehaviorActionType] = useState('deduct'); // 'add' | 'deduct'

  // Presets for behavior
  const behaviorPresets = {
    deduct: [
      { reason: 'มาสายบ่อยครั้ง', score: -3 },
      { reason: 'แต่งกายไม่เรียบร้อย', score: -5 },
      { reason: 'ใช้โทรศัพท์ในห้องเรียน', score: -2 },
      { reason: 'ไม่ส่งงานวิชาโครงการ', score: -10 }
    ],
    add: [
      { reason: 'ช่วยเหลือกิจกรรมวิทยาลัย', score: 5 },
      { reason: 'รักษาความสะอาดห้องเรียน', score: 2 },
      { reason: 'มีจิตสาธารณะดีเด่น', score: 5 },
      { reason: 'ชนะการประกวดทักษะวิชาการ', score: 10 }
    ]
  };

  useEffect(() => {
    // Load student leaves from local storage
    const storedLeaves = readJSON('sbac_leave_requests', []);
    setLeaveRequests(storedLeaves);

    // Load homeroom status
    const storedHomeroom = readJSON('sbac_homeroom_attendance', {});
    setHomeroomStatus(storedHomeroom.status || {});
    setIsHomeroomSubmitted(storedHomeroom.submitted || false);

    // Load behavior logs
    const storedLogs = readJSON('sbac_behavior_logs', []);
    setBehaviorLogs(storedLogs);
  }, [activeModal]);

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

  // Student Behavior Action
  const handleBehaviorSave = () => {
    if (!behaviorReason.trim()) {
      showToast('กรุณาระบุหรือเลือกเหตุผลของรายการ', 'error');
      return;
    }
    const scoreVal = Number(behaviorPoints);
    if (!scoreVal || scoreVal <= 0) {
      showToast('กรุณาระบุคะแนนที่ถูกต้อง', 'error');
      return;
    }

    const selectedStudent = STUDENTS.find(s => s.id === selectedStudentId);
    const scoreOffset = behaviorActionType === 'add' ? scoreVal : -scoreVal;

    const newLog = {
      id: `BH-${Date.now()}`,
      studentId: selectedStudentId,
      studentName: selectedStudent.name,
      reason: behaviorReason,
      score: scoreOffset,
      teacherName: user.name,
      timestamp: new Date().toISOString()
    };

    const existingLogs = readJSON('sbac_behavior_logs', []);
    existingLogs.push(newLog);
    writeJSON('sbac_behavior_logs', existingLogs);
    setBehaviorLogs(existingLogs);

    showToast(`อัปเดตพฤติกรรม ${selectedStudent.name} ${scoreOffset > 0 ? `+${scoreOffset}` : scoreOffset} คะแนนสำเร็จ`, 'success');
    
    // Reset form
    setBehaviorReason('');
    setBehaviorPoints('5');
    setActiveModal(null);
  };

  const getStudentBehaviorScore = (studentId) => {
    const logs = readJSON('sbac_behavior_logs', []);
    const studentLogs = logs.filter(log => log.studentId === studentId);
    const totalDeductions = studentLogs.reduce((acc, log) => acc + Number(log.score), 0);
    return Math.max(0, Math.min(100, 100 + totalDeductions));
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
              {Math.round(STUDENTS.reduce((acc, s) => acc + getStudentBehaviorScore(s.id), 0) / STUDENTS.length)}
            </span>
            <span className={`text-[9px] font-bold block mt-1 ${textMuted}`}>คะแนนวินัยเฉลี่ย</span>
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
          {/* Select Student */}
          <div>
            <label className={`text-xs font-bold block mb-1.5 ${textPrimary}`}>เลือกนักเรียนสำหรับการจัดการ</label>
            <select
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              className={`w-full border rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none ${bgInput}`}
            >
              {STUDENTS.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} (รหัส {s.id}) — ปัจจุบัน {getStudentBehaviorScore(s.id)} แต้ม
                </option>
              ))}
            </select>
          </div>

          {/* Action Type (Add / Deduct) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setBehaviorActionType('deduct'); setBehaviorReason(''); }}
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
              onClick={() => { setBehaviorActionType('add'); setBehaviorReason(''); }}
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

          {/* Presets List */}
          <div>
            <label className={`text-xs font-bold block mb-2 ${textPrimary}`}>รายการบันทึกสำเร็จรูป (Presets)</label>
            <div className="grid grid-cols-2 gap-2">
              {behaviorPresets[behaviorActionType].map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setBehaviorReason(preset.reason);
                    setBehaviorPoints(Math.abs(preset.score).toString());
                  }}
                  className={`p-2.5 rounded-xl border text-[10px] font-bold text-left transition-all ${
                    behaviorReason === preset.reason
                      ? 'border-sbac-blue bg-sbac-blue-50/20 text-brand'
                      : isDark
                      ? 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] text-content-secondary'
                      : 'border-slate-100 bg-surface-card hover:bg-slate-50 text-slate-600 shadow-sm'
                  }`}
                >
                  <div className="truncate">{preset.reason}</div>
                  <div className={`text-[9px] mt-0.5 font-extrabold ${behaviorActionType === 'add' ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                    {preset.score > 0 ? `+${preset.score}` : preset.score} คะแนน
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
                onChange={e => setBehaviorReason(e.target.value)}
                placeholder="พิมพ์ระบุเหตุผล เช่น ทะเลาะวิวาท, มีจิตอาสาช่วยขยะ"
                className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
              />
            </div>

            <div>
              <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>จำนวนคะแนน</label>
              <input
                type="number"
                value={behaviorPoints}
                onChange={e => setBehaviorPoints(e.target.value)}
                className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
              />
            </div>
          </div>

          {/* Submit Behavior Log */}
          <button 
            onClick={handleBehaviorSave}
            className={`w-full text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-1.5 ${
              behaviorActionType === 'add' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
            }`}
          >
            <Award size={16} />
            ลงบันทึกพฤติกรรมนักเรียน
          </button>
        </div>
      </Modal>
    </div>
  );
}
