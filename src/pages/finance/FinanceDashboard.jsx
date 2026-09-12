import { useEffect, useMemo, useState } from 'react';
import { Wallet, ClipboardCheck, AlertCircle, FilePlus2, CheckCircle2, XCircle, GraduationCap, Users } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../../components/layout/PageHeader';
import TabNav from '../../components/layout/TabNav';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useFinanceFees, useFeeIssuing, financeErrorMessage } from '../../hooks/useFinanceFees';
import { FEE_STATUS_LABELS } from '../../hooks/useStudentFees';
import { formatBaht } from '../../utils/identity';

/* หน้าจอฝ่ายการเงิน — ค่าเทอม/ค่าธรรมเนียม (43_student_fees.sql, 44_finance_console.sql)

   ก่อนหน้านี้งานทั้งหมดนี้ทำผ่าน Supabase SQL Editor: ออกบิลด้วย create_class_fees()
   ยืนยันการจ่ายด้วย set_fee_status(id, 'paid') โดยต้องพิมพ์ id บิลเองไม่ให้ผิด
   คนที่ทำงานการเงินจริงไม่ได้เปิด SQL Editor เป็น ฟีเจอร์จึงเท่ากับไม่มี

   สามแท็บ = สามงานที่ทำจริงในแต่ละวัน:
     รอตรวจสอบ — เด็กแจ้งโอนมาแล้ว เทียบกับเงินเข้าบัญชีแล้วกดยืนยัน
     ค้างชำระ  — ใครยังไม่จ่าย ใครเลยกำหนด (รับเงินสดที่เคาน์เตอร์ก็กดจากตรงนี้)
     ออกบิล    — ต้นเทอมออกบิลทั้งห้องทีเดียว ติ๊กออกเฉพาะเด็กทุนได้

   ทุกปุ่มที่กดแล้วมีผลกับเงิน จะถามยืนยันก่อนเสมอ เพราะทุกการกดส่งแจ้งเตือน
   ถึงนักเรียนทันที กดผิดแล้วเด็กจะได้ข้อความผิด ๆ ไปแล้วถึงจะแก้กลับได้ */

const TITLE_PRESETS = ['ค่าเทอม', 'ค่าอุปกรณ์การเรียน', 'ค่ากิจกรรมพิเศษ', 'ค่าชุดนักเรียน'];

const STATUS_CHIP = {
  unpaid: 'bg-rose-500/10 text-accent-rose border-rose-500/20',
  pending: 'bg-amber-500/10 text-accent-amber border-amber-500/20',
  paid: 'bg-emerald-500/10 text-accent-emerald border-emerald-500/20',
  waived: 'bg-indigo-500/10 text-brand border-indigo-500/20',
};

function thaiDateTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function thaiDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${iso}T12:00:00Z`));
}

export default function FinanceDashboard() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { confirm, confirmDialog } = useConfirm();
  const { user } = useAuth();

  /* ปุ่มย้อนกลับต้องพากลับ "หน้าหลักของคนที่เข้ามา" ไม่ใช่หน้าเดียวตายตัว
     บัญชีเคาน์เตอร์ (role barista) อยู่ในเปลือกเต็มจอที่ไม่มีเมนูใด ๆ เลย
     ถ้าส่งไป /academic จะโดน redirect กลับ /barista อีกที = ปุ่มดูเหมือนพัง

     ต้องดู roles ทั้งอาร์เรย์ ไม่ใช่ role เดียว เพราะ AuthContext ยุบทั้ง pos
     และ cashier เป็นชื่อ 'barista' เหมือนกัน แต่สองคนนี้กลับคนละที่:
       มี pos ด้วย     -> เป็นคนหน้าร้านจริง กลับไปคิวกาแฟได้
       cashier ล้วน    -> /barista คือจอ "ไม่มีสิทธิ์ดูคิวหน้าร้าน" ซึ่งไม่มีทางออก
                          หน้านี้คือบ้านของเขาอยู่แล้ว จึงไม่ต้องมีปุ่มย้อนกลับเลย */
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isFullScreenShell = String(user?.role || '').toLowerCase() === 'barista';
  const backTo = isFullScreenShell
    ? (roles.includes('pos') ? '/barista' : null)
    : '/academic';

  const [activeTab, setActiveTab] = useState('pending');

  // แท็บ "ออกบิล" ไม่ได้ใช้คิว แต่ยังต้องการ summary ไว้ทำป้ายตัวเลขบนแท็บ
  const queueStatus = activeTab === 'unpaid' ? 'unpaid' : 'pending';
  const queue = useFinanceFees(queueStatus);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const cardClass = isDark ? 'bg-neutral-900/60 border-white/10' : 'bg-surface-card border-slate-100 shadow-sm';
  const rowClass = isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50/50 border-slate-100';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  const tabs = [
    { id: 'pending', label: 'รอตรวจสอบ', icon: ClipboardCheck, badge: queue.summary.pending_count },
    { id: 'unpaid', label: 'ค้างชำระ', icon: AlertCircle, badge: queue.summary.unpaid_count },
    { id: 'issue', label: 'ออกบิล', icon: FilePlus2 },
  ];

  const handleSetStatus = async (fee, nextStatus, dialog) => {
    const ok = await confirm(dialog);
    if (!ok) return;

    const result = await queue.setFeeStatus(fee.id, nextStatus);

    if (!result.ok) {
      showToast(financeErrorMessage(result.error), 'error');
      return;
    }
    showToast(`อัปเดต ${fee.student_name} เรียบร้อย — แจ้งเตือนนักเรียนแล้ว`, 'success');
  };

  const confirmPaid = (fee) =>
    handleSetStatus(fee, 'paid', {
      title: 'ยืนยันว่าได้รับเงินแล้ว?',
      message: `${fee.student_name} — ${fee.title} ${fee.term} จำนวน ${formatBaht(fee.amount_satang)} บาท`,
      detail: 'ตรวจให้แน่ใจว่าเงินเข้าบัญชีจริงก่อนกดยืนยัน นักเรียนจะได้รับแจ้งเตือนว่าชำระครบแล้วทันที',
      confirmLabel: 'ยืนยันรับเงิน',
    });

  const rejectToUnpaid = (fee) =>
    handleSetStatus(fee, 'unpaid', {
      title: 'ตีกลับเป็นค้างชำระ?',
      message: `${fee.student_name} — ${fee.title} ${fee.term} จำนวน ${formatBaht(fee.amount_satang)} บาท`,
      detail: 'ใช้เมื่อตรวจแล้วไม่พบเงินเข้าบัญชีตามที่แจ้ง นักเรียนจะได้รับแจ้งเตือนให้ติดต่อฝ่ายการเงินพร้อมสลิป',
      confirmLabel: 'ตีกลับ',
      danger: true,
    });

  const waiveFee = (fee) =>
    handleSetStatus(fee, 'waived', {
      title: 'ยกเว้นค่าธรรมเนียมรายการนี้?',
      message: `${fee.student_name} — ${fee.title} ${fee.term} จำนวน ${formatBaht(fee.amount_satang)} บาท`,
      detail: 'ใช้กับนักเรียนทุนหรือกรณีที่วิทยาลัยยกเว้นให้ ยอดนี้จะไม่ถูกนับเป็นค้างชำระอีก',
      confirmLabel: 'ยกเว้นให้',
    });

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Wallet}
        title="ฝ่ายการเงิน"
        tone="emerald"
        backTo={backTo}
        backLabel={backTo === '/barista' ? 'กลับหน้าคิวร้านกาแฟ' : 'กลับหน้าฝ่ายวิชาการ'}
      />

      <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} ariaLabel="หมวดงานฝ่ายการเงิน" />

      {/* ตัวเลขรวมทั้งระบบ ไม่ใช่เฉพาะที่กรองอยู่ — เห็นภาพรวมโดยไม่ต้องสลับแท็บ

          บนมือถือเรียงลงเป็นแถว ไม่ใช่สามคอลัมน์
          ของเดิมเป็น grid-cols-3 ตายตัว วัดจริงบนจอ 375: ยอดหลักล้าน (3,400,500.00)
          กว้าง 113px ในกล่องที่มีที่ว่างจริง 82px ตัวเลขจึงดันจนทั้งหน้าเลื่อนซ้ายขวาได้
          (documentElement.scrollWidth = 379 บนจอ 375) ล้นตั้งแต่ยอดหกหลักขึ้นไป
          ยัดสามคอลัมน์ให้พอดีต้องลดตัวอักษรเหลือราว 10px ซึ่งอ่านไม่ออกอยู่ดี
          และขัดกับหลักของโปรเจกต์เองที่เขียนไว้ว่าเน้นอ่านง่ายบนมือถือ

          เรียงลงแล้วแต่ละยอดได้เต็มความกว้าง เทียบกันได้เหมือนเดิมเพราะอยู่ติดกัน
          พอถึง sm ค่อยกลับไปสามคอลัมน์ซึ่งมีที่พอจริง

          tabular-nums บังคับให้ตัวเลขทุกตัวกว้างเท่ากัน หลักจึงตรงกันทุกแถว
          ไม่งั้น 1 กับ 8 กว้างไม่เท่ากัน แล้วสายตาเทียบยอดผิด */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {[
          { value: queue.summary.pending_satang, tone: 'text-accent-amber', label: `รอตรวจสอบ (${queue.summary.pending_count})` },
          { value: queue.summary.unpaid_satang, tone: 'text-accent-rose', label: `ค้างชำระ (${queue.summary.unpaid_count})` },
          { value: queue.summary.paid_satang, tone: 'text-accent-emerald', label: 'เก็บได้แล้วทั้งหมด' },
        ].map((item) => (
          <div
            key={item.label}
            className={`px-4 py-3 rounded-2xl border flex items-center justify-between gap-3 sm:block sm:text-center ${cardClass}`}
          >
            <span className={`text-[11px] font-bold sm:hidden ${textMuted}`}>{item.label}</span>
            <span className={`text-lg font-extrabold tabular-nums whitespace-nowrap ${item.tone}`}>
              {formatBaht(item.value)}
            </span>
            <span className={`text-[11px] font-bold mt-1 hidden sm:block ${textMuted}`}>{item.label}</span>
          </div>
        ))}
      </div>

      {queue.error && activeTab !== 'issue' && (
        <div className={`p-4 rounded-2xl border text-xs font-semibold leading-relaxed ${
          isDark ? 'bg-amber-500/5 border-amber-500/20 text-accent-amber' : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {financeErrorMessage(queue.error)}
        </div>
      )}

      {activeTab !== 'issue' && !queue.error && (
        <div id="panel-queue" className="space-y-3">
          {queue.loading ? (
            <div className="py-10">
              <LoadingSpinner text="กำลังโหลดรายการ..." />
            </div>
          ) : queue.fees.length === 0 ? (
            <div className={`p-6 rounded-2xl border text-center ${rowClass}`}>
              <CheckCircle2 className="text-accent-emerald mx-auto mb-2" size={28} />
              <p className={`text-xs font-bold ${textPrimary}`}>
                {activeTab === 'pending' ? 'ไม่มีรายการรอตรวจสอบ' : 'ไม่มีรายการค้างชำระ'}
              </p>
              <p className={`text-[11px] mt-1 ${textMuted}`}>
                {activeTab === 'pending'
                  ? 'รายการจะขึ้นที่นี่เองทันทีที่นักเรียนกดแจ้งชำระเงิน'
                  : 'ถ้าเพิ่งเริ่มใช้ ให้ไปที่แท็บ "ออกบิล" เพื่อออกบิลค่าเทอมให้นักเรียนก่อน'}
              </p>
            </div>
          ) : (
            queue.fees.map((fee) => (
              <div key={fee.id} className={`p-3.5 rounded-2xl border space-y-3 ${rowClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm font-extrabold ${textPrimary}`}>{fee.student_name}</div>
                    <div className={`text-[11px] font-semibold ${textMuted}`}>
                      {fee.student_code || '—'}
                      {fee.class_label ? ` · ${fee.class_label}` : ''}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`text-sm font-extrabold ${textPrimary}`}>{formatBaht(fee.amount_satang)} ฿</div>
                    <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border mt-0.5 ${STATUS_CHIP[fee.status]}`}>
                      {FEE_STATUS_LABELS[fee.status] || fee.status}
                    </span>
                  </div>
                </div>

                <div className={`text-[11px] font-semibold ${textMuted}`}>
                  {fee.title} · เทอม {fee.term}
                  {fee.due_date && (
                    <span className={fee.is_overdue ? 'text-accent-rose font-bold' : ''}>
                      {' · '}ครบกำหนด {thaiDate(fee.due_date)}{fee.is_overdue ? ' (เลยกำหนด)' : ''}
                    </span>
                  )}
                  {fee.reported_at && <> · แจ้งโอนเมื่อ {thaiDateTime(fee.reported_at)}</>}
                </div>

                {fee.note && <p className={`text-[11px] ${textMuted}`}>หมายเหตุ: {fee.note}</p>}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => confirmPaid(fee)}
                    disabled={queue.savingId === fee.id}
                    className="flex items-center justify-center gap-1.5 text-xs font-extrabold py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white transition-all active:scale-[0.99]"
                  >
                    <CheckCircle2 size={14} />
                    {fee.status === 'pending' ? 'ยืนยันรับเงิน' : 'รับเงินสดแล้ว'}
                  </button>

                  {fee.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => rejectToUnpaid(fee)}
                      disabled={queue.savingId === fee.id}
                      className="flex items-center justify-center gap-1.5 text-xs font-extrabold py-2.5 rounded-xl bg-rose-500/10 text-accent-rose border border-rose-500/20 disabled:opacity-50 transition-all active:scale-[0.99]"
                    >
                      <XCircle size={14} />
                      ไม่พบเงินเข้า
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => waiveFee(fee)}
                      disabled={queue.savingId === fee.id}
                      className="flex items-center justify-center gap-1.5 text-xs font-extrabold py-2.5 rounded-xl bg-indigo-500/10 text-brand border border-indigo-500/20 disabled:opacity-50 transition-all active:scale-[0.99]"
                    >
                      <GraduationCap size={14} />
                      ยกเว้นให้
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'issue' && (
        <IssueFeesPanel
          isDark={isDark}
          textPrimary={textPrimary}
          textMuted={textMuted}
          rowClass={rowClass}
          bgInput={bgInput}
          confirm={confirm}
          onIssued={queue.reload}
        />
      )}

      {confirmDialog}
    </div>
  );
}

/* ---------------------------------------------------------------
   แท็บออกบิล — เลือกห้อง แล้วติ๊กว่าจะออกให้ใครบ้าง
   ค่าเทอมออกพร้อมกันทั้งห้องเป็นปกติ จึงติ๊กมาให้ทุกคนไว้ก่อน
   แล้วค่อยเอาออกเฉพาะเด็กทุน ไม่ใช่ให้ไล่ติ๊กทีละสี่สิบคน
   --------------------------------------------------------------- */
function IssueFeesPanel({ isDark, textPrimary, textMuted, rowClass, bgInput, confirm, onIssued }) {
  const issuing = useFeeIssuing();

  const [title, setTitle] = useState('ค่าเทอม');
  const [amountBaht, setAmountBaht] = useState('');
  const [term, setTerm] = useState('1/2569');
  const [dueDate, setDueDate] = useState('');
  const [excluded, setExcluded] = useState({}); // { [user_id]: true } = ไม่ออกบิลให้คนนี้

  /* บอก hook ว่ากำลังจะออกบิลชื่ออะไรของเทอมไหน เพื่อให้ DB ตอบกลับมาว่า
     ใครมีบิลใบนี้อยู่แล้วและอยู่ในสถานะไหน (hook หน่วง 300ms ให้เอง) */
  const { setFeeKey } = issuing;
  useEffect(() => {
    setFeeKey({ term, title: title.trim() });
  }, [setFeeKey, term, title]);

  /* บิลที่จบแล้ว ห้ามออกทับ — ฝั่ง DB กันไว้แล้ว (47_fee_guard_and_log.sql)
     แต่หน้าจอต้องไม่หลอกให้กดตั้งแต่แรก ไม่งั้นกดแล้วได้ผลว่า "ข้าม 12 คน"
     ซึ่งอ่านเหมือนระบบพัง ทั้งที่มันทำถูก */
  const isSettled = (s) => s.existing_status === 'paid' || s.existing_status === 'waived';

  const selectedIds = useMemo(
    () =>
      issuing.students
        .filter((s) => !isSettled(s) && !excluded[s.user_id])
        .map((s) => s.user_id),
    [issuing.students, excluded],
  );

  const settledCount = useMemo(
    () => issuing.students.filter(isSettled).length,
    [issuing.students],
  );
  const selectableCount = issuing.students.length - settledCount;

  const amountValue = Number(amountBaht);
  const amountSatang = Math.round(amountValue * 100);
  const isValid = title.trim() !== '' && amountValue > 0 && selectedIds.length > 0;

  const toggle = (userId) => setExcluded((prev) => ({ ...prev, [userId]: !prev[userId] }));
  const selectAll = () => setExcluded({});
  const clearAll = () =>
    setExcluded(Object.fromEntries(issuing.students.map((s) => [s.user_id, true])));

  const handleIssue = async () => {
    const ok = await confirm({
      title: 'ออกบิลให้นักเรียนที่เลือก?',
      message: `${title.trim()} เทอม ${term} คนละ ${formatBaht(amountSatang)} บาท — ${selectedIds.length} คน`,
      detail: 'นักเรียนทุกคนที่เลือกจะได้รับแจ้งเตือน "มีรายการค้างชำระใหม่" ทันที คนที่มีบิลชื่อเดิมของเทอมเดิมอยู่แล้วจะถูกแก้ยอดแทนการออกใบใหม่',
      confirmLabel: 'ออกบิล',
    });
    if (!ok) return;

    const result = await issuing.issue({
      studentIds: selectedIds,
      title: title.trim(),
      amountSatang,
      term,
      dueDate,
    });

    if (!result.ok) {
      showToast(financeErrorMessage(result.error), 'error');
      return;
    }

    /* รายงานตามจริงทุกช่อง รวม skipped กับ failed ที่ของเดิมไม่เคยเอามาแสดง
       ของเดิมถ้าไม่มีใบใหม่เลยจะขึ้นว่า "อัปเดตยอดให้แทน" เสมอ ทั้งที่บางคน
       อาจถูกข้ามเพราะจ่ายไปแล้ว หรือหลุดเพราะ uuid ไม่ใช่นักเรียน */
    const parts = [];
    if (result.created > 0) parts.push(`ออกบิลใหม่ ${result.created} ใบ`);
    if (result.updated > 0) parts.push(`แก้ยอดบิลเดิม ${result.updated} ใบ`);
    if (result.skipped > 0) parts.push(`ข้าม ${result.skipped} คน (ชำระแล้ว/ยกเว้น)`);
    if (result.failed > 0) parts.push(`ไม่สำเร็จ ${result.failed} คน`);

    showToast(
      parts.length > 0
        ? parts.join(' · ') + (result.created > 0 ? ' — แจ้งเตือนนักเรียนแล้ว' : '')
        : 'ไม่มีอะไรเปลี่ยนแปลง',
      result.failed > 0 ? 'info' : 'success',
    );
    onIssued?.();
  };

  if (issuing.loading && issuing.students.length === 0) {
    return (
      <div className="py-10">
        <LoadingSpinner text="กำลังโหลดรายชื่อห้องเรียน..." />
      </div>
    );
  }

  if (issuing.error) {
    return (
      <div className={`p-4 rounded-2xl border text-xs font-semibold leading-relaxed ${
        isDark ? 'bg-amber-500/5 border-amber-500/20 text-accent-amber' : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}>
        {financeErrorMessage(issuing.error)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* รายละเอียดบิล */}
      <div className={`p-4 rounded-2xl border space-y-3 ${rowClass}`}>
        <div className="space-y-1.5">
          <label className={`text-[11px] font-bold block ${textMuted}`}>ชื่อรายการ</label>
          <div className="flex flex-wrap gap-1.5">
            {TITLE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTitle(preset)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                  title === preset
                    ? 'bg-sbac-blue text-white border-sbac-blue'
                    : isDark
                      ? 'border-white/15 text-content-secondary'
                      : 'border-slate-200 text-ink-secondary'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ค่าเทอม"
            className={`w-full border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none ${bgInput}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={`text-[11px] font-bold block ${textMuted}`}>จำนวนเงิน (บาท/คน)</label>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              value={amountBaht}
              onChange={(e) => setAmountBaht(e.target.value)}
              placeholder="2500"
              className={`w-full border rounded-xl px-3 py-2 text-sm font-bold focus:outline-none ${bgInput}`}
            />
          </div>

          <div className="space-y-1.5">
            <label className={`text-[11px] font-bold block ${textMuted}`}>ภาคเรียน</label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="1/2569"
              className={`w-full border rounded-xl px-3 py-2 text-sm font-bold focus:outline-none ${bgInput}`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={`text-[11px] font-bold block ${textMuted}`}>ครบกำหนดชำระ (ไม่ใส่ก็ได้)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={`w-full border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none ${bgInput}`}
          />
        </div>
      </div>

      {/* เลือกห้อง + รายชื่อ */}
      <div className={`p-4 rounded-2xl border space-y-3 ${rowClass}`}>
        <div className="space-y-1.5">
          <label className={`text-[11px] font-bold block ${textMuted}`}>ห้องเรียน</label>
          <select
            value={issuing.classRoomId || ''}
            onChange={(e) => {
              issuing.setClassRoomId(Number(e.target.value));
              setExcluded({}); // เปลี่ยนห้องแล้วเริ่มติ๊กใหม่ทั้งหมด กันเผลอถือรายชื่อห้องเก่าไว้
            }}
            className={`w-full border rounded-xl px-3 py-2 text-sm font-bold focus:outline-none ${bgInput}`}
          >
            {issuing.classRooms.map((room) => (
              <option key={room.id} value={room.id}>{room.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-bold ${textMuted}`}>
            เลือกแล้ว {selectedIds.length}/{selectableCount} คน
            {settledCount > 0 && ` · ชำระแล้ว ${settledCount} คน`}
          </span>
          <div className="flex gap-1.5">
            <button type="button" onClick={selectAll} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-accent-emerald border border-emerald-500/20">
              เลือกทั้งห้อง
            </button>
            <button type="button" onClick={clearAll} className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-500/10 text-accent-rose border border-rose-500/20">
              ไม่เลือกเลย
            </button>
          </div>
        </div>

        {issuing.students.length === 0 ? (
          <div className={`p-4 rounded-xl text-center text-xs font-semibold ${textMuted}`}>
            <Users className="mx-auto mb-2 opacity-60" size={24} />
            ห้องนี้ยังไม่มีรายชื่อนักเรียนในระบบ
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
            {issuing.students.map((student) => {
              const settled = isSettled(student);
              const picked = !settled && !excluded[student.user_id];
              return (
                <label
                  key={student.user_id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                    settled
                      ? `cursor-not-allowed opacity-60 ${isDark ? 'bg-white/[0.02] border-white/10' : 'bg-slate-50 border-slate-100'}`
                      : picked
                        ? `cursor-pointer ${isDark ? 'bg-sbac-blue/10 border-sbac-blue/30' : 'bg-sbac-blue/5 border-sbac-blue/20'}`
                        : `cursor-pointer ${isDark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-slate-100'}`
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={settled}
                    onChange={() => toggle(student.user_id)}
                    className="w-4 h-4 accent-sbac-blue shrink-0 disabled:cursor-not-allowed"
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-bold truncate ${textPrimary}`}>{student.full_name}</div>
                    <div className={`text-[10px] font-semibold ${textMuted}`}>{student.student_code}</div>
                  </div>
                  {/* ล็อกไว้ไม่ให้ออกบิลทับ พร้อมบอกเหตุผล
                      ของเดิมติ๊กคนกลุ่มนี้มาให้ด้วย แล้วกดออกบิลทีเดียวยอดที่จ่ายไปแล้วเปลี่ยน */}
                  {settled && (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md shrink-0 ${
                      student.existing_status === 'paid'
                        ? 'bg-emerald-500/10 text-accent-emerald'
                        : 'bg-violet-500/10 text-accent-violet'
                    }`}>
                      {student.existing_status === 'paid' ? 'ชำระแล้ว' : 'ยกเว้น'}
                    </span>
                  )}
                  {student.outstanding_satang > 0 && (
                    <span className="text-[10px] font-bold text-accent-rose shrink-0">
                      ค้าง {formatBaht(student.outstanding_satang)} ฿
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleIssue}
        disabled={!isValid || issuing.issuing}
        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:hover:bg-emerald-500 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-button flex items-center justify-center gap-1.5"
      >
        <FilePlus2 size={16} />
        {issuing.issuing
          ? 'กำลังออกบิล...'
          : isValid
            ? `ออกบิล ${selectedIds.length} คน · รวม ${formatBaht(amountSatang * selectedIds.length)} ฿`
            : 'กรอกชื่อรายการ จำนวนเงิน และเลือกนักเรียน'}
      </button>
    </div>
  );
}
