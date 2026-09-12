import { useTheme } from '../../contexts/ThemeContext';
import { useMyAttendance, ATTENDANCE_LABELS, attendanceErrorText } from '../../hooks/useMyAttendance';
import LoadingSpinner from '../ui/LoadingSpinner';

/* ประวัติการเช็คชื่อเข้าแถวของนักเรียนเอง

   ครูประจำชั้นบันทึกทุกเช้า นักเรียนได้แจ้งเตือนรายวัน แต่ไม่เคยมีที่ไหน
   ให้ย้อนดูว่าสะสมมาเท่าไหร่แล้ว — "เทอมนี้ขาดไปกี่วัน" เป็นตัวเลขที่มีผลกับการจบ
   และเป็นข้อมูลของตัวเขาเอง ควรตอบได้โดยไม่ต้องไปถามครู

   วางไว้ในโมดัลเดียวกับเวลาเข้าโรงเรียน เพราะเป็นคำถามเดียวกัน ("ฉันมาเรียนไหม")
   แค่คนละแหล่ง — เครื่องแตะบัตร กับ ครูขานชื่อ ไม่แยกการ์ดใหม่ในกริดหน้าแรก
   ที่แน่นอยู่แล้ว */

const TONE = {
  present: 'text-accent-emerald',
  late: 'text-accent-amber',
  absent: 'text-accent-rose',
  leave: 'text-brand',
};

const CHIP = {
  present: 'bg-emerald-500/10 text-accent-emerald',
  late: 'bg-amber-500/10 text-accent-amber',
  absent: 'bg-rose-500/10 text-accent-rose',
  leave: 'bg-sbac-blue/10 text-brand',
};

const thaiDate = (iso) =>
  new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    .format(new Date(`${iso}T12:00:00Z`));

export default function MyAttendanceHistory() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { days, summary, loading, error } = useMyAttendance(true);

  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';

  if (loading) {
    return (
      <div className="py-6">
        <LoadingSpinner text="กำลังโหลดประวัติการเข้าแถว..." />
      </div>
    );
  }

  if (error) {
    return (
      <p className={`text-[12px] text-center py-6 leading-relaxed ${textMuted}`}>
        {attendanceErrorText(error)}
      </p>
    );
  }

  if (summary.total === 0) {
    return (
      <p className={`text-[12px] text-center py-6 leading-relaxed ${textMuted}`}>
        ยังไม่มีการเช็คชื่อเข้าแถวของคุณในระบบ
        <br />
        ครูประจำชั้นจะเริ่มบันทึกให้เมื่อเปิดเรียน
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* สรุปก่อน รายวันทีหลัง — คำถามแรกคือ "ขาดไปกี่วัน" ไม่ใช่ "วันที่ 12 เป็นยังไง" */}
      <div className="grid grid-cols-4 gap-2">
        {['present', 'late', 'absent', 'leave'].map((k) => (
          <div
            key={k}
            className={`rounded-xl px-2 py-2.5 text-center border ${
              isDark ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-100'
            }`}
          >
            <span className={`block text-lg font-extrabold tabular-nums ${TONE[k]}`}>
              {summary[k]}
            </span>
            <span className={`block text-[11px] font-bold mt-0.5 ${textMuted}`}>
              {ATTENDANCE_LABELS[k]}
            </span>
          </div>
        ))}
      </div>

      <p className={`text-[11px] font-semibold ${textMuted}`}>
        บันทึกทั้งหมด {summary.total} วัน · แสดง {days.length} วันล่าสุด
      </p>

      <ul className="space-y-1.5">
        {days.map((d) => (
          <li
            key={d.attend_date}
            className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border ${
              isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-slate-100'
            }`}
          >
            <span className={`text-[12px] font-bold ${textPrimary}`}>{thaiDate(d.attend_date)}</span>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md shrink-0 ${CHIP[d.status]}`}>
              {ATTENDANCE_LABELS[d.status] || d.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
