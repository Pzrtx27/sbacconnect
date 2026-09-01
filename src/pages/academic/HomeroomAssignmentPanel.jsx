import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import { Users, ChevronRight } from 'lucide-react';

/* ผูก "ครูประจำชั้น" เข้ากับห้องเรียน — ต้องมีขั้นตอนนี้ก่อน workflow อนุมัติใบลา
   ขั้นที่ 1 ถึงจะรู้ว่าใบลาของนักเรียนคนไหนต้องส่งไปหาครูคนไหน (22_leave_requests.sql)
   ถ้าห้องไหนยังไม่ผูกไว้ ระบบ fallback ให้ครู role teacher คนไหนก็ได้อนุมัติแทนไปก่อน
   (กันใบลาค้าง) แต่แนะนำให้ผูกให้ครบทุกห้องเพื่อความถูกต้องของ workflow */
export default function HomeroomAssignmentPanel() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [isOpen, setIsOpen] = useState(false);
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    const [roomsRes, teachersRes] = await Promise.all([
      supabase.rpc('list_classrooms_with_homeroom'),
      supabase.rpc('list_teachers'),
    ]);

    // list_classrooms_with_homeroom() / list_teachers() คืน jsonb array ตรง ๆ (ไม่ห่อ {ok, ...})
    if (roomsRes.error) console.error('[academic] โหลดรายชื่อห้องเรียนไม่สำเร็จ:', roomsRes.error);
    else setClassrooms(Array.isArray(roomsRes.data) ? roomsRes.data : []);

    if (teachersRes.error) console.error('[academic] โหลดรายชื่อครูไม่สำเร็จ:', teachersRes.error);
    else setTeachers(Array.isArray(teachersRes.data) ? teachersRes.data : []);

    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      load();
    }
  }, [isOpen, load]);

  const handleAssign = async (classRoomId, teacherUserId) => {
    setSavingId(classRoomId);
    const { data, error } = await supabase.rpc('set_homeroom_teacher', {
      p_class_room_id: classRoomId,
      p_teacher_user_id: teacherUserId || null,
    });
    setSavingId(null);

    if (error || !data?.ok) {
      showToast('บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
      return;
    }
    showToast('อัปเดตครูประจำชั้นแล้ว', 'success');
    load();
  };

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgInput = isDark
    ? 'bg-neutral-900 border-white/15 text-white focus:border-sbac-blue-light/50'
    : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  return (
    <>
      <GlassCard onClick={() => setIsOpen(true)}>
        <div className="flex flex-col h-full justify-between min-h-[110px]">
          <div>
            <Users className="text-brand mb-2" size={24} />
            <div className={`text-sm font-extrabold ${textPrimary}`}>กำหนดครูประจำชั้น</div>
            <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ผูกครูกับห้องเรียน — ใช้กำหนดผู้อนุมัติใบลาขั้นที่ 1</div>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[9px] font-semibold text-brand">จัดการ</span>
            <ChevronRight size={14} className={textMuted} />
          </div>
        </div>
      </GlassCard>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="กำหนดครูประจำชั้น">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
            ))}
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {classrooms.map((room) => (
              <div
                key={room.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${
                  isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <span className={`text-xs font-extrabold shrink-0 ${textPrimary}`}>{room.label}</span>
                <select
                  value={room.homeroom_teacher_id || ''}
                  onChange={(e) => handleAssign(room.id, e.target.value || null)}
                  disabled={savingId === room.id}
                  className={`flex-1 max-w-[220px] border rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none disabled:opacity-50 ${bgInput}`}
                >
                  <option value="">— ยังไม่กำหนด —</option>
                  {teachers.map((t) => (
                    <option key={t.user_id} value={t.user_id}>{t.full_name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
