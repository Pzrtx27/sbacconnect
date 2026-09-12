import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronDown, MinusCircle, StickyNote } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import LoadingSpinner from '../ui/LoadingSpinner';
import ScoreGauge from './ScoreGauge';
import { useMySubjectScores } from '../../hooks/useGradebook';
import { fmtScore, getScoreTier, scorePercent } from '../../utils/score';

/* หน้าจอที่นักเรียนกดเข้ามาจากรายวิชา — แตกเป็น T1-T5 แล้วกางดูหัวข้อย่อยได้

   ทำไมต้องกางเอง ไม่กางทุกอันตั้งแต่แรก:
     วิชาหนึ่งมี 5 หน่วย หน่วยละ 2-4 หัวข้อย่อย = 10-20 บรรทัด
     บนมือถือในโมดัลสูง 70vh คือต้องเลื่อนสามหน้าจอกว่าจะครบ
     ค่าเริ่มต้นจึงเป็นสรุปรายหน่วยซึ่งตอบคำถามแรก (หน่วยไหนคะแนนหาย)
     แล้วค่อยกางเฉพาะหน่วยที่สงสัยเพื่อดูว่าหายที่ใบไหน

   หน่วยที่ยังไม่มีคะแนนเลยจะกางให้ดูไม่ได้ประโยชน์ — เขียนบอกตรง ๆ ว่ายังไม่ประกาศ
   ดีกว่าโชว์ 0/20 ซึ่งนักเรียนอ่านว่า "ได้ศูนย์" ทั้งที่ครูแค่ยังไม่ได้กรอก */
export default function SubjectScoreDetail({ subjectId, onBack }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { detail, loading } = useMySubjectScores(subjectId);
  const [expanded, setExpanded] = useState({});

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const borderSubtle = isDark ? 'border-white/10' : 'border-slate-100';

  if (loading) {
    return (
      <div className="py-10">
        <LoadingSpinner text="กำลังโหลดคะแนนรายวิชา..." />
      </div>
    );
  }

  if (!detail?.subject) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} isDark={isDark} />
        <p className={`text-xs text-center py-8 ${textMuted}`}>ไม่พบข้อมูลคะแนนของรายวิชานี้</p>
      </div>
    );
  }

  const { subject, items } = detail;
  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} isDark={isDark} />

      <div>
        <h3 className={`text-base font-extrabold leading-snug ${textPrimary}`}>{subject.name}</h3>
        <p className={`text-[11px] mt-1 ${textMuted}`}>
          {subject.teacher_name ? `ผู้สอน ${subject.teacher_name} • ` : ''}
          หน่วยกิต {subject.credits} • ภาคเรียน {subject.term}
        </p>
      </div>

      <ScoreGauge
        score={subject.score}
        maxScore={subject.max_score}
        caption={`คะแนนรวมทุกหน่วยของรายวิชานี้`}
      />

      <div className="space-y-2.5">
        {items.length === 0 && (
          <p className={`text-xs text-center py-6 ${textMuted}`}>
            อาจารย์ยังไม่ได้กำหนดหัวข้อคะแนนของวิชานี้
          </p>
        )}

        {items.map((unit, idx) => {
          const children = unit.children || [];
          const hasChildren = children.length > 0;
          const pct = scorePercent(unit.score, unit.max_score);
          const tier = getScoreTier(pct);
          const isOpen = Boolean(expanded[unit.id]);
          const graded = hasChildren
            ? children.filter((c) => c.has_score).length
            : unit.has_score ? 1 : 0;
          const totalLeaf = hasChildren ? children.length : 1;

          return (
            <motion.div
              key={unit.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={`rounded-2xl border overflow-hidden ${
                isDark ? 'bg-white/[0.04] border-white/10' : 'bg-surface-card border-slate-100'
              }`}
            >
              <button
                type="button"
                onClick={() => hasChildren && toggle(unit.id)}
                aria-expanded={hasChildren ? isOpen : undefined}
                className={`w-full text-left p-3.5 ${hasChildren ? 'cursor-pointer' : 'cursor-default'} ${
                  hasChildren ? (isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50') : ''
                } transition-colors`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-lg shrink-0 ${tier.chip} ${tier.text}`}>
                    {unit.code}
                  </span>
                  <span className={`text-xs font-bold flex-1 min-w-0 truncate ${textSecondary}`}>
                    {unit.label || 'ไม่ระบุชื่อหน่วย'}
                  </span>
                  <span className={`text-xs font-extrabold shrink-0 ${textPrimary}`}>
                    {fmtScore(unit.score)}
                    <span className={`text-[11px] font-normal ${textMuted}`}>/{fmtScore(unit.max_score)}</span>
                  </span>
                  {hasChildren && (
                    <ChevronDown
                      size={15}
                      className={`${textMuted} shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className={`h-2 rounded-full overflow-hidden mt-2.5 ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                  <motion.div
                    className={`h-full rounded-full ${tier.bar}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: idx * 0.05 + 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>

                {/* บอกตรง ๆ ว่ายอดที่เห็นยังไม่ครบ ไม่ใช่ทำได้แค่นี้ */}
                {graded < totalLeaf && (
                  <div className={`text-[10px] mt-1.5 font-semibold ${textMuted}`}>
                    ประกาศแล้ว {graded} จาก {totalLeaf} หัวข้อ
                  </div>
                )}
              </button>

              <AnimatePresence initial={false}>
                {hasChildren && isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className={`border-t px-3.5 py-2 space-y-2 ${borderSubtle}`}>
                      {children.map((child) => {
                        const childPct = scorePercent(child.score, child.max_score);
                        const childTier = getScoreTier(childPct);

                        return (
                          <div key={child.id} className="py-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                                isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-muted'
                              }`}>
                                {child.code}
                              </span>
                              <span className={`text-[11px] flex-1 min-w-0 truncate ${textSecondary}`}>
                                {child.label || 'ไม่ระบุชื่อหัวข้อ'}
                              </span>

                              {child.has_score ? (
                                <span className={`text-[11px] font-extrabold shrink-0 ${childTier.text}`}>
                                  {fmtScore(child.score)}
                                  <span className={`font-normal ${textMuted}`}>/{fmtScore(child.max_score)}</span>
                                </span>
                              ) : (
                                <span className={`text-[10px] font-semibold shrink-0 flex items-center gap-1 ${textMuted}`}>
                                  <MinusCircle size={11} aria-hidden="true" />
                                  ยังไม่ประกาศ
                                  <span className="font-normal">(เต็ม {fmtScore(child.max_score)})</span>
                                </span>
                              )}
                            </div>

                            {/* หมายเหตุจากอาจารย์ เช่น "ส่งช้า 2 วัน" — คือคำตอบของคำถาม
                                "ทำไมได้เท่านี้" ที่นักเรียนต้องเดินไปถามเองทุกครั้ง */}
                            {child.note && (
                              <div className={`text-[10px] mt-1 flex items-start gap-1 pl-7 ${textMuted}`}>
                                <StickyNote size={10} className="mt-0.5 shrink-0" aria-hidden="true" />
                                <span className="leading-relaxed">{child.note}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function BackButton({ onBack, isDark }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 -ml-2 rounded-xl transition-colors ${
        isDark ? 'text-content-secondary hover:bg-white/10' : 'text-ink-secondary hover:bg-slate-100'
      }`}
    >
      <ChevronLeft size={15} aria-hidden="true" />
      กลับไปทุกรายวิชา
    </button>
  );
}
