import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { showToast } from '../ui/Toast';
import { fmtScore } from '../../utils/score';

/* กรอกคะแนน "หนึ่งหัวข้อ ทั้งห้อง" รวดเดียว

   นี่คือท่าที่ครูใช้จริงตอนตรวจใบงานเสร็จทั้งปึก: หยิบทีละใบ อ่านชื่อ ใส่เลข
   ล็อกหัวข้อไว้ทีละอันแล้วไล่ตามรายชื่อ จึงกรอกผิดช่องไม่ได้เลยโดยโครงสร้าง
   ต่างจากตารางสองแกนที่ต้องคอยนับว่าตอนนี้อยู่คอลัมน์ไหน

   ปุ่มบันทึกเป็นปุ่มเดียวจบ ส่งทั้งชุดในธุรกรรมเดียว (bulk_save_scores)
   เข้าครบทุกคนหรือไม่เข้าเลย ไม่มีสภาพครึ่ง ๆ กลาง ๆ ที่ครูไม่รู้ว่าถึงไหนแล้ว */
export default function BulkScoreEntry({ leafItems, students, canGrade, saving, onBulkSave }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [itemId, setItemId] = useState(leafItems[0]?.id || '');
  const [drafts, setDrafts] = useState({});

  /* ช่องที่ครูพิมพ์แล้วแต่ยังไม่ได้กดบันทึก — ห้ามให้ข้อมูลจากเซิร์ฟเวอร์มาทับ

     ที่ต้องมี: useSubjectGradebook ดึงข้อมูลใหม่ทุก 60 วินาทีตอนเรียลไทม์ต่อติด
     และทุก 8 วินาทีตอนต่อไม่ติด (ดู useRealtimeTable) ซึ่งทำให้ students ได้ reference ใหม่
     ถ้า sync ทับหมดทุกครั้ง ครูที่กำลังไล่กรอกคะแนนทั้งห้อง 30 คนจะโดนล้างทิ้ง
     กลางคันทุก 8 วินาที โดยไม่มีอะไรเตือน ซึ่งเป็นบั๊กที่หาสาเหตุยากมาก
     เพราะบนเครื่องที่เน็ตดีจะนาน ๆ เกิดที จนดูเหมือนเป็นเรื่องบังเอิญ */
  const dirtyRef = useRef(new Set());
  const lastItemIdRef = useRef(itemId);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const borderSubtle = isDark ? 'border-white/10' : 'border-slate-100';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  const activeItem = useMemo(
    () => leafItems.find((i) => i.id === itemId) || null,
    [leafItems, itemId]
  );

  // หัวข้อถูกลบทิ้งระหว่างที่หน้านี้เปิดอยู่ (ครูอีกคนแก้โครงสร้าง) ต้องเด้งกลับไปอันแรก
  useEffect(() => {
    if (leafItems.length > 0 && !leafItems.some((i) => i.id === itemId)) {
      setItemId(leafItems[0].id);
    }
  }, [leafItems, itemId]);

  // เปลี่ยนหัวข้อ = โหลดคะแนนเดิมของหัวข้อนั้นมาใส่ช่องให้ครบทุกคน
  // ข้อมูลมาใหม่เฉย ๆ = sync เฉพาะช่องที่ครูยังไม่ได้แตะ
  useEffect(() => {
    if (!itemId) return;

    const switchedItem = lastItemIdRef.current !== itemId;
    if (switchedItem) {
      // คนละหัวข้อคือคนละชุดคะแนน ของที่ค้างอยู่ใช้ต่อไม่ได้อยู่แล้ว
      dirtyRef.current = new Set();
      lastItemIdRef.current = itemId;
    }

    setDrafts((prev) => {
      const next = {};
      for (const student of students) {
        if (!switchedItem && dirtyRef.current.has(student.user_id)) {
          next[student.user_id] = prev[student.user_id] ?? '';
          continue;
        }
        const cell = student.scores?.[itemId];
        next[student.user_id] = cell ? fmtScore(cell.score) : '';
      }
      return next;
    });
  }, [itemId, students]);

  const handleSave = async () => {
    if (!activeItem) return;

    const max = Number(activeItem.max_score) || 0;
    const rows = [];
    const invalid = [];

    for (const student of students) {
      const raw = String(drafts[student.user_id] ?? '').trim();

      if (raw === '') {
        // ปล่อยว่าง = ยังไม่ประกาศ ไม่ใช่ศูนย์ — ข้ามไปเลย ไม่ส่งเป็น null
        // เพราะ null จะไปลบคะแนนเดิมของคนที่ครูไม่ได้ตั้งใจแตะทิ้ง
        continue;
      }

      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
        invalid.push(student.full_name);
        continue;
      }

      rows.push({ student_user_id: student.user_id, score: parsed });
    }

    /* ตรวจก่อนยิง ไม่ใช่ปล่อยให้ DB ตีกลับทีละแถว
       ครูพิมพ์ 100 ในช่องที่เต็ม 10 คือพิมพ์ผิด ไม่ใช่ตั้งใจ
       บอกตั้งแต่ยังไม่บันทึกดีกว่าบันทึกไปครึ่งห้องแล้วค่อยขึ้นแดง */
    if (invalid.length > 0) {
      showToast(
        `คะแนนต้องอยู่ระหว่าง 0 ถึง ${fmtScore(max)} — ตรวจของ ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? ` และอีก ${invalid.length - 3} คน` : ''}`,
        'error'
      );
      return;
    }

    if (rows.length === 0) {
      showToast('ยังไม่ได้กรอกคะแนนของใครเลย', 'info');
      return;
    }

    const ok = await onBulkSave({ itemId, rows });

    /* บันทึกผ่านแล้วค่อยปล่อยให้เซิร์ฟเวอร์เป็นเจ้าของค่าอีกครั้ง
       ถ้าบันทึกไม่ผ่าน ต้องคงสิ่งที่ครูพิมพ์ไว้ทั้งหมด ไม่ใช่ล้างทิ้งแล้วให้กรอกใหม่ */
    if (ok) dirtyRef.current = new Set();
  };

  if (leafItems.length === 0) {
    return (
      <p className={`text-xs text-center py-10 leading-relaxed ${textMuted}`}>
        วิชานี้ยังไม่มีหัวข้อคะแนน
        <br />
        ไปที่แท็บ &ldquo;หัวข้อ T1-T5&rdquo; เพื่อสร้างก่อน
      </p>
    );
  }

  const filledCount = students.filter((s) => String(drafts[s.user_id] ?? '').trim() !== '').length;

  return (
    <div className="space-y-3.5">
      <div className="space-y-1.5">
        <label htmlFor="bulk-item" className={`text-[11px] font-bold block ${textMuted}`}>
          เลือกหัวข้อที่จะกรอก
        </label>
        <select
          id="bulk-item"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className={`w-full text-xs font-semibold rounded-xl border px-3 py-2.5 outline-none transition-colors ${bgInput}`}
        >
          {leafItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} {item.label ? `— ${item.label}` : ''} (เต็ม {fmtScore(item.max_score)})
            </option>
          ))}
        </select>
      </div>

      {!canGrade && (
        <div className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${
          isDark ? 'bg-amber-950/20 border-amber-900/30 text-accent-amber' : 'bg-amber-50 border-amber-100 text-accent-amber'
        }`}>
          คุณไม่ใช่ครูประจำวิชานี้ จึงดูได้อย่างเดียว แก้คะแนนไม่ได้
        </div>
      )}

      {/* โหมดนี้ไม่มีปุ่มบวก/ลบโดยตั้งใจ — งานตรงนี้คือไล่กรอกคะแนนดิบทั้งห้องรวดเดียว
          ส่วนการให้/ตัดทีละคะแนนเป็นงานรายคน ซึ่งอยู่ในโหมด "รายคน"
          เขียนบอกไว้เลย ครูจะได้ไม่ต้องหาปุ่มที่ไม่มี */}
      {canGrade && (
        <p className={`text-[10px] leading-relaxed ${textMuted}`}>
          พิมพ์คะแนนดิบของแต่ละคน แล้วกดปุ่มบันทึกด้านล่างทีเดียว
          — ถ้าต้องการให้หรือตัดคะแนนทีละ 1 พร้อมเหตุผล ให้ไปที่โหมด &ldquo;รายคน&rdquo;
        </p>
      )}

      <div className={`flex items-center justify-between text-[11px] font-bold ${textMuted}`}>
        <span className="flex items-center gap-1.5">
          <Users size={13} aria-hidden="true" />
          นักเรียน {students.length} คน
        </span>
        <span>กรอกแล้ว {filledCount} คน</span>
      </div>

      <div className={`rounded-2xl border divide-y ${
        isDark ? 'bg-white/[0.04] border-white/10 divide-white/10' : 'bg-surface-card border-slate-100 divide-slate-100'
      }`}>
        {students.length === 0 && (
          <p className={`text-xs text-center py-8 ${textMuted}`}>ยังไม่มีนักเรียนในห้องนี้</p>
        )}

        {students.map((student, idx) => (
          <div key={student.user_id} className="flex items-center gap-2.5 px-3.5 py-2.5">
            <span className={`text-[10px] font-bold w-5 shrink-0 ${textMuted}`}>{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <div className={`text-[11px] font-bold truncate ${textSecondary}`}>{student.full_name}</div>
              {student.student_code && (
                <div className={`text-[10px] ${textMuted}`}>{student.student_code}</div>
              )}
            </div>

            <input
              type="text"
              inputMode="decimal"
              value={drafts[student.user_id] ?? ''}
              disabled={!canGrade || saving}
              onChange={(e) => {
                dirtyRef.current.add(student.user_id);
                setDrafts((prev) => ({ ...prev, [student.user_id]: e.target.value }));
              }}
              placeholder="-"
              aria-label={`คะแนนของ ${student.full_name}`}
              className={`w-16 text-center text-xs font-bold rounded-lg border px-1.5 py-1.5 outline-none transition-colors disabled:opacity-50 ${bgInput}`}
            />
            <span className={`text-[11px] font-semibold shrink-0 w-8 ${textMuted}`}>
              /{fmtScore(activeItem?.max_score)}
            </span>
          </div>
        ))}
      </div>

      <div className={`text-[10px] leading-relaxed ${textMuted}`}>
        ช่องที่เว้นว่างไว้จะไม่ถูกบันทึก และไม่ไปลบคะแนนเดิมที่มีอยู่
        — ใช้ช่อง &ldquo;ล้างคะแนน&rdquo; ในหน้ารายคนถ้าต้องการลบจริง ๆ
      </div>

      <button
        type="button"
        disabled={!canGrade || saving || students.length === 0}
        onClick={handleSave}
        className="w-full flex items-center justify-center gap-2 bg-sbac-blue hover:bg-sbac-navy text-white text-xs font-bold py-3 rounded-2xl shadow-lg shadow-sbac-blue/20 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
      >
        <CheckCircle2 size={15} aria-hidden="true" />
        {saving ? 'กำลังบันทึก...' : `บันทึกคะแนน ${activeItem?.code || ''} ทั้งห้อง`}
      </button>
    </div>
  );
}
