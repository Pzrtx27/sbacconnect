import { useMemo, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { CalendarPlus, Pencil, Trash2, Save, X, Eye, EyeOff, MapPin, RefreshCw, Repeat, Users } from 'lucide-react';
import { useEventsInRange, useClassRooms } from '../../hooks/useEvents';
import {
  EVENT_CATEGORIES,
  EVENT_TYPE_LABELS,
  DEFAULT_COLOR_BY_CATEGORY,
  DOT_COLORS,
  DAY_NAMES_FULL,
  eventTimeText,
  thaiShortDate,
  toLocalInputValue,
  toLocalDateValue,
  weeklyOccurrences,
} from '../../utils/events';

/* จัดการปฏิทินกิจกรรม — สำหรับฝ่ายวิชาการ (โมดูล A ในแผน)

   ของเดิมในหน้านี้เป็นฟอร์ม "ประกาศกิจกรรม" ที่ยิงไป Firebase
   ซึ่งถูกปิดถาวรไปแล้ว (ดู src/config/firebase.js) → กดแล้ว error ตลอด
   และต่อให้ยิงสำเร็จ ข้อมูลก็ไปคนละที่กับปฏิทินที่นักเรียนเห็น

   ตัวนี้เขียนลงตาราง events ตรง ๆ ซึ่งเป็นตารางเดียวกับที่ปฏิทินหน้านักเรียนอ่าน
   บันทึกปุ๊บขึ้นปั๊บผ่าน Realtime

   สิทธิ์: RLS ใน 10_events.sql เป็นตัวกัน ไม่ใช่โค้ดหน้านี้
   คนที่ไม่มี role academic/sysadmin ต่อให้ยิง API ตรงก็เขียนไม่ได้ */

const emptyDraft = () => {
  const start = new Date();
  start.setHours(9, 0, 0, 0);
  return {
    id: null,
    title: '',
    description: '',
    location: '',
    category: 'activity',
    color: DEFAULT_COLOR_BY_CATEGORY.activity,
    start_at: toLocalInputValue(start),
    end_at: '',
    all_day: false,
    is_published: true,

    // '' = ทั้งวิทยาลัย (แปลงเป็น null ตอนบันทึก)
    class_room_id: '',

    // การทำซ้ำใช้ตอนสร้างใหม่เท่านั้น ไม่ได้เก็บลง DB
    // ระบบจะแตกเป็นกิจกรรมจริงทีละสัปดาห์ให้ (ดู weeklyOccurrences)
    repeat_weekly: false,
    repeat_until: '',
  };
};

export default function EventManager() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [draft, setDraft] = useState(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // แสดงตั้งแต่ต้นเดือนนี้ไปข้างหน้า 1 ปี — ฝ่ายวิชาการต้องเห็นของเก่าในเดือนนี้ด้วย
  // เผื่อพิมพ์ผิดแล้วต้องย้อนกลับไปแก้
  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear() + 1, now.getMonth(), 1);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const { events, loading, reload } = useEventsInRange(from, to, { includeDrafts: true });
  const { rooms, labelOf } = useClassRooms();
  const { confirm, confirmDialog } = useConfirm();

  /* เลือกหลายรายการแล้วลบทีเดียว

     ที่มา: กิจกรรมที่ทำซ้ำทุกสัปดาห์ถูกแตกเป็นแถวจริงทีละสัปดาห์ (ดู weeklyOccurrences)
     ตั้งผิดทีเดียวจึงต้องไล่ลบทีละ 18 ครั้ง ผ่าน confirm 18 รอบ ซึ่งใช้ไม่ได้จริง
     ตัวกรองห้องช่วยอีกชั้น: กรองเหลือเฉพาะ ปวช.3/6 -> เลือกทั้งหมด -> ลบ จบในสามคลิก */
  const [selected, setSelected] = useState(() => new Set());
  const [roomFilter, setRoomFilter] = useState('all');
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const visibleEvents = useMemo(() => {
    if (roomFilter === 'all') return events;
    if (roomFilter === 'none') return events.filter((e) => e.classRoomId === null);
    // ค่าจาก <select> เป็น string เสมอ ส่วน id จาก DB อาจเป็นตัวเลข เทียบเป็น string ทั้งคู่
    return events.filter((e) => String(e.classRoomId) === roomFilter);
  }, [events, roomFilter]);

  const allVisibleSelected =
    visibleEvents.length > 0 && visibleEvents.every((e) => selected.has(e.id));

  const toggleSelected = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visibleEvents.map((e) => e.id)));

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;

    // ลบหลายรายการพร้อมกันย้อนไม่ได้ ต้องบอกจำนวนให้ชัดก่อนถาม
    const ok = await confirm({
      title: `ลบกิจกรรม ${ids.length} รายการ`,
      message: 'กิจกรรมที่เลือกไว้จะถูกลบออกจากปฏิทินถาวร และหายจากเครื่องนักเรียนทันที',
      detail: 'การลบนี้ย้อนกลับไม่ได้',
      confirmLabel: `ลบ ${ids.length} รายการ`,
      danger: true,
    });
    if (!ok) return;

    setBulkDeleting(true);
    try {
      // ยิงครั้งเดียวด้วย .in() ไม่ใช่วนลูปลบทีละใบ
      // RLS เป็นตัวกันว่าใครลบได้ (10_events.sql) หน้าเว็บไม่ได้ตัดสินใจเรื่องสิทธิ์เอง
      const { error } = await supabase.from('events').delete().in('id', ids);

      if (error) {
        console.error('[events] ลบหลายรายการไม่สำเร็จ:', error);
        showToast(
          error.code === '42501'
            ? 'บัญชีนี้ไม่มีสิทธิ์ลบกิจกรรม (ต้องมี role academic)'
            : `ลบไม่สำเร็จ: ${error.message}`,
          'error'
        );
        return;
      }

      showToast(`ลบกิจกรรม ${ids.length} รายการแล้ว`, 'success');
      setSelected(new Set());
      await reload();
    } finally {
      setBulkDeleting(false);
    }
  };

  const inputClass = `w-full rounded-xl px-4 py-2.5 text-xs font-semibold border focus:outline-none transition-all duration-200 ${
    isDark
      ? 'bg-slate-900 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50'
      : 'bg-slate-50 border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-surface-card'
  }`;

  const labelClass = `text-xs font-bold block mb-1 ${
    isDark ? 'text-content-secondary' : 'text-ink-secondary'
  }`;

  const startNew = () => {
    setDraft(emptyDraft());
    setFormOpen(true);
  };

  const startEdit = (evt) => {
    setDraft({
      id: evt.id,
      title: evt.title,
      description: evt.description,
      location: evt.location,
      category: evt.type,
      color: evt.color,
      start_at: toLocalInputValue(evt.start),
      end_at: evt.end ? toLocalInputValue(evt.end) : '',
      all_day: evt.allDay,
      is_published: evt.isPublished,
      class_room_id: evt.classRoomId ?? '',

      // แก้ไขทีละครั้ง ไม่แก้ทั้งชุด — กิจกรรมที่ซ้ำถูกแตกเป็นแถวแยกกันแล้ว
      repeat_weekly: false,
      repeat_until: '',
    });
    setFormOpen(true);
  };

  /** เปลี่ยนหมวดแล้วให้สีขยับตามอัตโนมัติ — ฝ่ายวิชาการไม่ต้องมานั่งจำว่าสอบใช้สีอะไร */
  const changeCategory = (category) => {
    setDraft((d) => ({
      ...d,
      category,
      color: DEFAULT_COLOR_BY_CATEGORY[category] || d.color,
    }));
  };

  const save = async () => {
    const title = draft.title.trim();
    if (!title) {
      showToast('กรุณากรอกชื่อกิจกรรม', 'error');
      return;
    }
    if (!draft.start_at) {
      showToast('กรุณาเลือกวันและเวลาที่เริ่ม', 'error');
      return;
    }
    if (draft.end_at && new Date(draft.end_at) < new Date(draft.start_at)) {
      showToast('เวลาสิ้นสุดต้องไม่มาก่อนเวลาเริ่ม', 'error');
      return;
    }

    const repeating = !draft.id && draft.repeat_weekly;
    if (repeating && !draft.repeat_until) {
      showToast('กรุณาเลือกวันสุดท้ายที่ให้ทำซ้ำถึง', 'error');
      return;
    }
    if (repeating && new Date(draft.repeat_until) < new Date(draft.start_at)) {
      showToast('วันสุดท้ายต้องอยู่หลังวันที่เริ่ม', 'error');
      return;
    }

    // new Date('2026-08-28T09:00') ตีความเป็นเวลาท้องถิ่น แล้ว toISOString() แปลงเป็น UTC
    // ตรงกับชนิด timestamptz ใน DB พอดี ไม่ต้องบวกลบ 7 ชั่วโมงเอง
    const base = {
      title,
      description: draft.description.trim() || null,
      location: draft.location.trim() || null,
      all_day: draft.all_day,
      category: draft.category,
      color: draft.color,
      is_published: draft.is_published,
      // '' จาก <select> ต้องแปลงเป็น null ไม่งั้น DB จะหาห้อง id เป็นสตริงว่าง
      class_room_id: draft.class_room_id || null,
    };

    // ซ้ำทุกสัปดาห์ = แตกเป็นหลายแถวส่งไปทีเดียว (insert เดียว ไม่ใช่วน request)
    const rows = repeating
      ? weeklyOccurrences(draft.start_at, draft.end_at || null, draft.repeat_until).map((occ) => ({
          ...base,
          start_at: occ.start.toISOString(),
          end_at: occ.end ? occ.end.toISOString() : null,
        }))
      : [
          {
            ...base,
            start_at: new Date(draft.start_at).toISOString(),
            end_at: draft.end_at ? new Date(draft.end_at).toISOString() : null,
          },
        ];

    setSaving(true);
    try {
      // created_by ไม่ได้ส่งไป ปล่อยให้ default app_current_user_id() ใน DB เติมเอง
      const { error } = draft.id
        ? await supabase.from('events').update(rows[0]).eq('id', draft.id)
        : await supabase.from('events').insert(rows);

      if (error) {
        console.error('[events] บันทึกไม่สำเร็จ:', error);
        showToast(
          error.code === '42501'
            ? 'บัญชีนี้ไม่มีสิทธิ์จัดการปฏิทิน (ต้องมี role academic)'
            : `บันทึกไม่สำเร็จ: ${error.message}`,
          'error'
        );
        return;
      }

      showToast(
        draft.id
          ? 'แก้ไขกิจกรรมเรียบร้อย'
          : repeating
          ? `เพิ่มกิจกรรม ${rows.length} ครั้งเรียบร้อย`
          : 'เพิ่มกิจกรรมเรียบร้อย',
        'success'
      );
      setFormOpen(false);
      setDraft(emptyDraft());
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (evt) => {
    // ลบแล้วหายจากเครื่องนักเรียนทันที ต้องถามก่อน
    const ok = await confirm({
      title: 'ลบกิจกรรมนี้',
      message: `"${evt.title}" จะถูกลบออกจากปฏิทินถาวร และหายจากเครื่องนักเรียนทันที`,
      detail: 'การลบนี้ย้อนกลับไม่ได้',
      confirmLabel: 'ลบกิจกรรม',
      danger: true,
    });
    if (!ok) return;

    setDeletingId(evt.id);
    try {
      const { error } = await supabase.from('events').delete().eq('id', evt.id);
      if (error) {
        showToast(`ลบไม่สำเร็จ: ${error.message}`, 'error');
        return;
      }
      showToast('ลบกิจกรรมแล้ว', 'success');
      await reload();
    } finally {
      setDeletingId(null);
    }
  };

  /** ซ่อน/แสดงโดยไม่ต้องลบ — เตรียมกิจกรรมไว้ก่อนแล้วค่อยกดเผยแพร่ทีหลังได้ */
  const togglePublish = async (evt) => {
    const { error } = await supabase
      .from('events')
      .update({ is_published: !evt.isPublished })
      .eq('id', evt.id);

    if (error) {
      showToast(`เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`, 'error');
      return;
    }
    showToast(evt.isPublished ? 'ซ่อนจากปฏิทินนักเรียนแล้ว' : 'เผยแพร่ขึ้นปฏิทินแล้ว', 'success');
    await reload();
  };

  return (
    <div
      className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${
        isDark ? 'bg-white/[0.04] border-white/5' : 'bg-surface-card border-slate-100'
      }`}
    >
      {confirmDialog}

      <div className="flex items-center justify-between gap-2">
        <h3
          className={`text-sm font-extrabold flex items-center gap-2 ${
            isDark ? 'text-white' : 'text-sbac-navy'
          }`}
        >
          <CalendarPlus size={18} className="text-brand" aria-hidden="true" />
          ปฏิทินกิจกรรม
        </h3>

        {!formOpen && (
          <button
            type="button"
            onClick={startNew}
            className="bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold px-3 py-2 rounded-xl text-[11px] transition-all active:scale-95 flex items-center gap-1.5"
          >
            <CalendarPlus size={13} aria-hidden="true" />
            เพิ่มกิจกรรม
          </button>
        )}
      </div>

      <p className={`text-[10px] leading-relaxed ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
        กิจกรรมที่บันทึกที่นี่จะขึ้นบนปฏิทินหน้าแรกของนักเรียนทันที ไม่ต้องรอให้เขาปิดแอปเปิดใหม่
      </p>

      {/* ---------- ฟอร์มเพิ่ม/แก้ไข ---------- */}
      {formOpen && (
        <div
          className={`rounded-2xl border p-4 space-y-3 ${
            isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
              {draft.id ? 'แก้ไขกิจกรรม' : 'กิจกรรมใหม่'}
            </span>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label="ปิดฟอร์ม"
              className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
            >
              <X size={14} className="text-content-muted" aria-hidden="true" />
            </button>
          </div>

          <div>
            <label className={labelClass} htmlFor="evt-title">ชื่อกิจกรรม</label>
            <input
              id="evt-title"
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className={inputClass}
              placeholder="เช่น กิจกรรมสัปดาห์วิทยาศาสตร์"
              maxLength={200}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="evt-desc">รายละเอียด (ไม่บังคับ)</label>
            <textarea
              id="evt-desc"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={inputClass}
              placeholder="ขั้นตอนปฏิบัติ สิ่งที่ต้องเตรียม ฯลฯ"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="evt-cat">หมวด</label>
              <select
                id="evt-cat"
                value={draft.category}
                onChange={(e) => changeCategory(e.target.value)}
                className={inputClass}
              >
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EVENT_TYPE_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="evt-loc">สถานที่ (ไม่บังคับ)</label>
              <input
                id="evt-loc"
                type="text"
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                className={inputClass}
                placeholder="เช่น หอประชุม"
              />
            </div>
          </div>

          {/* ห้องเรียน — ตัวที่ทำให้ รด. ของ 3/6 ไม่ไปโผล่บนเครื่องเด็ก 3/4 */}
          <div>
            <label className={labelClass} htmlFor="evt-room">กิจกรรมนี้ของใคร</label>
            <select
              id="evt-room"
              value={draft.class_room_id}
              onChange={(e) => setDraft({ ...draft, class_room_id: e.target.value })}
              className={inputClass}
            >
              <option value="">ทั้งวิทยาลัย (ทุกคนเห็น)</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  เฉพาะ {r.label}
                </option>
              ))}
            </select>
            <p className={`text-[10px] mt-1 ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
              เลือกห้องแล้วนักเรียนห้องอื่นจะไม่เห็นกิจกรรมนี้เลย ครูกับฝ่ายวิชาการยังเห็นทุกห้อง
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="evt-start">เริ่ม</label>
              <input
                id="evt-start"
                type="datetime-local"
                value={draft.start_at}
                onChange={(e) => setDraft({ ...draft, start_at: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="evt-end">สิ้นสุด (ไม่บังคับ)</label>
              <input
                id="evt-end"
                type="datetime-local"
                value={draft.end_at}
                onChange={(e) => setDraft({ ...draft, end_at: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.all_day}
                onChange={(e) => setDraft({ ...draft, all_day: e.target.checked })}
                className="w-4 h-4 accent-sbac-blue"
              />
              <span className={`text-[11px] font-bold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                ทั้งวัน
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.is_published}
                onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                className="w-4 h-4 accent-sbac-blue"
              />
              <span className={`text-[11px] font-bold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                เผยแพร่ให้นักเรียนเห็น
              </span>
            </label>
          </div>

          {/* ---------- ทำซ้ำทุกสัปดาห์ ---------- */}
          {/* เปิดให้ใช้เฉพาะตอนสร้างใหม่ — ตอนแก้ไขถือว่าแก้ครั้งนั้นครั้งเดียว */}
          {!draft.id && (
            <div
              className={`rounded-xl border p-3 space-y-3 ${
                isDark ? 'bg-white/[0.03] border-white/10' : 'bg-surface-card border-slate-200'
              }`}
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.repeat_weekly}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      repeat_weekly: e.target.checked,
                      // เดาวันสิ้นสุดให้ = สิ้นภาคเรียน (อีก 4 เดือน) แก้เองได้
                      repeat_until:
                        e.target.checked && !draft.repeat_until
                          ? toLocalDateValue(
                              new Date(
                                new Date(draft.start_at).setMonth(
                                  new Date(draft.start_at).getMonth() + 4
                                )
                              )
                            )
                          : draft.repeat_until,
                    })
                  }
                  className="w-4 h-4 accent-sbac-blue"
                />
                <Repeat size={14} className="text-brand" aria-hidden="true" />
                <span className={`text-[11px] font-bold ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                  ทำซ้ำทุกสัปดาห์
                  {draft.start_at && (
                    <> (ทุกวัน{DAY_NAMES_FULL[new Date(draft.start_at).getDay()]})</>
                  )}
                </span>
              </label>

              {draft.repeat_weekly && (
                <>
                  <div>
                    <label className={labelClass} htmlFor="evt-until">ทำซ้ำถึงวันที่</label>
                    <input
                      id="evt-until"
                      type="date"
                      value={draft.repeat_until}
                      onChange={(e) => setDraft({ ...draft, repeat_until: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  {draft.repeat_until && (
                    <p className={`text-[10px] leading-relaxed ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
                      จะสร้างกิจกรรมทั้งหมด{' '}
                      <span className="font-extrabold text-brand">
                        {weeklyOccurrences(draft.start_at, draft.end_at || null, draft.repeat_until).length} ครั้ง
                      </span>{' '}
                      แยกเป็นรายการละสัปดาห์ — สัปดาห์ไหนตรงวันหยุดก็ลบทิ้งทีละอันได้
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-extrabold py-3 rounded-xl text-xs transition-all shadow-button flex items-center justify-center gap-2"
          >
            <Save size={14} aria-hidden="true" />
            {saving ? 'กำลังบันทึก...' : draft.id ? 'บันทึกการแก้ไข' : 'เพิ่มลงปฏิทิน'}
          </button>
        </div>
      )}

      {/* ---------- รายการกิจกรรม ---------- */}
      {loading ? (
        <div className="text-center py-8">
          <RefreshCw className="animate-spin text-brand mx-auto mb-2" size={22} aria-hidden="true" />
          <span className="text-xs font-semibold text-content-muted">กำลังโหลดปฏิทิน...</span>
        </div>
      ) : events.length === 0 ? (
        <p className={`text-xs font-semibold text-center py-6 ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
          ยังไม่มีกิจกรรมในช่วง 1 ปีข้างหน้า
        </p>
      ) : (
        <>
          {/* ---------- แถบกรอง + เลือกหลายรายการ ---------- */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={roomFilter}
              onChange={(e) => {
                setRoomFilter(e.target.value);
                setSelected(new Set()); // เปลี่ยนตัวกรองแล้วล้างการเลือก กันเผลอลบของที่มองไม่เห็น
              }}
              aria-label="กรองตามห้องเรียน"
              className={`${inputClass} w-auto flex-1 min-w-[180px]`}
            >
              <option value="all">ทุกห้อง ({events.length})</option>
              <option value="none">เฉพาะกิจกรรมกลางทั้งวิทยาลัย</option>
              {rooms.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  เฉพาะ {r.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={toggleSelectAll}
              className={`px-3 py-2.5 rounded-xl text-[11px] font-bold border transition-colors ${
                isDark
                  ? 'border-white/10 text-content-secondary hover:bg-white/5'
                  : 'border-border text-ink-secondary hover:bg-slate-50'
              }`}
            >
              {allVisibleSelected ? 'ล้างการเลือก' : `เลือกทั้งหมด (${visibleEvents.length})`}
            </button>
          </div>

          {/* แถบยืนยันลบ โผล่เฉพาะตอนมีของถูกเลือก จะได้ไม่มีปุ่มลบค้างอยู่ตลอดเวลา */}
          {selected.size > 0 && (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border ${
                isDark ? 'bg-rose-500/10 border-rose-500/30' : 'bg-rose-50 border-rose-200'
              }`}
            >
              <span className="text-xs font-extrabold text-accent-rose">
                เลือกไว้ {selected.size} รายการ
              </span>
              <button
                type="button"
                onClick={bulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black bg-accent-rose text-white disabled:opacity-60 transition-all active:scale-95"
              >
                <Trash2 size={13} aria-hidden="true" />
                {bulkDeleting ? 'กำลังลบ...' : `ลบทั้ง ${selected.size} รายการ`}
              </button>
            </div>
          )}

          {visibleEvents.length === 0 ? (
            <p className={`text-xs font-semibold text-center py-6 ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
              ไม่มีกิจกรรมที่ตรงกับตัวกรองนี้
            </p>
          ) : (
        <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {visibleEvents.map((evt) => (
            <li
              key={evt.id}
              className={`flex items-start gap-3 p-3 rounded-xl border ${
                selected.has(evt.id)
                  ? isDark
                    ? 'bg-sbac-blue/15 border-sbac-blue/40'
                    : 'bg-sbac-blue/10 border-sbac-blue/30'
                  : isDark
                  ? 'bg-white/[0.03] border-white/10'
                  : 'bg-slate-50 border-slate-200'
              } ${evt.isPublished ? '' : 'opacity-60'}`}
            >
              <input
                type="checkbox"
                checked={selected.has(evt.id)}
                onChange={() => toggleSelected(evt.id)}
                aria-label={`เลือก ${evt.title}`}
                className="w-4 h-4 mt-1 shrink-0 accent-sbac-blue cursor-pointer"
              />

              <div
                className={`w-1 self-stretch min-h-[40px] rounded-full shrink-0 ${DOT_COLORS[evt.color] || 'bg-blue-500'}`}
                aria-hidden="true"
              />

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={`text-xs font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                    {evt.title}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isDark ? 'bg-white/10 text-content-secondary' : 'bg-surface-card text-ink-secondary'
                    }`}
                  >
                    {EVENT_TYPE_LABELS[evt.type] || evt.type}
                  </span>
                  {!evt.isPublished && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-accent-amber">
                      ฉบับร่าง
                    </span>
                  )}
                  {/* บอกให้ชัดว่ากิจกรรมนี้จำกัดห้อง ไม่ใช่ของกลาง */}
                  {evt.classRoomId !== null && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sbac-blue/15 text-brand flex items-center gap-1">
                      <Users size={9} aria-hidden="true" />
                      {labelOf(evt.classRoomId) || 'เฉพาะห้องเรียน'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap text-[10px] font-semibold text-content-muted">
                  <span>{thaiShortDate(evt.start)}</span>
                  <span>·</span>
                  <span>{eventTimeText(evt)}</span>
                  {evt.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin size={10} aria-hidden="true" /> {evt.location}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => togglePublish(evt)}
                  aria-label={evt.isPublished ? `ซ่อน ${evt.title}` : `เผยแพร่ ${evt.title}`}
                  title={evt.isPublished ? 'ซ่อนจากนักเรียน' : 'เผยแพร่'}
                  className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-surface-card'}`}
                >
                  {evt.isPublished ? (
                    <Eye size={14} className="text-accent-emerald" aria-hidden="true" />
                  ) : (
                    <EyeOff size={14} className="text-content-muted" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(evt)}
                  aria-label={`แก้ไข ${evt.title}`}
                  title="แก้ไข"
                  className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-surface-card'}`}
                >
                  <Pencil size={14} className="text-brand" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(evt)}
                  disabled={deletingId === evt.id}
                  aria-label={`ลบ ${evt.title}`}
                  title="ลบ"
                  className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${isDark ? 'hover:bg-white/10' : 'hover:bg-surface-card'}`}
                >
                  <Trash2 size={14} className="text-accent-rose" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
          )}
        </>
      )}
    </div>
  );
}
