import { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useBehaviorCategories } from '../../hooks/useBehaviorCategories';
import Modal from '../ui/Modal';
import { Save } from 'lucide-react';

/* โมดัลแก้ไขรายการตัด/เพิ่มคะแนน — ใช้ร่วมกันทั้ง TeacherHome และ AcademicDashboard
   log = null ปิดโมดัล, log = object เปิดพร้อม prefill ค่าจากรายการนั้น
   onSave(logId, payload) ต้องคืน Promise<boolean> (สำเร็จ/ไม่สำเร็จ) — ให้ hook เดิมจัดการ toast เอง */
export default function BehaviorLogEditModal({ log, onClose, onSave }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { byActionType } = useBehaviorCategories();

  const [actionType, setActionType] = useState('deduct');
  const [categoryId, setCategoryId] = useState(null);
  const [reason, setReason] = useState('');
  const [points, setPoints] = useState('5');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!log) return;
    setActionType(log.action_type);
    setCategoryId(null);
    setReason(log.reason);
    setPoints(String(log.points));
    setEditReason('');
  }, [log]);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  const handleSave = async () => {
    const scoreVal = Math.round(Number(points));
    if (!reason.trim() || !scoreVal || scoreVal <= 0) return;

    setSaving(true);
    const ok = await onSave(log.id, {
      categoryId,
      reason: reason.trim(),
      points: scoreVal,
      actionType,
      editReason: editReason.trim() || null,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal isOpen={!!log} onClose={onClose} title="แก้ไขรายการพฤติกรรม">
      {log && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setActionType('deduct'); setCategoryId(null); }}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                actionType === 'deduct'
                  ? 'bg-rose-500 text-white border-rose-500'
                  : isDark ? 'bg-white/5 border-white/10 text-accent-rose' : 'bg-rose-50 border-rose-100 text-accent-rose'
              }`}
            >
              ⚠️ ตัดคะแนน
            </button>
            <button
              type="button"
              onClick={() => { setActionType('add'); setCategoryId(null); }}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                actionType === 'add'
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : isDark ? 'bg-white/5 border-white/10 text-accent-emerald' : 'bg-emerald-50 border-emerald-100 text-accent-emerald'
              }`}
            >
              ⭐ เพิ่มคะแนน
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {byActionType(actionType).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setCategoryId(cat.id); setReason(cat.label); setPoints(String(cat.default_points)); }}
                className={`p-2 rounded-xl border text-[10px] font-bold text-left transition-all ${
                  categoryId === cat.id
                    ? 'border-sbac-blue bg-sbac-blue-50/20 text-brand'
                    : isDark ? 'border-white/5 bg-white/[0.02] text-content-secondary' : 'border-slate-100 bg-surface-card text-slate-600'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div>
            <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>เหตุผล</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setCategoryId(null); }}
              className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
            />
          </div>

          <div>
            <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>จำนวนคะแนน</label>
            <input
              type="number"
              min="1"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
            />
          </div>

          <div>
            <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>เหตุผลที่แก้ไข (ไม่บังคับ)</label>
            <input
              type="text"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="เช่น พิมพ์คะแนนผิด, ระบุเหตุผลไม่ครบ"
              className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-sbac-blue hover:bg-sbac-navy disabled:opacity-50 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-1.5"
          >
            <Save size={16} aria-hidden="true" />
            {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      )}
    </Modal>
  );
}
