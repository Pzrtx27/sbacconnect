import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, QrCode, Receipt, CheckCircle2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { showToast } from '../ui/Toast';
import {
  PROMPTPAY_ID,
  PROMPTPAY_ACCOUNT_NAME,
  PROMPTPAY_ID_DIGITS,
  isPromptPayConfigured,
  isPromptPayIdValid,
} from '../../config/promptpay';
import { buildPromptPayPayload } from '../../utils/promptpay';
import { formatBaht } from '../../utils/identity';
import { FEE_STATUS_LABELS, feeErrorMessage } from '../../hooks/useStudentFees';

/* เนื้อหาของโมดัล "รายการค้างชำระ" ฝั่งนักเรียน (43_student_fees.sql)

   QR สร้างที่เครื่องผู้ใช้ด้วย buildPromptPayPayload() ตามมาตรฐาน EMVCo ของ ธปท.
   ฝังยอดของบิลใบนั้นไว้ในตัว QR เลย นักเรียนจะได้ไม่ต้องพิมพ์ยอดเอง (พิมพ์ผิด = โอนผิด)

   ระบบไม่ตัดเงินเอง: กด "แจ้งชำระเงินแล้ว" เป็นแค่การบอกฝ่ายการเงินให้ไปเช็คเงินเข้าบัญชี
   สถานะจะยังเป็น "รอตรวจสอบ" จนกว่าการเงินจะกดยืนยัน — เขียนไว้บนจอให้ชัดตรงนี้
   ไม่งั้นนักเรียนจะเข้าใจว่ากดแล้วจบ แล้วไม่ตามเรื่องต่อ */

const STATUS_CHIP = {
  unpaid: 'bg-rose-500/10 text-accent-rose border-rose-500/20',
  pending: 'bg-amber-500/10 text-accent-amber border-amber-500/20',
  paid: 'bg-emerald-500/10 text-accent-emerald border-emerald-500/20',
  waived: 'bg-indigo-500/10 text-brand border-indigo-500/20',
};

// 'YYYY-MM-DD' -> '30 ก.ย. 2569' (ตรึงเที่ยงวัน UTC กันวันเพี้ยนข้ามเขตเวลา เหมือน utils/timetable)
function thaiDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${iso}T12:00:00Z`));
}

export default function FeePaymentPanel({ fees, loading, error, summary, reportTransfer, reportingId }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [openFeeId, setOpenFeeId] = useState(null);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const rowClass = isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50/50 border-slate-100';

  const handleReport = async (fee) => {
    const result = await reportTransfer(fee.id);

    if (!result.ok) {
      showToast(feeErrorMessage(result.error), 'error');
      return;
    }

    showToast('แจ้งชำระเงินแล้ว — ฝ่ายการเงินจะตรวจสอบเงินเข้าบัญชีและยืนยันให้', 'success');
    setOpenFeeId(null);
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-20 rounded-2xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 rounded-2xl border text-xs font-semibold leading-relaxed ${
        isDark ? 'bg-amber-500/5 border-amber-500/20 text-accent-amber' : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}>
        {feeErrorMessage(error)}
      </div>
    );
  }

  const hasOutstanding = summary.hasOutstanding;

  return (
    <div className="space-y-5">
      {/* ยอดรวมค้างชำระ — สีแดงเมื่อค้างจริง ไม่ใช่เขียว 0 THB ตายตัวเหมือนของเดิม */}
      <div className="text-center space-y-2">
        <div className={`inline-flex p-4 border rounded-full ${
          hasOutstanding
            ? (isDark ? 'bg-rose-900/30 border-rose-800/30 text-accent-rose' : 'bg-rose-50 border-rose-100 text-accent-rose')
            : (isDark ? 'bg-emerald-900/30 border-emerald-800/30 text-accent-emerald' : 'bg-emerald-50 border-emerald-100 text-accent-emerald')
        }`}>
          <Receipt size={32} />
        </div>

        <h3 className={`text-3xl font-extrabold ${hasOutstanding ? 'text-accent-rose' : 'text-accent-emerald'}`}>
          {formatBaht(summary.outstandingSatang)} ฿
        </h3>

        <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${
          hasOutstanding
            ? (isDark ? 'bg-rose-900/30 text-accent-rose' : 'bg-rose-50 text-accent-rose')
            : (isDark ? 'bg-emerald-900/30 text-accent-emerald' : 'bg-emerald-50 text-accent-emerald')
        }`}>
          {hasOutstanding
            ? `ค้างชำระ ${summary.unpaidCount + summary.pendingCount} รายการ`
            : '✓ ไม่มีรายการค้างชำระ'}
        </span>

        {summary.overdueCount > 0 && (
          <p className="text-[12px] font-bold text-accent-rose">
            เลยกำหนดชำระแล้ว {summary.overdueCount} รายการ — กรุณาติดต่อฝ่ายการเงิน
          </p>
        )}
      </div>

      {/* เช็ค isPromptPayIdValid ไม่ใช่แค่ isPromptPayConfigured
          เลขที่กรอกไว้แต่ผิดรูปแบบก็สร้าง QR ไม่ได้เหมือนกัน แต่ของเดิมเงียบสนิท
          นักเรียนจะเห็นแค่ช่อง QR ว่างเปล่าโดยไม่มีอะไรบอกว่าทำไม */}
      {!isPromptPayIdValid && (
        <div className={`p-3 rounded-2xl border flex gap-2 ${
          isDark ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'
        }`}>
          <AlertTriangle className="text-accent-amber shrink-0" size={18} aria-hidden="true" />
          <p className={`text-[11px] font-semibold leading-relaxed ${textMuted}`}>
            {isPromptPayConfigured
              ? `เลขพร้อมเพย์ที่ตั้งไว้ไม่ถูกรูปแบบ (VITE_PROMPTPAY_ID ตอนนี้มี ${PROMPTPAY_ID_DIGITS} หลัก ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก)`
              : 'ยังไม่ได้ตั้งค่าบัญชีพร้อมเพย์ของวิทยาลัย (VITE_PROMPTPAY_ID)'}
            {' '}— ตอนนี้จ่ายผ่าน QR ในแอปไม่ได้ ให้ติดต่อฝ่ายการเงินโดยตรง
          </p>
        </div>
      )}

      {fees.length === 0 ? (
        <p className={`text-xs text-center ${textMuted}`}>ยังไม่มีรายการค่าธรรมเนียมในระบบ</p>
      ) : (
        <div className="space-y-3">
          {fees.map((fee) => {
            const amountBaht = fee.amount_satang / 100;
            const qrPayload = isPromptPayConfigured ? buildPromptPayPayload(PROMPTPAY_ID, amountBaht) : null;
            const isOpen = openFeeId === fee.id;

            return (
              <div key={fee.id} className={`p-3 rounded-2xl border space-y-2.5 ${rowClass}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`text-sm font-extrabold ${textPrimary}`}>{fee.title}</div>
                    <div className={`text-[11px] font-semibold ${textMuted}`}>
                      เทอม {fee.term}
                      {fee.due_date && (
                        <span className={fee.is_overdue ? 'text-accent-rose' : ''}>
                          {' · '}ครบกำหนด {thaiDate(fee.due_date)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className={`text-sm font-extrabold ${textPrimary}`}>{formatBaht(fee.amount_satang)} ฿</div>
                    <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border mt-0.5 ${STATUS_CHIP[fee.status]}`}>
                      {FEE_STATUS_LABELS[fee.status] || fee.status}
                    </span>
                  </div>
                </div>

                {fee.status === 'unpaid' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOpenFeeId(isOpen ? null : fee.id)}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-extrabold py-2 rounded-xl bg-brand/10 text-brand border border-brand/20 active:scale-[0.99] transition-all"
                    >
                      <QrCode size={14} />
                      {isOpen ? 'ปิดคิวอาร์' : 'จ่ายด้วยคิวอาร์พร้อมเพย์'}
                    </button>

                    {isOpen && (
                      <div className={`rounded-2xl border p-4 text-center space-y-2 ${
                        isDark ? 'bg-neutral-900/60 border-white/10' : 'bg-surface-card border-slate-100'
                      }`}>
                        {qrPayload ? (
                          <>
                            <div className="bg-white p-3 rounded-xl inline-block">
                              <QRCodeSVG value={qrPayload} size={176} level="M" marginSize={0} />
                            </div>
                            <p className={`text-xs font-bold ${textPrimary}`}>
                              สแกนด้วยแอปธนาคาร — ยอด {formatBaht(fee.amount_satang)} บาท
                            </p>
                            {PROMPTPAY_ACCOUNT_NAME && (
                              <p className={`text-[12px] font-semibold ${textMuted}`}>บัญชี: {PROMPTPAY_ACCOUNT_NAME}</p>
                            )}
                            <p className={`text-[11px] leading-relaxed ${textMuted}`}>
                              คิวอาร์ฝังยอดไว้ให้แล้ว ไม่ต้องพิมพ์จำนวนเงินเอง
                              โอนเสร็จแล้วเก็บสลิปไว้ด้วยเผื่อฝ่ายการเงินขอตรวจสอบ
                            </p>

                            <button
                              type="button"
                              onClick={() => handleReport(fee)}
                              disabled={reportingId === fee.id}
                              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-extrabold py-3 rounded-xl text-sm transition-all shadow-button flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle2 size={16} />
                              {reportingId === fee.id ? 'กำลังแจ้ง...' : 'แจ้งชำระเงินแล้ว'}
                            </button>
                            <p className={`text-[10px] ${textMuted}`}>กดปุ่มนี้เมื่อโอนเงินเรียบร้อยแล้วเท่านั้น</p>
                          </>
                        ) : (
                          <p className={`text-[12px] font-semibold ${textMuted}`}>
                            สร้างคิวอาร์ไม่สำเร็จ — ตรวจรูปแบบเลขพร้อมเพย์ในการตั้งค่าระบบ
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {fee.status === 'pending' && (
                  <p className={`text-[11px] font-semibold leading-relaxed ${textMuted}`}>
                    แจ้งชำระแล้ว กำลังรอฝ่ายการเงินตรวจสอบเงินเข้าบัญชี — ไม่ต้องโอนซ้ำ
                    ถ้าเกินสองวันทำการยังไม่ขึ้นว่าชำระแล้ว ให้ติดต่อฝ่ายการเงินพร้อมสลิป
                  </p>
                )}

                {fee.note && (
                  <p className={`text-[11px] ${textMuted}`}>หมายเหตุ: {fee.note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
