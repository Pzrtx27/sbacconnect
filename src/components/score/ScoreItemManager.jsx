import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2, Check, X, Sparkles } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useConfirm } from '../ui/ConfirmDialog';
import { fmtScore } from '../../utils/score';

/* จัดโครงสร้าง T1-T5 และหัวข้อย่อยของรายวิชา

   ทำไมต้องให้ครูแก้เองได้ ไม่ fix ไว้ในโค้ด:
     สัดส่วนคะแนนเป็นของแต่ละรายวิชา ไม่ใช่ของทั้งวิทยาลัย
     วิชาปฏิบัติให้น้ำหนักชิ้นงาน 40 วิชาทฤษฎีให้สอบ 40 ซึ่งต่างกันตามแผนการสอน
     ถ้า fix ไว้ ครูจะกลับไปใช้ Excel ของตัวเองเหมือนเดิมภายในสัปดาห์แรก

   คะแนนเต็มของ T คือผลรวมของลูก ระบบคิดให้เอง ไม่มีช่องให้กรอก
   เพราะเลขสองที่ที่หมายถึงของเดียวกันจะขัดกันเองเสมอ และไม่มีใครรู้ว่าต้องเชื่ออันไหน */
export default function ScoreItemManager({ items, canGrade, subject, onSaveItem, onDeleteItem, onApplyTemplate }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { confirm, confirmDialog } = useConfirm();

  const [editing, setEditing] = useState(null);   // id ของหัวข้อที่กำลังแก้
  const [adding, setAdding] = useState(null);     // 'unit' | parentId ของ T ที่จะเพิ่มลูก
  const [form, setForm] = useState({ code: '', label: '', max_score: '' });
  const [busy, setBusy] = useState(false);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const borderSubtle = isDark ? 'border-white/10' : 'border-slate-100';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  const totalMax = items.reduce((sum, unit) => {
    const leaves = (unit.children || []).length > 0 ? unit.children : [unit];
    return sum + leaves.reduce((s, leaf) => s + (Number(leaf.max_score) || 0), 0);
  }, 0);

  const resetForm = () => {
    setForm({ code: '', label: '', max_score: '' });
    setEditing(null);
    setAdding(null);
  };

  const startEdit = (item) => {
    setAdding(null);
    setEditing(item.id);
    setForm({
      code: item.code || '',
      label: item.label || '',
      max_score: fmtScore(item.max_score),
    });
  };

  const startAdd = (target, suggestedCode) => {
    setEditing(null);
    setAdding(target);
    setForm({ code: suggestedCode, label: '', max_score: '10' });
  };

  const submit = async ({ itemId = null, parentId = null, isUnit = false, sortOrder = null }) => {
    const code = form.code.trim();
    if (!code) return;

    setBusy(true);
    const ok = await onSaveItem({
      itemId,
      parentId,
      code,
      label: form.label.trim(),
      // หน่วยหลักที่มีลูกไม่ต้องกรอกคะแนนเต็ม ระบบรวมจากลูกให้เอง
      maxScore: isUnit ? 0 : Number(form.max_score) || 0,
      sortOrder,
    });
    setBusy(false);

    if (ok) resetForm();
  };

  const handleDelete = async (item, isUnit) => {
    const ok = await confirm({
      title: `ลบหัวข้อ ${item.code}?`,
      message: isUnit
        ? `หัวข้อย่อยทั้งหมดใต้ ${item.code} จะถูกลบไปด้วย`
        : `หัวข้อ ${item.code} ${item.label || ''} จะถูกลบออกจากรายวิชานี้`,
      detail: 'คะแนนที่นักเรียนได้ในหัวข้อนี้จะหายไปทั้งหมดและกู้คืนไม่ได้',
      confirmLabel: 'ลบหัวข้อ',
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    await onDeleteItem(item.id);
    setBusy(false);
  };

  /** ฟอร์มเพิ่ม/แก้ — ใช้ร่วมกันทั้งหน่วยหลักและหัวข้อย่อย
   *  ต้องมี key เพราะทุกที่ที่เรียกอยู่ใน AnimatePresence ซึ่งใช้ key ไล่ว่าตัวไหนเข้าตัวไหนออก
   *  ไม่มี key แล้ว exit animation จะไม่ทำงานและ React เตือนตอน dev */
  const renderForm = ({ itemId = null, parentId = null, isUnit = false }) => (
    <motion.div
      key={`form-${itemId || parentId || 'new-unit'}`}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
    >
      <div className={`flex items-center gap-1.5 py-2 ${isUnit ? '' : 'pl-6'}`}>
        <input
          type="text"
          value={form.code}
          onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
          placeholder={isUnit ? 'T6' : 'T1.3'}
          aria-label="รหัสหัวข้อ"
          className={`w-16 text-[11px] font-bold text-center rounded-lg border px-1.5 py-1.5 outline-none transition-colors ${bgInput}`}
        />
        <input
          type="text"
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          placeholder={isUnit ? 'ชื่อหน่วย เช่น สอบปฏิบัติ' : 'ชื่อหัวข้อ เช่น ใบงานที่ 3'}
          aria-label="ชื่อหัวข้อ"
          className={`flex-1 min-w-0 text-[11px] rounded-lg border px-2.5 py-1.5 outline-none transition-colors ${bgInput}`}
        />
        {!isUnit && (
          <input
            type="text"
            inputMode="decimal"
            value={form.max_score}
            onChange={(e) => setForm((p) => ({ ...p, max_score: e.target.value }))}
            placeholder="10"
            aria-label="คะแนนเต็ม"
            className={`w-12 text-[11px] font-bold text-center rounded-lg border px-1.5 py-1.5 outline-none transition-colors ${bgInput}`}
          />
        )}
        <button
          type="button"
          disabled={busy || !form.code.trim()}
          onClick={() => submit({ itemId, parentId, isUnit })}
          aria-label="บันทึก"
          className="p-1.5 rounded-lg bg-sbac-blue text-white disabled:opacity-40 shrink-0 transition-colors hover:bg-sbac-navy"
        >
          <Check size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={resetForm}
          aria-label="ยกเลิก"
          className={`p-1.5 rounded-lg shrink-0 transition-colors ${
            isDark ? 'hover:bg-white/10 text-content-secondary' : 'hover:bg-slate-100 text-ink-muted'
          }`}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );

  if (!canGrade) {
    return (
      <p className={`text-xs text-center py-10 leading-relaxed ${textMuted}`}>
        คุณไม่ใช่ครูประจำวิชานี้
        <br />
        การแก้โครงสร้างคะแนนทำได้เฉพาะครูประจำวิชาและฝ่ายวิชาการ
      </p>
    );
  }

  return (
    <div className="space-y-3.5">
      {confirmDialog}

      <div className={`rounded-xl border px-3 py-2.5 flex items-center justify-between ${
        isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
      }`}>
        <span className={`text-[11px] font-bold ${textSecondary}`}>คะแนนเต็มรวมของรายวิชา</span>
        <span className={`text-sm font-extrabold ${totalMax === 100 ? 'text-accent-emerald' : 'text-accent-amber'}`}>
          {fmtScore(totalMax)} คะแนน
        </span>
      </div>

      {/* เตือนแบบไม่ขวางทาง — บางวิชาตั้งใจไม่เต็ม 100 จริง ๆ จึงห้ามบังคับ */}
      {totalMax !== 100 && items.length > 0 && (
        <p className={`text-[10px] leading-relaxed ${textMuted}`}>
          ปกติคะแนนรวมทั้งรายวิชาคือ 100 คะแนน — ตอนนี้รวมได้ {fmtScore(totalMax)}
          {' '}หากตั้งใจไว้แบบนี้ก็ใช้งานได้ตามปกติ
        </p>
      )}

      {items.length === 0 && (
        <div className="space-y-3 py-4 text-center">
          <p className={`text-xs leading-relaxed ${textMuted}`}>
            วิชา {subject?.name} ยังไม่มีหัวข้อคะแนน
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await onApplyTemplate(); setBusy(false); }}
            className="inline-flex items-center gap-2 bg-sbac-blue hover:bg-sbac-navy text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-lg shadow-sbac-blue/20 active:scale-95 transition-all disabled:opacity-40"
          >
            <Sparkles size={14} aria-hidden="true" />
            สร้างโครงสร้าง T1-T5 มาตรฐาน
          </button>
          <p className={`text-[10px] ${textMuted}`}>สร้างให้ 5 หน่วย หน่วยละ 2 หัวข้อย่อย รวม 100 คะแนน แล้วแก้ทีหลังได้ทุกช่อง</p>
        </div>
      )}

      <div className="space-y-2.5">
        {items.map((unit) => {
          const children = unit.children || [];
          const unitMax = children.length > 0
            ? children.reduce((s, c) => s + (Number(c.max_score) || 0), 0)
            : Number(unit.max_score) || 0;

          return (
            <div
              key={unit.id}
              className={`rounded-2xl border ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-surface-card border-slate-100'}`}
            >
              <div className={`px-3.5 py-2.5 ${children.length > 0 || adding === unit.id ? `border-b ${borderSubtle}` : ''}`}>
                <AnimatePresence initial={false} mode="wait">
                  {editing === unit.id ? (
                    renderForm({ itemId: unit.id, isUnit: children.length > 0 })
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg shrink-0 ${
                        isDark ? 'bg-sbac-blue/20 text-brand' : 'bg-sbac-blue/10 text-brand'
                      }`}>
                        {unit.code}
                      </span>
                      <span className={`text-xs font-bold flex-1 min-w-0 truncate ${textSecondary}`}>
                        {unit.label || 'ไม่ระบุชื่อหน่วย'}
                      </span>
                      <span className={`text-[11px] font-extrabold shrink-0 ${textPrimary}`}>
                        {fmtScore(unitMax)}
                        <span className={`font-normal ${textMuted}`}> คะแนน</span>
                      </span>
                      <IconButton onClick={() => startEdit(unit)} label={`แก้ไข ${unit.code}`} isDark={isDark}>
                        <Pencil size={12} aria-hidden="true" />
                      </IconButton>
                      <IconButton onClick={() => handleDelete(unit, children.length > 0)} label={`ลบ ${unit.code}`} isDark={isDark} danger>
                        <Trash2 size={12} aria-hidden="true" />
                      </IconButton>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              <div className="px-3.5 py-1">
                {children.map((child) => (
                  <div key={child.id} className="py-1">
                    <AnimatePresence initial={false} mode="wait">
                      {editing === child.id ? (
                        renderForm({ itemId: child.id })
                      ) : (
                        <div className="flex items-center gap-2 pl-6">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                            isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-muted'
                          }`}>
                            {child.code}
                          </span>
                          <span className={`text-[11px] flex-1 min-w-0 truncate ${textSecondary}`}>
                            {child.label || 'ไม่ระบุชื่อหัวข้อ'}
                          </span>
                          <span className={`text-[11px] font-bold shrink-0 ${textMuted}`}>
                            เต็ม {fmtScore(child.max_score)}
                          </span>
                          <IconButton onClick={() => startEdit(child)} label={`แก้ไข ${child.code}`} isDark={isDark}>
                            <Pencil size={12} aria-hidden="true" />
                          </IconButton>
                          <IconButton onClick={() => handleDelete(child, false)} label={`ลบ ${child.code}`} isDark={isDark} danger>
                            <Trash2 size={12} aria-hidden="true" />
                          </IconButton>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                <AnimatePresence initial={false}>
                  {adding === unit.id && renderForm({ parentId: unit.id })}
                </AnimatePresence>

                {adding !== unit.id && editing === null && (
                  <button
                    type="button"
                    onClick={() => startAdd(unit.id, `${unit.code}.${children.length + 1}`)}
                    className={`w-full text-left text-[10px] font-bold pl-6 py-2 rounded-lg transition-colors flex items-center gap-1 ${
                      isDark ? 'text-content-secondary hover:bg-white/5' : 'text-ink-muted hover:bg-slate-50'
                    }`}
                  >
                    <Plus size={11} aria-hidden="true" />
                    เพิ่มหัวข้อย่อยใน {unit.code}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* หน่วยที่เพิ่งสร้างยังไม่มีลูก จึงถือคะแนนเต็มของตัวเองไปก่อน (isUnit: false = มีช่องคะแนนเต็ม)
          พอเพิ่มหัวข้อย่อยเข้าไป ระบบจะเปลี่ยนไปใช้ผลรวมของลูกเองอัตโนมัติ */}
      {adding === 'unit' && (
        <div className={`rounded-2xl border px-3.5 ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-surface-card border-slate-100'}`}>
          <AnimatePresence initial={false}>{renderForm({ isUnit: false })}</AnimatePresence>
        </div>
      )}

      {adding !== 'unit' && editing === null && items.length > 0 && (
        <button
          type="button"
          onClick={() => startAdd('unit', `T${items.length + 1}`)}
          className={`w-full flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-2xl border border-dashed transition-colors ${
            isDark
              ? 'border-white/20 text-content-secondary hover:bg-white/5'
              : 'border-slate-200 text-ink-muted hover:bg-slate-50'
          }`}
        >
          <Plus size={14} aria-hidden="true" />
          เพิ่มหน่วยใหม่ (T{items.length + 1})
        </button>
      )}
    </div>
  );
}

function IconButton({ onClick, label, isDark, danger = false, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`p-1.5 rounded-lg shrink-0 transition-colors ${
        danger
          ? 'text-accent-rose hover:bg-rose-500/10'
          : isDark
            ? 'text-content-secondary hover:bg-white/10'
            : 'text-ink-muted hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}
