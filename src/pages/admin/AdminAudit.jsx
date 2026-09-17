import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { History, RefreshCw } from 'lucide-react';

/* ปูมการกระทำของผู้ดูแลระบบ — ตอบคำถาม "ใครเปลี่ยนกติกานี้ และเปลี่ยนเมื่อไร"

   เขียนได้จากในฟังก์ชัน security definer เท่านั้น (ดู 53_admin_console.sql)
   ไม่มี policy ให้ใครเขียนหรือลบแถวตรง ๆ ปูมที่ลบเองได้ไม่ใช่ปูม */

const ACTION_LABELS = {
  SAVE_SETTINGS: 'แก้เงื่อนไขของระบบ',
  EDIT_ACCOUNT: 'แก้ข้อมูลบัญชี',
  SUSPEND_ACCOUNT: 'ระงับบัญชี',
  ACTIVATE_ACCOUNT: 'เปิดใช้งานบัญชี',
  ADD_CLASSROOM: 'เพิ่มห้องเรียน',
};

/** สรุป details ให้เป็นประโยคสั้น ๆ แทนการโยน JSON ดิบใส่หน้าคน */
function describeDetails(row) {
  const d = row.details || {};
  if (row.action === 'SAVE_SETTINGS') {
    const parts = [];
    if (d.school_name) parts.push(d.school_name);
    if (d.after_days !== undefined) parts.push(`ลาเกิน ${d.after_days} วันต้องแนบเอกสาร`);
    if (d.count_weekends !== undefined) {
      parts.push(d.count_weekends ? 'นับวันปฏิทิน' : 'นับจันทร์–ศุกร์');
    }
    return parts.join(' · ');
  }
  if (d.name) return d.name;
  return row.target || '';
}

export default function AdminAudit() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_audit')
      .select('id, actor_id, action, target, details, created_at')
      .order('id', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[admin] โหลดปูมไม่สำเร็จ:', error);
      setLoadError(
        error.code === '42P01'
          ? 'ยังไม่ได้ติดตั้งตารางปูม — รัน 53_admin_console.sql ใน Supabase ก่อน'
          : 'โหลดปูมไม่สำเร็จ กรุณาลองใหม่'
      );
      setRows([]);
    } else {
      setLoadError('');
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';

  if (loadError) {
    return <p role="alert" className="text-xs font-bold text-accent-rose leading-relaxed">{loadError}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[11px] ${textMuted}`}>100 รายการล่าสุด</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 ${
            isDark ? 'bg-white/10 text-content-secondary hover:bg-white/15' : 'bg-slate-100 text-ink-secondary hover:bg-slate-200'
          }`}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
          โหลดใหม่
        </button>
      </div>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className={`text-center py-12 ${textMuted}`}>
          <History size={28} className="mx-auto mb-2 opacity-40" aria-hidden="true" />
          <p className="text-xs">ยังไม่มีการเปลี่ยนแปลงที่บันทึกไว้</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`p-3.5 rounded-xl border ${
                isDark ? 'bg-white/[0.03] border-white/10' : 'bg-surface-card border-slate-100'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`text-xs font-extrabold ${textPrimary}`}>
                  {ACTION_LABELS[row.action] || row.action}
                </span>
                <span className={`text-[11px] ${textMuted}`}>
                  {new Date(row.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
                </span>
              </div>
              {describeDetails(row) && (
                <p className={`text-[11px] mt-1 break-words ${textMuted}`}>{describeDetails(row)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
