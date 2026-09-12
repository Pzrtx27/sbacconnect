import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronDown, Minus, Plus, Trash2, Save, History, Check, X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfirm } from '../ui/ConfirmDialog';
import ScoreGauge from './ScoreGauge';
import { useScoreLogs } from '../../hooks/useGradebook';
import { fmtScore, getScoreTier, scorePercent } from '../../utils/score';

/* ฟอร์มกรอกคะแนนของนักเรียน "หนึ่งคน" ครบทุกหัวข้อ T1-T5 ในหน้าจอเดียว

   ทำไมเป็นรายคนก่อน ไม่ใช่ตารางทั้งห้อง:
     ตารางนักเรียน 30 คน x หัวข้อ 10 ช่อง คือ 300 ช่องในโมดัลกว้าง 512px
     ต่อให้เลื่อนสองแกนได้ ครูก็กรอกผิดแถวจนต้องไล่แก้ย้อนหลัง
     งานจริงที่ครูทำในโมดัลนี้คือ "เด็กคนนี้มาถามว่าคะแนนหายตรงไหน" ซึ่งเป็นรายคนเสมอ
     ส่วนการกรอกทั้งห้องรวดเดียวอยู่ในโหมด "ทั้งห้อง" ซึ่งล็อกทีละหัวข้อจึงกรอกผิดยาก

   การบันทึก: ช่องคะแนนบันทึกตอนออกจากช่อง (blur) หรือกด Enter
   ไม่มีปุ่ม "บันทึกทั้งหมด" เพราะครูมักปิดโมดัลทันทีหลังพิมพ์ช่องสุดท้าย
   แล้วคะแนนที่พิมพ์ไว้จะหายไปเงียบ ๆ โดยไม่มีใครรู้ */
export default function StudentScoreEditor({
  student,
  items,
  subject,
  canGrade,
  saving,
  onBack,
  onSaveScore,
  onAdjustScore,
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { confirm, confirmDialog } = useConfirm();

  /* ปูมของนักเรียนคนนี้ในวิชานี้ — โหลดใหม่ทุกครั้งที่คะแนนเปลี่ยน (student เปลี่ยน reference)
     คำถามที่ครูต้องตอบบ่อยที่สุดคือ "คะแนนหนูหายไปไหน" ซึ่งเดิมตอบไม่ได้เลย
     ต้องไปรื้อสมุดจดของตัวเองหรือเชื่อความจำ ตรงนี้ตอบได้ทันทีว่าใครทำอะไรเมื่อไหร่ */
  const { logs, reload: reloadLogs } = useScoreLogs({
    subjectId: subject?.id || null,
    studentUserId: student?.user_id || null,
    enabled: Boolean(subject?.id && student?.user_id),
  });

  const [drafts, setDrafts] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [adjustReason, setAdjustReason] = useState('');
  // คะแนนเป้าหมายที่สะสมไว้แต่ยังไม่ได้กดยืนยัน คีย์ด้วย item id (ดู bumpPending ข้างล่าง)
  const [pendingTarget, setPendingTarget] = useState({});

  /* ช่องที่ครูพิมพ์แล้วแต่ยังไม่ได้บันทึก — ห้ามให้ข้อมูลจากเซิร์ฟเวอร์มาทับ

     ที่ต้องมี: useSubjectGradebook ดึงข้อมูลใหม่ทุก 60 วินาทีตอนเรียลไทม์ต่อติด
     และทุก 8 วินาทีตอนต่อไม่ติด (ดู useRealtimeTable) ทุกรอบ student ได้ reference ใหม่
     ถ้าซิงก์ทับทุกครั้ง ตัวเลขที่ครูกำลังพิมพ์ค้างอยู่จะหายกลางคันโดยไม่มีอะไรเตือน
     เป็นบั๊กที่หาสาเหตุยากมาก เพราะบนเน็ตที่ดีจะนาน ๆ เกิดที จนดูเหมือนเรื่องบังเอิญ */
  const dirtyRef = useRef(new Set());
  const lastStudentRef = useRef(student?.user_id);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const borderSubtle = isDark ? 'border-white/10' : 'border-slate-100';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  /* ซิงก์ค่าในช่องกรอกกับข้อมูลจริงทุกครั้งที่ข้อมูลเปลี่ยน
     จำเป็นเพราะ realtime อาจส่งคะแนนที่ครูอีกคนเพิ่งแก้เข้ามาระหว่างที่หน้านี้เปิดอยู่
     ถ้าไม่ซิงก์ ครูจะเห็นเลขเก่าค้างแล้วเซฟทับงานของอีกคนโดยไม่รู้ตัว */
  useEffect(() => {
    // เปลี่ยนนักเรียน = ของที่ค้างอยู่เป็นของคนก่อนหน้า ใช้ต่อไม่ได้ ต้องล้างทิ้ง
    // รวมถึงคะแนนที่สะสมไว้แต่ยังไม่ได้กดยืนยัน ไม่งั้นจะไปลงกับเด็กผิดคน
    const switchedStudent = lastStudentRef.current !== student?.user_id;
    if (switchedStudent) {
      dirtyRef.current = new Set();
      lastStudentRef.current = student?.user_id;
      setPendingTarget({});
      setAdjustReason('');
    }

    const leaves = [];
    for (const unit of items) {
      const unitLeaves = (unit.children || []).length > 0 ? unit.children : [unit];
      leaves.push(...unitLeaves);
    }

    /** เก็บค่าที่ครูพิมพ์ค้างไว้ ส่วนช่องที่ยังไม่ได้แตะให้ใช้ของจากเซิร์ฟเวอร์ */
    const sync = (prefix, prev, serverValue) => {
      const next = {};
      for (const leaf of leaves) {
        next[leaf.id] = !switchedStudent && dirtyRef.current.has(`${prefix}:${leaf.id}`)
          ? prev[leaf.id] ?? ''
          : serverValue(leaf);
      }
      return next;
    };

    setDrafts((prev) =>
      sync('score', prev, (leaf) => {
        const cell = student?.scores?.[leaf.id];
        return cell ? fmtScore(cell.score) : '';
      })
    );

    setNoteDrafts((prev) =>
      sync('note', prev, (leaf) => student?.scores?.[leaf.id]?.note || '')
    );
  }, [items, student]);

  const totals = useMemo(() => {
    let score = 0;
    let max = 0;
    for (const unit of items) {
      const leaves = (unit.children || []).length > 0 ? unit.children : [unit];
      for (const leaf of leaves) {
        max += Number(leaf.max_score) || 0;
        score += Number(student?.scores?.[leaf.id]?.score) || 0;
      }
    }
    return { score, max };
  }, [items, student]);

  const currentScore = (leafId) => Number(student?.scores?.[leafId]?.score) || 0;

  /** บันทึกเมื่อค่าต่างจากของเดิมเท่านั้น
   *  ครู tab ผ่านช่องที่ไม่ได้แก้เป็นเรื่องปกติ ถ้ายิงทุกครั้งจะได้ปูมขยะเต็มไปหมด
   *  (ฝั่ง DB กันซ้ำให้อีกชั้นอยู่แล้ว แต่ไม่ควรยิงคำขอที่รู้ว่าไม่มีผลตั้งแต่แรก) */
  const commitScore = async (leaf) => {
    const raw = String(drafts[leaf.id] ?? '').trim();
    const existing = student?.scores?.[leaf.id];
    const oldValue = existing ? fmtScore(existing.score) : '';

    // ค่าเท่าเดิม = ไม่ได้แก้อะไร ปล่อยให้เซิร์ฟเวอร์เป็นเจ้าของช่องนี้ต่อ
    if (raw === oldValue) {
      dirtyRef.current.delete(`score:${leaf.id}`);
      return;
    }

    if (raw === '') {
      await onSaveScore({ itemId: leaf.id, studentUserId: student.user_id, score: null });
      dirtyRef.current.delete(`score:${leaf.id}`);
      reloadLogs();
      return;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      // พิมพ์ไม่เป็นตัวเลข — คืนค่าเดิมทันที ไม่ปล่อยให้ค้างเป็นข้อความมั่ว ๆ ในช่อง
      setDrafts((prev) => ({ ...prev, [leaf.id]: oldValue }));
      dirtyRef.current.delete(`score:${leaf.id}`);
      return;
    }

    await onSaveScore({
      itemId: leaf.id,
      studentUserId: student.user_id,
      score: parsed,
      note: noteDrafts[leaf.id] ?? '',
    });
    dirtyRef.current.delete(`score:${leaf.id}`);
    reloadLogs();
  };

  const commitNote = async (leaf) => {
    const note = noteDrafts[leaf.id] ?? '';
    const existing = student?.scores?.[leaf.id];
    if ((existing?.note || '') === note) {
      dirtyRef.current.delete(`note:${leaf.id}`);
      return;
    }

    // ยังไม่มีคะแนนแล้วใส่แต่หมายเหตุ = ต้องมีตัวเลขก่อนถึงจะมีแถวให้แปะหมายเหตุ
    if (!existing) return;

    await onSaveScore({
      itemId: leaf.id,
      studentUserId: student.user_id,
      score: Number(existing.score),
      note,
    });
    dirtyRef.current.delete(`note:${leaf.id}`);
  };

  /* สะสมคะแนนที่จะปรับไว้ก่อน แล้วค่อยยืนยันทีเดียว

     ของเดิมกดปุ่ม + หนึ่งครั้ง = ยิงคำสั่งหนึ่งครั้ง = นักเรียนได้แจ้งเตือนหนึ่งใบ
     ครูที่อยากให้ 5 คะแนนจึงกด 5 ครั้ง แล้วเด็กได้แจ้งเตือนรัว ๆ 5 ใบติดกัน
     ซึ่งทั้งน่ารำคาญและทำให้แจ้งเตือนที่สำคัญจริง ๆ จมหายไป
     (ปูมคะแนนก็บวมด้วย 5 แถวสำหรับเหตุการณ์เดียว)

     ตอนนี้ปุ่มบวก/ลบแค่ขยับ "ตัวเลขเป้าหมาย" บนจอเท่านั้น ยังไม่แตะฐานข้อมูล
     กดยืนยันครั้งเดียวจึงส่งผลรวมไปทีเดียว = แจ้งเตือนใบเดียว ปูมแถวเดียว

     เก็บเป็นเป้าหมาย (target) ไม่ใช่ส่วนต่าง (delta) เพราะต้องบีบไม่ให้เกิน 0-เต็ม
     ตั้งแต่ตอนกด ตัวเลขที่ครูเห็นบนจอจะได้ตรงกับผลจริงเสมอ ไม่ใช่โชว์ 12/10 แล้วค่อยไปตัดทีหลัง
     (ตัว state ประกาศรวมไว้ข้างบนกับ state ตัวอื่น) */
  const bumpPending = (leaf, step) => {
    setPendingTarget((prev) => {
      const base = prev[leaf.id] ?? currentScore(leaf.id);
      const max = Number(leaf.max_score) || 0;
      const next = Math.max(0, Math.min(max, base + step));
      return { ...prev, [leaf.id]: next };
    });
  };

  const cancelPending = (leaf) => {
    setPendingTarget((prev) => {
      const next = { ...prev };
      delete next[leaf.id];
      return next;
    });
  };

  const confirmPending = async (leaf) => {
    const target = pendingTarget[leaf.id];
    if (target == null) return;

    // อ่านค่าปัจจุบันตอนกดยืนยัน ไม่ใช่ตอนกดปุ่มบวก
    // เผื่อครูอีกคนแก้คะแนนช่องนี้ระหว่างที่เรายังไม่ได้กดยืนยัน
    const delta = target - currentScore(leaf.id);

    if (delta === 0) {
      cancelPending(leaf);
      return;
    }

    const ok = await onAdjustScore({
      itemId: leaf.id,
      studentUserId: student.user_id,
      delta,
      reason: adjustReason.trim() || null,
    });

    if (ok) {
      cancelPending(leaf);
      setAdjustReason('');
    }
    reloadLogs();
  };

  const handleClear = async (leaf) => {
    const ok = await confirm({
      title: `ล้างคะแนน ${leaf.code}?`,
      message: `คะแนนของ ${student.full_name} ในหัวข้อนี้จะถูกลบออก`,
      detail: 'นักเรียนจะได้รับแจ้งเตือนทันที และรายการนี้จะถูกบันทึกไว้ในปูมคะแนน',
      confirmLabel: 'ล้างคะแนน',
      danger: true,
    });
    if (!ok) return;
    await onSaveScore({ itemId: leaf.id, studentUserId: student.user_id, score: null });
  };

  return (
    <div className="space-y-4">
      {confirmDialog}

      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 -ml-2 rounded-xl transition-colors ${
          isDark ? 'text-content-secondary hover:bg-white/10' : 'text-ink-secondary hover:bg-slate-100'
        }`}
      >
        <ChevronLeft size={15} aria-hidden="true" />
        กลับไปรายชื่อนักเรียน
      </button>

      <div>
        <h3 className={`text-base font-extrabold ${textPrimary}`}>{student.full_name}</h3>
        <p className={`text-[11px] mt-0.5 ${textMuted}`}>
          {student.student_code ? `รหัส ${student.student_code} • ` : ''}
          {subject?.name}
        </p>
      </div>

      <ScoreGauge score={totals.score} maxScore={totals.max} caption="คะแนนรวมของนักเรียนคนนี้" size="sm" />

      {!canGrade && (
        <div className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${
          isDark ? 'bg-amber-950/20 border-amber-900/30 text-accent-amber' : 'bg-amber-50 border-amber-100 text-accent-amber'
        }`}>
          คุณไม่ใช่ครูประจำวิชานี้ จึงดูได้อย่างเดียว แก้คะแนนไม่ได้
        </div>
      )}

      {/* เคยมีกล่องอธิบายวิธีใช้ตรงนี้ เอาออกแล้วเพราะตัวหน้าจอบอกตัวเองได้อยู่แล้ว
          ปุ่มยืนยันโผล่มาพร้อมตัวเลขส่วนต่างตอนเริ่มสะสม และแต่ละปุ่มมี title กำกับ
          คำอธิบายยาว ๆ ที่ต้องอ่านทุกครั้งที่เปิดหน้าจึงเป็นแค่สิ่งกีดขวางสายตา */}

      <div className="space-y-2.5">
        {items.map((unit) => {
          const leaves = (unit.children || []).length > 0 ? unit.children : [unit];
          const unitScore = leaves.reduce((sum, leaf) => sum + currentScore(leaf.id), 0);
          const unitMax = leaves.reduce((sum, leaf) => sum + (Number(leaf.max_score) || 0), 0);
          const tier = getScoreTier(scorePercent(unitScore, unitMax));

          return (
            <div
              key={unit.id}
              className={`rounded-2xl border ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-surface-card border-slate-100'}`}
            >
              <div className={`flex items-center gap-2.5 px-3.5 py-2.5 border-b ${borderSubtle}`}>
                <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg shrink-0 ${tier.chip} ${tier.text}`}>
                  {unit.code}
                </span>
                <span className={`text-xs font-bold flex-1 min-w-0 truncate ${textSecondary}`}>
                  {unit.label || 'ไม่ระบุชื่อหน่วย'}
                </span>
                <span className={`text-xs font-extrabold shrink-0 ${textPrimary}`}>
                  {fmtScore(unitScore)}
                  <span className={`text-[11px] font-normal ${textMuted}`}>/{fmtScore(unitMax)}</span>
                </span>
              </div>

              <div className="px-3.5 py-1">
                {leaves.map((leaf) => {
                  const isOpen = expanded === leaf.id;
                  const hasScore = Boolean(student?.scores?.[leaf.id]);
                  const isPending = pendingTarget[leaf.id] != null;
                  const pendingDelta = isPending ? pendingTarget[leaf.id] - currentScore(leaf.id) : 0;

                  return (
                    <div key={leaf.id} className={`py-2 ${leaf !== leaves[leaves.length - 1] ? `border-b ${borderSubtle}` : ''}`}>
                      {/* flex-wrap + min-w บนชื่อหัวข้อ = พอที่ไม่พอ ชุดปุ่มจะตกลงบรรทัดใหม่เอง
                          แทนที่จะไปบีบชื่อหัวข้อจนเหลือ "ครั้ง..." อ่านไม่รู้เรื่อง
                          บนจอ 375px ชุดปุ่มกินราว 190px ถ้าไม่ยอมให้ตกบรรทัด
                          ชื่อหัวข้อจะเหลือที่แค่ราว 70px ซึ่งสั้นเกินกว่าจะอ่านออก */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                          isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-muted'
                        }`}>
                          {leaf === unit ? unit.code : leaf.code}
                        </span>
                        <span className={`text-[11px] flex-1 min-w-[7rem] truncate ${textSecondary}`}>
                          {leaf.label || 'ไม่ระบุชื่อหัวข้อ'}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0 ml-auto">

                        {/* ปุ่มลบ/บวกต้องอยู่ติดช่องตัวเลขและเห็นตลอดเวลา

                            ของเดิมซ่อนไว้หลังลูกศรกาง ครูจึงเห็นแต่ช่องเปล่า ๆ แล้วไม่รู้ว่าให้คะแนนยังไง
                            การซ่อนปุ่มหลักของหน้าจอไว้ใต้ปุ่มกางคือการซ่อนทางเข้าหลัก
                            (บทเรียนเดียวกับที่แก้ TabNav ไปแล้ว — ดูคอมเมนต์ในไฟล์นั้น) */}
                        <button
                          type="button"
                          disabled={!canGrade || saving}
                          onClick={() => bumpPending(leaf, -1)}
                          aria-label={`ลดคะแนน ${leaf.code} 1 คะแนน`}
                          title="ลด 1 (ยังไม่บันทึกจนกว่าจะกดยืนยัน)"
                          className={`p-1.5 rounded-lg border shrink-0 transition-colors disabled:opacity-30 ${
                            isDark
                              ? 'border-rose-500/30 text-accent-rose hover:bg-rose-500/10'
                              : 'border-rose-200 text-accent-rose hover:bg-rose-50'
                          }`}
                        >
                          <Minus size={12} aria-hidden="true" />
                        </button>

                        <input
                          type="text"
                          inputMode="decimal"
                          /* กำลังสะสมอยู่ = โชว์ตัวเลขเป้าหมาย ไม่ใช่ค่าที่บันทึกไว้
                             ครูจะได้เห็นผลลัพธ์ก่อนตัดสินใจกดยืนยัน */
                          value={isPending ? fmtScore(pendingTarget[leaf.id]) : drafts[leaf.id] ?? ''}
                          readOnly={isPending}
                          disabled={!canGrade || saving}
                          onChange={(e) => {
                            // พิมพ์เอง = ตั้งค่าตรง ๆ ยกเลิกที่สะสมไว้ทิ้ง
                            cancelPending(leaf);
                            dirtyRef.current.add(`score:${leaf.id}`);
                            setDrafts((prev) => ({ ...prev, [leaf.id]: e.target.value }));
                          }}
                          /* ห้าม commit ตอน blur ระหว่างที่ยังสะสมอยู่
                             ไม่งั้นครูกด + แล้วคลิกที่อื่น จะถูกบันทึกทันทีโดยไม่ได้กดยืนยัน
                             ซึ่งทำให้ปุ่มยืนยันไม่มีความหมายเลย */
                          onBlur={() => canGrade && !isPending && commitScore(leaf)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (isPending) confirmPending(leaf);
                              else e.currentTarget.blur();
                            }
                          }}
                          placeholder="-"
                          aria-label={`คะแนน ${leaf.code} ของ ${student.full_name}`}
                          className={`w-11 text-center text-xs font-bold rounded-lg border px-1 py-1.5 outline-none transition-colors disabled:opacity-50 ${
                            isPending
                              ? isDark
                                ? 'bg-sbac-blue/20 border-sbac-blue-light text-white'
                                : 'bg-sbac-blue/10 border-sbac-blue text-ink'
                              : bgInput
                          }`}
                        />

                        <button
                          type="button"
                          disabled={!canGrade || saving}
                          onClick={() => bumpPending(leaf, 1)}
                          aria-label={`เพิ่มคะแนน ${leaf.code} 1 คะแนน`}
                          title="เพิ่ม 1 (ยังไม่บันทึกจนกว่าจะกดยืนยัน)"
                          className={`p-1.5 rounded-lg border shrink-0 transition-colors disabled:opacity-30 ${
                            isDark
                              ? 'border-emerald-500/30 text-accent-emerald hover:bg-emerald-500/10'
                              : 'border-emerald-200 text-accent-emerald hover:bg-emerald-50'
                          }`}
                        >
                          <Plus size={12} aria-hidden="true" />
                        </button>

                        <span className={`text-[10px] font-semibold shrink-0 w-7 ${textMuted}`}>
                          /{fmtScore(leaf.max_score)}
                        </span>

                        {/* ระหว่างสะสม ลูกศรกางถูกแทนที่ด้วยยืนยัน/ยกเลิก
                            เพราะตอนนั้นมีอยู่สองอย่างเท่านั้นที่ครูอยากทำต่อ
                            และปุ่มยืนยันต้องเป็นสิ่งที่เด่นที่สุดในแถว */}
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => confirmPending(leaf)}
                              aria-label={`ยืนยันปรับคะแนน ${leaf.code} ${pendingDelta > 0 ? '+' : ''}${fmtScore(pendingDelta)}`}
                              className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg bg-sbac-blue hover:bg-sbac-navy text-white text-[10px] font-extrabold shrink-0 transition-colors disabled:opacity-40"
                            >
                              <Check size={12} aria-hidden="true" />
                              {pendingDelta > 0 ? '+' : ''}{fmtScore(pendingDelta)}
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelPending(leaf)}
                              aria-label={`ยกเลิกการปรับคะแนน ${leaf.code}`}
                              title="ยกเลิก"
                              className={`p-1 rounded-lg shrink-0 transition-colors ${
                                isDark ? 'hover:bg-white/10 text-content-secondary' : 'hover:bg-slate-100 text-ink-muted'
                              }`}
                            >
                              <X size={13} aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setExpanded(isOpen ? null : leaf.id);
                              setAdjustReason('');
                            }}
                            aria-expanded={isOpen}
                            aria-label={`ตัวเลือกเพิ่มเติมของ ${leaf.code}`}
                            className={`p-1 rounded-lg shrink-0 transition-colors ${
                              isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                            }`}
                          >
                            <ChevronDown
                              size={14}
                              className={`${textMuted} transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                          </button>
                        )}
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="pt-2.5 pb-1 space-y-2.5">
                              {/* ให้/ตัดคะแนนแบบบวกลบ — ครูไม่ต้องคิดเลขว่าเดิมได้เท่าไหร่
                                  ตรงกับวิธีพูดจริง: ส่งช้าหักหนึ่ง, ช่วยงานเพิ่มให้สอง */}
                              <div className="space-y-1.5">
                                <span className={`text-[10px] font-bold ${textMuted}`}>
                                  ให้ / ตัดคะแนน พร้อมระบุเหตุผล
                                  <span className="font-normal"> (เหตุผลจะไปอยู่ในแจ้งเตือนของนักเรียน)</span>
                                </span>
                                {/* ก้อนใหญ่ (5, 10) สำหรับกรณีให้คะแนนทีเดียวเยอะ ๆ
                                    จะได้ไม่ต้องกด +1 สิบครั้ง ทุกปุ่มสะสมลงตัวเดียวกับปุ่มในแถว */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {[-10, -5, -2, 2, 5, 10].map((delta) => (
                                    <button
                                      key={delta}
                                      type="button"
                                      disabled={!canGrade || saving}
                                      onClick={() => bumpPending(leaf, delta)}
                                      className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-colors disabled:opacity-40 ${
                                        delta < 0
                                          ? isDark
                                            ? 'border-rose-500/30 text-accent-rose hover:bg-rose-500/10'
                                            : 'border-rose-200 text-accent-rose hover:bg-rose-50'
                                          : isDark
                                            ? 'border-emerald-500/30 text-accent-emerald hover:bg-emerald-500/10'
                                            : 'border-emerald-200 text-accent-emerald hover:bg-emerald-50'
                                      }`}
                                    >
                                      {delta < 0 ? <Minus size={11} aria-hidden="true" /> : <Plus size={11} aria-hidden="true" />}
                                      {Math.abs(delta)}
                                    </button>
                                  ))}
                                </div>

                                <input
                                  type="text"
                                  value={adjustReason}
                                  disabled={!canGrade || saving}
                                  onChange={(e) => setAdjustReason(e.target.value)}
                                  placeholder="เหตุผล เช่น ส่งงานครบตามกำหนด (ไม่บังคับ)"
                                  aria-label="เหตุผลของการให้หรือตัดคะแนน"
                                  className={`w-full text-[11px] rounded-xl border px-2.5 py-1.5 outline-none transition-colors disabled:opacity-50 ${bgInput}`}
                                />

                                {/* ปุ่มยืนยันในแผงกางด้วย เพราะครูที่มาพิมพ์เหตุผลตรงนี้
                                    สายตาอยู่ที่แผงนี้ ไม่ควรต้องเลื่อนกลับขึ้นไปหาปุ่มในแถว */}
                                {isPending ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={saving}
                                      onClick={() => confirmPending(leaf)}
                                      className="flex-1 flex items-center justify-center gap-1.5 bg-sbac-blue hover:bg-sbac-navy text-white text-[11px] font-bold py-2 rounded-xl transition-colors disabled:opacity-40"
                                    >
                                      <Check size={13} aria-hidden="true" />
                                      ยืนยัน {pendingDelta > 0 ? '+' : ''}{fmtScore(pendingDelta)} คะแนน
                                      (เป็น {fmtScore(pendingTarget[leaf.id])}/{fmtScore(leaf.max_score)})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => cancelPending(leaf)}
                                      aria-label="ยกเลิกการปรับคะแนน"
                                      className={`p-2 rounded-xl border shrink-0 transition-colors ${
                                        isDark ? 'border-white/15 text-content-secondary hover:bg-white/10' : 'border-slate-200 text-ink-muted hover:bg-slate-50'
                                      }`}
                                    >
                                      <X size={13} aria-hidden="true" />
                                    </button>
                                  </div>
                                ) : (
                                  <p className={`text-[10px] ${textMuted}`}>
                                    กดปุ่มด้านบนเพื่อสะสมคะแนนที่จะปรับ แล้วปุ่มยืนยันจะขึ้นมาตรงนี้
                                  </p>
                                )}
                              </div>

                              {/* หมายเหตุติดกับคะแนน — นักเรียนเห็นบรรทัดนี้ในหน้าของตัวเอง
                                  จึงตอบคำถาม "ทำไมได้เท่านี้" ได้โดยไม่ต้องเดินมาถาม */}
                              <div className="space-y-1.5">
                                <span className={`text-[10px] font-bold ${textMuted}`}>
                                  หมายเหตุที่นักเรียนจะเห็น
                                  {!hasScore && ' (กรอกคะแนนก่อนจึงจะบันทึกหมายเหตุได้)'}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={noteDrafts[leaf.id] ?? ''}
                                    disabled={!canGrade || saving || !hasScore}
                                    onChange={(e) => {
                                      dirtyRef.current.add(`note:${leaf.id}`);
                                      setNoteDrafts((prev) => ({ ...prev, [leaf.id]: e.target.value }));
                                    }}
                                    onBlur={() => canGrade && hasScore && commitNote(leaf)}
                                    placeholder="เช่น ส่งช้า 2 วัน"
                                    aria-label={`หมายเหตุของ ${leaf.code}`}
                                    className={`flex-1 text-[11px] rounded-xl border px-2.5 py-1.5 outline-none transition-colors disabled:opacity-50 ${bgInput}`}
                                  />
                                  <button
                                    type="button"
                                    disabled={!canGrade || saving || !hasScore}
                                    onClick={() => commitNote(leaf)}
                                    aria-label="บันทึกหมายเหตุ"
                                    className={`p-2 rounded-xl border transition-colors disabled:opacity-40 ${
                                      isDark ? 'border-white/15 text-content-secondary hover:bg-white/10' : 'border-slate-200 text-ink-muted hover:bg-slate-50'
                                    }`}
                                  >
                                    <Save size={13} aria-hidden="true" />
                                  </button>
                                </div>
                              </div>

                              {hasScore && canGrade && (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleClear(leaf)}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-accent-rose px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                                >
                                  <Trash2 size={12} aria-hidden="true" />
                                  ล้างคะแนนหัวข้อนี้
                                </button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ปูมคะแนนของนักเรียนคนนี้ — ตอบคำถาม "คะแนนหายไปไหน" ได้โดยไม่ต้องเชื่อความจำใคร
          เก็บทุกครั้งที่ค่าเปลี่ยน ไม่ใช่เฉพาะตอนแก้ย้อนหลัง (ดู score_logs ใน 40_gradebook.sql) */}
      {logs.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className={`text-[11px] font-bold flex items-center gap-1.5 ${textMuted}`}>
            <History size={13} aria-hidden="true" />
            ประวัติการให้ / ตัดคะแนนของนักเรียนคนนี้
          </span>

          <div className={`rounded-2xl border divide-y ${
            isDark ? 'bg-white/[0.04] border-white/10 divide-white/10' : 'bg-surface-card border-slate-100 divide-slate-100'
          }`}>
            {logs.slice(0, 12).map((log) => {
              const delta = Number(log.delta) || 0;
              return (
                <div key={log.id} className="px-3.5 py-2 flex items-start gap-2.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 mt-0.5 ${
                    isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-muted'
                  }`}>
                    {log.item_code}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className={`text-[11px] font-semibold ${textSecondary}`}>
                      {/* old_score เป็น null = หัวข้อนี้ยังไม่เคยมีคะแนนมาก่อน ไม่ใช่เคยได้ศูนย์
                          ถ้าแสดงเป็น "0 → 0" ครูจะอ่านว่าไม่มีอะไรเกิดขึ้น
                          ทั้งที่เพิ่งให้ศูนย์ไป ซึ่งเป็นคนละเรื่องกันสำหรับนักเรียน */}
                      {log.action === 'clear'
                        ? 'ล้างคะแนนทิ้ง'
                        : log.old_score == null
                          ? `ให้คะแนนครั้งแรก ${fmtScore(log.new_score ?? 0)}`
                          : `${fmtScore(log.old_score)} → ${fmtScore(log.new_score ?? 0)}`}
                      {log.reason && <span className={`font-normal ${textMuted}`}> • {log.reason}</span>}
                    </div>
                    <div className={`text-[10px] ${textMuted}`}>
                      {new Date(log.created_at).toLocaleString('th-TH', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                      {' โดย '}{log.teacher_name}
                    </div>
                  </div>

                  {/* ให้ศูนย์ครั้งแรกก็ได้ delta 0 เหมือนกับ "ไม่มีอะไรเปลี่ยน"
                      ตรงนี้จึงโชว์คะแนนที่ได้จริงแทนตัวเลขส่วนต่างที่อ่านแล้วเข้าใจผิด */}
                  <span className={`text-[11px] font-extrabold shrink-0 ${
                    delta > 0 ? 'text-accent-emerald' : delta < 0 ? 'text-accent-rose' : textMuted
                  }`}>
                    {log.old_score == null && log.action !== 'clear'
                      ? fmtScore(log.new_score ?? 0)
                      : `${delta > 0 ? '+' : ''}${fmtScore(delta)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
