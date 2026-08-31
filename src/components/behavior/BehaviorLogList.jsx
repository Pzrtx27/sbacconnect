import { useTheme } from '../../contexts/ThemeContext';
import { Pencil, Trash2, CheckCircle2 } from 'lucide-react';

/* รายการประวัติตัด/เพิ่มคะแนน ใช้ร่วมกัน 2 ที่:
   - TeacherHome.jsx  ("ประวัติของฉัน" — ครูเห็น/แก้ไขเฉพาะรายการที่ตัวเองบันทึก)
   - AcademicDashboard.jsx ("จัดการรายการทั้งหมด" — ฝ่ายวิชาการเห็น/แก้ไขได้ทุกรายการ)
   ปุ่มแก้ไข/ลบโชว์เฉพาะแถวที่ can_edit=true (DB ส่งมาให้แล้วจาก list_behavior_logs) */
export default function BehaviorLogList({ logs, loading, showStudentName = false, onEdit, onDeleteRequest }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';

  if (loading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-16 rounded-2xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className={`rounded-2xl p-6 border text-center ${isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
        <CheckCircle2 size={28} className="text-accent-emerald mx-auto mb-2" aria-hidden="true" />
        <p className={`text-xs font-bold ${textPrimary}`}>ยังไม่มีรายการ</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className={`p-3.5 rounded-2xl border ${isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50/50 border-slate-100'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {showStudentName && (
                <div className={`text-xs font-extrabold truncate ${textPrimary}`}>
                  {log.student_name} {log.student_code ? `(รหัส ${log.student_code})` : ''}
                </div>
              )}
              <div className={`text-xs font-semibold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                {log.reason}
              </div>
              <div className={`text-[9px] font-semibold mt-1 ${textMuted}`}>
                โดย {log.teacher_name} • {new Date(log.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                {log.updated_at && ' • แก้ไขแล้ว'}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className={`text-sm font-extrabold ${log.action_type === 'add' ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                {log.action_type === 'add' ? '+' : '-'}{log.points}
              </span>
              {log.can_edit && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(log)}
                    aria-label="แก้ไขรายการ"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10 text-content-secondary' : 'hover:bg-slate-200 text-ink-secondary'}`}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRequest(log)}
                    aria-label="ลบรายการ"
                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-rose-500/10 text-accent-rose' : 'hover:bg-rose-50 text-accent-rose'}`}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
