import { useState, useEffect } from 'react';
import { Plus, Archive, Pencil, X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';

/* เพิ่ม/แก้/เก็บรายวิชา — สำหรับฝ่ายวิชาการและแอดมิน

   ทำไมเพิ่งมี: upsert_subject() กับ archive_subject() อยู่ใน 40_gradebook.sql
   มาตั้งแต่แรกและ grant ให้ authenticated แล้ว แต่ไม่มีโค้ดฝั่งเว็บเรียกเลย
   ทางเดียวที่เพิ่มวิชาได้คือเปิด Supabase SQL Editor ซึ่งคนทำงานวิชาการไม่ได้ทำเป็น
   ฟีเจอร์จึงเท่ากับไม่มี แถม empty state ของสมุดคะแนนยังเขียนชี้ให้ไปหาหน้าจอนี้
   ที่ไม่เคยมีอยู่จริง

   รายวิชาที่ seed มาจาก timetables ผูก teacher_user_id ไม่ได้ (ชีตเก็บชื่อเป็นข้อความ)
   ช่องเลือกครูตรงนี้จึงเป็นทางเดียวที่จะผูกครูประจำวิชาให้ถูกคน ซึ่งมีผลกับสิทธิ์
   กรอกคะแนนโดยตรง (ดู app_can_grade_subject ใน 46_bind_subject_teachers.sql) */

const EMPTY_FORM = {
  subjectId: null,
  classRoomId: '',
  term: '1/2569',
  code: '',
  name: '',
  credits: 1,
  teacherUserId: '',
  sortOrder: '',
};

export default function SubjectManager({ subjects, classRooms, onSave, onArchive }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { confirm, confirmDialog } = useConfirm();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [teachers, setTeachers] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc('list_teachers').then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        console.error('[score] โหลดรายชื่อครูไม่สำเร็จ:', error);
        return;
      }
      setTeachers(Array.isArray(data) ? data : []);
    });
    return () => { alive = false; };
  }, []);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white placeholder:text-content-muted'
    : 'bg-slate-50 border-slate-200 text-ink';

  const startNew = () => {
    setForm({ ...EMPTY_FORM, classRoomId: classRooms[0]?.id ?? '' });
    setOpen(true);
  };

  const startEdit = (s) => {
    setForm({
      subjectId: s.subject_id,
      classRoomId: s.class_room_id,
      term: s.term || '1/2569',
      code: s.code || '',
      name: s.name || '',
      credits: s.credits ?? 1,
      teacherUserId: s.teacher_user_id || '',
      sortOrder: s.sort_order ?? '',
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      showToast('กรุณาระบุชื่อรายวิชา', 'error');
      return;
    }
    if (!form.classRoomId) {
      showToast('กรุณาเลือกห้องเรียน', 'error');
      return;
    }

    setSaving(true);
    const result = await onSave({
      subjectId: form.subjectId,
      classRoomId: Number(form.classRoomId),
      term: form.term.trim(),
      code: form.code.trim() || null,
      name: form.name.trim(),
      credits: Number(form.credits) || 1,
      teacherUserId: form.teacherUserId || null,
      sortOrder: form.sortOrder === '' ? null : Number(form.sortOrder),
    });
    setSaving(false);

    if (!result.ok) {
      showToast(
        result.error === 'FORBIDDEN' ? 'บัญชีนี้ไม่มีสิทธิ์จัดการรายวิชา' : 'บันทึกไม่สำเร็จ กรุณาลองใหม่',
        'error',
      );
      return;
    }

    showToast(form.subjectId ? 'แก้ไขรายวิชาแล้ว' : 'เพิ่มรายวิชาแล้ว', 'success');
    setOpen(false);
    setForm(EMPTY_FORM);
  };

  const archive = async (s) => {
    const ok = await confirm({
      title: 'เก็บรายวิชานี้ออกจากระบบ?',
      message: `${s.name} · ${s.class_label} · ภาคเรียน ${s.term}`,
      detail: 'วิชาจะหายจากสมุดคะแนนและหน้าคะแนนของนักเรียน แต่คะแนนที่กรอกไว้ยังอยู่ในฐานข้อมูล เปิดกลับมาได้ภายหลัง',
      danger: true,
      confirmLabel: 'เก็บออก',
    });
    if (!ok) return;

    const result = await onArchive(s.subject_id, false);
    if (!result.ok) {
      showToast(result.error === 'FORBIDDEN' ? 'บัญชีนี้ไม่มีสิทธิ์' : 'ทำรายการไม่สำเร็จ', 'error');
      return;
    }
    showToast('เก็บรายวิชาออกแล้ว', 'success');
  };

  return (
    <div className="space-y-3">
      {confirmDialog}

      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-extrabold ${textPrimary}`}>จัดการรายวิชา</span>
        <button
          type="button"
          onClick={open ? () => setOpen(false) : startNew}
          className="flex items-center gap-1.5 px-3 min-h-11 rounded-xl text-xs font-bold bg-sbac-blue hover:bg-sbac-navy text-white transition-colors"
        >
          {open ? <X size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
          {open ? 'ปิดฟอร์ม' : 'เพิ่มรายวิชา'}
        </button>
      </div>

      {open && (
        <div className={`rounded-2xl border p-4 space-y-3 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-100'}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={`text-[11px] font-bold block mb-1 ${textMuted}`}>ชื่อรายวิชา</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="เช่น การเขียนโปรแกรมเบื้องต้น"
                className={`w-full border rounded-xl px-3 min-h-11 text-sm font-semibold outline-none ${bgInput}`}
              />
            </label>

            <label className="block">
              <span className={`text-[11px] font-bold block mb-1 ${textMuted}`}>ห้องเรียน</span>
              <select
                value={form.classRoomId}
                onChange={(e) => setForm((f) => ({ ...f, classRoomId: e.target.value }))}
                className={`w-full border rounded-xl px-3 min-h-11 text-sm font-bold outline-none ${bgInput}`}
              >
                <option value="">— เลือกห้อง —</option>
                {classRooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={`text-[11px] font-bold block mb-1 ${textMuted}`}>ภาคเรียน</span>
              <input
                value={form.term}
                onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))}
                placeholder="1/2569"
                className={`w-full border rounded-xl px-3 min-h-11 text-sm font-semibold outline-none ${bgInput}`}
              />
            </label>

            <label className="block">
              <span className={`text-[11px] font-bold block mb-1 ${textMuted}`}>หน่วยกิต</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={form.credits}
                onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
                className={`w-full border rounded-xl px-3 min-h-11 text-sm font-semibold outline-none ${bgInput}`}
              />
            </label>

            <label className="block sm:col-span-2">
              {/* ผูกครูตรงนี้มีผลกับสิทธิ์กรอกคะแนนโดยตรง ไม่ใช่แค่ป้ายชื่อ */}
              <span className={`text-[11px] font-bold block mb-1 ${textMuted}`}>ครูประจำวิชา</span>
              <select
                value={form.teacherUserId}
                onChange={(e) => setForm((f) => ({ ...f, teacherUserId: e.target.value }))}
                className={`w-full border rounded-xl px-3 min-h-11 text-sm font-bold outline-none ${bgInput}`}
              >
                <option value="">— ยังไม่ระบุ (ครูประจำชั้นกรอกแทน) —</option>
                {teachers.map((t) => (
                  <option key={t.user_id || t.id} value={t.user_id || t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
              <span className={`text-[11px] font-semibold block mt-1 leading-relaxed ${textMuted}`}>
                ครูที่เลือกจะกรอกคะแนนวิชานี้ได้ ถ้าไม่ระบุ ครูประจำชั้นของห้องนั้นเป็นคนกรอก
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="w-full min-h-11 rounded-xl text-sm font-extrabold bg-sbac-blue hover:bg-sbac-navy text-white transition-colors disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : form.subjectId ? 'บันทึกการแก้ไข' : 'เพิ่มรายวิชา'}
          </button>
        </div>
      )}

      {subjects.length > 0 && (
        <ul className="space-y-1.5">
          {subjects.map((s) => (
            <li
              key={s.subject_id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                isDark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-slate-100'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className={`text-xs font-bold truncate ${textPrimary}`}>{s.name}</div>
                <div className={`text-[11px] font-semibold ${textMuted}`}>
                  {s.class_label} · ภาคเรียน {s.term} ·{' '}
                  {s.teacher_user_id ? s.teacher_name : 'ยังไม่ผูกครู'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => startEdit(s)}
                aria-label={`แก้ไข ${s.name}`}
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isDark ? 'hover:bg-white/10 text-content-secondary' : 'hover:bg-slate-100 text-ink-muted'
                }`}
              >
                <Pencil size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => archive(s)}
                aria-label={`เก็บ ${s.name} ออก`}
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-accent-rose hover:bg-rose-500/10 transition-colors"
              >
                <Archive size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
