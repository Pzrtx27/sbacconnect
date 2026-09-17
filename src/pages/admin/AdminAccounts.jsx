import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import { Search, UserCog, RefreshCw } from 'lucide-react';

/* จัดการบัญชีครูและนักเรียน

   ขอบเขตที่ตั้งใจจำกัดไว้ และเหตุผล
   ---------------------------------
   1) แก้ได้เฉพาะบัญชีครูและนักเรียน
      บัญชีเจ้าหน้าที่ (academic / sysadmin / cashier / pos) ต้องแก้จาก Supabase โดยตรง
      ถ้าเปิดให้แก้จากหน้าเว็บ บัญชี Admin ที่หลุดไปหนึ่งบัญชีจะยึดทั้งระบบได้ทันที

   2) แก้บัญชีตัวเองไม่ได้
      กัน Admin ระงับตัวเองจนไม่เหลือใครเข้าระบบได้อีก

   3) "ระงับ" ไม่ใช่ "ลบ"
      ระงับคือปิดธง users.is_active ซึ่ง AuthContext ปฏิเสธตั้งแต่ตอนโหลดโปรไฟล์
      พอสำหรับตัดสิทธิ์เข้าระบบ โดยที่ประวัติใบลา ธุรกรรม และคะแนนยังอ่านได้ครบ
      การลบบัญชีเข้าสู่ระบบจริง (auth.users) ต้องใช้ service_role key
      ซึ่งห้ามอยู่ในโค้ดฝั่งเบราว์เซอร์ — ดูหมายเหตุหัวไฟล์ 53_admin_console.sql

   4) สร้างบัญชีใหม่ยังทำจากหน้านี้ไม่ได้ ด้วยเหตุผลเดียวกับข้อ 3
      ตอนนี้สร้างผ่าน import-tool หรือ Supabase Dashboard */

const ROLE_LABELS = {
  student: 'นักเรียน',
  teacher: 'ครู',
  academic: 'ฝ่ายวิชาการ',
  sysadmin: 'ผู้ดูแลระบบ',
  cashier: 'การเงิน',
  pos: 'หน้าร้าน',
};

const ERROR_MESSAGES = {
  FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์จัดการบัญชีผู้ใช้',
  NOT_FOUND: 'ไม่พบบัญชีนี้ — อาจถูกลบไปแล้ว',
  SELF: 'แก้บัญชีตัวเองจากหน้านี้ไม่ได้',
  STAFF_ACCOUNT: 'บัญชีเจ้าหน้าที่ต้องแก้จาก Supabase โดยตรง',
  INVALID_NAME: 'ชื่อต้องยาว 1–150 ตัวอักษร',
  INVALID_CLASSROOM: 'กรุณาเลือกห้องเรียนของนักเรียนคนนี้',
  IS_HOMEROOM: 'ครูคนนี้เป็นครูประจำชั้นอยู่ — ย้ายห้องให้ครูคนอื่นก่อน',
  HAS_SUBSTITUTION: 'ครูคนนี้มีคาบสอนแทนข้างหน้าอยู่ — ยกเลิกคาบนั้นก่อน',
};

export default function AdminAccounts() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { user } = useAuth();
  const { confirm, confirmDialog } = useConfirm();

  const [rows, setRows] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [usersRes, roomsRes] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.rpc('list_classrooms_with_homeroom'),
    ]);

    if (usersRes.error) {
      console.error('[admin] โหลดรายชื่อบัญชีไม่สำเร็จ:', usersRes.error);
      setLoadError(
        usersRes.error.code === '42883'
          ? 'ยังไม่ได้ติดตั้งหน้า Admin — รัน 53_admin_console.sql ใน Supabase ก่อน'
          : 'โหลดรายชื่อบัญชีไม่สำเร็จ กรุณาลองใหม่'
      );
      setRows([]);
    } else {
      setLoadError('');
      setRows(Array.isArray(usersRes.data) ? usersRes.data : []);
    }

    if (roomsRes.error) console.error('[admin] โหลดห้องเรียนไม่สำเร็จ:', roomsRes.error);
    else setClassrooms(Array.isArray(roomsRes.data) ? roomsRes.data : []);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* จัดการได้เฉพาะครู/นักเรียน และต้องไม่ใช่ตัวเอง — กติกาเดียวกับฝั่ง DB เป๊ะ
     เช็คซ้ำฝั่งหน้าเว็บเพื่อไม่ให้ปุ่มที่กดแล้วขึ้น error โผล่มาตั้งแต่แรก
     ตัวที่กันจริงคือ admin_change_account() ไม่ใช่บรรทัดนี้ */
  const isManageable = (row) =>
    row.id !== user?.uid &&
    row.roles.length > 0 &&
    row.roles.every((r) => r === 'teacher' || r === 'student');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.full_name} ${r.email} ${r.code} ${r.class_label}`.toLowerCase().includes(needle)
    );
  }, [rows, query]);

  const runAction = async (row, action) => {
    const labels = { suspend: 'ระงับบัญชี', activate: 'เปิดใช้งานบัญชี' };

    const ok = await confirm({
      title: `${labels[action]} ${row.full_name}?`,
      message: action === 'suspend'
        ? 'บัญชีนี้จะเข้าสู่ระบบไม่ได้ทันที'
        : 'บัญชีนี้จะกลับมาเข้าสู่ระบบได้ทันที',
      detail: action === 'suspend'
        ? 'ประวัติใบลา ธุรกรรม และคะแนนยังอยู่ครบ เปิดใช้งานคืนได้ทุกเมื่อ'
        : undefined,
      confirmLabel: labels[action],
      danger: action === 'suspend',
    });
    if (!ok) return;

    setBusy(true);
    const { data, error } = await supabase.rpc('admin_change_account', {
      p_id: row.id,
      p_action: action,
    });
    setBusy(false);

    if (error || !data?.ok) {
      showToast(ERROR_MESSAGES[data?.error] || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่', 'error');
      return;
    }
    showToast(`${labels[action]}แล้ว`, 'success');
    load();
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_change_account', {
      p_id: editing.id,
      p_action: 'edit',
      p_full_name: editing.full_name,
      p_class_room: editing.class_room_id || null,
      p_department: editing.department || null,
    });
    setBusy(false);

    if (error || !data?.ok) {
      showToast(ERROR_MESSAGES[data?.error] || 'บันทึกไม่สำเร็จ กรุณาลองใหม่', 'error');
      return;
    }
    showToast('บันทึกข้อมูลบัญชีแล้ว', 'success');
    setEditing(null);
    load();
  };

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';
  const fieldCls = `w-full border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none disabled:opacity-50 ${bgInput}`;
  const btnCls = 'px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50';

  if (loadError) {
    return <p role="alert" className="text-xs font-bold text-accent-rose leading-relaxed">{loadError}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} aria-hidden="true" />
          <label htmlFor="account-search" className="sr-only">ค้นหาบัญชี</label>
          <input
            id="account-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ อีเมล รหัส หรือห้อง"
            className={`${fieldCls} pl-9`}
          />
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || busy}
          className={`${btnCls} flex items-center gap-1.5 ${
            isDark ? 'bg-white/10 text-content-secondary hover:bg-white/15' : 'bg-slate-100 text-ink-secondary hover:bg-slate-200'
          }`}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
          โหลดใหม่
        </button>
      </div>

      <p className={`text-[11px] leading-relaxed ${textMuted}`}>
        จัดการได้เฉพาะบัญชีครูและนักเรียน · บัญชีเจ้าหน้าที่และบัญชีของตัวเองต้องแก้จาก Supabase โดยตรง
        · การระงับไม่ลบประวัติ เปิดคืนได้ทุกเมื่อ
      </p>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`h-16 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className={`text-xs text-center py-10 ${textMuted}`}>
          {rows.length === 0 ? 'ยังไม่มีบัญชีในระบบ' : 'ไม่พบบัญชีที่ตรงกับคำค้น'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <li
              key={row.id}
              className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border ${
                isDark ? 'bg-white/[0.03] border-white/10' : 'bg-surface-card border-slate-100'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-xs font-extrabold truncate ${textPrimary}`}>
                  {row.full_name}
                  {!row.is_active && (
                    <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-rose/15 text-accent-rose">
                      ระงับอยู่
                    </span>
                  )}
                  {!row.has_login && (
                    <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-amber/15 text-accent-amber">
                      ยังไม่มีบัญชีเข้าระบบ
                    </span>
                  )}
                </div>
                <div className={`text-[11px] truncate ${textMuted}`}>
                  {[row.roles.map((r) => ROLE_LABELS[r] || r).join(', '), row.code, row.class_label, row.department]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div className={`text-[11px] truncate ${textMuted}`}>{row.email}</div>
              </div>

              {isManageable(row) ? (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing({ ...row })}
                    className={`${btnCls} ${isDark ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-slate-100 text-ink hover:bg-slate-200'}`}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(row, row.is_active ? 'suspend' : 'activate')}
                    className={`${btnCls} ${
                      row.is_active
                        ? 'bg-accent-rose/10 text-accent-rose hover:bg-accent-rose/20'
                        : 'bg-accent-emerald/10 text-accent-emerald hover:bg-accent-emerald/20'
                    }`}
                  >
                    {row.is_active ? 'ระงับ' : 'เปิดใช้งาน'}
                  </button>
                </div>
              ) : (
                <span className={`text-[10px] font-bold shrink-0 ${textMuted}`}>
                  {row.id === user?.uid ? 'บัญชีของคุณ' : 'บัญชีเจ้าหน้าที่'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => { if (!busy) setEditing(null); }}
        title="แก้ไขบัญชี"
        icon={UserCog}
      >
        {editing && (
          <form onSubmit={saveEdit} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <div>
                <label htmlFor="edit-name" className={`text-xs font-bold block mb-1 ${textMuted}`}>ชื่อ–นามสกุล</label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  maxLength={150}
                  value={editing.full_name}
                  onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                  className={fieldCls}
                />
              </div>

              {editing.roles.includes('student') ? (
                <div>
                  <label htmlFor="edit-room" className={`text-xs font-bold block mb-1 ${textMuted}`}>ห้องเรียน</label>
                  <select
                    id="edit-room"
                    required
                    value={editing.class_room_id || ''}
                    onChange={(e) => setEditing({ ...editing, class_room_id: Number(e.target.value) })}
                    className={fieldCls}
                  >
                    <option value="">— เลือกห้องเรียน —</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <p className={`text-[11px] mt-1.5 ${textMuted}`}>
                    ห้องเป็นตัวกำหนดว่าใบลาของนักเรียนคนนี้จะไปถึงครูประจำชั้นคนไหน
                  </p>
                </div>
              ) : (
                <div>
                  <label htmlFor="edit-dept" className={`text-xs font-bold block mb-1 ${textMuted}`}>แผนก</label>
                  <input
                    id="edit-dept"
                    type="text"
                    maxLength={150}
                    value={editing.department || ''}
                    onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                    className={fieldCls}
                  />
                </div>
              )}

              <p className={`text-[11px] leading-relaxed ${textMuted}`}>
                อีเมลและรหัสประจำตัวแก้จากหน้านี้ไม่ได้ เพราะเป็นคีย์ที่ตารางอื่นใช้อ้างถึงคนนี้
              </p>

              <button
                type="submit"
                className="w-full bg-sbac-blue hover:bg-sbac-navy disabled:opacity-50 text-white font-extrabold py-3 rounded-xl text-xs transition-all"
              >
                {busy ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </fieldset>
          </form>
        )}
      </Modal>

      {confirmDialog}
    </div>
  );
}
