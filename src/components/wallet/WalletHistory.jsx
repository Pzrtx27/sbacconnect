import { useEffect, useState, useCallback } from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import {
  fetchWalletHistory,
  walletKindLabel,
  formatSignedBaht,
  formatTime,
  groupByDay,
} from '../../utils/wallet';

/* ประวัติเงินเข้า-ออก

   ก่อนหน้านี้หน้าเว็บโชว์แค่ยอดคงเหลือก้อนเดียว ทั้งที่ wallet_entries
   บันทึกทุกความเคลื่อนไหวไว้ครบมาตลอด นักเรียนที่รู้สึกว่ายอดหาย
   จึงไม่มีอะไรไปยืนยันกับเจ้าหน้าที่ได้เลย */
export default function WalletHistory({ limit = 50 }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchWalletHistory(limit));
    } catch (err) {
      console.error('[wallet] โหลดประวัติไม่สำเร็จ:', err);
      // ยังไม่ได้รัน migration = ฟังก์ชันไม่มีจริง บอกให้ตรงจุดจะได้ไม่ไล่หาผิดที่
      setError(
        err?.code === 'PGRST202' || /my_wallet_history/i.test(err?.message || '')
          ? 'ยังไม่ได้ติดตั้งระบบประวัติ (รัน 26_wallet_history.sql บน Supabase ก่อน)'
          : 'โหลดประวัติไม่สำเร็จ'
      );
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const rowBase = `flex items-center gap-3 py-3 ${isDark ? 'border-white/5' : 'border-slate-100'}`;

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">กำลังโหลดประวัติ</span>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-14 rounded-2xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
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
        <p className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-ink'}`}>ยังไม่มีรายการ</p>
        <p className="text-xs font-semibold text-content-muted mt-1 leading-relaxed">
          เมื่อเติมเงินหรือซื้อของ รายการจะขึ้นที่นี่ พร้อมยอดคงเหลือหลังทำรายการ
        </p>
      </div>
    );
  }

  const groups = groupByDay(items, (i) => i.occurred_at);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          {/* หัวข้อวันคั่น — ไม่งั้นเป็นรายการยาวพรืดที่หาไม่เจอว่าอันไหนวันไหน
              ถ้า DB ไม่มีคอลัมน์เวลา label จะว่าง ก็ไม่ต้องขึ้นหัวข้อ */}
          {group.label && (
            <div className={`text-[11px] font-extrabold mb-1 ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
              {group.label}
            </div>
          )}

          <ul className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-100'}`}>
            {group.items.map((item) => {
              const isIn = item.direction === 'in';
              return (
                <li key={item.id} className={rowBase}>
                  {/* ทิศทางบอกด้วยไอคอน+เครื่องหมาย ไม่ใช่สีอย่างเดียว
                      คนตาบอดสีแยกเขียว/แดงไม่ออก */}
                  <span
                    className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                      isIn
                        ? isDark ? 'bg-emerald-500/15 text-accent-emerald' : 'bg-emerald-500/10 text-accent-emerald'
                        : isDark ? 'bg-rose-500/15 text-accent-rose' : 'bg-rose-500/10 text-accent-rose'
                    }`}
                    aria-hidden="true"
                  >
                    {isIn ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs font-extrabold truncate ${isDark ? 'text-white' : 'text-ink'}`}>
                      {walletKindLabel(item.kind, item.direction)}
                    </span>
                    <span className="block text-[10px] font-semibold text-content-muted">
                      {formatTime(item.occurred_at)}
                      {item.balance_after != null && (
                        <> · เหลือ {formatSignedBaht(item.balance_after).replace('+', '')} บาท</>
                      )}
                    </span>
                  </span>

                  <span
                    className={`shrink-0 text-sm font-extrabold tabular-nums ${
                      isIn ? 'text-accent-emerald' : 'text-accent-rose'
                    }`}
                  >
                    {formatSignedBaht(item.amount_satang)}
                    <span className="sr-only">{isIn ? ' บาท เงินเข้า' : ' บาท เงินออก'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
