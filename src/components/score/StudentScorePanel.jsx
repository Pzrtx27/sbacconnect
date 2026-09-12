import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import LoadingSpinner from '../ui/LoadingSpinner';
import ScoreGauge from './ScoreGauge';
import SubjectScoreDetail from './SubjectScoreDetail';
import { fmtScore, getScoreTier, scorePercent, scoreErrorMessage, sumScores } from '../../utils/score';

/* เนื้อหาของโมดัล "คะแนนระหว่างภาค" ฝั่งนักเรียน

   สองชั้น: รายวิชาทั้งหมด -> กดเข้าไปดู T1-T5 ของวิชานั้น
   สลับกันในโมดัลเดียว ไม่เปิดโมดัลซ้อนโมดัล เพราะบนมือถือ bottom sheet ซ้อนกัน
   จะเหลือที่อ่านจริงไม่ถึงครึ่งจอ และปุ่มปิดสองชั้นทำให้คนกดพลาดออกไปเลย */
export default function StudentScorePanel({ subjects, term, loading, error }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [openSubjectId, setOpenSubjectId] = useState(null);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';

  if (loading) {
    return (
      <div className="py-10">
        <LoadingSpinner text="กำลังโหลดคะแนน..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-2xl border p-4 flex gap-3 ${
        isDark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-amber-50 border-amber-100'
      }`}>
        <AlertCircle size={18} className="text-accent-amber shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className={`text-xs font-bold ${textPrimary}`}>ยังดูคะแนนไม่ได้ในตอนนี้</p>
          <p className={`text-[11px] leading-relaxed ${textMuted}`}>
            {error === 'SETUP'
              ? 'ระบบคะแนนยังไม่ถูกเปิดใช้งาน กรุณาแจ้งฝ่ายวิชาการ'
              : scoreErrorMessage(error, 'ไม่สามารถโหลดคะแนนได้')}
          </p>
        </div>
      </div>
    );
  }

  if (openSubjectId) {
    return <SubjectScoreDetail subjectId={openSubjectId} onBack={() => setOpenSubjectId(null)} />;
  }

  if (subjects.length === 0) {
    return (
      <p className={`text-xs text-center py-10 leading-relaxed ${textMuted}`}>
        ยังไม่มีรายวิชาของห้องคุณในภาคเรียนนี้
        <br />
        ฝ่ายวิชาการจะเพิ่มให้เมื่อเปิดภาคเรียน
      </p>
    );
  }

  const totals = sumScores(subjects);
  const overallPct = scorePercent(totals.score, totals.max);
  const overallTier = getScoreTier(overallPct);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className={`text-xs font-bold ${textMuted}`}>ภาคเรียน {term || '-'}</p>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${overallTier.chip} ${overallTier.text}`}>
          {overallTier.emoji} {overallTier.label}
        </span>
      </div>

      <ScoreGauge
        score={totals.score}
        maxScore={totals.max}
        caption={`คะแนนเก็บรวม ${subjects.length} รายวิชา`}
      />

      <div className="space-y-2">
        <p className={`text-[11px] font-bold ${textMuted}`}>แตะที่รายวิชาเพื่อดูคะแนนรายหัวข้อ T1-T5</p>

        {subjects.map((item, idx) => {
          const pct = scorePercent(item.score, item.max_score);
          const tier = getScoreTier(pct);
          const pending = Number(item.item_count || 0) - Number(item.graded_count || 0);

          return (
            <motion.button
              key={item.subject_id}
              type="button"
              onClick={() => setOpenSubjectId(item.subject_id)}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className={`w-full text-left rounded-2xl border p-3.5 transition-colors ${
                isDark
                  ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                  : 'bg-surface-card border-slate-100 hover:bg-slate-50'
              }`}
            >
              <div className="flex justify-between items-baseline gap-3 mb-1.5">
                <span className={`text-xs font-bold min-w-0 truncate ${textSecondary}`}>{item.name}</span>
                <span className={`text-xs font-bold shrink-0 flex items-center gap-1 ${textPrimary}`}>
                  {fmtScore(item.score)}
                  <span className={`text-[11px] font-normal ${textMuted}`}>/{fmtScore(item.max_score)}</span>
                  <ChevronRight size={13} className={textMuted} aria-hidden="true" />
                </span>
              </div>

              <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                <motion.div
                  className={`h-full rounded-full ${tier.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: idx * 0.06 + 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              {pending > 0 && (
                <div className={`text-[10px] mt-1.5 font-semibold ${textMuted}`}>
                  ยังรอประกาศอีก {pending} หัวข้อ
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
