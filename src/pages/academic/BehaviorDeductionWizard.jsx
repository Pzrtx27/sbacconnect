import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import { useBehaviorCategories } from '../../hooks/useBehaviorCategories';
import { useClassRooms } from '../../hooks/useEvents';
import { Award, ChevronLeft, ChevronRight, Check } from 'lucide-react';

const STEP_LABELS = ['หมวดหมู่', 'ห้องเรียน', 'นักเรียน'];

/* Workflow ตัด/เพิ่มคะแนนของฝ่ายวิชาการ — แยกจากฟอร์มค้นหาของครูใน TeacherHome.jsx โดยตั้งใจ
   (ข้อ 2 ของงาน): เดินทีละขั้น หมวดหมู่ -> ห้องเรียน -> เลือกนักเรียนในห้องนั้น
   สิทธิ์บันทึกใช้ submit_behavior_log() ตัวเดียวกับของครู — role 'academic' ผ่าน
   app_is_teaching_staff() อยู่แล้วตั้งแต่ 20_behavior_and_notifications.sql ไม่ต้องเพิ่ม
   permission ใหม่ ไฟล์นี้แค่เพิ่ม UI แบบ step-by-step + endpoint "เรียกดูตามห้อง"
   (list_students_by_classroom, 21_behavior_crud_and_academic.sql) */
export default function BehaviorDeductionWizard() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { byActionType } = useBehaviorCategories();
  const { rooms } = useClassRooms();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);

  const [actionType, setActionType] = useState('deduct');
  const [categoryId, setCategoryId] = useState(null);
  const [reason, setReason] = useState('');
  const [points, setPoints] = useState('5');

  const [classRoomId, setClassRoomId] = useState('');
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  const resetAll = () => {
    setStep(1);
    setActionType('deduct');
    setCategoryId(null);
    setReason('');
    setPoints('5');
    setClassRoomId('');
    setStudents([]);
    setSelectedStudent(null);
  };

  const close = () => {
    setIsOpen(false);
    resetAll();
  };

  const handlePickCategory = (cat) => {
    setCategoryId(cat.id);
    setReason(cat.label);
    setPoints(String(cat.default_points));
  };

  const goToClassroomStep = () => {
    if (!reason.trim() || !Number(points) || Number(points) <= 0) {
      showToast('กรุณาเลือกหมวดหมู่หรือระบุเหตุผล/คะแนนให้ครบ', 'error');
      return;
    }
    setStep(2);
  };

  const handlePickClassroom = async (id) => {
    setClassRoomId(id);
    setSelectedStudent(null);
    setStudentsLoading(true);
    setStep(3);

    const { data, error } = await supabase.rpc('list_students_by_classroom', { p_class_room_id: id });
    setStudentsLoading(false);

    if (error || !data?.ok) {
      console.error('[academic] โหลดรายชื่อนักเรียนในห้องไม่สำเร็จ:', error);
      setStudents([]);
      return;
    }
    setStudents(data.students || []);
  };

  const handleSubmit = async () => {
    if (!selectedStudent) return;

    setSubmitting(true);
    const { data, error } = await supabase.rpc('submit_behavior_log', {
      p_student_user_id: selectedStudent.user_id,
      p_category_id: categoryId,
      p_reason: reason.trim(),
      p_points: Math.round(Number(points)),
      p_action_type: actionType,
    });
    setSubmitting(false);

    if (error || !data?.ok) {
      const messages = {
        FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์บันทึกพฤติกรรมนักเรียน',
        STUDENT_NOT_FOUND: 'ไม่พบข้อมูลนักเรียนคนนี้ในระบบ',
      };
      showToast(messages[data?.error] || 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
      return;
    }

    showToast(
      `บันทึกพฤติกรรม ${selectedStudent.full_name} ${actionType === 'add' ? '+' : '-'}${points} คะแนนสำเร็จ — แจ้งเตือนนักเรียนแล้ว`,
      'success'
    );
    close();
  };

  return (
    <>
      <GlassCard onClick={() => setIsOpen(true)}>
        <div className="flex flex-col h-full justify-between min-h-[110px]">
          <div>
            <Award className="text-accent-amber mb-2" size={24} />
            <div className={`text-sm font-extrabold ${textPrimary}`}>ตัด/เพิ่มคะแนนพฤติกรรม</div>
            <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>เลือกหมวดหมู่ → ห้องเรียน → นักเรียน</div>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[9px] font-semibold text-accent-amber">เริ่ม Workflow</span>
            <ChevronRight size={14} className={textMuted} />
          </div>
        </div>
      </GlassCard>

      <Modal isOpen={isOpen} onClose={close} title="ตัด/เพิ่มคะแนนพฤติกรรม">
        <div className="space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {STEP_LABELS.map((label, idx) => {
              const n = idx + 1;
              const active = n === step;
              const done = n < step;
              return (
                <div key={label} className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                      done
                        ? 'bg-accent-emerald text-white'
                        : active
                        ? 'bg-sbac-blue text-white'
                        : isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-200 text-ink-muted'
                    }`}
                  >
                    {done ? <Check size={12} /> : n}
                  </div>
                  <span className={`text-[10px] font-bold ${active ? textPrimary : textMuted}`}>{label}</span>
                  {n < STEP_LABELS.length && <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />}
                </div>
              );
            })}
          </div>

          {/* Step 1: หมวดหมู่ */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setActionType('deduct'); setCategoryId(null); setReason(''); }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    actionType === 'deduct'
                      ? 'bg-rose-500 text-white border-rose-500'
                      : isDark ? 'bg-white/5 border-white/10 text-accent-rose' : 'bg-rose-50 border-rose-100 text-accent-rose'
                  }`}
                >
                  ⚠️ ตัดคะแนน
                </button>
                <button
                  type="button"
                  onClick={() => { setActionType('add'); setCategoryId(null); setReason(''); }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    actionType === 'add'
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : isDark ? 'bg-white/5 border-white/10 text-accent-emerald' : 'bg-emerald-50 border-emerald-100 text-accent-emerald'
                  }`}
                >
                  ⭐ เพิ่มคะแนน
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {byActionType(actionType).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handlePickCategory(cat)}
                    className={`p-2.5 rounded-xl border text-[10px] font-bold text-left transition-all ${
                      categoryId === cat.id
                        ? 'border-sbac-blue bg-sbac-blue-50/20 text-brand'
                        : isDark ? 'border-white/5 bg-white/[0.02] text-content-secondary' : 'border-slate-100 bg-surface-card text-slate-600'
                    }`}
                  >
                    <div className="truncate">{cat.label}</div>
                    <div className={`text-[9px] mt-0.5 font-extrabold ${actionType === 'add' ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                      {actionType === 'add' ? '+' : '-'}{cat.default_points} คะแนน
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>ระบุรายละเอียด / เหตุผลอื่น ๆ</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setCategoryId(null); }}
                  placeholder="พิมพ์ระบุเหตุผล"
                  className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
                />
              </div>

              <div>
                <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>จำนวนคะแนน</label>
                <input
                  type="number"
                  min="1"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
                />
              </div>

              <button
                type="button"
                onClick={goToClassroomStep}
                className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5"
              >
                ถัดไป: เลือกห้องเรียน <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Step 2: ห้องเรียน */}
          {step === 2 && (
            <div className="space-y-3">
              <p className={`text-xs ${textMuted}`}>เลือกห้องเรียนที่นักเรียนสังกัดอยู่</p>
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => handlePickClassroom(room.id)}
                    className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${
                      isDark ? 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] text-content-secondary' : 'border-slate-100 bg-surface-card hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {room.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`w-full font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 border ${
                  isDark ? 'border-white/10 text-content-secondary hover:bg-white/5' : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
                }`}
              >
                <ChevronLeft size={14} /> ย้อนกลับ
              </button>
            </div>
          )}

          {/* Step 3: นักเรียน + ยืนยัน */}
          {step === 3 && (
            <div className="space-y-3">
              {!selectedStudent ? (
                <>
                  <p className={`text-xs ${textMuted}`}>เลือกนักเรียนในห้องนี้ที่ต้องการบันทึก</p>
                  {studentsLoading ? (
                    <div className="space-y-2" aria-hidden="true">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className={`h-12 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
                      ))}
                    </div>
                  ) : students.length === 0 ? (
                    <p className={`text-xs font-semibold text-center py-6 ${textMuted}`}>ไม่พบนักเรียนในห้องนี้</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1.5">
                      {students.map((s) => (
                        <button
                          key={s.user_id}
                          type="button"
                          onClick={() => setSelectedStudent(s)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                            isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'
                          }`}
                        >
                          <div className={`text-xs font-extrabold ${textPrimary}`}>{s.full_name}</div>
                          <div className={`text-[9px] font-semibold mt-0.5 ${textMuted}`}>
                            รหัส {s.student_code || '—'} • ปัจจุบัน {s.score} แต้ม
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className={`w-full font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 border ${
                      isDark ? 'border-white/10 text-content-secondary hover:bg-white/5' : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
                    }`}
                  >
                    <ChevronLeft size={14} /> ย้อนกลับ
                  </button>
                </>
              ) : (
                <>
                  <div className={`rounded-2xl border p-4 space-y-2 ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                    <div className={`text-sm font-extrabold ${textPrimary}`}>{selectedStudent.full_name}</div>
                    <div className={`text-[11px] font-semibold ${textMuted}`}>รหัส {selectedStudent.student_code || '—'} • ปัจจุบัน {selectedStudent.score} แต้ม</div>
                    <div className={`h-px my-1 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                    <div className={`text-xs font-semibold ${textPrimary}`}>{reason}</div>
                    <div className={`text-sm font-extrabold ${actionType === 'add' ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                      {actionType === 'add' ? '+' : '-'}{points} คะแนน
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(null)}
                      className={`flex-1 font-extrabold py-3 rounded-xl text-xs transition-all border ${
                        isDark ? 'border-white/10 text-content-secondary hover:bg-white/5' : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
                      }`}
                    >
                      เปลี่ยนนักเรียน
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      className={`flex-1 text-white font-extrabold py-3 rounded-xl text-xs transition-all disabled:opacity-50 ${
                        actionType === 'add' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                      }`}
                    >
                      {submitting ? 'กำลังบันทึก...' : 'ยืนยันบันทึก'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
