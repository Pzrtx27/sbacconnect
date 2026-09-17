import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import { CalendarOff, ChevronRight, Trash2 } from 'lucide-react';
import { todayISO } from '../../utils/timetable';

/* ช่วงเวลาที่ครูไม่พร้อมสอน — ป้อนข้อมูลให้ตัวคัดกรองครูสอนแทน (52_substitute_picker.sql)

   ทำไมไม่ใช้ leave_requests: ตารางนั้นเป็นใบลา "ของนักเรียน" มีขั้นอนุมัติสองชั้น
   และ submit_leave_request ตอบ STUDENT_ONLY ถ้าคนยื่นไม่มีแถวใน student_profiles
   ครูจึงยื่นไม่ได้ตั้งแต่แรก ตารางนี้ตอบคำถามเดียวคือ "คาบนี้ครูคนนี้ว่างไหม"
   จึงไม่เก็บเหตุผลหรือเอกสารส่วนตัวของครู

   ถ้าไม่มีใครกรอกตรงนี้ รายการครูสอนแทนจะขึ้นครูทุกคน ซึ่งยังใช้งานได้
   แค่ไม่ได้ช่วยคัดกรองให้ — ไม่ใช่สถานะที่พัง */

const PERIODS = Array.from({ length: 12 }, (_, i) => i + 1);

const blankForm = () => ({
  teacher_user_id: '',
  start_date: todayISO(),
  end_date: todayISO(),
  first_period: 1,
  last_period: 12,
  note: '',
});

export default function TeacherAbsencePanel() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { confirm, confirmDialog } = useConfirm();

  const [isOpen, setIsOpen] = useState(false);
  const [teachers, setTeachers] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [notReady, setNotReady] = useState('');

  const load = useCallback(async () => {
    const [teacherRes, absenceRes] = await Promise.all([
      supabase.rpc('list_teachers'),
      supabase
        .from('teacher_absences')
        .select('id, teacher_user_id, start_date, end_date, first_period, last_period, note')
        .order('start_date', { ascending: false })
        .limit(200),
    ]);

    if (teacherRes.error) console.error('[academic] โหลดรายชื่อครูไม่สำเร็จ:', teacherRes.error);
    else setTeachers(Array.isArray(teacherRes.data) ? teacherRes.data : []);

    /* 42P01 = ตารางยังไม่มี แปลว่ายังไม่ได้รัน migration
       บอกชื่อไฟล์ไปเลยดีกว่าปล่อยให้เห็นรายการว่างแล้วนึกว่าไม่มีใครลา */
    if (absenceRes.error) {
      console.error('[academic] โหลดช่วงลาครูไม่สำเร็จ:', absenceRes.error);
      setNotReady(
        absenceRes.error.code === '42P01'
          ? 'ยังไม่ได้ติดตั้งตารางช่วงลาครู — รัน 52_substitute_picker.sql ใน Supabase ก่อน'
          : 'โหลดช่วงลาครูไม่สำเร็จ กรุณาลองใหม่'
      );
      setAbsences([]);
    } else {
      setNotReady('');
      setAbsences(absenceRes.data || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      load();
    }
  }, [isOpen, load]);

  const teacherName = (id) => teachers.find((t) => t.user_id === id)?.full_name || 'ครูที่ถูกลบบัญชีแล้ว';

  const handleAdd = async (e) => {
    e.preventDefault();

    if (!form.teacher_user_id) {
      showToast('กรุณาเลือกครู', 'error');
      return;
    }
    if (form.end_date < form.start_date) {
      showToast('วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม', 'error');
      return;
    }
    if (Number(form.last_period) < Number(form.first_period)) {
      showToast('คาบสิ้นสุดต้องไม่มาก่อนคาบเริ่ม', 'error');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('teacher_absences').insert({
      teacher_user_id: form.teacher_user_id,
      start_date: form.start_date,
      end_date: form.end_date,
      first_period: Number(form.first_period),
      last_period: Number(form.last_period),
      note: form.note.trim(),
    });
    setSaving(false);

    if (error) {
      console.error('[academic] บันทึกช่วงลาครูไม่สำเร็จ:', error);
      showToast(
        error.code === '42501'
          ? 'บัญชีนี้ไม่มีสิทธิ์บันทึกช่วงลาครู (เฉพาะฝ่ายวิชาการ)'
          : `บันทึกไม่สำเร็จ (${error.code || 'ไม่ทราบรหัส'})`,
        'error'
      );
      return;
    }

    showToast('บันทึกช่วงลาครูแล้ว — ครูคนนี้จะไม่ขึ้นในรายการสอนแทนของคาบนั้น', 'success');
    setForm(blankForm());
    load();
  };

  const handleDelete = async (row) => {
    const ok = await confirm({
      title: `ยกเลิกช่วงลาของ ${teacherName(row.teacher_user_id)}?`,
      message: `${row.start_date} ถึง ${row.end_date} · คาบ ${row.first_period}–${row.last_period}`,
      detail: 'ครูคนนี้จะกลับมาเลือกเป็นครูสอนแทนในช่วงนั้นได้ทันที',
      confirmLabel: 'ยกเลิกช่วงลา',
      danger: true,
    });
    if (!ok) return;

    const { error } = await supabase.from('teacher_absences').delete().eq('id', row.id);
    if (error) {
      console.error('[academic] ลบช่วงลาครูไม่สำเร็จ:', error);
      showToast('ลบไม่สำเร็จ กรุณาลองใหม่', 'error');
      return;
    }
    showToast('ยกเลิกช่วงลาแล้ว', 'success');
    load();
  };

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';
  const labelCls = `text-[11px] font-bold block mb-1 ${textMuted}`;
  const fieldCls = `w-full border rounded-lg px-2.5 py-2 text-xs font-semibold focus:outline-none disabled:opacity-50 ${bgInput}`;

  return (
    <>
      <GlassCard onClick={() => setIsOpen(true)}>
        <div className="flex flex-col h-full justify-between min-h-[110px]">
          <div>
            <CalendarOff className="text-accent-amber mb-2" size={24} />
            <div className={`text-sm font-extrabold ${textPrimary}`}>ช่วงลาของครู</div>
            <div className={`text-[11px] mt-1 leading-snug ${textMuted}`}>
              บันทึกวันที่ครูไม่พร้อมสอน — ใช้คัดออกจากรายการสอนแทน
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[9px] font-semibold text-brand">จัดการ</span>
            <ChevronRight size={14} className={textMuted} />
          </div>
        </div>
      </GlassCard>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="ช่วงลาของครู" icon={CalendarOff} tone="amber">
        <div className="space-y-5">
          {notReady && (
            <p role="alert" className="text-[11px] font-bold text-accent-rose leading-relaxed">
              {notReady}
            </p>
          )}

          <form onSubmit={handleAdd} className="space-y-3">
            <fieldset disabled={saving || !!notReady} className="space-y-3">
              <div>
                <label htmlFor="absence-teacher" className={labelCls}>ครู</label>
                <select
                  id="absence-teacher"
                  value={form.teacher_user_id}
                  onChange={(e) => set('teacher_user_id', e.target.value)}
                  className={fieldCls}
                >
                  <option value="">— เลือกครู —</option>
                  {teachers.map((t) => (
                    <option key={t.user_id} value={t.user_id}>{t.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="absence-start" className={labelCls}>วันเริ่ม</label>
                  <input
                    id="absence-start"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => set('start_date', e.target.value)}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label htmlFor="absence-end" className={labelCls}>วันสิ้นสุด</label>
                  <input
                    id="absence-end"
                    type="date"
                    min={form.start_date}
                    value={form.end_date}
                    onChange={(e) => set('end_date', e.target.value)}
                    className={fieldCls}
                  />
                </div>
              </div>

              {/* ลาทั้งวันคือ 1–12 ซึ่งเป็นค่าตั้งต้น
                  แยกคาบไว้เผื่อครูติดประชุมแค่ช่วงเช้าแล้วบ่ายกลับมาสอนได้ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="absence-first" className={labelCls}>ตั้งแต่คาบ</label>
                  <select
                    id="absence-first"
                    value={form.first_period}
                    onChange={(e) => set('first_period', Number(e.target.value))}
                    className={fieldCls}
                  >
                    {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="absence-last" className={labelCls}>ถึงคาบ</label>
                  <select
                    id="absence-last"
                    value={form.last_period}
                    onChange={(e) => set('last_period', Number(e.target.value))}
                    className={fieldCls}
                  >
                    {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="absence-note" className={labelCls}>หมายเหตุ (ไม่บังคับ)</label>
                <input
                  id="absence-note"
                  type="text"
                  maxLength={200}
                  value={form.note}
                  onChange={(e) => set('note', e.target.value)}
                  placeholder="เช่น อบรมนอกสถานที่"
                  className={fieldCls}
                />
              </div>

              <button
                type="submit"
                className="w-full bg-sbac-blue hover:bg-sbac-navy disabled:opacity-50 text-white font-extrabold py-2.5 rounded-xl text-xs transition-all"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกช่วงลา'}
              </button>
            </fieldset>
          </form>

          <div className="space-y-2">
            <p className={`text-[11px] font-bold ${textMuted}`}>ช่วงลาที่บันทึกไว้</p>

            {loading ? (
              <div className="space-y-2" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={`h-12 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
                ))}
              </div>
            ) : absences.length === 0 ? (
              <p className={`text-[11px] py-4 text-center ${textMuted}`}>
                ยังไม่มีช่วงลาที่บันทึกไว้ — รายการสอนแทนจะขึ้นครูทุกคน
              </p>
            ) : (
              <ul className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {absences.map((row) => (
                  <li
                    key={row.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
                      isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`text-xs font-bold truncate ${textPrimary}`}>
                        {teacherName(row.teacher_user_id)}
                      </div>
                      <div className={`text-[11px] ${textMuted}`}>
                        {row.start_date === row.end_date
                          ? row.start_date
                          : `${row.start_date} – ${row.end_date}`}
                        {' · '}
                        {row.first_period === 1 && row.last_period === 12
                          ? 'ทั้งวัน'
                          : `คาบ ${row.first_period}–${row.last_period}`}
                        {row.note ? ` · ${row.note}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      title="ยกเลิกช่วงลานี้"
                      className="shrink-0 p-2 rounded-lg text-accent-rose hover:bg-rose-500/10 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      {confirmDialog}
    </>
  );
}
