import { useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { CheckCircle2, XCircle, Check } from 'lucide-react';
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_TEXT, LEAVE_STATUS_COLOR } from '../../utils/leave';

/* รายการใบลา ใช้ร่วมกัน 3 ที่:
   - StudentHome.jsx  (mode="student" — อ่านอย่างเดียว ดูสถานะของตัวเอง)
   - TeacherHome.jsx  (mode="teacher" — อนุมัติ/ไม่อนุมัติขั้นที่ 1 เฉพาะสถานะ pending_teacher)
   - AcademicDashboard.jsx (mode="academic" — อนุมัติ/ไม่อนุมัติขั้นที่ 2 เฉพาะสถานะ pending_academic)
   onDecide(request, approve, reason) เรียกเฉพาะ mode teacher/academic */
export default function LeaveRequestList({ requests, loading, mode = 'student', onDecide }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState(null);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';

  const actionableStatus = mode === 'teacher' ? 'pending_teacher' : mode === 'academic' ? 'pending_academic' : null;

  const handleApprove = async (req) => {
    setBusyId(req.id);
    await onDecide(req, true, null);
    setBusyId(null);
  };

  const handleRejectConfirm = async (req) => {
    setBusyId(req.id);
    await onDecide(req, false, rejectReason);
    setBusyId(null);
    setRejectingId(null);
    setRejectReason('');
  };

  if (loading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-20 rounded-2xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
        ))}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className={`rounded-2xl p-8 border text-center ${isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
        <CheckCircle2 size={32} className="text-accent-emerald mx-auto mb-2" aria-hidden="true" />
        <p className={`text-sm font-extrabold ${textPrimary}`}>ไม่มีรายการ</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {requests.map((req) => {
        const canDecide = actionableStatus && req.status === actionableStatus;
        const isRejecting = rejectingId === req.id;
        const isBusy = busyId === req.id;

        return (
          <div
            key={req.id}
            className={`p-4 border rounded-2xl space-y-2.5 ${isDark ? 'bg-slate-900 border-white/5' : 'bg-slate-50 border-slate-100'}`}
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                {mode !== 'student' && (
                  <span className={`text-xs font-extrabold block truncate ${textPrimary}`}>
                    {req.student_name} {req.student_code ? `(รหัส ${req.student_code})` : ''}
                  </span>
                )}
                <span className={`text-[9px] font-semibold block ${textMuted}`}>
                  {mode !== 'student' && req.class_label ? `${req.class_label} • ` : ''}
                  ยื่นเมื่อ {new Date(req.created_at).toLocaleDateString('th-TH')}
                </span>
              </div>
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                  LEAVE_STATUS_COLOR[req.status] || 'bg-slate-500/10 text-content-muted border-transparent'
                }`}
              >
                {LEAVE_STATUS_TEXT[req.status] || req.status}
              </span>
            </div>

            <div className={`p-2.5 rounded-xl text-xs space-y-1 ${isDark ? 'bg-white/[0.02]' : 'bg-surface-card shadow-sm'}`}>
              <div className="font-semibold">
                <span className={textMuted}>ประเภท: </span>
                <span className={textSecondary}>{LEAVE_TYPE_LABELS[req.leave_type]?.label || req.leave_type}</span>
              </div>
              <div className="font-semibold">
                <span className={textMuted}>วันที่ลา: </span>
                <span className={textSecondary}>
                  {req.start_date}
                  {req.end_date && req.end_date !== req.start_date ? ` ถึง ${req.end_date}` : ''}
                </span>
              </div>
              <div className="font-semibold">
                <span className={textMuted}>เหตุผล: </span>
                <span className={textSecondary}>{req.reason}</span>
              </div>
              {req.rejection_reason && (
                <div className="font-semibold">
                  <span className={textMuted}>เหตุผลที่ไม่อนุมัติ: </span>
                  <span className="text-accent-rose">{req.rejection_reason}</span>
                </div>
              )}
            </div>

            {canDecide && (
              isRejecting ? (
                <div className="space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="ระบุเหตุผลที่ไม่อนุมัติ (ไม่บังคับ)"
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none resize-none ${
                      isDark ? 'bg-neutral-900 border-white/15 text-white' : 'bg-white border-slate-200 text-ink'
                    }`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setRejectingId(null); setRejectReason(''); }}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold border ${isDark ? 'border-white/10 text-content-secondary' : 'border-slate-200 text-ink-secondary'}`}
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectConfirm(req)}
                      disabled={isBusy}
                      className="flex-1 py-2 rounded-lg text-xs font-extrabold bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white"
                    >
                      {isBusy ? 'กำลังส่ง...' : 'ยืนยันไม่อนุมัติ'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRejectingId(req.id)}
                    disabled={isBusy}
                    className="flex-1 bg-rose-500/10 text-accent-rose hover:bg-rose-500 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 border border-rose-500/20 disabled:opacity-50"
                  >
                    <XCircle size={13} /> ไม่อนุมัติ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(req)}
                    disabled={isBusy}
                    className="flex-1 bg-emerald-500 text-white hover:bg-emerald-600 px-3 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {isBusy ? 'กำลังส่ง...' : <><Check size={13} /> อนุมัติ</>}
                  </button>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
