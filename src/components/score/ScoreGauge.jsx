import { motion } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';
import { fmtScore, getScoreTier, scorePercent } from '../../utils/score';

/* วงกลมสรุปเปอร์เซ็นต์ + ยอดคะแนน — เดิมเขียนอยู่กลางโมดัลใน StudentHome.jsx
   ตอนนี้ใช้สามที่ (สรุปทุกวิชา, รายละเอียดวิชาเดียว, สมุดคะแนนฝั่งครู) จึงแยกออกมา */
export default function ScoreGauge({ score, maxScore, caption, size = 'md' }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const pct = scorePercent(score, maxScore);
  const tier = getScoreTier(pct);
  const circumference = 2 * Math.PI * 15.5;
  const box = size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';

  return (
    <div
      className={`rounded-2xl border p-4 flex items-center gap-4 ${
        isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
      }`}
    >
      <div className={`relative shrink-0 ${box}`}>
        <svg viewBox="0 0 36 36" className={`${box} -rotate-90`} aria-hidden="true">
          <circle
            cx="18" cy="18" r="15.5" fill="none" strokeWidth="3"
            className={isDark ? 'stroke-white/10' : 'stroke-slate-200'}
          />
          <motion.circle
            cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round"
            stroke="currentColor"
            className={tier.text}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${size === 'sm' ? 'text-[11px]' : 'text-sm'} font-extrabold ${textPrimary}`}>
            {pct}%
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className={`text-sm font-extrabold ${textPrimary}`}>
          {fmtScore(score)} / {fmtScore(maxScore)} คะแนน
        </div>
        {caption && <div className={`text-[12px] mt-0.5 ${textMuted}`}>{caption}</div>}
      </div>
    </div>
  );
}
