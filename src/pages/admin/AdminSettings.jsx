import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { SlidersHorizontal, School, Plus } from 'lucide-react';

/* เงื่อนไขของระบบที่โรงเรียนแก้เองได้ โดยไม่ต้องแก้โค้ดแล้ว deploy ใหม่

   ตัวอย่างที่ขอมาตรง ๆ: "วันนี้ลาเกิน 5 วันต้องแนบใบลา พรุ่งนี้อาจเป็น 3 หรือ 7 วัน"
   ค่าพวกนี้เคยฝังอยู่ในไฟล์ js ตอนนี้ย้ายมาอยู่ในตาราง school_settings (53_admin_console.sql)
   ฟอร์มใบลาของนักเรียนอ่านค่าจากที่นี่ เปลี่ยนแล้วมีผลกับใบลาที่ยื่นหลังจากนั้นทันที

   เรื่องเวอร์ชัน: ฟอร์มส่งเลขเวอร์ชันที่ตัวเองอ่านมาด้วยตอนกดบันทึก
   ถ้ามีคนอื่นแก้ไปก่อน ฝั่ง DB จะตอบ STALE_VERSION แทนที่จะเขียนทับเงียบ ๆ
   เพราะสองคนแก้กติกาคนละอย่างพร้อมกันแล้วคนหลังชนะ คือบั๊กที่ไม่มีใครสังเกตเห็น */

const LEVELS = ['ปวช.1', 'ปวช.2', 'ปวช.3', 'ปวส.1', 'ปวส.2'];

export default function AdminSettings() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { confirm, confirmDialog } = useConfirm();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [newRoom, setNewRoom] = useState({ level: LEVELS[0], room_no: '' });
  const [addingRoom, setAddingRoom] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('school_settings')
      .select('school_name, leave_attachment_after_days, leave_count_weekends, version')
      .eq('id', true)
      .maybeSingle();

    if (error || !data) {
      console.error('[admin] โหลดเงื่อนไขระบบไม่สำเร็จ:', error);
      setLoadError(
        error?.code === '42P01'
          ? 'ยังไม่ได้ติดตั้งตารางเงื่อนไข — รัน 53_admin_console.sql ใน Supabase ก่อน'
          : 'โหลดเงื่อนไขไม่สำเร็จ กรุณาลองใหม่'
      );
      setForm(null);
    } else {
      setLoadError('');
      setForm(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e) => {
    e.preventDefault();

    const days = Number(form.leave_attachment_after_days);
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      showToast('จำนวนวันต้องเป็นเลขจำนวนเต็ม 0–365', 'error');
      return;
    }

    const ok = await confirm({
      title: 'ใช้เงื่อนไขใหม่กับทั้งวิทยาลัย?',
      message: `นักเรียนที่ลาเกิน ${days} วัน จะต้องแนบเอกสารประกอบ`,
      detail: 'มีผลกับใบลาที่ยื่นหลังจากนี้เท่านั้น ใบที่ยื่นไปแล้วไม่ถูกย้อนตรวจ',
      confirmLabel: 'บันทึกเงื่อนไข',
    });
    if (!ok) return;

    setSaving(true);
    const { data, error } = await supabase.rpc('admin_save_settings', {
      p_school_name: form.school_name,
      p_after_days: days,
      p_count_weekends: form.leave_count_weekends,
      p_version: form.version,
    });
    setSaving(false);

    if (error || !data?.ok) {
      const messages = {
        FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์แก้เงื่อนไขระบบ',
        INVALID_NAME: 'ชื่อโรงเรียนต้องยาว 1–100 ตัวอักษร',
        INVALID_DAYS: 'จำนวนวันต้องอยู่ระหว่าง 0–365',
        STALE_VERSION: 'มีคนอื่นแก้เงื่อนไขไปแล้ว — กำลังโหลดค่าล่าสุดให้',
      };
      showToast(messages[data?.error] || 'บันทึกไม่สำเร็จ กรุณาลองใหม่', 'error');
      if (data?.error === 'STALE_VERSION') load();
      return;
    }

    showToast('บันทึกเงื่อนไขแล้ว', 'success');
    load();
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    setAddingRoom(true);
    const { data, error } = await supabase.rpc('admin_add_classroom', {
      p_level: newRoom.level,
      p_room: newRoom.room_no,
    });
    setAddingRoom(false);

    if (error || !data?.ok) {
      const messages = {
        FORBIDDEN: 'บัญชีนี้ไม่มีสิทธิ์เพิ่มห้องเรียน',
        INVALID_ROOM: 'เลขห้องต้องเป็นตัวเลข 1–999',
        DUPLICATE: 'มีห้องนี้อยู่แล้ว',
      };
      showToast(messages[data?.error] || 'เพิ่มห้องไม่สำเร็จ', 'error');
      return;
    }

    showToast(`เพิ่มห้อง ${newRoom.level}/${newRoom.room_no} แล้ว`, 'success');
    setNewRoom({ ...newRoom, room_no: '' });
  };

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const cardCls = `rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${
    isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
  }`;
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';
  const fieldCls = `w-full border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none disabled:opacity-50 ${bgInput}`;
  const labelCls = `text-xs font-bold block mb-1 ${textMuted}`;

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`h-24 rounded-3xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
        ))}
      </div>
    );
  }

  if (loadError) {
    return <p role="alert" className="text-xs font-bold text-accent-rose leading-relaxed">{loadError}</p>;
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSave} className={cardCls}>
        <h3 className={`text-sm font-extrabold flex items-center gap-2 ${textPrimary}`}>
          <SlidersHorizontal size={18} className="text-brand" aria-hidden="true" />
          กติกาการลา
        </h3>

        <fieldset disabled={saving} className="space-y-4 max-w-md">
          <div>
            <label htmlFor="setting-name" className={labelCls}>ชื่อโรงเรียน / ชื่อระบบ</label>
            <input
              id="setting-name"
              type="text"
              required
              maxLength={100}
              value={form.school_name}
              onChange={(e) => setForm({ ...form, school_name: e.target.value })}
              className={fieldCls}
            />
          </div>

          <div>
            <label htmlFor="setting-days" className={labelCls}>ต้องแนบเอกสารเมื่อลา “เกิน” กี่วัน</label>
            <input
              id="setting-days"
              type="number"
              min={0}
              max={365}
              step={1}
              required
              value={form.leave_attachment_after_days}
              onChange={(e) => setForm({ ...form, leave_attachment_after_days: e.target.value })}
              className={fieldCls}
            />
            {/* บอกผลของค่าที่กรอกเป็นประโยค เพราะคำว่า "เกิน" กับ "ตั้งแต่" ต่างกันหนึ่งวัน
                และเป็นจุดที่คนอ่านสเปกคนละแบบกันบ่อยที่สุด */}
            <p className={`text-[11px] mt-1.5 leading-relaxed ${textMuted}`}>
              ลา {form.leave_attachment_after_days || 0} วันพอดี = ไม่ต้องแนบ ·
              ลา {Number(form.leave_attachment_after_days || 0) + 1} วันขึ้นไป = ต้องแนบ
            </p>
          </div>

          <div>
            <label htmlFor="setting-weekends" className={labelCls}>วิธีนับวัน</label>
            <select
              id="setting-weekends"
              value={String(form.leave_count_weekends)}
              onChange={(e) => setForm({ ...form, leave_count_weekends: e.target.value === 'true' })}
              className={fieldCls}
            >
              <option value="true">นับวันปฏิทิน (รวมเสาร์–อาทิตย์)</option>
              <option value="false">นับเฉพาะจันทร์–ศุกร์</option>
            </select>
            <p className={`text-[11px] mt-1.5 leading-relaxed ${textMuted}`}>
              ทั้งสองแบบยังไม่หักวันหยุดนักขัตฤกษ์ เพราะปฏิทินวันหยุดของวิทยาลัย
              ยังไม่ได้อยู่ในระบบ
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-sbac-blue hover:bg-sbac-navy disabled:opacity-50 text-white font-extrabold py-3 rounded-xl text-xs transition-all"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกเงื่อนไข'}
          </button>
        </fieldset>
      </form>

      <form onSubmit={handleAddRoom} className={cardCls}>
        <h3 className={`text-sm font-extrabold flex items-center gap-2 ${textPrimary}`}>
          <School size={18} className="text-brand" aria-hidden="true" />
          เพิ่มห้องเรียน
        </h3>
        <p className={`text-[11px] leading-relaxed ${textMuted}`}>
          ห้องที่เพิ่มแล้วจะเลือกได้ในหน้าแก้บัญชีนักเรียน และหน้ากำหนดครูประจำชั้น
        </p>

        <fieldset disabled={addingRoom} className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[140px]">
            <label htmlFor="room-level" className={labelCls}>ระดับชั้น</label>
            <select
              id="room-level"
              value={newRoom.level}
              onChange={(e) => setNewRoom({ ...newRoom, level: e.target.value })}
              className={fieldCls}
            >
              {LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
            </select>
          </div>
          <div className="min-w-[120px]">
            <label htmlFor="room-no" className={labelCls}>เลขห้อง</label>
            <input
              id="room-no"
              type="text"
              inputMode="numeric"
              required
              pattern="[1-9][0-9]{0,2}"
              value={newRoom.room_no}
              onChange={(e) => setNewRoom({ ...newRoom, room_no: e.target.value })}
              className={fieldCls}
            />
          </div>
          <button
            type="submit"
            className="flex items-center gap-1.5 bg-sbac-blue hover:bg-sbac-navy disabled:opacity-50 text-white font-extrabold px-4 py-2.5 rounded-xl text-xs transition-all"
          >
            <Plus size={14} aria-hidden="true" />
            {addingRoom ? 'กำลังเพิ่ม...' : 'เพิ่มห้อง'}
          </button>
        </fieldset>
      </form>

      {confirmDialog}
    </div>
  );
}
