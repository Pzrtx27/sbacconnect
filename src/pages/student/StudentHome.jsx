import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import ProfileBanner from '../../components/layout/ProfileBanner';
import CoffeeCup from '../../components/ui/icons/CoffeeCup';
import AcademicCalendar from '../../components/ui/AcademicCalendar';
import UpcomingEvents from '../../components/ui/UpcomingEvents';
import TopUpSlipForm from '../../components/wallet/TopUpSlipForm';
import FeePaymentPanel from '../../components/wallet/FeePaymentPanel';
import { useStudentFees } from '../../hooks/useStudentFees';
import { supabase } from '../../config/supabase';
import { formatBaht } from '../../utils/identity';
import { timetableTitle } from '../../utils/timetable';
import { LEAVE_TYPE_LABELS } from '../../utils/leave';
import { useLeaveRequests } from '../../hooks/useLeaveRequests';
import LeaveRequestList from '../../components/leave/LeaveRequestList';
import WalletHistory from '../../components/wallet/WalletHistory';
import GateEntryLog from '../../components/gate/GateEntryLog';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useMyClassInfo } from '../../hooks/useMyClassInfo';
import { useMyScoreSummary } from '../../hooks/useGradebook';
import StudentScorePanel from '../../components/score/StudentScorePanel';
import { calcGpa, fmtScore, getScoreTier, isAnnounced, scorePercent, sumScores, toGrade } from '../../utils/score';
import {
  Clock,
  Award,
  BookOpen,
  GraduationCap,
  Calendar,
  FileText,
  UserX,
  ArrowRight,
  CheckCircle2,
  History,
  Receipt,
  QrCode,
  CalendarDays,
  ChevronDown,
  Wallet
} from 'lucide-react';

/* สถานะ "ฟีเจอร์นี้ยังไม่เปิดใช้งาน"
 *
 * ของเดิมสองโมดัลนี้ (กำหนดการสอบ / เอกสารอิเล็กทรอนิกส์) เป็นข้อมูลสมมติที่เขียนตายไว้ใน JSX
 * นักเรียนทุกคนทั้งวิทยาลัยเห็นตารางสอบชุดเดียวกัน ห้อง 1503 เหมือนกันหมด
 * และปุ่ม "ดาวน์โหลด" ขึ้น toast สีเขียวว่ากำลังดาวน์โหลดโดยไม่มีไฟล์ออกมาเลย
 *
 * ตัวเลขทุกตัวที่เหลือในแอปนี้มาจากของจริง จุดที่ยังปลอมจึงไม่ได้แค่ "ยังไม่เสร็จ"
 * แต่มันสอนผู้ใช้ว่าหน้าจอนี้โกหกได้ ซึ่งทำให้เขาไม่เชื่อยอดเงินกับคะแนนที่จริงไปด้วย
 *
 * สถานะว่างที่ใช้ได้จริงต้องตอบสามข้อ: ตอนนี้เป็นยังไง / ทำไม / แล้วต้องทำยังไงต่อ
 * ข้อสามสำคัญที่สุด — บอกทางที่ได้ของจริงวันนี้ ไม่ใช่ปล่อยให้เจอทางตัน
 */
function NotOpenYet({ icon: Icon, what, detail, meanwhile, isDark }) {
  return (
    <div className="py-6 text-center max-w-sm mx-auto">
      <span
        className={`w-14 h-14 rounded-2xl inline-flex items-center justify-center mb-4 ${
          isDark ? 'bg-white/[0.06] text-content-secondary' : 'bg-slate-100 text-ink-muted'
        }`}
      >
        <Icon size={26} aria-hidden="true" />
      </span>

      <p className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
        ยังไม่เปิดให้ใช้{what}ในแอป
      </p>

      <p className={`text-[12px] leading-relaxed mt-2 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
        {detail}
      </p>

      {/* ทางที่ได้ของจริงวันนี้ — แยกออกมาให้เห็นชัด ไม่ปนกับคำอธิบายว่าทำไมยังไม่มี */}
      <div
        className={`mt-5 pt-4 border-t text-[12px] font-semibold leading-relaxed ${
          isDark ? 'border-white/10 text-content-secondary' : 'border-slate-100 text-ink-secondary'
        }`}
      >
        {meanwhile}
      </div>
    </div>
  );
}

export default function StudentHome() {
  const { user, updateBalance } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  // คะแนนพฤติกรรม + ประวัติจริงจาก DB (ดู my_behavior_logs() ใน 20_behavior_and_notifications.sql)
  // ของเดิมผูกกับ localStorage (sbac_behavior_logs) ซึ่งเป็นคนละชุดกับที่อาจารย์บันทึกจริง
  const [behaviorScore, setBehaviorScore] = useState(100);
  const [behaviorLogs, setBehaviorLogs] = useState([]);

  /* ห้องเรียนและครูที่ปรึกษาของตัวเอง — ชื่อครูอยู่ในตาราง users ที่ RLS กันไว้
     จึงต้องผ่าน RPC my_class_info() ดู src/hooks/useMyClassInfo.js */
  const { info: classInfo, loading: classInfoLoading } = useMyClassInfo();

  /* ค่าเทอม/ค่าธรรมเนียมค้างชำระ (43_student_fees.sql)
     โหลดตั้งแต่เข้าหน้า ไม่รอเปิดโมดัล เพราะแถบเตือนด้านบนกับตัวเลขบนการ์ด
     ต้องบอกความจริงตั้งแต่แรกเห็น — ของเดิมเขียนตายตัวว่า 0 THB ทุกคน */
  const fees = useStudentFees(true);

  const loadBehavior = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_behavior_logs');
    if (error) {
      console.error('[behavior] โหลดคะแนนพฤติกรรมไม่สำเร็จ:', error);
      return;
    }
    if (data?.ok) {
      setBehaviorScore(data.score ?? 100);
      setBehaviorLogs(data.logs || []);
    }
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    loadBehavior();

    /* ครูบันทึกปุ๊บ คะแนน/ประวัติหน้านี้ต้องขยับตามทันที ไม่ต้องรอปิดเปิดโมดัลใหม่

       ต้องเป็น '*' ไม่ใช่ 'INSERT' เท่านั้น
       ของเดิมฟังแค่ INSERT ครูจึงแก้รายการเดิม (UPDATE) หรือลบทิ้ง (soft delete = UPDATE)
       แล้วหน้านักเรียนไม่ขยับเลย ตัวอย่างที่เจอจริง: ครูตัด 10 คะแนน แล้วมาแก้เป็น 5
       ฝั่ง DB คิดถูกแล้ว (behavior_score รวมสด ๆ และกรอง is_deleted ตั้งแต่ไฟล์ 21)
       แต่นักเรียนยังเห็น -10 ค้างอยู่จนกว่าจะปิดแอปเปิดใหม่
       ฝั่งครู/วิชาการใช้ '*' ถูกต้องอยู่แล้วใน useBehaviorLogs.js — ตกไปแค่ฝั่งนักเรียน */
    const channel = supabase
      .channel(`behavior-${user.uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'behavior_logs', filter: `student_user_id=eq.${user.uid}` },
        loadBehavior
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.uid, loadBehavior]);

  const getBehaviorColor = (score) => {
    if (score >= 90) return isDark ? 'bg-emerald-950/40 text-accent-emerald border border-emerald-500/20' : 'bg-emerald-50 text-accent-emerald border border-emerald-200';
    if (score >= 70) return isDark ? 'bg-blue-950/40 text-brand border border-blue-500/20' : 'bg-blue-50 text-brand border border-blue-200';
    if (score >= 50) return isDark ? 'bg-amber-950/40 text-accent-amber border border-amber-500/20' : 'bg-amber-50 text-accent-amber border border-amber-200';
    return isDark ? 'bg-rose-950/40 text-accent-rose border border-rose-500/20' : 'bg-rose-50 text-accent-rose border border-rose-200';
  };

  // ใบลาจริง (22_leave_requests.sql) — แทนของเดิมที่เขียน/อ่านผ่าน localStorage
  const { requests: myLeaveRequests, loading: myLeaveLoading, submit: submitLeaveRequest } = useLeaveRequests();
  const pendingLeaveCount = myLeaveRequests.filter((r) => r.status.startsWith('pending')).length;
  const [leaveView, setLeaveView] = useState('form'); // 'form' | 'history'

  // Modal states
  const [activeModal, setActiveModal] = useState(null);

  /* ปฏิทินพับไว้เป็นค่าเริ่มต้นบนมือถือ เพราะเป็น element ที่สูงที่สุดในหน้า
     บนคอมไม่ต้องพับ ปฏิทินอยู่รางขวาที่ตรึงไว้ ไม่ได้ดันเนื้อหาหลักลงไปไหน */
  const isDesktop = useIsDesktop();
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Leave Request Form States
  const [leaveType, setLeaveType] = useState('sick');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  /* เรื่องเงินในบัตร ฝั่ง DB ปิดทางไว้หมดตั้งแต่ย้ายมา Supabase:
       เติมเงิน — RLS revoke สิทธิ์เขียน wallet_entries ทิ้ง ทางเข้าตรงมีแค่ topup_cash()
                  ซึ่งบังคับ role 'cashier' (02_functions.sql) ปุ่มเติมเงินแบบเก่าจึงถูกเอาออก
       โอนเงิน  — เอาปุ่มออกแล้ว ฝั่ง DB ไม่เคยมีฟังก์ชันรองรับ ปุ่มเดิมกดแล้วขึ้น
                  toast ว่ายังไม่เปิดให้บริการอย่างเดียว
     ตั้งใจให้เป็นแบบนี้ ไม่งั้นนักเรียนเสกเงินให้ตัวเองได้

     ทางเข้าที่เพิ่มมาใหม่ (30_topup_instant_guarded.sql): เติมเงินด้วย QR พร้อมเพย์
     + แนบสลิป ผ่าน <TopUpSlipForm /> ซึ่งเรียก topup_qr_instant_v2() แล้วเงินเข้าทันที

     ตรงนี้ผ่อนหลักการข้างบนโดยตั้งใจ เพื่อให้สาธิตได้ลื่นไม่ต้องรอเจ้าหน้าที่
     แต่ไม่ได้ปล่อยฟรีแบบ topup_qr_instant() ตัวเดิมที่ถูกถอนสิทธิ์เรียกไปแล้ว
     ตัวใหม่บังคับสี่อย่างฝั่ง DB: path เป็นของตัวเอง / ไฟล์มีจริงใน bucket /
     sha256 ของสลิปไม่ซ้ำกับที่เคยใช้ / รวมทั้งวันไม่เกินเพดาน
     ข้อที่สามคือตัวที่ปิดช่องยิงวนลูป เพราะต้องมีสลิปใบใหม่จริง ๆ ถึงจะเติมรอบต่อไปได้

     ยังไม่ได้ตรวจกับธนาคารจริง จึงยังไม่ควรใช้กับเงินจริงจำนวนมาก */
  // ยื่นใบลาจริงผ่าน RPC submit_leave_request (22_leave_requests.sql)
  const handleLeaveSubmit = async () => {
    if (!leaveStartDate) {
      showToast('กรุณาเลือกวันที่เริ่มลา', 'error');
      return;
    }
    if (!leaveReason.trim()) {
      showToast('กรุณาระบุเหตุผลการลา', 'error');
      return;
    }

    setSubmittingLeave(true);
    const id = await submitLeaveRequest({
      leaveType,
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      reason: leaveReason.trim(),
    });
    setSubmittingLeave(false);

    if (!id) return;

    resetLeaveForm();
    setLeaveView('history');
  };

  const resetLeaveForm = () => {
    setLeaveType('sick');
    setLeaveStartDate('');
    setLeaveEndDate('');
    setLeaveReason('');
  };

  // Dark mode aware colors
  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgInput = isDark ? 'bg-neutral-900 border-white/20 text-white placeholder:text-content-muted focus:border-sbac-blue-light' : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  /* สรุปคะแนนเก็บ — ใช้ทั้งการ์ดหน้าแรก โมดัล "คะแนนระหว่างภาค" และโมดัล "ผลการเรียน"
     ของเดิมเป็นตัวเลขที่เขียนตายไว้ในไฟล์นี้ (ตัวแปร SCORE_ITEMS) นักเรียนทุกคนจึงเห็น
     42/50 วิชาเกม กับ GPA 3.45 เหมือนกันหมดทั้งวิทยาลัย ไม่ว่าจะเรียนห้องไหน
     ตอนนี้มาจาก my_score_summary() ซึ่งคิดจากคะแนนที่อาจารย์กรอกจริง (40_gradebook.sql) */
  const {
    subjects: scoreSubjects,
    term: scoreTerm,
    loading: scoreLoading,
    error: scoreError,
  } = useMyScoreSummary();

  const scoreTotals = sumScores(scoreSubjects);
  const scoreAvgPct = scorePercent(scoreTotals.score, scoreTotals.max);
  const scoreTier = getScoreTier(scoreAvgPct);
  const gpa = calcGpa(scoreSubjects);

  return (
    <div className="space-y-6">
      {/* หัวหน้าแรก — ใช้ตัวเดียวกับหน้าอาจารย์ (ProfileBanner)
          ของเดิมฝั่งนักเรียนเป็นกล่องเทาจาง ๆ ที่บอกได้แค่ชื่อกับ "ID • เทคโนโลยีสารสนเทศ"
          ซึ่งสาขานั้น hardcode ไว้ในหน้าเว็บ ไม่ได้มาจากฐานข้อมูล — นักเรียนสาขาอื่น
          ก็ขึ้นว่าเทคโนโลยีสารสนเทศเหมือนกันหมด ส่วนห้องเรียนที่รู้อยู่แล้วกลับไม่ได้แสดง

          ตอนนี้เป็นสามอย่างที่มาจากฐานข้อมูลจริงทั้งหมด:
          รหัสประจำตัว / ระดับชั้น-ห้อง / ครูที่ปรึกษา */}
      <ProfileBanner
        roleLabel="นักเรียน (Student Panel)"
        name={user?.name || 'นักเรียน SBAC'}
        balanceSatang={user?.balance_satang || 0}
        onWalletClick={() => setActiveModal('balance')}
        facts={[
          { label: 'รหัสประจำตัว', value: user?.id },
          { label: 'ระดับชั้น', value: user?.class_label },
          {
            label: 'ครูที่ปรึกษา',
            wide: true,
            /* กำลังโหลดกับยังไม่ได้กำหนด เป็นคนละเรื่องกัน
               ถ้าขึ้น "ยังไม่ได้กำหนด" ตอนที่ยังโหลดไม่เสร็จ นักเรียนจะเข้าใจผิด
               แล้วไปถามฝ่ายวิชาการทั้งที่ข้อมูลมีอยู่ */
            value: classInfoLoading ? 'กำลังโหลด...' : classInfo?.advisor_name || 'ยังไม่ได้กำหนด',
          },
        ]}
      />

      {/* แถบเตือนค่าเทอมค้างชำระ — ขึ้นเฉพาะตอนค้างจริงเท่านั้น
          วางใต้หัวหน้าแรกสุด เพราะเป็นเรื่องที่ต้องรู้ก่อนไปทำอย่างอื่นในแอป
          (ของเดิมยอดค้างซ่อนอยู่ในการ์ดใบหนึ่งกลางหน้า และเป็นเลข 0 ตายตัวด้วย)
          กดแล้วเข้าโมดัลจ่ายเงินพร้อมคิวอาร์ได้ทันที ไม่ต้องไล่หาการ์ดเอง */}
      {fees.summary.hasOutstanding && (
        <button
          type="button"
          onClick={() => setActiveModal('debt')}
          className={`w-full text-left rounded-2xl border p-4 flex items-center gap-3 active:scale-[0.995] transition-all ${
            isDark ? 'bg-rose-950/30 border-rose-800/40' : 'bg-rose-50 border-rose-200'
          }`}
        >
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            isDark ? 'bg-rose-500/15 text-accent-rose' : 'bg-white text-accent-rose'
          }`}>
            <Receipt size={20} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold text-accent-rose">
              มีค่าเทอมค้างชำระ {formatBaht(fees.summary.outstandingSatang)} ฿
            </div>
            <div className={`text-[11px] font-semibold mt-0.5 ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
              {fees.summary.overdueCount > 0
                ? `เลยกำหนดชำระแล้ว ${fees.summary.overdueCount} รายการ — แตะเพื่อจ่ายด้วยคิวอาร์พร้อมเพย์`
                : fees.summary.unpaidCount > 0
                  ? `${fees.summary.unpaidCount} รายการ — แตะเพื่อจ่ายด้วยคิวอาร์พร้อมเพย์`
                  : 'แจ้งชำระแล้ว รอฝ่ายการเงินตรวจสอบ — แตะเพื่อดูรายละเอียด'}
            </div>
          </div>

          <ArrowRight size={16} className="text-accent-rose shrink-0" />
        </button>
      )}

      {/* ลำดับบนมือถือ: เมนู -> กิจกรรม -> ปฏิทิน (พับไว้)
          ของเดิมเรียง กิจกรรม -> ปฏิทิน -> เมนู ซึ่งแปลว่าเปิดแอปมาต้องเลื่อนผ่าน
          ปฏิทินเต็มเดือน (สูงราว 400px บนจอ 375) ก่อนจะเจอเมนูสักปุ่ม
          ทั้งที่เมนูคือเหตุผลที่เปิดแอป ส่วนปฏิทินคือของที่เปิดดูเป็นครั้งคราว

          บนคอมยังเป็นสองคอลัมน์เหมือนเดิม เมนูซ้าย ปฏิทินเป็นรางขวาที่ตรึงไว้
          ซึ่งไม่กินพื้นที่แนวตั้งของเนื้อหาหลักอยู่แล้ว จึงไม่ต้องพับ */}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px] items-start">
        <div className="order-2 xl:order-2 space-y-6 xl:sticky xl:top-[calc(var(--app-header-h,0px)+1.5rem)]">
          {/* กิจกรรมที่กำลังจะมาถึง — สั้นและต้องเห็นโดยไม่ต้องกดอะไรเลย */}
          <UpcomingEvents />

          {/* ปฏิทินการศึกษา — บนคอมแสดงเสมอ บนมือถือพับไว้เพราะเป็นตัวที่ทำให้หน้ายาวที่สุด */}
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setCalendarOpen((v) => !v)}
              aria-expanded={calendarOpen}
              aria-controls="student-calendar"
              className={`w-full min-h-[48px] px-4 rounded-2xl border flex items-center justify-between gap-2 text-sm font-extrabold transition-colors ${
                isDark
                  ? 'bg-white/[0.06] border-white/10 text-white hover:bg-white/10'
                  : 'bg-surface-card border-slate-100 text-ink hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <CalendarDays size={17} className="text-brand" aria-hidden="true" />
                ปฏิทินการศึกษา
              </span>
              <ChevronDown
                size={17}
                aria-hidden="true"
                className={`text-content-muted transition-transform duration-200 ${calendarOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}

          {/* instance เดียว ไม่ render ซ้ำสองชุดแล้วซ่อนด้วย CSS
              ไม่งั้นจะโหลดกิจกรรมจากฐานข้อมูลสองรอบโดยเปล่าประโยชน์ */}
          {(isDesktop || calendarOpen) && (
            <div id="student-calendar">
              <AcademicCalendar />
            </div>
          )}
        </div>

        {/* Dashboard Grid */}
        <div className="order-1 xl:order-1 grid grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Entrance Times */}
        <GlassCard onClick={() => setActiveModal('entry')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <Clock className="text-brand mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>เวลาเข้าโรงเรียน</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>เวลาแตะบัตรผ่านประตู / Gate entry</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              ดูข้อมูล <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Payment Debts */}
        <GlassCard onClick={() => setActiveModal('debt')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <div className="w-9 h-9 rounded-2xl bg-rose-500/10 flex items-center justify-center text-accent-rose mb-2">
                <Receipt size={20} />
              </div>
              <div className={`text-sm font-extrabold ${textPrimary}`}>รายการค้างชำระ</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>
                {fees.summary.hasOutstanding ? 'จ่ายด้วยคิวอาร์พร้อมเพย์ได้ในแอป' : 'ยอดคงเหลือ / Outstanding'}
              </div>
            </div>
            {/* ยอดจริงจากตาราง student_fees แล้ว — ค้างอยู่ขึ้นแดง ไม่ใช่เขียว 0 THB ตายตัว */}
            <span className={`inline-block self-start text-xs font-bold px-3 py-1 rounded-full mt-2 ${
              fees.summary.hasOutstanding
                ? (isDark ? 'bg-rose-900/30 text-accent-rose' : 'bg-rose-50 text-accent-rose')
                : (isDark ? 'bg-emerald-900/30 text-accent-emerald' : 'bg-emerald-50 text-accent-emerald')
            }`}>
              {fees.loading ? '—' : `${formatBaht(fees.summary.outstandingSatang)} ฿`}
            </span>
          </div>
        </GlassCard>

        {/* Behavior Score */}
        <GlassCard onClick={() => setActiveModal('behavior')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <Award className="text-accent-amber mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>คะแนนความประพฤติ</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>ดูคะแนนความประพฤติสะสม</div>
            </div>
            <span className={`inline-block self-start text-xs font-bold px-3 py-1 rounded-full mt-2 ${
              getBehaviorColor(behaviorScore)
            }`}>
              {behaviorScore} / 100
            </span>
          </div>
        </GlassCard>

        {/* Score — ตัวเลขบนการ์ดเป็นของจริงจาก my_score_summary()
            ของเดิมเขียนแค่ "ดูข้อมูล" ซึ่งไม่ได้ตอบอะไรเลยทั้งที่มีที่ว่างพอจะตอบ */}
        <GlassCard onClick={() => setActiveModal('score')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <BookOpen className="text-accent-emerald mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>คะแนนระหว่างภาค</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>คะแนนเก็บรายหัวข้อ T1-T5</div>
            </div>
            {scoreLoading || scoreError || scoreSubjects.length === 0 ? (
              <div className="flex items-center text-xs font-bold text-brand mt-2">
                ดูข้อมูล <ArrowRight size={14} className="ml-1" />
              </div>
            ) : (
              <span className={`inline-block self-start text-xs font-bold px-3 py-1 rounded-full mt-2 ${scoreTier.chip} ${scoreTier.text}`}>
                {fmtScore(scoreTotals.score)} / {fmtScore(scoreTotals.max)}
              </span>
            )}
          </div>
        </GlassCard>

        {/* Grade */}
        <GlassCard onClick={() => setActiveModal('grade')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <GraduationCap className="text-accent-violet mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>ผลการเรียน</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>ดูเกรดเฉลี่ยเทอมนี้</div>
            </div>
            {gpa === null ? (
              <div className="flex items-center text-xs font-bold text-brand mt-2">
                ดูข้อมูล <ArrowRight size={14} className="ml-1" />
              </div>
            ) : (
              <span className="inline-block self-start text-xs font-bold px-3 py-1 rounded-full mt-2 bg-violet-500/10 text-accent-violet">
                GPA {gpa.toFixed(2)}
              </span>
            )}
          </div>
        </GlassCard>

        {/* Timetable */}
        <GlassCard onClick={() => navigate('/timetable')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <Calendar className="text-brand mb-2" size={24} />
              {/* หน้านี้เป็นของนักเรียนอย่างเดียว จึงเป็น "ตารางเรียน" เสมอ */}
              <div className={`text-sm font-extrabold ${textPrimary}`}>{timetableTitle('student')}</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>ดูรายคาบ เลือกดูวันอื่นได้</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              ดูข้อมูล <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Exam Schedule */}
        <GlassCard onClick={() => setActiveModal('exam')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <FileText className="text-accent-cyan mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>กำหนดการสอบ</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>สถานที่สอบ / เวลาสอบ</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              เปิดดู <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* E-Document */}
        <GlassCard onClick={() => setActiveModal('edoc')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <FileText className="text-accent-emerald mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>เอกสารอิเล็กทรอนิกส์</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>ใบรับรอง, ทรานสคริปต์</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              เปิดดู <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Leave Request — เปิด modal ให้เลือกได้ทั้งยื่นใหม่/ดูประวัติ */}
        <GlassCard onClick={() => { setLeaveView(pendingLeaveCount > 0 ? 'history' : 'form'); resetLeaveForm(); setActiveModal('leave'); }}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <UserX className="text-accent-rose mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>ยื่นใบลา</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>ยื่นใบลาผ่านแอป SBAC</div>
            </div>
            {pendingLeaveCount > 0 ? (
              <span className="inline-block self-start text-[9px] font-extrabold px-2.5 py-0.5 rounded-full mt-2 bg-amber-500/10 text-accent-amber">
                รออนุมัติ {pendingLeaveCount} ใบ
              </span>
            ) : (
              <div className="flex items-center text-xs font-bold text-brand mt-2">
                ยื่นใบลา <ArrowRight size={14} className="ml-1" />
              </div>
            )}
          </div>
        </GlassCard>

        {/* Coffee Shop */}
        <GlassCard onClick={() => navigate('/coffee')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <div className="w-9 h-9 rounded-2xl bg-amber-500/10 flex items-center justify-center text-accent-amber mb-2">
                <CoffeeCup size={22} aria-hidden="true" />
              </div>
              <div className={`text-sm font-extrabold ${textPrimary}`}>สั่งกาแฟบาริสต้า</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>SBAC Barista Coffee</div>
            </div>
            <div className="flex items-center text-xs font-bold text-accent-amber mt-2">
              สั่งเครื่องดื่ม <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Order History */}
        <GlassCard onClick={() => navigate('/orders/history')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <History className="text-accent-emerald mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>ประวัติการสั่งซื้อ</div>
              <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>ดูประวัติและสถานะคิวสั่งซื้อ</div>
            </div>
            <div className="flex items-center text-xs font-bold text-accent-emerald mt-2">
              ดูประวัติ <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        </div>
      </div>

      {/* MODAL: Balance & Topup */}
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

          {/* ปุ่มเติมเงินแบบเดิม (เขียน wallet_entries ตรง ๆ จากหน้าเว็บ) ถูกเอาออกไปแล้ว
              ไม่ใช่แค่ซ่อน — RLS revoke สิทธิ์เขียนทิ้งทั้งหมด
              ปุ่มนี้เปิดฟอร์มที่เติมทันทีผ่าน topup_qr_instant_v2 ซึ่งมีด่านกันยิงซ้ำฝั่ง DB */}
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

          {/* ประวัติเงินเข้า-ออก วางไว้ในโมดัลยอดเงินเลย
              เพราะคำถามที่ตามมาทันทีหลังเห็นยอดคือ "ยอดนี้มาจากไหน หายไปไหน" */}
          <div className="space-y-2">
            <span className={`text-xs font-bold block ${textPrimary}`}>ประวัติเงินเข้า-ออก</span>
            <WalletHistory />
          </div>
        </div>
      </Modal>

      {/* MODAL: เติมเงินด้วย QR พร้อมเพย์ + แนบสลิป */}
      <Modal
        isOpen={activeModal === 'topup'}
        onClose={() => setActiveModal(null)}
        title="เติมเงินด้วย QR + สลิป"
        icon={QrCode}
        tone="brand"
      >
        <TopUpSlipForm />
      </Modal>

      {/* MODAL: Leave Request — ยื่นใหม่ (form) / ดูสถานะ (history) ผ่าน RPC จริง (22_leave_requests.sql) */}
      <Modal
        isOpen={activeModal === 'leave'}
        onClose={() => setActiveModal(null)}
        title="ยื่นใบลา"
        icon={UserX}
        tone="amber"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLeaveView('form')}
              className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                leaveView === 'form'
                  ? 'bg-sbac-blue text-white border-sbac-blue'
                  : isDark ? 'bg-white/5 border-white/10 text-content-secondary' : 'bg-slate-50 border-slate-200 text-ink-secondary'
              }`}
            >
              ยื่นใบลาใหม่
            </button>
            <button
              type="button"
              onClick={() => setLeaveView('history')}
              className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                leaveView === 'history'
                  ? 'bg-sbac-blue text-white border-sbac-blue'
                  : isDark ? 'bg-white/5 border-white/10 text-content-secondary' : 'bg-slate-50 border-slate-200 text-ink-secondary'
              }`}
            >
              ประวัติของฉัน {myLeaveRequests.length > 0 && `(${myLeaveRequests.length})`}
            </button>
          </div>

          {leaveView === 'history' ? (
            <LeaveRequestList requests={myLeaveRequests} loading={myLeaveLoading} mode="student" />
          ) : (
            <div className="space-y-4">
              <p className={`text-xs leading-relaxed ${textMuted}`}>
                กรุณากรอกข้อมูลการลาให้ครบถ้วน ระบบจะส่งแจ้งเตือนไปยังครูประจำชั้นอัตโนมัติ
                หลังจากครูอนุมัติแล้วฝ่ายวิชาการจะอนุมัติอีกขั้นหนึ่ง แล้วแจ้งเตือนคุณทันทีทุกขั้นตอน
              </p>

              {/* Leave Type */}
              <div>
                <label className={`text-xs font-bold block mb-2 ${textPrimary}`}>ประเภทการลา</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(LEAVE_TYPE_LABELS).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setLeaveType(key)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-left ${
                        leaveType === key
                          ? 'bg-sbac-blue text-white border-sbac-blue shadow-sm'
                          : isDark
                          ? 'bg-white/5 border-white/10 text-content-secondary hover:bg-white/10'
                          : 'bg-slate-50 border-slate-200 text-ink-secondary hover:bg-slate-100'
                      }`}
                    >
                      <div>{val.label}</div>
                      <div className={`text-[9px] mt-0.5 ${leaveType === key ? 'text-white/70' : textMuted}`}>{val.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>วันที่เริ่มลา *</label>
                  <input
                    type="date"
                    value={leaveStartDate}
                    onChange={e => setLeaveStartDate(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>ถึงวันที่ (ไม่บังคับ)</label>
                  <input
                    type="date"
                    value={leaveEndDate}
                    onChange={e => setLeaveEndDate(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>เหตุผลการลา *</label>
                <textarea
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  rows={3}
                  className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none resize-none ${bgInput}`}
                  placeholder="ระบุเหตุผลการลา เช่น ไม่สบาย มีไข้สูง"
                />
              </div>

              {/* Student Info */}
              <div className={`rounded-xl p-3 border ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'}`}>
                <div className={`text-[11px] font-bold mb-1 ${textMuted}`}>ข้อมูลผู้ยื่น</div>
                <div className={`text-xs font-semibold ${textSecondary}`}>
                  {user?.name} • รหัส {user?.id}
                  {user?.class_label ? ` • ${user.class_label}` : ''}
                </div>
              </div>

              <button
                onClick={handleLeaveSubmit}
                disabled={submittingLeave}
                className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <UserX size={16} />
                {submittingLeave ? 'กำลังส่ง...' : 'ยืนยันการยื่นใบลา'}
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL: Entrance Times */}
      {/* MODAL: เวลาเข้าโรงเรียน — ขาเข้าอย่างเดียว
          ของเดิมเป็นเลขเขียนตายไว้ (เข้า 07:42 / ออก 16:30) ทุกคนเห็นเหมือนกันหมด
          และมีบรรทัด "ออกนอกสถานศึกษา" ทั้งที่ของจริงไม่มีใครแตะบัตรตอนกลับ */}
      <Modal isOpen={activeModal === 'entry'} onClose={() => setActiveModal(null)} title="เวลาเข้าโรงเรียน" icon={Clock} tone="cyan">
        <GateEntryLog />
      </Modal>

      {/* MODAL: Debts */}
      <Modal isOpen={activeModal === 'debt'} onClose={() => setActiveModal(null)} title="รายการค้างชำระ" icon={Receipt} tone="rose">
        <FeePaymentPanel
          fees={fees.fees}
          loading={fees.loading}
          error={fees.error}
          summary={fees.summary}
          reportTransfer={fees.reportTransfer}
          reportingId={fees.reportingId}
        />
      </Modal>

      {/* MODAL: Behavior */}
      <Modal isOpen={activeModal === 'behavior'} onClose={() => setActiveModal(null)} title="คะแนนความประพฤติ" icon={Award} tone="amber">
        <div className="space-y-6">
          <div className={`text-center py-5 border rounded-2xl ${
            isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={`text-5xl font-extrabold block ${
              behaviorScore >= 90 ? 'text-accent-emerald' :
              behaviorScore >= 70 ? 'text-brand' :
              behaviorScore >= 50 ? 'text-accent-amber' : 'text-accent-rose'
            }`}>
              {behaviorScore} <span className={`text-lg font-bold ${textMuted}`}>/ 100</span>
            </span>
            <span className={`text-xs font-bold mt-1 block ${
              behaviorScore >= 90 ? 'text-accent-emerald dark:text-accent-emerald' :
              behaviorScore >= 70 ? 'text-brand' :
              behaviorScore >= 50 ? 'text-accent-amber dark:text-accent-amber' : 'text-accent-rose dark:text-accent-rose'
            }`}>
              {behaviorScore >= 90 ? 'ดีเยี่ยม (Excellent)' :
               behaviorScore >= 70 ? 'ดี (Good)' :
               behaviorScore >= 50 ? 'ปานกลาง (Fair)' : 'ควรปรับปรุง (Needs Improvement)'}
            </span>
            <div className={`w-[80%] h-2.5 rounded-full mx-auto mt-4 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div className={`h-full rounded-full transition-all duration-500 ${
                behaviorScore >= 90 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' :
                behaviorScore >= 70 ? 'bg-gradient-to-r from-blue-500 to-indigo-500' :
                behaviorScore >= 50 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                'bg-gradient-to-r from-rose-500 to-red-500'
              }`} style={{ width: `${behaviorScore}%` }} />
            </div>
          </div>

          <div className="space-y-3">
            <span className={`text-xs font-bold block ${textMuted}`}>
              ประวัติรายการตัดคะแนน
            </span>
            {behaviorLogs.length === 0 ? (
              <div className={`rounded-2xl p-6 border text-center transition-all ${
                isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-100'
              }`}>
                <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-accent-emerald mb-2">
                  <CheckCircle2 size={24} />
                </div>
                <p className={`text-sm font-extrabold ${textPrimary}`}>ไม่มีประวัติการถูกหักคะแนน</p>
                <p className={`text-xs mt-1 ${textMuted}`}>นักเรียนปฏิบัติตามกฎระเบียบของวิทยาลัยได้อย่างดีเยี่ยม</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {behaviorLogs.map((item) => (
                  <div key={item.id} className={`flex justify-between items-center text-sm font-semibold border-b pb-2 ${
                    isDark ? 'border-white/10' : 'border-slate-50'
                  }`}>
                    <div>
                      <span className={textSecondary}>{item.reason}</span>
                      <span className={`text-[9px] font-normal block ${textMuted}`}>
                        โดย {item.teacher_name} • {new Date(item.created_at).toLocaleDateString('th-TH')}
                      </span>
                    </div>
                    <span className={`font-extrabold ${item.action_type === 'add' ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                      {item.action_type === 'add' ? `+${item.points}` : `-${item.points}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL: Score — เนื้อหาทั้งหมดอยู่ใน StudentScorePanel
          เพราะตอนนี้เป็นสองชั้น (ทุกรายวิชา -> รายละเอียด T1-T5 ของวิชาที่กด)
          ซึ่งมีสถานะภายในของตัวเอง ไม่ควรปนกับสถานะของหน้าแรกทั้งหน้า */}
      <Modal isOpen={activeModal === 'score'} onClose={() => setActiveModal(null)} title="คะแนนระหว่างภาค" icon={BookOpen} tone="brand">
        <StudentScorePanel
          subjects={scoreSubjects}
          term={scoreTerm}
          loading={scoreLoading}
          error={scoreError}
        />
      </Modal>

      {/* MODAL: Grade */}
      <Modal isOpen={activeModal === 'grade'} onClose={() => setActiveModal(null)} title="ผลการเรียน" icon={GraduationCap} tone="violet">
        <div className="space-y-4">
          <div className={`flex justify-between items-center p-3 rounded-xl border ${
            isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={`text-sm font-bold ${textPrimary}`}>ภาคเรียน {scoreTerm || '-'}</span>
            <span className="text-sm font-extrabold text-brand">
              {gpa === null ? 'ยังไม่มีเกรด' : `GPA: ${gpa.toFixed(2)}`}
            </span>
          </div>

          {/* เกรดคิดจากคะแนนจริงที่อาจารย์กรอก ไม่ใช่ตัวอักษรที่เขียนตายไว้ในโค้ดแบบเดิม
              วิชาที่ยังกรอกไม่ครบจะมีบรรทัดกำกับ ไม่ปล่อยให้เข้าใจผิดว่าเป็นเกรดสุดท้ายแล้ว */}
          {scoreLoading && (
            <div className="py-6">
              <LoadingSpinner text="กำลังโหลดผลการเรียน..." />
            </div>
          )}

          {/* ต้องแยก "โหลดไม่ได้" ออกจาก "ไม่มีข้อมูล" ก่อนเสมอ
              ของเดิมเช็คแค่ scoreSubjects.length === 0 ตอน RPC ล้ม (เช่นยังไม่ได้รัน
              40_gradebook.sql) นักเรียนจึงถูกบอกว่า "ห้องคุณไม่มีวิชา" ซึ่งชี้ผิดทางสนิท
              แล้วจะเดินไปถามฝ่ายทะเบียนเรื่องที่ไม่ใช่ปัญหา */}
          {!scoreLoading && scoreError && (
            <div className={`text-xs text-center py-8 space-y-1 ${textMuted}`}>
              <p className={`font-bold ${textPrimary}`}>ยังดูผลการเรียนไม่ได้ในตอนนี้</p>
              <p>ระบบคะแนนยังไม่ถูกเปิดใช้งาน กรุณาแจ้งฝ่ายวิชาการ</p>
            </div>
          )}

          {!scoreLoading && !scoreError && scoreSubjects.length === 0 && (
            <p className={`text-xs text-center py-8 ${textMuted}`}>
              ยังไม่มีรายวิชาของห้องคุณในภาคเรียนนี้
            </p>
          )}

          <div className="space-y-2.5">
            {scoreSubjects.map((item, idx) => {
              const grade = toGrade(item.score, item.max_score);
              const pending = Number(item.item_count || 0) - Number(item.graded_count || 0);
              /* วิชาที่ครูยังไม่กรอกคะแนนสักช่อง ต้องไม่ขึ้นชิป "F"
                 คะแนนเต็มถูกตั้งไว้ตั้งแต่ตอนรัน migration แล้ว (โครง T1-T5 = เต็ม 100)
                 แต่คะแนนที่ได้ยังเป็น 0 เพราะไม่มีใครกรอก ไม่ใช่เพราะนักเรียนทำไม่ได้
                 บรรทัด "รอประกาศอีก N หัวข้อ" ข้างล่างบอกความจริงนี้อยู่แล้ว
                 แต่มันเป็นตัวเล็กสีจาง ส่วน F เป็นชิปตัวหนา คนอ่านเห็น F ก่อนเสมอ */
              const announced = isAnnounced(item);

              return (
                <motion.div
                  key={item.subject_id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex justify-between items-center border-b pb-2.5 ${
                    isDark ? 'border-white/10' : 'border-slate-50'
                  }`}
                >
                  <div className="min-w-0 pr-3">
                    <div className={`text-sm font-semibold ${textSecondary}`}>{item.name}</div>
                    <div className={`text-[11px] ${textMuted}`}>
                      หน่วยกิต: {item.credits}
                      {announced
                        ? ` • ${fmtScore(item.score)}/${fmtScore(item.max_score)} คะแนน`
                        : ' • อาจารย์ยังไม่ประกาศคะแนน'}
                      {announced && pending > 0 && ` • รอประกาศอีก ${pending} หัวข้อ`}
                    </div>
                  </div>
                  {announced ? (
                    <span className={`text-sm font-extrabold px-2.5 py-1 rounded-full shrink-0 ${grade.chip} ${grade.color}`}>
                      {grade.label}
                    </span>
                  ) : (
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                      isDark ? 'bg-white/[0.06] text-white/50' : 'bg-slate-100 text-slate-400'
                    }`}>
                      ยังไม่ประกาศ
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* MODAL: Exam Schedule */}
      <Modal isOpen={activeModal === 'exam'} onClose={() => setActiveModal(null)} title="กำหนดการสอบ" icon={CalendarDays} tone="rose">
        <NotOpenYet
          icon={CalendarDays}
          what="ตารางสอบ"
          detail="ฝ่ายวิชาการยังไม่ได้ประกาศกำหนดการสอบผ่านแอป เมื่อประกาศแล้วจะขึ้นที่นี่พร้อมวัน เวลา และห้องสอบของห้องคุณเอง"
          meanwhile="ระหว่างนี้ดูประกาศจากบอร์ดหน้าห้องวิชาการ หรือถามครูที่ปรึกษา"
          isDark={isDark}
        />
      </Modal>

      {/* MODAL: E-Document */}
      <Modal isOpen={activeModal === 'edoc'} onClose={() => setActiveModal(null)} title="เอกสารอิเล็กทรอนิกส์" icon={FileText} tone="cyan">
        <NotOpenYet
          icon={FileText}
          what="การขอเอกสารออนไลน์"
          detail="ใบรับรองการเป็นนักเรียน ทรานสคริปต์ และวุฒิการศึกษา ยังขอผ่านแอปไม่ได้ ต้องให้ฝ่ายทะเบียนออกให้และลงนามก่อน"
          meanwhile="ขอได้ที่ฝ่ายทะเบียน อาคาร 1 ชั้น 1 ในวันและเวลาราชการ"
          isDark={isDark}
        />
      </Modal>
    </div>
  );
}
