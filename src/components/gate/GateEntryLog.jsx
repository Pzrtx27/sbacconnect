import { useEffect, useState, useCallback } from 'react';
import { LogIn, RefreshCw } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchGateLogs, formatTime, formatDayLabel } from '../../utils/wallet';

/* เวลาเข้าโรงเรียน — ขาเข้าอย่างเดียว

   ของเดิมการ์ดนี้เขียนเลขตายไว้ใน JSX (เข้า 07:42 / ออก 16:30)
   นักเรียนทุกคนเปิดดูเห็นเลขชุดเดียวกันหมด และไม่มีตารางรองรับเลย

   ที่ไม่มีขาออก: ของจริงแตะบัตรตอนเข้าเท่านั้น ตอนกลับบ้านไม่มีใครแตะ
   ถ้าโชว์ช่อง "ออก" ว่างไว้ คนดูจะเข้าใจว่าระบบพัง ทั้งที่ไม่เคยมีข้อมูลตรงนั้น */
const METHOD_LABEL = { card: 'แตะบัตร', qr: 'สแกน QR', manual: 'เจ้าหน้าที่บันทึกให้' };

export default function GateEntryLog({ limit = 14 }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchGateLogs(limit));
    } catch (err) {
      console.error('[gate] โหลดเวลาเข้าโรงเรียนไม่สำเร็จ:', err);
      setError(
        err?.code === 'PGRST202' || /my_gate_logs/i.test(err?.message || '')
          ? 'ยังไม่ได้ติดตั้งระบบบันทึกเวลาเข้า (รัน 27_gate_logs.sql บน Supabase ก่อน)'
          : 'โหลดข้อมูลไม่สำเร็จ'
      );
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">กำลังโหลดเวลาเข้าโรงเรียน</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-12 rounded-2xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-2xl border p-4 space-y-3 ${
        isDark ? 'bg-rose-950/20 border-rose-900/30' : 'bg-rose-50 border-rose-200'
      }`}>
        <p className="text-xs font-bold text-accent-rose leading-relaxed">{error}</p>
        <button
          type="button"
          onClick={load}
          className="text-xs font-extrabold text-brand hover:underline inline-flex items-center gap-1.5"
        >
          <RefreshCw size={13} />
          ลองใหม่
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`rounded-2xl border p-6 text-center ${
        isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
      }`}>
        <p className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-ink'}`}>ยังไม่มีบันทึกการเข้า</p>
        <p className="text-xs font-semibold text-content-muted mt-1 leading-relaxed">
          เวลาจะขึ้นที่นี่หลังแตะบัตรผ่านประตูเข้าโรงเรียน
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-content-muted leading-relaxed">
        ระบบบันทึกเฉพาะตอนเข้าโรงเรียน ไม่ได้บันทึกตอนกลับ
      </p>

      {/* เส้นแนวตั้งพร้อมจุด สื่อว่าเป็นลำดับเวลา ไม่ใช่รายการทั่วไป */}
      <ul className={`border-l-2 pl-4 space-y-3 ml-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        {items.map((item) => (
          <li key={item.id} className="relative">
            <span
              className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ${
                isDark ? 'ring-surface-dark-elev' : 'ring-surface-card'
              }`}
              aria-hidden="true"
            />
            <div className="flex justify-between items-center gap-3">
              <div className="min-w-0">
                <div className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-ink'}`}>
                  <LogIn size={13} className="text-accent-emerald shrink-0" aria-hidden="true" />
                  {formatDayLabel(item.entered_at)}
                </div>
                <div className="text-[10px] text-content-muted font-semibold truncate">
                  {item.gate}
                  {METHOD_LABEL[item.method] && ` · ${METHOD_LABEL[item.method]}`}
                </div>
              </div>
              <span className="text-sm font-extrabold text-accent-emerald tabular-nums shrink-0">
                {formatTime(item.entered_at)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
