import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabase';
import { showToast } from '../components/ui/Toast';
import { scoreErrorMessage } from '../utils/score';
import { useRealtimeTable } from './useRealtimeTable';

/* ฮุกทั้งหมดของระบบคะแนนระหว่างภาค (40_gradebook.sql)

   ทุกตัวคุยกับ DB ผ่าน RPC เท่านั้น ไม่มีตัวไหน select ตารางตรง ๆ
   เพราะคะแนนของเพื่อนเป็นข้อมูลที่ RLS กันไว้อยู่แล้ว การ join หาชื่อครู/ชื่อนักเรียน
   จากฝั่งหน้าเว็บจะได้ null กลับมาเงียบ ๆ (บทเรียนเดียวกับ my_class_info ใน 38)

   ทุกตัวที่ต้องเห็นของสดใช้ useRealtimeTable ซึ่งมีตาข่ายรองรับตอน websocket ต่อไม่ติด
   ครูกรอกคะแนนปุ๊บ นักเรียนที่เปิดค้างไว้ต้องเห็นโดยไม่ต้องปิดเปิดแอปใหม่ */

// ---------------------------------------------------------------
// ฝั่งนักเรียน
// ---------------------------------------------------------------

/** สรุปคะแนนทุกวิชาของตัวเอง — ใช้ในโมดัล "คะแนนระหว่างภาค" และ "ผลการเรียน" */
export function useMyScoreSummary(enabled = true) {
  const [subjects, setSubjects] = useState([]);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;

    const { data, error: rpcError } = await supabase.rpc('my_score_summary');

    if (rpcError) {
      // ยังไม่ได้รัน 40_gradebook.sql ก็จะมาตกที่นี่ — บอกให้ชัดว่าต้องทำอะไรต่อ
      console.error('[score] โหลดสรุปคะแนนไม่สำเร็จ (รัน supabase/migrations/40_gradebook.sql แล้วหรือยัง):', rpcError);
      setError('SETUP');
      setLoading(false);
      return;
    }

    if (!data?.ok) {
      setError(data?.error || 'UNKNOWN');
      setSubjects([]);
      setLoading(false);
      return;
    }

    setError(null);
    setTerm(data.term || '');
    setSubjects(data.subjects || []);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [enabled, load]);

  /* ฟังทั้งตารางไม่กรองรายคน เพราะ filter ของ postgres_changes กรองได้ทีละคอลัมน์
     และแถวที่เปลี่ยนคือ student_scores ของนักเรียนคนนั้นซึ่ง RLS ส่งมาให้อยู่แล้ว
     ส่วนคนอื่นที่ไม่เกี่ยวจะไม่ได้ payload ตั้งแต่ต้น (ดู policy student_scores_read) */
  useRealtimeTable({ table: 'student_scores', onChange: load, enabled });
  // ครูแก้คะแนนเต็มของหัวข้อ ยอด "เต็มเท่าไหร่" ของนักเรียนต้องขยับตามด้วย
  useRealtimeTable({ table: 'score_items', onChange: load, enabled });

  return { subjects, term, loading, error, reload: load };
}

/** รายละเอียดวิชาเดียว แตกเป็น T1-T5 พร้อมหัวข้อย่อย */
export function useMySubjectScores(subjectId) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(Boolean(subjectId));

  const load = useCallback(async () => {
    if (!subjectId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('my_subject_scores', { p_subject_id: subjectId });

    if (error || !data?.ok) {
      console.error('[score] โหลดรายละเอียดวิชาไม่สำเร็จ:', error || data?.error);
      setDetail(null);
      setLoading(false);
      return;
    }

    setDetail(data);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    setLoading(Boolean(subjectId));
    load();
  }, [load, subjectId]);

  useRealtimeTable({ table: 'student_scores', onChange: load, enabled: Boolean(subjectId) });

  return { detail, loading, reload: load };
}

// ---------------------------------------------------------------
// ฝั่งอาจารย์ / ฝ่ายวิชาการ
// ---------------------------------------------------------------

/** รายวิชาทั้งหมดที่ครูคนนี้เห็น พร้อมธง can_grade ว่าวิชาไหนแก้ได้จริง */
export function useGradebookSubjects({ classRoomId = null, term = null, enabled = true } = {}) {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;

    const { data, error: rpcError } = await supabase.rpc('list_gradebook_subjects', {
      p_class_room_id: classRoomId,
      p_term: term,
    });

    if (rpcError) {
      console.error('[score] โหลดรายวิชาไม่สำเร็จ (รัน supabase/migrations/40_gradebook.sql แล้วหรือยัง):', rpcError);
      setError('SETUP');
      setLoading(false);
      return;
    }

    if (!data?.ok) {
      setError(data?.error || 'UNKNOWN');
      setLoading(false);
      return;
    }

    setError(null);
    setSubjects(data.subjects || []);
    setLoading(false);
  }, [classRoomId, term, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [enabled, load]);

  useRealtimeTable({ table: 'subjects', onChange: load, enabled });

  return { subjects, loading, error, reload: load };
}

/** สมุดคะแนนของวิชาหนึ่ง — โครงสร้างหัวข้อ + รายชื่อนักเรียน + คะแนนทุกช่อง
 *  พร้อมคำสั่งเขียนทั้งหมดที่หน้าจอครูต้องใช้ */
export function useSubjectGradebook(subjectId) {
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(Boolean(subjectId));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!subjectId) {
      setBook(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('subject_gradebook', { p_subject_id: subjectId });

    if (error || !data?.ok) {
      console.error('[score] โหลดสมุดคะแนนไม่สำเร็จ:', error || data?.error);
      showToast(scoreErrorMessage(data?.error, 'โหลดสมุดคะแนนไม่สำเร็จ'), 'error');
      setBook(null);
      setLoading(false);
      return;
    }

    setBook(data);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    setLoading(Boolean(subjectId));
    load();
  }, [load, subjectId]);

  /* ครูสองคนเปิดวิชาเดียวกันพร้อมกันได้จริง (ครูประจำวิชา + ฝ่ายวิชาการที่มาแก้ให้)
     ถ้าไม่ฟังของสด คนที่เปิดค้างไว้จะเซฟทับงานอีกคนโดยไม่รู้ตัว */
  useRealtimeTable({ table: 'student_scores', onChange: load, enabled: Boolean(subjectId) });
  useRealtimeTable({ table: 'score_items', onChange: load, enabled: Boolean(subjectId) });

  /** หัวข้อที่กรอกคะแนนได้จริง = หัวข้อใบ (ไม่มีลูก)
   *  แผ่ต้นไม้ให้แบนไว้ล่วงหน้า เพราะทั้งฟอร์มรายคนและฟอร์มทั้งห้องต้องใช้ชุดนี้ */
  const leafItems = useMemo(() => {
    const out = [];
    for (const unit of book?.items || []) {
      if ((unit.children || []).length === 0) out.push({ ...unit, unit_code: unit.code });
      else for (const child of unit.children) out.push({ ...child, unit_code: unit.code });
    }
    return out;
  }, [book]);

  const saveScore = useCallback(
    async ({ itemId, studentUserId, score, note = null, reason = null }) => {
      setSaving(true);
      const { data, error } = await supabase.rpc('save_score', {
        p_item_id: itemId,
        p_student_user_id: studentUserId,
        p_score: score,
        p_note: note,
        p_reason: reason,
      });
      setSaving(false);

      if (error || !data?.ok) {
        const extra = data?.max_score != null ? ` (เต็ม ${data.max_score})` : '';
        showToast(scoreErrorMessage(data?.error, 'บันทึกคะแนนไม่สำเร็จ') + extra, 'error');
        return false;
      }

      await load();
      return true;
    },
    [load]
  );

  const adjustScore = useCallback(
    async ({ itemId, studentUserId, delta, reason = null }) => {
      setSaving(true);
      const { data, error } = await supabase.rpc('adjust_score', {
        p_item_id: itemId,
        p_student_user_id: studentUserId,
        p_delta: delta,
        p_reason: reason,
      });
      setSaving(false);

      if (error || !data?.ok) {
        showToast(scoreErrorMessage(data?.error, 'ปรับคะแนนไม่สำเร็จ'), 'error');
        return false;
      }

      showToast(
        delta > 0
          ? `ให้คะแนนเพิ่ม +${delta} แล้ว — แจ้งเตือนนักเรียนเรียบร้อย`
          : `ตัดคะแนน ${delta} แล้ว — แจ้งเตือนนักเรียนเรียบร้อย`,
        'success'
      );
      await load();
      return true;
    },
    [load]
  );

  const bulkSave = useCallback(
    async ({ itemId, rows, notify = true }) => {
      setSaving(true);
      const { data, error } = await supabase.rpc('bulk_save_scores', {
        p_item_id: itemId,
        p_rows: rows,
        p_notify: notify,
      });
      setSaving(false);

      if (error || !data?.ok) {
        showToast(scoreErrorMessage(data?.error, 'บันทึกคะแนนทั้งห้องไม่สำเร็จ'), 'error');
        return false;
      }

      /* รายงานผลตามจริงเสมอ รวมถึงแถวที่เข้าไม่ได้
         ครูกด "บันทึก" แล้วเห็นข้อความเขียวทั้งที่มีสามคนไม่เข้า คือกับดักที่แย่ที่สุดของฟีเจอร์นี้
         เพราะจะไปรู้ตัวอีกทีตอนนักเรียนมาทวงคะแนนตอนปลายเทอม */
      const failed = (data.errors || []).length;
      if (failed > 0) {
        showToast(`บันทึกแล้ว ${data.saved} คน แต่มี ${failed} คนที่บันทึกไม่ได้`, 'error');
      } else if (data.saved === 0) {
        showToast('ไม่มีคะแนนที่เปลี่ยนแปลง', 'info');
      } else {
        showToast(`บันทึกคะแนน ${data.saved} คนเรียบร้อย — แจ้งเตือนนักเรียนแล้ว`, 'success');
      }

      await load();
      return failed === 0;
    },
    [load]
  );

  const saveItem = useCallback(
    async ({ itemId = null, parentId = null, code, label, maxScore, sortOrder = null }) => {
      const { data, error } = await supabase.rpc('upsert_score_item', {
        p_item_id: itemId,
        p_subject_id: subjectId,
        p_parent_id: parentId,
        p_code: code,
        p_label: label,
        p_max_score: maxScore,
        p_sort_order: sortOrder,
      });

      if (error || !data?.ok) {
        showToast(scoreErrorMessage(data?.error, 'บันทึกหัวข้อไม่สำเร็จ'), 'error');
        return false;
      }

      showToast(itemId ? 'แก้ไขหัวข้อคะแนนแล้ว' : 'เพิ่มหัวข้อคะแนนแล้ว', 'success');
      await load();
      return true;
    },
    [subjectId, load]
  );

  const deleteItem = useCallback(
    async (itemId) => {
      const { data, error } = await supabase.rpc('delete_score_item', { p_item_id: itemId });

      if (error || !data?.ok) {
        showToast(scoreErrorMessage(data?.error, 'ลบหัวข้อไม่สำเร็จ'), 'error');
        return false;
      }

      showToast(
        data.deleted_scores > 0
          ? `ลบหัวข้อแล้ว พร้อมคะแนนที่เคยกรอกไว้ ${data.deleted_scores} รายการ`
          : 'ลบหัวข้อแล้ว',
        'success'
      );
      await load();
      return true;
    },
    [load]
  );

  const applyTemplate = useCallback(async () => {
    const { data, error } = await supabase.rpc('apply_default_score_template', {
      p_subject_id: subjectId,
    });

    if (error || !data?.ok) {
      showToast(scoreErrorMessage(data?.error, 'ใส่โครงสร้างมาตรฐานไม่สำเร็จ'), 'error');
      return false;
    }

    showToast(`สร้างหัวข้อ T1-T5 ให้แล้ว ${data.items_created} หัวข้อย่อย`, 'success');
    await load();
    return true;
  }, [subjectId, load]);

  return {
    book,
    items: book?.items || [],
    leafItems,
    students: book?.students || [],
    subject: book?.subject || null,
    canGrade: Boolean(book?.can_grade),
    loading,
    saving,
    reload: load,
    saveScore,
    adjustScore,
    bulkSave,
    saveItem,
    deleteItem,
    applyTemplate,
  };
}

/** ปูมการให้/ตัดคะแนน — ใช้ทั้งฝั่งครู (ดูทั้งวิชา) และฝั่งนักเรียน (ดูของตัวเอง) */
export function useScoreLogs({ subjectId = null, studentUserId = null, enabled = true } = {}) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback(async () => {
    if (!enabled) return;

    const { data, error } = await supabase.rpc('list_score_logs', {
      p_subject_id: subjectId,
      p_student_user_id: studentUserId,
      p_limit: 100,
    });

    if (error || !data?.ok) {
      console.error('[score] โหลดปูมคะแนนไม่สำเร็จ:', error || data?.error);
      setLogs([]);
      setLoading(false);
      return;
    }

    setLogs(data.logs || []);
    setLoading(false);
  }, [subjectId, studentUserId, enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [enabled, load]);

  return { logs, loading, reload: load };
}

export default useMyScoreSummary;
