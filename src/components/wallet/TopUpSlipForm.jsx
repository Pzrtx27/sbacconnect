import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../config/supabase';
import { showToast } from '../ui/Toast';
import { PROMPTPAY_ID, PROMPTPAY_ACCOUNT_NAME, isPromptPayConfigured } from '../../config/promptpay';
import { buildPromptPayPayload } from '../../utils/promptpay';
import { validateSlipFile, anonymousFileName, slipErrorText, MAX_SLIP_BYTES } from '../../utils/slipFile';
import { TOPUP_STATUS_TEXT, TOPUP_STATUS_COLOR, topupErrorText } from '../../utils/topup';
import { Camera, UploadCloud, X, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

const STORAGE_BUCKET = 'topup-slips';
const MAX_TOPUP_BAHT = 20000; // เพดานกันพิมพ์ผิด/ทดสอบ ไม่ใช่ข้อจำกัดทางธุรกิจตายตัว

/* ฟอร์มเติมเงินด้วย QR พร้อมเพย์ + แนบสลิปโอนเงิน (18_topup_requests.sql)

   ขั้นตอน: กรอกจำนวนเงิน -> สแกน QR ด้วยแอปธนาคารแล้วโอนจริง -> ถ่าย/เลือกรูปสลิป
   -> กดส่ง = ส่งเป็น "คำขอ" สถานะ pending -> เจ้าหน้าที่การเงินตรวจสลิปแล้วกดอนุมัติ
   -> เงินเข้าบัตรตอนนั้น

   เดิมฟอร์มนี้เรียก topup_qr_instant() ซึ่งเติมเงินทันทีโดยเชื่อยอดที่ผู้ใช้พิมพ์เอง
   ไม่มีใครตรวจ ถอดออกแล้วเพราะนักเรียนยิง RPC ตรงจาก DevTools วนลูปได้เงินไม่จำกัด
   ฟังก์ชันนั้นยังอยู่ใน DB แต่ไม่มีอะไรในแอปเรียกใช้แล้ว */
export default function TopUpSlipForm() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [amountBaht, setAmountBaht] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileMeta, setFileMeta] = useState(null); // { ext, mime } จาก magic-byte sniff
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [checkingFile, setCheckingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [recentRequests, setRecentRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  const fileInputRef = useRef(null);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const boxClass = isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100';
  const inputClass = isDark
    ? 'bg-neutral-900 border-white/20 text-white placeholder:text-content-muted focus:border-sbac-blue-light'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  const amountValue = Number(amountBaht);
  const isAmountValid = amountBaht !== '' && amountValue > 0 && amountValue <= MAX_TOPUP_BAHT;

  const qrPayload = isPromptPayConfigured
    ? buildPromptPayPayload(PROMPTPAY_ID, isAmountValid ? amountValue : undefined)
    : null;

  const loadRecentRequests = useCallback(async () => {
    setLoadingRequests(true);
    const { data, error } = await supabase
      .from('topup_requests')
      .select('id, amount_baht, status, created_at, note')
      .order('created_at', { ascending: false })
      .limit(5);
    if (!error) setRecentRequests(data || []);
    setLoadingRequests(false);
  }, []);

  useEffect(() => {
    loadRecentRequests();
  }, [loadRecentRequests]);

  // เลิกใช้ object URL เก่าทุกครั้งที่เปลี่ยนไฟล์/ปิดฟอร์ม กัน memory leak
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setFileMeta(null);
    setPreviewUrl(null);
    setFileError(null);
  };

  /** เลือกรูปจากคลังภาพหรือถ่ายจากกล้อง — ตั้งใจไม่ใส่ attribute capture บน input
   *  เพราะจะบังคับเปิดกล้องอย่างเดียว ผู้ใช้เลือกคลังภาพไม่ได้ ปล่อยว่างไว้
   *  เบราว์เซอร์มือถือจะเด้งเมนูให้เลือกทั้งกล้องและคลังภาพเอง */
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0] || null;
    e.target.value = ''; // เลือกไฟล์เดิมซ้ำได้ (เผื่อกดผิดแล้วอยากเลือกไฟล์เดิมใหม่)
    if (!file) return;

    resetFile();
    setCheckingFile(true);
    const result = await validateSlipFile(file);
    setCheckingFile(false);

    if (!result.ok) {
      const msg = slipErrorText(result.error);
      setFileError(msg);
      showToast(msg, 'error');
      return;
    }

    setSelectedFile(file);
    setFileMeta({ ext: result.ext, mime: result.mime });
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!isAmountValid) {
      showToast('กรอกจำนวนเงินที่โอนให้ถูกต้องก่อน', 'error');
      return;
    }
    if (!selectedFile || !fileMeta) {
      showToast('กรุณาแนบรูปสลิปก่อนส่ง', 'error');
      return;
    }
    if (!user?.uid) {
      showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // ตั้งชื่อไฟล์ใหม่ทุกครั้งก่อนอัปโหลด — นิรนามและไม่ซ้ำกัน (timestamp + เลขสุ่ม)
      // ไม่ใช้ชื่อไฟล์เดิมของผู้ใช้แม้แต่ส่วนเดียว
      const fileName = anonymousFileName(fileMeta.ext);
      const path = `${user.uid}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, selectedFile, { contentType: fileMeta.mime, upsert: false });
      if (uploadError) throw uploadError;

      /* ส่งเป็น "คำขอ" ให้เจ้าหน้าที่ตรวจสลิปก่อน ไม่เติมเงินทันที

         ของเดิมเรียก topup_qr_instant() ซึ่งเชื่อยอดที่ผู้ใช้พิมพ์เองทั้งหมด
         ไม่ตรวจสลิปกับธนาคาร และไม่มีใครอนุมัติ — นักเรียนเปิด DevTools
         ยิง RPC วนลูปใส่ยอดสูงสุดก็ได้เงินไม่จำกัด แล้วเอาไปซื้อของจริงได้
         (ไม่ต้องอัปโหลดไฟล์ด้วยซ้ำ เพราะ RPC ตรวจแค่ว่า path ขึ้นต้นด้วย uid ตัวเอง)

         ทางนี้ปลอดภัยเพราะ RLS บังคับไว้แล้วที่ 18_topup_requests.sql:91-93
           with check (user_id = app_current_user_id() and status = 'pending')
         ส่งเป็นของคนอื่นไม่ได้ และยัด status='approved' มาเองจาก DevTools ก็ไม่ผ่าน
         ทั้งตารางไม่มี policy for update เลย จึงแก้ยอดหลังส่งไม่ได้ด้วย
         เงินเข้าจริงตอนเจ้าหน้าที่เรียก approve_topup_request() เท่านั้น */
      const { error: insertError } = await supabase.from('topup_requests').insert({
        user_id: user.uid,
        amount_baht: amountValue,
        slip_path: path,
        slip_mime: fileMeta.mime,
        status: 'pending',
      });
      if (insertError) throw insertError;

      showToast('ส่งคำขอเติมเงินแล้ว รอเจ้าหน้าที่ตรวจสลิป', 'success');
      setAmountBaht('');
      resetFile();
      loadRecentRequests();
    } catch (err) {
      console.error('[topup] ส่งคำขอไม่สำเร็จ', err);
      showToast(topupErrorText(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = isAmountValid && !!selectedFile && !checkingFile && !submitting;

  return (
    <div className="space-y-5">
      {/* ขั้นที่ 1: จำนวนเงิน */}
      <div>
        <label htmlFor="topup-amount" className={`text-xs font-extrabold block mb-1.5 ${textPrimary}`}>
          จำนวนเงินที่โอน (บาท)
        </label>
        <input
          id="topup-amount"
          type="number"
          inputMode="decimal"
          min="1"
          max={MAX_TOPUP_BAHT}
          step="0.01"
          placeholder="เช่น 100"
          value={amountBaht}
          onChange={(e) => setAmountBaht(e.target.value)}
          className={`w-full px-4 py-3 rounded-2xl border text-lg font-extrabold outline-none transition-colors ${inputClass}`}
        />
        {amountBaht !== '' && !isAmountValid && (
          <p className="text-[11px] font-semibold text-accent-rose mt-1">
            กรอกจำนวนเงินมากกว่า 0 และไม่เกิน {MAX_TOPUP_BAHT.toLocaleString('th-TH')} บาท
          </p>
        )}
      </div>

      {/* ขั้นที่ 2: QR พร้อมเพย์ */}
      <div className={`rounded-2xl border p-4 text-center ${boxClass}`}>
        {isPromptPayConfigured && qrPayload ? (
          <>
            <div className="bg-white p-3 rounded-xl inline-block">
              <QRCodeSVG value={qrPayload} size={176} level="M" marginSize={0} />
            </div>
            <p className={`text-xs font-extrabold mt-3 ${textPrimary}`}>สแกนด้วยแอปธนาคารเพื่อโอนเงิน</p>
            {PROMPTPAY_ACCOUNT_NAME && (
              <p className={`text-[11px] font-semibold mt-0.5 ${textMuted}`}>บัญชี: {PROMPTPAY_ACCOUNT_NAME}</p>
            )}
            {!isAmountValid && (
              <p className={`text-[10px] mt-1 ${textMuted}`}>กรอกจำนวนเงินด้านบนก่อน คิวอาร์จะฝังยอดให้อัตโนมัติ</p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <AlertTriangle className="text-accent-amber" size={28} aria-hidden="true" />
            <p className={`text-xs font-bold ${textPrimary}`}>ยังไม่ได้ตั้งค่าบัญชีพร้อมเพย์</p>
            <p className={`text-[11px] leading-relaxed ${textMuted}`}>
              ผู้ดูแลระบบต้องตั้งค่า VITE_PROMPTPAY_ID ใน .env ก่อน (ดู .env.example)
            </p>
          </div>
        )}
      </div>

      {/* ขั้นที่ 3: แนบรูปสลิป */}
      <div>
        <span className={`text-xs font-extrabold block mb-1.5 ${textPrimary}`}>แนบรูปสลิปโอนเงิน</span>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChange}
          className="hidden"
          aria-label="เลือกรูปสลิปโอนเงิน"
        />

        {previewUrl ? (
          <div className={`relative rounded-2xl border overflow-hidden ${boxClass}`}>
            <img src={previewUrl} alt="พรีวิวรูปสลิปโอนเงิน" className="w-full max-h-64 object-contain" />
            <button
              type="button"
              onClick={resetFile}
              aria-label="เอารูปนี้ออก"
              className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white active:scale-95 transition-all"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={checkingFile}
            className={`w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed transition-colors active:scale-[0.99] ${
              isDark ? 'border-white/15 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            {checkingFile ? (
              <Loader2 className="animate-spin text-brand" size={28} aria-hidden="true" />
            ) : (
              <div className="flex gap-2">
                <Camera className="text-brand" size={24} aria-hidden="true" />
                <UploadCloud className="text-brand" size={24} aria-hidden="true" />
              </div>
            )}
            <span className={`text-xs font-bold ${textPrimary}`}>
              {checkingFile ? 'กำลังตรวจสอบไฟล์...' : 'แตะเพื่อถ่ายรูปหรือเลือกจากคลังภาพ'}
            </span>
            <span className={`text-[10px] ${textMuted}`}>
              JPG หรือ PNG เท่านั้น • ไม่เกิน {(MAX_SLIP_BYTES / 1024 / 1024).toFixed(0)}MB
            </span>
          </button>
        )}

        {fileError && (
          <p className="text-[11px] font-semibold text-accent-rose mt-1.5">{fileError}</p>
        )}
      </div>

      {/* ปุ่มส่ง */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 bg-sbac-blue hover:bg-sbac-navy disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-extrabold py-3.5 rounded-2xl shadow-lg shadow-sbac-blue/30 active:scale-[0.98] transition-all"
      >
        {submitting ? (
          <>
            <Loader2 className="animate-spin" size={18} aria-hidden="true" /> กำลังส่งคำขอ...
          </>
        ) : (
          'ส่งคำขอเติมเงิน'
        )}
      </button>
      {/* บอกตามจริงว่าเงินยังไม่เข้า ไม่งั้นผู้ใช้กดแล้วไปดูยอดทันที เห็นเท่าเดิม
          แล้วเข้าใจว่าระบบพัง จึงกดส่งซ้ำอีกหลายรอบ */}
      <p className={`text-[10px] text-center leading-relaxed ${textMuted}`}>
        เจ้าหน้าที่การเงินจะตรวจสลิปก่อนแล้วจึงเติมเข้าบัตร ยอดจะยังไม่ขึ้นทันที
        ติดตามสถานะได้จากรายการด้านล่าง
      </p>

      {/* คำขอล่าสุดของฉัน */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-extrabold ${textPrimary}`}>คำขอเติมเงินล่าสุด</span>
          <button
            type="button"
            onClick={loadRecentRequests}
            aria-label="โหลดสถานะใหม่"
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
          >
            <RefreshCw size={14} className={loadingRequests ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>

        {loadingRequests ? (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
            ))}
          </div>
        ) : recentRequests.length === 0 ? (
          <p className={`text-[11px] font-semibold ${textMuted}`}>ยังไม่เคยส่งคำขอเติมเงิน</p>
        ) : (
          <ul className="space-y-2">
            {recentRequests.map((req) => (
              <li
                key={req.id}
                className={`flex items-center justify-between gap-2 p-3 rounded-xl border ${boxClass}`}
              >
                <div className="min-w-0">
                  <span className={`text-sm font-extrabold block ${textPrimary}`}>
                    {Number(req.amount_baht).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                  </span>
                  <span className={`text-[10px] ${textMuted}`}>
                    {new Date(req.created_at).toLocaleString('th-TH', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                  {req.status === 'rejected' && req.note && (
                    <span className="text-[10px] font-semibold text-accent-rose block mt-0.5">{req.note}</span>
                  )}
                </div>
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1 ${
                    TOPUP_STATUS_COLOR[req.status] || TOPUP_STATUS_COLOR.pending
                  }`}
                >
                  {req.status === 'approved' && <CheckCircle2 size={11} aria-hidden="true" />}
                  {TOPUP_STATUS_TEXT[req.status] || req.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
