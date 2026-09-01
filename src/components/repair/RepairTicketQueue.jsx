import { useMemo, useState } from 'react';
import { Wrench, RefreshCw } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useRepairTickets } from '../../hooks/useRepairTickets';
import { useConfirm } from '../ui/ConfirmDialog';
import { showToast } from '../ui/Toast';
import { repairStatusLabel } from '../../utils/assistant';

/* คิวใบแจ้งซ่อมของฝ่ายวิชาการ — ปลายทางของเรื่องที่นักเรียนแจ้งผ่านผู้ช่วย
   ถ้าไม่มีหน้านี้ ใบแจ้งซ่อมก็เป็นแค่แถวใน DB ที่ไม่มีใครเห็น ซึ่งไม่ต่างจาก
   ใบปลอมของแชทบอทตัวเดิมเท่าไหร่ */

const FILTERS = [
  { value: 'open', label: 'รอรับเรื่อง' },
  { value: 'in_progress', label: 'กำลังซ่อม' },
  { value: 'done', label: 'เสร็จแล้ว' },
  { value: null, label: 'ทั้งหมด' },
];

const STATUS_TONE = {
  open: 'bg-amber-500/10 text-accent-amber border-amber-500/20',
  in_progress: 'bg-sky-500/10 text-accent-cyan border-sky-500/20',
  done: 'bg-emerald-500/10 text-accent-emerald border-emerald-500/20',
  cancelled: 'bg-rose-500/10 text-accent-rose border-rose-500/20',
};

export default function RepairTicketQueue() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [filter, setFilter] = useState('open');
  const [busyId, setBusyId] = useState(null);
  const { confirm, confirmDialog } = useConfirm();

  const { tickets, loading, error, reload, updateStatus } = useRepairTickets({
    statusFilter: filter,
    realtime: true,
  });

  const openCount = useMemo(
    () => tickets.filter((t) => t.status === 'open').length,
    [tickets]
  );

  const changeStatus = async (ticket, nextStatus, label) => {
    const ok = await confirm({
      title: `${label} · ${ticket.ticket_no}`,
      message: `${ticket.room_label} · ${ticket.equipment}`,
      detail: 'ผู้แจ้งจะได้รับการแจ้งเตือนทันทีที่กดยืนยัน',
      danger: nextStatus === 'cancelled',
      confirmLabel: label,
    });
    if (!ok) return;

    setBusyId(ticket.id);
    const { error: err } = await updateStatus(ticket.id, nextStatus);
    setBusyId(null);

    if (err) {
      showToast(err === 'FORBIDDEN' ? 'ไม่มีสิทธิ์จัดการใบแจ้งซ่อม' : 'เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่', 'error');
      return;
    }
    showToast(`${ticket.ticket_no} — ${label}แล้ว แจ้งเตือนผู้แจ้งเรียบร้อย`, 'success');
  };

  const cardBase = isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100';

  return (
    <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${cardBase}`}>
      {confirmDialog}

      <div className="flex items-center justify-between gap-3">
        <h3 className={`text-sm font-extrabold flex items-center gap-2 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
          <Wrench size={18} className="text-brand" aria-hidden="true" />
          คิวแจ้งซ่อม
          {openCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-accent-amber border border-amber-500/25">
              รอรับเรื่อง {openCount}
            </span>
          )}
        </h3>

        <button
          type="button"
          onClick={reload}
          aria-label="โหลดคิวแจ้งซ่อมใหม่"
          className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
        >
          <RefreshCw size={15} className="text-content-muted" aria-hidden="true" />
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
              filter === f.value
                ? 'bg-sbac-blue text-white border-sbac-blue'
                : isDark
                  ? 'border-white/15 text-slate-200 hover:bg-white/10'
                  : 'border-border text-ink-secondary hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center">
          <RefreshCw className="animate-spin text-brand mx-auto mb-2" size={20} aria-hidden="true" />
          <span className="text-xs font-semibold text-content-muted">กำลังโหลดคิวแจ้งซ่อม...</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className={`rounded-2xl border p-5 text-center space-y-2 ${
            isDark ? 'bg-rose-950/30 border-rose-900/40' : 'bg-rose-50 border-rose-200'
          }`}
        >
          <p className="text-xs font-extrabold text-accent-rose">โหลดคิวแจ้งซ่อมไม่สำเร็จ</p>
          <p className="text-[11px] font-semibold text-content-secondary">
            ถ้าเพิ่งติดตั้งระบบ ตรวจว่ารัน 23_repair_tickets.sql บน Supabase แล้วหรือยัง
          </p>
          <button
            type="button"
            onClick={reload}
            className="px-4 py-2 rounded-xl text-[11px] font-extrabold bg-sbac-blue hover:bg-sbac-navy text-white transition-colors"
          >
            ลองใหม่
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <p className="py-8 text-center text-xs font-semibold text-content-muted">
          {filter === 'open'
            ? 'ไม่มีใบแจ้งซ่อมที่รอรับเรื่อง'
            : 'ยังไม่มีใบแจ้งซ่อมในหมวดนี้'}
        </p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li
              key={t.id}
              className={`rounded-2xl border p-4 space-y-2.5 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-border'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                    {t.ticket_no} · {t.room_label}
                  </p>
                  <p className="text-[11px] font-semibold text-content-secondary mt-0.5">
                    {t.equipment} — {t.problem}
                  </p>
                  <p className="text-[10px] font-semibold text-content-muted mt-1">
                    แจ้งโดย {t.reporter_name}
                    {t.reporter_code ? ` (${t.reporter_code})` : ''} ·{' '}
                    {new Date(t.created_at).toLocaleString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                    STATUS_TONE[t.status] || STATUS_TONE.open
                  }`}
                >
                  {repairStatusLabel(t.status)}
                </span>
              </div>

              {(t.status === 'open' || t.status === 'in_progress') && (
                <div className="flex gap-2">
                  {t.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => changeStatus(t, 'in_progress', 'รับเรื่อง')}
                      disabled={busyId === t.id}
                      className="flex-1 py-2 rounded-xl text-[11px] font-extrabold bg-sbac-blue hover:bg-sbac-navy text-white transition-colors disabled:opacity-50"
                    >
                      รับเรื่อง
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => changeStatus(t, 'done', 'ปิดงาน')}
                    disabled={busyId === t.id}
                    className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold border-2 transition-colors disabled:opacity-50 ${
                      isDark ? 'border-white/20 text-slate-200 hover:bg-white/10' : 'border-border text-ink-secondary hover:bg-slate-100'
                    }`}
                  >
                    ซ่อมเสร็จแล้ว
                  </button>
                  <button
                    type="button"
                    onClick={() => changeStatus(t, 'cancelled', 'ยกเลิก')}
                    disabled={busyId === t.id}
                    className="px-3 py-2 rounded-xl text-[11px] font-extrabold text-accent-rose border-2 border-rose-500/30 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                </div>
              )}

              {t.staff_note && (
                <p className="text-[10px] font-semibold text-content-muted">บันทึก: {t.staff_note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
