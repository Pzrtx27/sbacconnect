import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Search, User, ListChecks, Users, SlidersHorizontal, AlertCircle, Lock } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import LoadingSpinner from '../ui/LoadingSpinner';
import StudentScoreEditor from './StudentScoreEditor';
import BulkScoreEntry from './BulkScoreEntry';
import ScoreItemManager from './ScoreItemManager';
import { useGradebookSubjects, useSubjectGradebook } from '../../hooks/useGradebook';
import { fmtScore, getScoreTier, scorePercent } from '../../utils/score';

/* สมุดคะแนนฝั่งอาจารย์ — เนื้อหาของโมดัล "คะแนนระหว่างภาค" ในหน้าครูและหน้าฝ่ายวิชาการ

   สามชั้น: เลือกวิชา -> เลือกโหมด -> ลงมือกรอก
   ทุกชั้นอยู่ในโมดัลเดียวและมีปุ่มย้อนกลับเสมอ ไม่เปิดโมดัลซ้อน
   (เหตุผลเดียวกับฝั่งนักเรียน — bottom sheet ซ้อนกันบนมือถือใช้งานไม่ได้จริง) */

const MODES = [
  { id: 'students', label: 'รายคน', icon: User },
  { id: 'bulk', label: 'ทั้งห้อง', icon: Users },
  { id: 'items', label: 'หัวข้อ T1-T5', icon: SlidersHorizontal },
];

export default function TeacherGradebookPanel({ classRoomId = null }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [subjectId, setSubjectId] = useState(null);
  const [mode, setMode] = useState('students');
  const [studentId, setStudentId] = useState(null);
  const [query, setQuery] = useState('');

  const { subjects, loading: subjectsLoading, error: subjectsError } = useGradebookSubjects({ classRoomId });
  const gradebook = useSubjectGradebook(subjectId);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  const filteredSubjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.class_label || '').toLowerCase().includes(q) ||
        (s.teacher_name || '').toLowerCase().includes(q)
    );
  }, [subjects, query]);

  // จัดกลุ่มตามห้อง — ฝ่ายวิชาการเห็นทุกห้อง ถ้าเรียงเป็นรายการเดียวยาว ๆ จะหาไม่เจอ
  const grouped = useMemo(() => {
    const map = new Map();
    for (const subject of filteredSubjects) {
      const key = subject.class_label || 'ไม่ระบุห้อง';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(subject);
    }
    return [...map.entries()];
  }, [filteredSubjects]);

  const selectedStudent = useMemo(
    () => gradebook.students.find((s) => s.user_id === studentId) || null,
    [gradebook.students, studentId]
  );

  // ---------- ชั้นที่ 1: เลือกวิชา ----------
  if (!subjectId) {
    if (subjectsLoading) {
      return (
        <div className="py-10">
          <LoadingSpinner text="กำลังโหลดรายวิชา..." />
        </div>
      );
    }

    if (subjectsError) {
      return (
        <div className={`rounded-2xl border p-4 flex gap-3 ${
          isDark ? 'bg-amber-950/20 border-amber-900/30' : 'bg-amber-50 border-amber-100'
        }`}>
          <AlertCircle size={18} className="text-accent-amber shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className={`text-xs font-bold ${textPrimary}`}>ยังใช้สมุดคะแนนไม่ได้</p>
            <p className={`text-[11px] leading-relaxed ${textMuted}`}>
              {subjectsError === 'SETUP'
                ? 'ยังไม่ได้รัน supabase/migrations/40_gradebook.sql ในฐานข้อมูล'
                : 'ไม่มีสิทธิ์เข้าถึงสมุดคะแนน'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3.5">
        <p className={`text-xs font-bold ${textMuted}`}>เลือกรายวิชาที่ต้องการกรอกคะแนน</p>

        {subjects.length > 6 && (
          <div className="relative">
            <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${textMuted}`} aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาวิชา ห้อง หรือชื่อครู"
              aria-label="ค้นหารายวิชา"
              className={`w-full text-xs rounded-xl border pl-9 pr-3 py-2.5 outline-none transition-colors ${bgInput}`}
            />
          </div>
        )}

        {filteredSubjects.length === 0 && (
          <p className={`text-xs text-center py-10 leading-relaxed ${textMuted}`}>
            {subjects.length === 0
              ? 'ยังไม่มีรายวิชาในระบบ — ฝ่ายวิชาการเพิ่มได้ที่แท็บนักเรียน'
              : 'ไม่พบรายวิชาที่ตรงกับคำค้น'}
          </p>
        )}

        {grouped.map(([classLabel, list]) => (
          <div key={classLabel} className="space-y-1.5">
            <span className={`text-[10px] font-extrabold uppercase tracking-wide ${textMuted}`}>
              {classLabel}
            </span>

            <div className="space-y-1.5">
              {list.map((subject) => (
                <button
                  key={subject.subject_id}
                  type="button"
                  onClick={() => {
                    setSubjectId(subject.subject_id);
                    setStudentId(null);
                    setMode('students');
                  }}
                  className={`w-full text-left rounded-2xl border p-3 flex items-center gap-2.5 transition-colors ${
                    isDark
                      ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                      : 'bg-surface-card border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-bold truncate ${textSecondary}`}>{subject.name}</div>
                    <div className={`text-[10px] mt-0.5 ${textMuted}`}>
                      {subject.teacher_name || 'ยังไม่ระบุครูผู้สอน'} • เต็ม {fmtScore(subject.max_score)} คะแนน
                      {' • '}{subject.student_count} คน
                    </div>
                  </div>

                  {/* บอกตั้งแต่หน้ารายการว่าวิชาไหนแก้ไม่ได้
                      ดีกว่าให้กดเข้าไปแล้วค่อยเจอว่าทุกช่องเป็นสีเทา */}
                  {!subject.can_grade && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0 ${
                      isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-muted'
                    }`}>
                      <Lock size={9} aria-hidden="true" />
                      ดูอย่างเดียว
                    </span>
                  )}
                  <ChevronRight size={14} className={`${textMuted} shrink-0`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------- ชั้นที่ 2-3: อยู่ในวิชาแล้ว ----------
  if (gradebook.loading) {
    return (
      <div className="py-10">
        <LoadingSpinner text="กำลังโหลดสมุดคะแนน..." />
      </div>
    );
  }

  if (!gradebook.subject) {
    return (
      <div className="space-y-4">
        <BackToSubjects onClick={() => setSubjectId(null)} isDark={isDark} />
        <p className={`text-xs text-center py-8 ${textMuted}`}>ไม่พบข้อมูลของรายวิชานี้</p>
      </div>
    );
  }

  // กำลังแก้คะแนนของนักเรียนคนหนึ่งอยู่
  if (mode === 'students' && selectedStudent) {
    return (
      <StudentScoreEditor
        student={selectedStudent}
        items={gradebook.items}
        subject={gradebook.subject}
        canGrade={gradebook.canGrade}
        saving={gradebook.saving}
        onBack={() => setStudentId(null)}
        onSaveScore={gradebook.saveScore}
        onAdjustScore={gradebook.adjustScore}
      />
    );
  }

  return (
    <div className="space-y-3.5">
      <BackToSubjects onClick={() => { setSubjectId(null); setStudentId(null); }} isDark={isDark} />

      <div>
        <h3 className={`text-base font-extrabold leading-snug ${textPrimary}`}>{gradebook.subject.name}</h3>
        <p className={`text-[11px] mt-0.5 ${textMuted}`}>
          {gradebook.subject.class_label} • ภาคเรียน {gradebook.subject.term} • เต็ม {fmtScore(gradebook.subject.max_score)} คะแนน
        </p>
      </div>

      {/* สลับโหมด — segmented control ไม่ใช่ TabNav เพราะตัวนั้น sticky เต็มความกว้างจอ
          ซึ่งอยู่ในโมดัลแล้วจะทะลุขอบการ์ดออกไป */}
      <div
        role="tablist"
        aria-label="โหมดการกรอกคะแนน"
        className={`grid grid-cols-3 gap-1 p-1 rounded-2xl ${isDark ? 'bg-white/[0.06]' : 'bg-slate-100'}`}
      >
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => { setMode(m.id); setStudentId(null); }}
              className={`relative flex items-center justify-center gap-1 text-[11px] font-bold py-2 rounded-xl transition-colors ${
                active
                  ? isDark ? 'text-white' : 'text-sbac-navy'
                  : isDark ? 'text-content-secondary' : 'text-ink-muted'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="gradebook-mode-pill"
                  className={`absolute inset-0 rounded-xl ${isDark ? 'bg-white/10' : 'bg-white shadow-sm'}`}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon size={12} className="relative" aria-hidden="true" />
              <span className="relative">{m.label}</span>
            </button>
          );
        })}
      </div>

      {mode === 'students' && (
        <StudentList
          students={gradebook.students}
          maxScore={gradebook.subject.max_score}
          isDark={isDark}
          onPick={setStudentId}
        />
      )}

      {mode === 'bulk' && (
        <BulkScoreEntry
          leafItems={gradebook.leafItems}
          students={gradebook.students}
          canGrade={gradebook.canGrade}
          saving={gradebook.saving}
          onBulkSave={gradebook.bulkSave}
        />
      )}

      {mode === 'items' && (
        <ScoreItemManager
          items={gradebook.items}
          subject={gradebook.subject}
          canGrade={gradebook.canGrade}
          onSaveItem={gradebook.saveItem}
          onDeleteItem={gradebook.deleteItem}
          onApplyTemplate={gradebook.applyTemplate}
        />
      )}
    </div>
  );
}

function StudentList({ students, maxScore, isDark, onPick }) {
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';

  if (students.length === 0) {
    return (
      <p className={`text-xs text-center py-10 ${textMuted}`}>
        ยังไม่มีนักเรียนในห้องของรายวิชานี้
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center gap-1.5 text-[11px] font-bold ${textMuted}`}>
        <ListChecks size={13} aria-hidden="true" />
        แตะที่ชื่อเพื่อกรอก / ให้ / ตัดคะแนนรายหัวข้อ
      </div>

      {students.map((student, idx) => {
        const pct = scorePercent(student.total_score, maxScore);
        const tier = getScoreTier(pct);

        return (
          <button
            key={student.user_id}
            type="button"
            onClick={() => onPick(student.user_id)}
            className={`w-full text-left rounded-2xl border p-3 flex items-center gap-2.5 transition-colors ${
              isDark
                ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
                : 'bg-surface-card border-slate-100 hover:bg-slate-50'
            }`}
          >
            <span className={`text-[10px] font-bold w-5 shrink-0 ${textMuted}`}>{idx + 1}</span>

            <div className="flex-1 min-w-0">
              <div className={`text-xs font-bold truncate ${textSecondary}`}>{student.full_name}</div>
              <div className={`h-1.5 rounded-full overflow-hidden mt-1.5 ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                <div className={`h-full rounded-full ${tier.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            <span className={`text-xs font-extrabold shrink-0 ${tier.text}`}>
              {fmtScore(student.total_score)}
              <span className={`text-[10px] font-normal ${textMuted}`}>/{fmtScore(maxScore)}</span>
            </span>
            <ChevronRight size={14} className={`${textMuted} shrink-0`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function BackToSubjects({ onClick, isDark }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 -ml-2 rounded-xl transition-colors ${
        isDark ? 'text-content-secondary hover:bg-white/10' : 'text-ink-secondary hover:bg-slate-100'
      }`}
    >
      <ChevronLeft size={15} aria-hidden="true" />
      เลือกรายวิชาอื่น
    </button>
  );
}
