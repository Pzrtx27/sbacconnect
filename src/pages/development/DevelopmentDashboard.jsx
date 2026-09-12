import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { HeartHandshake, ListChecks, Wallet, Award } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import PageHeader from '../../components/layout/PageHeader';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import BehaviorDeductionWizard from '../academic/BehaviorDeductionWizard';
import BehaviorLogList from '../../components/behavior/BehaviorLogList';
import BehaviorLogEditModal from '../../components/behavior/BehaviorLogEditModal';
import { useBehaviorLogs } from '../../hooks/useBehaviorLogs';

/* ฝ่ายพัฒนา (กิจการนักเรียน) — งานดูแลความประพฤตินักเรียน

   ของพวกนี้มีอยู่ในระบบแล้ว แต่เดิมไปกองรวมอยู่ในแท็บ "นักเรียน" ของหน้าฝ่ายวิชาการ
   ซึ่งเป็นคนละฝ่ายกันในโครงสร้างจริงของวิทยาลัย หน้านี้จึงเป็นที่ของฝ่ายพัฒนาโดยตรง
   ใช้คอมโพเนนต์ตัวเดียวกับหน้าฝ่ายวิชาการทั้งหมด ไม่ได้ก๊อปโค้ดมาวางซ้ำ
   (แก้ที่เดียวมีผลทั้งสองหน้า)

   สิทธิ์: role academic/sysadmin เท่าเดิม — ฝั่ง DB ก็กันด้วย app_is_academic_staff()
   ใน 21_behavior_crud_and_academic.sql อยู่แล้ว หน้านี้ไม่ได้เปิดสิทธิ์อะไรใหม่

   ปุ่ม "ฝ่ายการเงิน" ย้ายมาอยู่ที่นี่ (เดิมอยู่หัวหน้าคิวร้านกาแฟและหน้าฝ่ายวิชาการ)
   ขึ้นเฉพาะบัญชีที่มี role cashier/sysadmin จริง ๆ ตามกติกาเดียวกับ app_can_manage_fees() */
export default function DevelopmentDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // เทียบกับ role ทั้งหมดที่มี ไม่ใช่ user.role ที่ AuthContext ยุบมาเหลืออันเดียว
  const canManageFees = (user?.roles || []).some((r) => r === 'cashier' || r === 'sysadmin');

  const { logs, loading, updateLog, deleteLog } = useBehaviorLogs();
  const { confirm, confirmDialog } = useConfirm();
  const [editingLog, setEditingLog] = useState(null);

  const handleDelete = async (log) => {
    const ok = await confirm({
      title: 'ลบรายการนี้?',
      message: `"${log.reason}" (${log.action_type === 'add' ? '+' : '-'}${log.points} คะแนน) ของ ${log.student_name} — บันทึกโดย ${log.teacher_name}`,
      detail: 'ระบบจะเก็บหลักฐานไว้ตรวจสอบย้อนหลัง ไม่ได้ลบถาวร และคะแนนของนักเรียนจะกลับมาทันที',
      confirmLabel: 'ลบรายการ',
      danger: true,
    });
    if (ok) deleteLog(log.id);
  };

  /* สรุปของ "วันนี้" — ฝ่ายพัฒนาต้องตอบได้ทันทีว่าวันนี้มีเรื่องเข้ามากี่เรื่อง
     นับจากรายการที่โหลดมาแล้ว ไม่ยิง query เพิ่ม (list_behavior_logs ให้มา 100 รายการล่าสุด) */
  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const todays = logs.filter((l) => new Date(l.created_at) >= start);
    return {
      total: todays.length,
      deduct: todays.filter((l) => l.action_type === 'deduct').length,
      add: todays.filter((l) => l.action_type === 'add').length,
    };
  }, [logs]);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const cardClass = isDark ? 'bg-neutral-900/60 border-white/10' : 'bg-surface-card border-slate-100 shadow-sm';

  return (
    <div className="space-y-5">
      <PageHeader icon={HeartHandshake} title="ฝ่ายพัฒนา" tone="violet">
        {canManageFees && (
          <Link
            to="/finance"
            className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 bg-emerald-500/10 text-accent-emerald border border-emerald-500/20"
          >
            <Wallet size={14} aria-hidden="true" />
            ฝ่ายการเงิน
          </Link>
        )}
      </PageHeader>

      <p className={`text-xs leading-relaxed ${textMuted}`}>
        ดูแลความประพฤตินักเรียน — บันทึกการตัด/เพิ่มคะแนน และตรวจสอบรายการที่ครูทุกคนบันทึกไว้
        ทุกครั้งที่บันทึก นักเรียนเจ้าของรายการจะได้รับแจ้งเตือนทันที
      </p>

      <div className="grid grid-cols-3 gap-3">
        <div className={`p-3 rounded-2xl border text-center ${cardClass}`}>
          <span className={`text-lg font-extrabold ${textPrimary}`}>{today.total}</span>
          <span className={`text-[9px] font-bold block mt-1 ${textMuted}`}>รายการวันนี้</span>
        </div>
        <div className={`p-3 rounded-2xl border text-center ${cardClass}`}>
          <span className="text-lg font-extrabold text-accent-rose">{today.deduct}</span>
          <span className={`text-[9px] font-bold block mt-1 ${textMuted}`}>ตัดคะแนน</span>
        </div>
        <div className={`p-3 rounded-2xl border text-center ${cardClass}`}>
          <span className="text-lg font-extrabold text-accent-emerald">{today.add}</span>
          <span className={`text-[9px] font-bold block mt-1 ${textMuted}`}>เพิ่มคะแนนความดี</span>
        </div>
      </div>

      <section aria-labelledby="head-behavior" className="space-y-3">
        <h3 id="head-behavior" className={`text-sm font-extrabold flex items-center gap-2 ${textPrimary}`}>
          <Award size={18} className="text-accent-violet" aria-hidden="true" />
          คะแนนความประพฤติ
        </h3>

        {/* ซ้าย: ตัวบันทึกรายการใหม่ (โมดัลสามขั้น) / ขวา: ประวัติทั้งหมดที่แก้ไข-ลบได้
            เลย์เอาต์เดียวกับหน้าฝ่ายวิชาการ เพื่อให้คนที่ใช้ทั้งสองหน้าไม่ต้องเรียนรู้ใหม่ */}
        <div className="grid gap-4 xl:grid-cols-[300px_1fr] items-start">
          <BehaviorDeductionWizard />

          <div className="space-y-2.5">
            <span className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
              <ListChecks size={14} aria-hidden="true" />
              รายการทั้งหมด ({logs.length})
            </span>
            <div className="max-h-[520px] overflow-y-auto pr-1">
              <BehaviorLogList
                logs={logs}
                loading={loading}
                showStudentName
                onEdit={setEditingLog}
                onDeleteRequest={handleDelete}
              />
            </div>
          </div>
        </div>
      </section>

      <BehaviorLogEditModal
        log={editingLog}
        onClose={() => setEditingLog(null)}
        onSave={(logId, payload) => updateLog(logId, payload)}
      />

      {confirmDialog}
    </div>
  );
}
