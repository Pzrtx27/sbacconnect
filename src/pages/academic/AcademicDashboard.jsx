import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import PageHeader from '../../components/layout/PageHeader';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import BehaviorLogList from '../../components/behavior/BehaviorLogList';
import BehaviorLogEditModal from '../../components/behavior/BehaviorLogEditModal';
import LeaveRequestList from '../../components/leave/LeaveRequestList';
import { useBehaviorLogs } from '../../hooks/useBehaviorLogs';
import { useLeaveRequests } from '../../hooks/useLeaveRequests';
import RepairTicketQueue from '../../components/repair/RepairTicketQueue';
import {
  Calendar,
  Settings,
  RefreshCw,
  Undo,
  Award,
  BookOpen,
  ListChecks,
  ClipboardCheck,
  CalendarDays,
  Users,
  Trash2
} from 'lucide-react';
import EventManager from './EventManager';
import BehaviorDeductionWizard from './BehaviorDeductionWizard';
import HomeroomAssignmentPanel from './HomeroomAssignmentPanel';
import TeacherAbsencePanel from './TeacherAbsencePanel';
import TeacherGradebookPanel from '../../components/score/TeacherGradebookPanel';
import TabNav from '../../components/layout/TabNav';
import {
  DAY_LABELS,
  PERIODS,
  PERIOD_TIMES,
  fetchBaseTimetable,
  listClassIds,
  fetchSubstitutions,
  saveSubstitution,
  clearSubstitution,
  subscribeSubstitutions,
  todayISO,
  weekdayKeyOf,
  isSchoolDay,
  describeDate,
  formatThaiDate,
  classLabel,
} from '../../utils/timetable';
import { notEnabledMessage, CONTACT } from '../../utils/setupNotice';

/** กล่องอธิบายขั้นตอนการทำงานที่ต้องรู้ก่อนกดปุ่ม
 *  ไม่ใช่คำเตือนว่าพัง — ของที่พังถูกแก้หรือถอดออกไปหมดแล้ว */
function WorkflowNotice({ isDark, title, children }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-xs leading-relaxed ${
        isDark ? 'bg-sbac-blue/10 border-sbac-blue/25 text-slate-200' : 'bg-sbac-blue-50 border-sbac-blue/20 text-ink-secondary'
      }`}
    >
      <strong className={`font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>{title}</strong>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function AcademicDashboard() {
  const { user } = useAuth();

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  /* ฟอร์มสอนแทน — ผูกกับ "วันที่" ไม่ใช่ชื่อวัน
     การสอนแทนคือการเปลี่ยนตัวชั่วคราวแค่วันเดียว พ้นวันนั้นตารางกลับเป็นปกติเอง
     ถ้าเก็บเป็นชื่อวัน ('Monday') มันจะกลายเป็น "ทุกวันจันทร์" ซึ่งไม่ใช่ความจริง
     ชื่อวันจึงคำนวณจากวันที่ (weekdayKeyOf) ไม่ให้ผู้ใช้เลือกเอง จะได้ขัดกันไม่ได้ */
  const [subDate, setSubDate] = useState(todayISO());
  const [period, setPeriod] = useState(3);
  /* เก็บ "id บัญชีครู" ไม่ใช่ชื่อ — ชื่อถูกดึงจากรายการตอนบันทึกอีกที
     ของเดิมเป็นช่องพิมพ์อิสระ พิมพ์ผิดตัวเดียวแล้วครูที่ถูกสั่งไม่เห็นคาบของตัวเอง */
  const [subTeacher, setSubTeacher] = useState('');
  const [teacherChoices, setTeacherChoices] = useState([]);
  const [teacherChoicesError, setTeacherChoicesError] = useState('');
  const [teacherChoicesLoading, setTeacherChoicesLoading] = useState(false);
  const [roomMode, setRoomMode] = useState('same'); // 'same' or 'new'
  const [room, setRoom] = useState('');

  // ชื่อวันของ subDate — ใช้หาคาบในตารางฐาน และบอกผู้ใช้ว่ากำลังแก้วันอะไร
  const dayKey = weekdayKeyOf(subDate);

  /* ฟอร์มประกาศกิจกรรมเดิมถูกย้ายไป <EventManager /> ทั้งก้อน
     ของเดิมเขียนลง Firebase collection 'events' ซึ่งปิดไปแล้ว และเป็นคนละที่กับ
     ปฏิทินที่นักเรียนเห็นด้วย — ตอนนี้ทั้งสองฝั่งใช้ตาราง events ใน Supabase ร่วมกัน */

  // Selected class room/branch states
  const [selectedClassId, setSelectedClassId] = useState('m3_6');

  /* ห้องที่จัดการได้ = ห้องที่ตั้งค่าแท็บ Google Sheet ไว้แล้ว
     ไม่ต้องยิง DB เพราะรายชื่อมาจากไฟล์ config ตรง ๆ */
  const classIds = listClassIds();

  /* ตารางประจำเทอมจากชีต (อ่านอย่างเดียว) + รายการสอนแทนของวันที่เลือกจาก Supabase
     คนละแหล่ง คนละอายุข้อมูล จงใจไม่เอามารวมเป็นก้อนเดียว */
  const [timetableData, setTimetableData] = useState({});
  const [timetableSource, setTimetableSource] = useState('loading');
  const [timetableLoading, setTimetableLoading] = useState(true);
  const [daySubs, setDaySubs] = useState([]);
  const [savingSlot, setSavingSlot] = useState(false);

  /* แท็บที่เปิดอยู่ — เริ่มที่ "รอดำเนินการ" เพราะเป็นคำถามแรกของทุกเช้า
     ว่ามีใบลา/ใบแจ้งซ่อมค้างอยู่กี่รายการ ไม่ใช่การมาแก้ตารางสอน */
  const [activeTab, setActiveTab] = useState('inbox');

  const { confirm: confirmClearSub, confirmDialog: clearSubConfirmDialog } = useConfirm();

  // จัดการรายการตัด/เพิ่มคะแนนพฤติกรรมทั้งหมด (ทุกครู) — role academic เป็น overseer
  // ตาม list_behavior_logs() ใน 21_behavior_crud_and_academic.sql จึงแก้ไข/ลบได้ทุกรายการ
  const { logs: allBehaviorLogs, loading: allBehaviorLogsLoading, updateLog: updateBehaviorLog, deleteLog: deleteBehaviorLog } = useBehaviorLogs();
  const { confirm: confirmBehaviorDelete, confirmDialog: behaviorConfirmDialog } = useConfirm();
  const [editingBehaviorLog, setEditingBehaviorLog] = useState(null);

  const handleDeleteBehaviorLog = async (log) => {
    const ok = await confirmBehaviorDelete({
      title: 'ลบรายการนี้?',
      message: `"${log.reason}" (${log.action_type === 'add' ? '+' : '-'}${log.points} คะแนน) ของ ${log.student_name} — บันทึกโดย ${log.teacher_name}`,
      detail: 'ระบบจะเก็บหลักฐานไว้ตรวจสอบย้อนหลัง ไม่ได้ลบถาวร และคะแนนของนักเรียนจะกลับมาทันที',
      confirmLabel: 'ลบรายการ',
      danger: true,
    });
    if (ok) deleteBehaviorLog(log.id);
  };

  // อนุมัติใบลาขั้นที่ 2 (ขั้นสุดท้าย) — เห็นเฉพาะที่ครูประจำชั้นอนุมัติผ่านมาแล้ว (22_leave_requests.sql)
  const { requests: pendingAcademicLeaves, loading: pendingAcademicLeavesLoading, academicDecide } = useLeaveRequests('pending_academic');

  /* ตารางประจำเทอมอ่านสดจาก Google Sheet — ชีตคือต้นฉบับ ที่นี่อ่านอย่างเดียว
     ฝ่ายวิชาการจะเปลี่ยนวิชา/ครู/ห้องถาวร ต้องไปแก้ในชีต ไม่ใช่ในหน้านี้
     (หน้านี้ทำได้อย่างเดียวคือสั่งสอนแทนรายวัน ซึ่งชีตทำไม่ได้เพราะอ่านได้อย่างเดียว) */
  const reloadTimetable = useCallback(async () => {
    setTimetableLoading(true);
    const { timetable, source } = await fetchBaseTimetable(selectedClassId);
    setTimetableData(timetable);
    setTimetableSource(source);
    setTimetableLoading(false);
  }, [selectedClassId]);

  useEffect(() => {
    reloadTimetable();
  }, [reloadTimetable]);

  /* รายการสอนแทนของห้อง+วันที่ที่เลือก
     แยกเป็นฟังก์ชันเพราะต้องเรียกซ้ำหลังบันทึก/ยกเลิก ไม่ใช่แค่ตอนเปลี่ยนวันที่ */
  const reloadDaySubs = useCallback(async () => {
    setDaySubs(await fetchSubstitutions(selectedClassId, subDate));
  }, [selectedClassId, subDate]);

  useEffect(() => {
    reloadDaySubs();
    // ห้องเดียวกันอาจมีฝ่ายวิชาการอีกคนแก้อยู่พร้อมกัน — ให้เห็นตรงกัน
    return subscribeSubstitutions(selectedClassId, reloadDaySubs);
  }, [selectedClassId, reloadDaySubs]);

  /* คาบนี้ของวันนี้ในตารางประจำเทอม (อ่านอย่างเดียว) และแถวสอนแทนถ้ามี */
  const baseSlot = timetableData[dayKey]?.[period] || null;
  const currentSub = daySubs.find((s) => Number(s.period) === Number(period)) || null;

  /* ย้ายค่าเข้าฟอร์ม
     ถ้าคาบนั้นวันนั้นตั้งสอนแทนไว้แล้ว ดึงของเดิมมาแก้ต่อ
     ถ้ายังไม่มี เว้นช่องครูสอนแทนให้ว่าง แล้วตั้งห้องเป็น "ห้องเดิมตามตาราง"
     ต้องเคลียร์ทุกครั้งที่เปลี่ยนคาบ ไม่งั้นชื่อครูจากคาบก่อนหน้าจะค้างในช่อง
     แล้วกดบันทึกทีเดียวกลายเป็นสั่งสอนแทนคาบที่ไม่ได้ตั้งใจ */
  useEffect(() => {
    setSubTeacher(currentSub?.substitute_teacher_id || '');
    if (currentSub?.substitute_room) {
      setRoomMode('new');
      setRoom(currentSub.substitute_room);
    } else {
      setRoomMode('same');
      setRoom('');
    }
  }, [currentSub, subDate, period, selectedClassId]);

  /* รายชื่อครูที่เลือกได้ของ "วันที่ + คาบ" ที่กำลังดูอยู่
     ต้องยิงใหม่ทุกครั้งที่เปลี่ยนวันหรือคาบ เพราะช่วงลาของครูผูกกับวันและคาบ
     ธง active กันผลลัพธ์ของคำขอเก่ามาทับของใหม่ ตอนคนกดเปลี่ยนคาบรัว ๆ */
  useEffect(() => {
    let active = true;
    setTeacherChoicesLoading(true);
    setTeacherChoicesError('');

    supabase
      .rpc('available_substitute_teachers', { p_date: subDate, p_period: Number(period) })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('[academic] โหลดรายชื่อครูสอนแทนไม่สำเร็จ:', error);
          setTeacherChoices([]);
          setTeacherChoicesError(
            error.code === '42883'
              ? 'ยังไม่ได้ติดตั้งรายการครูสอนแทน — รัน 52_substitute_picker.sql ก่อน'
              : 'โหลดรายชื่อครูไม่สำเร็จ กรุณาลองใหม่'
          );
        } else {
          setTeacherChoices(Array.isArray(data) ? data : []);
        }
        setTeacherChoicesLoading(false);
      });

    return () => { active = false; };
  }, [subDate, period]);

  /* หมวดของหน้านี้ เรียงตามความถี่ที่ฝ่ายวิชาการต้องใช้จริง ไม่ใช่ตามลำดับที่โค้ดเคยเขียนไว้
     "รอดำเนินการ" มาก่อนเพราะเป็นคำถามแรกของทุกเช้าว่ามีอะไรค้างรออยู่บ้าง
     และตัวเลขบนแท็บตอบคำถามนั้นให้ตั้งแต่ยังไม่ได้กดเข้าไป */
  const TABS = [
    { id: 'inbox', label: 'รอดำเนินการ', icon: ClipboardCheck, badge: pendingAcademicLeaves.length },
    { id: 'timetable', label: 'ตารางสอน', icon: Calendar },
    { id: 'scores', label: 'คะแนน', icon: BookOpen },
    { id: 'students', label: 'นักเรียน', icon: Users },
    { id: 'events', label: 'กิจกรรม', icon: CalendarDays },
  ];

  /* สั่งสอนแทน 1 คาบ ของ 1 วัน
     ปุ่มนี้ทำได้อย่างเดียวคือสอนแทน ไม่มีทางแก้ตารางประจำเทอมโดยไม่ตั้งใจ
     (ของเดิมปุ่มเดียวทำสองอย่าง เว้นช่องครูสอนแทนว่าง = เขียนทับตารางถาวร) */
  const handleSaveSubstitution = async () => {
    /* ต้องเป็นคนที่อยู่ในรายการรอบนี้จริง ๆ เท่านั้น
       กันกรณีเลือกไว้แล้วเปลี่ยนคาบ จนคนที่เลือกไว้กลายเป็นคนที่ลาในคาบใหม่ */
    const picked = teacherChoices.find((t) => t.user_id === subTeacher);
    if (!picked) {
      showToast('กรุณาเลือกครูสอนแทนจากรายการ', 'error');
      return;
    }
    if (roomMode === 'new' && !room.trim()) {
      showToast('เลือก "เปลี่ยนห้องใหม่" แล้วต้องระบุเลขห้อง', 'error');
      return;
    }

    setSavingSlot(true);
    try {
      await saveSubstitution({
        classId: selectedClassId,
        date: subDate,
        period,
        // คัดลอกวิชา/ครูเดิมจากชีตไว้กับแถว เพื่อให้ประกาศของวันนั้นยังตรง
        // แม้ชีตจะถูกแก้ทีหลัง
        subject: baseSlot?.subject || '',
        originalTeacher: baseSlot?.teacher || '',
        substituteTeacher: picked.full_name,
        substituteTeacherId: picked.user_id,
        // โหมด 'same' ส่งค่าว่าง = ใช้ห้องเดิมตามตาราง ไม่ได้แปลว่าไม่มีห้อง
        substituteRoom: roomMode === 'new' ? room.trim() : '',
      });
      // ไม่รอ realtime สำหรับการกระทำของตัวเอง — ถ้า event ไม่มา ผู้ใช้จะนึกว่ากดไม่ติด
      await reloadDaySubs();
      showToast(`สั่งสอนแทน ${describeDate(subDate)} คาบ ${period} เรียบร้อย นักเรียนเห็นแล้ว`, 'success');
    } catch (err) {
      console.error('[academic] สั่งสอนแทนไม่สำเร็จ:', err);
      /* ต่อรหัสกับข้อความจริงของ DB ไว้ท้าย toast ด้วย
         ของเดิมเหลือ "ลองใหม่อีกครั้ง" ลอย ๆ ทุกกรณีที่ไม่ได้ดักไว้
         ซึ่งแปลว่าคนใช้ต้องเปิด DevTools ถึงจะรู้ว่าเกิดอะไรขึ้น */
      showToast(
        err?.code === '42501'
          ? 'บัญชีนี้ไม่มีสิทธิ์สั่งสอนแทน (เฉพาะฝ่ายวิชาการ)'
          : err?.code === '42P01'
            ? notEnabledMessage('สั่งสอนแทน', CONTACT.admin)
            : `บันทึกไม่สำเร็จ (${err?.code || 'ไม่ทราบรหัส'}) ${err?.message || ''}`.trim(),
        'error'
      );
    } finally {
      setSavingSlot(false);
    }
  };

  /* ยกเลิกสอนแทน = ลบแถวทิ้ง ตารางกลับไปใช้ของในชีตทันที
     ปกติไม่ต้องกดเลย เพราะพ้นวันแล้วมันหายไปเอง — ปุ่มนี้ไว้ใช้ตอนตั้งผิด
     หรือครูกลับมาสอนเองได้ */
  const handleClearSubstitution = async (targetPeriod = period) => {
    const ok = await confirmClearSub({
      title: `ยกเลิกสอนแทนคาบ ${targetPeriod}?`,
      message: `${describeDate(subDate)} ห้อง ${classLabel(selectedClassId)} คาบ ${targetPeriod}`,
      detail: 'คาบนี้จะกลับไปใช้ครูและห้องเดิมตามตารางในชีต และนักเรียนจะเห็นทันที',
      confirmLabel: 'ยกเลิกสอนแทน',
      danger: true,
    });
    if (!ok) return;

    setSavingSlot(true);
    try {
      await clearSubstitution(selectedClassId, subDate, targetPeriod);
      await reloadDaySubs();
      showToast(`ยกเลิกสอนแทน ${describeDate(subDate)} คาบ ${targetPeriod} แล้ว`, 'success');
    } catch (err) {
      console.error('[academic] ยกเลิกการสอนแทนไม่สำเร็จ:', err);
      showToast('ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    } finally {
      setSavingSlot(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* "Academic Panel" เป็นคำอังกฤษคำเดียวในหน้าที่เหลือเป็นไทยทั้งหมด
          และคนใช้จริงคือเจ้าหน้าที่ฝ่ายวิชาการของวิทยาลัยไทย

          ป้ายห้องโผล่เฉพาะแท็บตารางสอน เพราะการเลือกห้องมีผลแค่กับแท็บนั้น
          ถ้าค้างอยู่บนหัวตลอดจะอ่านเหมือนว่าทั้งหน้าถูกกรองด้วยห้องนี้
          ทั้งที่แท็บนักเรียน/กิจกรรมไม่ได้กรองอะไรเลย */}
      <PageHeader icon={Settings} title="ฝ่ายวิชาการ">
        {/* ทางเข้าหน้าการเงินย้ายไปอยู่หน้าฝ่ายพัฒนาแล้ว (/development)
            หน้านี้เป็นงานวิชาการล้วน ไม่ควรมีปุ่มของอีกฝ่ายมาปน */}
        {activeTab === 'timetable' && (
          <span className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors duration-300 ${isDark ? 'bg-white/10 text-content-secondary' : 'bg-slate-100 text-ink-secondary'
            }`}>
            ห้อง {classLabel(selectedClassId)}
          </span>
        )}
      </PageHeader>

      {/* แท็บ — เดิมเป็นหน้าเดียวยาว 7 หมวดรวด บนมือถือกว่าจะเลื่อนถึงใบลาที่รออนุมัติ
          ต้องผ่านฟอร์มตารางสอน ตัวอัปโหลด Excel และตารางพรีวิวรายชื่อทั้งหมดก่อน */}
      <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} equalWidth />

      {activeTab === 'inbox' && (
        <div
          role="tabpanel"
          id="panel-inbox"
          aria-labelledby="tab-inbox"
          tabIndex={-1}
          className="space-y-6"
        >
        {/* ============================================================
            อนุมัติใบลา (ขั้นสุดท้าย) + กำหนดครูประจำชั้น (22_leave_requests.sql)

            ไม่มีการ์ดครอบอีกชั้นแล้ว: ของที่อยู่ข้างในเป็นการ์ดอยู่แล้วทั้งคู่
            (HomeroomAssignmentPanel เป็น GlassCard, LeaveRequestList ออกมาเป็นการ์ดรายใบ)
            การ์ดซ้อนการ์ดกินขอบซ้ายขวาไปสองชั้นทั้งที่จอมือถือกว้างแค่ 375px
            และทำให้เส้นขอบสองเส้นวิ่งขนานกันห่างกัน 20px ซึ่งไม่ได้สื่ออะไรเลย
            ============================================================ */}
        <section aria-labelledby="head-leaves" className="space-y-3">
          <h3
            id="head-leaves"
            className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}
          >
            <ClipboardCheck size={18} className="text-brand" aria-hidden="true" />
            อนุมัติใบลา (ขั้นสุดท้าย)
          </h3>

          <div className="grid gap-4 xl:grid-cols-[300px_1fr] items-start">
            <HomeroomAssignmentPanel />

            <div className="space-y-2.5">
              <span className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                <ListChecks size={14} aria-hidden="true" />
                รอฝ่ายวิชาการอนุมัติ ({pendingAcademicLeaves.length})
              </span>
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <LeaveRequestList
                  requests={pendingAcademicLeaves}
                  loading={pendingAcademicLeavesLoading}
                  mode="academic"
                  onDecide={(req, approve, reason) => academicDecide(req.id, approve, reason)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* คิวใบแจ้งซ่อมจริงจากผู้ช่วย SBAC Connect (23_repair_tickets.sql) */}
        <RepairTicketQueue />
        </div>
      )}

      {activeTab === 'timetable' && (
        <div
          role="tabpanel"
          id="panel-timetable"
          aria-labelledby="tab-timetable"
          tabIndex={-1}
          className="space-y-6"
        >
            {/* เลือกห้อง
                เดิมเป็น dropdown สาขา 12 สาขา + ห้อง 20 ห้อง ทั้งที่:
                  - ตัวเลือกสาขาไม่เคยถูกใช้กรองหรือบันทึกอะไรเลย เอาไปโชว์เป็นข้อความบนหัวอย่างเดียว
                  - มีตารางจริงแค่สองห้อง อีก 18 ห้องเลือกไปก็เจอหน้าว่างโดยไม่มีคำอธิบาย
                    ซึ่งดูเหมือนระบบพัง ทั้งที่คือห้องนั้นยังไม่มีใครใส่ตาราง
                ตอนนี้แสดงเฉพาะห้องที่มีตารางอยู่จริงในฐานข้อมูล */}
        <div className={`rounded-3xl border p-5 shadow-sm space-y-3 transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
          }`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
              }`}>
              {/* ไอคอนฟันเฟืองสื่อว่า "ตั้งค่า" ซึ่งไม่ใช่สิ่งที่ส่วนนี้ทำ
                  ส่วนนี้เลือกห้องเรียนที่จะแก้ตาราง จึงใช้ไอคอนกลุ่มคน */}
              <Users size={18} className="text-brand" aria-hidden="true" />
              ห้องที่กำลังจัดการ
            </h3>
            <span className="text-xs font-bold text-content-muted">
              {classIds.length > 0 ? `${classIds.length} ห้อง` : ''}
            </span>
          </div>

          {classIds.length === 0 ? (
            /* ยังไม่มีห้องไหนตั้งค่าแท็บชีต — บอกทางออกไปเลย ไม่ใช่ปล่อยให้หน้าว่าง */
            <p className="text-xs font-semibold text-content-muted leading-relaxed">
              ยังไม่มีห้องไหนผูกกับ Google Sheet — เพิ่ม gid ของแท็บใน
              <code className="font-mono"> src/config/sheets.js </code>
              ที่ <code className="font-mono">TIMETABLE_TAB_GID_BY_CLASS</code>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedClassId(id)}
                  aria-pressed={selectedClassId === id}
                  className={`min-h-[44px] px-5 rounded-xl text-sm font-extrabold border transition-all active:scale-95 ${
                    selectedClassId === id
                      ? 'bg-sbac-blue text-white border-sbac-blue shadow-button'
                      : isDark
                        ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                        : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {classLabel(id)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ช่วงลาของครู — ต้นทางข้อมูลของตัวคัดกรองในฟอร์มด้านล่าง
            วางไว้ก่อนฟอร์มเพราะต้องบันทึกช่วงลาให้ครบก่อน รายการครูถึงจะกรองได้ตรง */}
        <div className="max-w-xs">
          <TeacherAbsencePanel />
        </div>

        {/* Timetable modification form */}
        <div className={`rounded-3xl border p-5 shadow-sm space-y-4 transition-colors duration-300 ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
          }`}>
          <h3 className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'
            }`}>
            <Calendar size={18} className="text-brand" />
            สั่งสอนแทน (ชั่วคราว 1 วัน)
            <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/25">
              นักเรียนเห็นทันที
            </span>
          </h3>

          {/* บอกขอบเขตให้ชัดตั้งแต่บรรทัดแรก กันเข้าใจผิดว่าเป็นการแก้ตารางถาวร
              ซึ่งเป็นสิ่งที่หน้านี้เคยทำได้และเป็นต้นเหตุของสอนแทนค้างข้ามสัปดาห์ */}
          <WorkflowNotice isDark={isDark} title="มีผลเฉพาะวันที่เลือกเท่านั้น">
            พ้นวันแล้วตารางกลับเป็นปกติเอง ไม่ต้องมากดคืนค่า
            <br />
            ถ้าจะเปลี่ยนวิชา/ครู/ห้อง <strong>แบบถาวร</strong> ให้แก้ที่ Google Sheet ของห้องนั้น
            แล้วหน้านี้กับหน้านักเรียนจะอัปเดตตามเอง
          </WorkflowNotice>

          {/* เลือกเป็น "วันที่" ไม่ใช่ชื่อวัน — นี่คือหัวใจของการแก้บั๊กเดิม
              ชื่อวันคำนวณจากวันที่ให้อัตโนมัติ ผู้ใช้จึงกรอกให้ขัดกันเองไม่ได้ */}
          <div>
            <label
              htmlFor="sub-date"
              className={`text-xs font-bold block mb-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}
            >
              วันที่สอนแทน
            </label>
            <input
              id="sub-date"
              type="date"
              value={subDate}
              min={todayISO()}
              onChange={(e) => setSubDate(e.target.value || todayISO())}
              className={`w-full min-h-[44px] rounded-xl px-4 text-sm font-extrabold focus:outline-none border transition-all ${isDark
                ? 'bg-slate-900 border-white/10 text-white focus:border-sbac-blue-light/50'
                : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue focus:bg-surface-card'
                }`}
            />
            <p className={`text-[12px] font-bold mt-1.5 ${isSchoolDay(subDate) ? 'text-content-muted' : 'text-accent-rose'}`}>
              {isSchoolDay(subDate)
                ? `วัน${DAY_LABELS[dayKey]} · ${describeDate(subDate)}`
                : `วัน${DAY_LABELS[dayKey]} — ปกติไม่มีคาบเรียน`}
            </p>
          </div>

          {/* คาบเรียนก็เช่นกัน แถมแต่ละปุ่มยังบอกได้ด้วยว่าคาบไหนมีวิชาแล้ว
              และคาบไหนถูกสั่งสอนแทนอยู่ — เดิมเป็นช่อง number ที่ไม่บอกอะไรเลย */}
          <div>
            <span className={`text-xs font-bold block mb-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>คาบที่</span>
            {/* สี่คอลัมน์บนมือถือ แปดคอลัมน์เมื่อมีที่พอ
                ความสูงถูกตั้งไว้ที่ 44px แล้ว แต่ความกว้างไม่ได้ถูกคุม พอเป็น grid-cols-8
                ตายตัวบนจอ 375 ปุ่มกว้างจริงแค่ 37.6px ซึ่งต่ำกว่าเกณฑ์เป้าแตะเหมือนกัน
                เป้าแตะต้องผ่านทั้งสองด้าน ไม่ใช่ด้านเดียว */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {PERIODS.map((p) => {
                const slot = timetableData[dayKey]?.[p];
                const substituted = daySubs.some((s) => Number(s.period) === p);
                const selected = period === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    aria-pressed={selected}
                    aria-label={`คาบ ${p}${slot ? ` — ${slot.subject}` : ' — ยังว่าง'}`}
                    className={`relative min-h-[44px] rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                      selected
                        ? 'bg-sbac-blue text-white border-sbac-blue shadow-button'
                        : slot
                          ? isDark
                            ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                            : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                          : isDark
                            ? 'bg-transparent text-content-muted border-white/10 border-dashed hover:bg-white/5'
                            : 'bg-transparent text-ink-light border-slate-200 border-dashed hover:bg-slate-50'
                    }`}
                  >
                    {p}
                    {substituted && (
                      <span
                        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent-rose"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* สรุปว่าคาบที่เลือกอยู่ตอนนี้เป็นอะไร — กันการแก้ผิดคาบ
              ซึ่งเป็นความผิดพลาดที่ตรวจไม่เจอจนกว่านักเรียนจะเดินไปผิดห้อง */}
          <div
            aria-live="polite"
            className={`rounded-2xl border px-4 py-3 text-xs ${
              isDark ? 'bg-slate-950/40 border-white/10' : 'bg-slate-50 border-slate-200'
            }`}
          >
            {timetableLoading ? (
              <span className="text-content-muted font-semibold">กำลังโหลดตาราง...</span>
            ) : baseSlot ? (
              <div className="space-y-1">
                <div className={`font-extrabold ${isDark ? 'text-white' : 'text-ink'}`}>
                  {baseSlot.subject || 'ยังไม่ระบุวิชา'}
                  <span className="ml-2 text-[11px] font-bold text-content-muted">
                    {PERIOD_TIMES[period] ? `${PERIOD_TIMES[period]} น.` : ''}
                  </span>
                </div>
                <div className="text-content-muted font-semibold">
                  {baseSlot.teacher || 'ไม่ระบุครู'}
                  {baseSlot.room && ` · ห้อง ${baseSlot.room}`}
                </div>
                {currentSub && (
                  <div className="text-accent-rose font-extrabold">
                    {describeDate(subDate)} สอนแทนโดย {currentSub.substitute_teacher || 'ไม่ระบุ'}
                    {currentSub.substitute_room && ` · ย้ายไปห้อง ${currentSub.substitute_room}`}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-content-muted font-semibold">
                วัน{DAY_LABELS[dayKey]} คาบ {period} ไม่มีคาบเรียนในตาราง
                {timetableSource === 'error' && ' (อ่านชีตไม่สำเร็จ กำลังใช้ข้อมูลสำรอง)'}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* ไม่มีช่องแก้วิชา/ครูประจำวิชาแล้ว — สองอย่างนั้นเป็นของตารางประจำเทอม
                ซึ่งต้นฉบับอยู่ในชีต การให้แก้ได้สองที่แปลว่ามีสองความจริงที่ขัดกันได้
                ค่าที่เห็นด้านบนคือของจริงจากชีต และจะถูกคัดลอกไปกับแถวสอนแทนให้เอง */}
            <div>
              <label
                htmlFor="sub-teacher"
                className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}
              >
                ครูสอนแทน
              </label>
              <select
                id="sub-teacher"
                value={subTeacher}
                disabled={teacherChoicesLoading || !!teacherChoicesError || savingSlot}
                onChange={e => setSubTeacher(e.target.value)}
                className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 disabled:opacity-60 ${isDark
                  ? 'bg-slate-900 border-white/10 text-white focus:border-sbac-blue-light/50'
                  : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue'
                  }`}
              >
                <option value="">
                  {teacherChoicesLoading ? 'กำลังโหลดรายชื่อครู...' : 'เลือกครูสอนแทน'}
                </option>
                {teacherChoices.map((t) => (
                  <option key={t.user_id} value={t.user_id}>
                    {[t.full_name, t.teacher_code, t.department].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>

              {/* บอกตามจริงว่ากรองอะไรให้แล้วและยังไม่ได้กรองอะไร
                  ถ้าเขียนแค่ "เลือกครูที่ว่าง" คนใช้จะเข้าใจว่าระบบเช็คให้ครบแล้ว
                  แล้ววันหนึ่งจะจัดครูที่ติดสอนห้องอื่นไปทับโดยไม่มีใครเอะใจ */}
              {teacherChoicesError ? (
                <p role="alert" className="text-[11px] font-bold text-accent-rose mt-1.5">
                  {teacherChoicesError}
                </p>
              ) : !teacherChoicesLoading && teacherChoices.length === 0 ? (
                <p className={`text-[11px] mt-1.5 ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
                  ไม่มีครูที่เลือกได้ในคาบนี้ — ตรวจช่วงลาครู หรือยังไม่มีบัญชีครูในระบบ
                </p>
              ) : (
                <p className={`text-[11px] mt-1.5 leading-relaxed ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
                  คัดครูที่บันทึกวันลาไว้ออกแล้ว · <strong>ยังไม่ได้เช็ค</strong>ว่าติดสอนห้องอื่นในคาบนี้หรือไม่
                </p>
              )}
            </div>

            <div>
              <label className={`text-xs font-bold block mb-1 transition-colors duration-300 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>ห้องเรียน</label>
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setRoomMode('same')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${roomMode === 'same'
                    ? 'bg-sbac-blue text-white border-sbac-blue shadow-sm'
                    : isDark
                      ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                      : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  ห้องเดิมตามตาราง
                </button>
                <button
                  onClick={() => setRoomMode('new')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${roomMode === 'new'
                    ? 'bg-sbac-blue text-white border-sbac-blue shadow-sm'
                    : isDark
                      ? 'bg-white/5 text-content-secondary border-white/10 hover:bg-white/10'
                      : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  เปลี่ยนห้องใหม่
                </button>
              </div>
              {roomMode === 'new' && (
                <input
                  type="text"
                  value={room}
                  onChange={e => setRoom(e.target.value)}
                  className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none transition-all duration-200 ${isDark
                    ? 'bg-slate-900 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50 focus:bg-slate-900'
                    : 'bg-slate-50 border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-surface-card'
                    }`}
                  placeholder="ระบุเลขห้องเรียนใหม่"
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleSaveSubstitution}
              disabled={savingSlot}
              className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-bold py-3 rounded-xl text-xs transition-all shadow-button flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sbac-blue"
            >
              <RefreshCw size={14} className={savingSlot ? 'animate-spin' : undefined} />
              {savingSlot
                ? 'กำลังบันทึก...'
                : currentSub
                  ? `แก้สอนแทน ${describeDate(subDate)} คาบ ${period}`
                  : `สั่งสอนแทน ${describeDate(subDate)} คาบ ${period}`}
            </button>

            {/* ปุ่มยกเลิกโผล่เฉพาะตอนที่คาบนี้ของวันนี้ถูกสั่งสอนแทนอยู่จริง
                เดิมปุ่ม "คืนค่าคาบนี้" ขึ้นตลอดเวลา กดตอนไม่มีอะไรให้คืนก็ไม่เกิดอะไร
                ซึ่งทำให้คนกดไม่แน่ใจว่าระบบทำงานหรือเปล่า */}
            {currentSub && (
              <button
                onClick={() => handleClearSubstitution()}
                disabled={savingSlot}
                className={`w-full border-2 font-bold py-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${isDark
                  ? 'border-white/10 text-content-secondary hover:bg-white/5'
                  : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
                  }`}
              >
                <Undo size={14} />
                ยกเลิกสอนแทนคาบนี้ กลับเป็นครูเดิม
              </button>
            )}
          </div>

          {/* รายการที่สั่งไว้แล้วของวันนั้น
              ฟอร์มโชว์ได้ทีละคาบ ถ้าไม่มีรายการนี้ ฝ่ายวิชาการจะไม่มีทางรู้ว่าวันนั้น
              สั่งอะไรค้างไว้บ้าง นอกจากไล่กดเปลี่ยนเลขคาบดูทีละอัน */}
          <div className={`border-t pt-4 space-y-2 ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                สอนแทนของ {formatThaiDate(subDate)}
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${daySubs.length > 0
                ? 'bg-accent-rose/15 text-accent-rose'
                : isDark ? 'bg-white/5 text-content-muted' : 'bg-slate-100 text-content-muted'
                }`}>
                {daySubs.length} คาบ
              </span>
            </div>

            {daySubs.length === 0 ? (
              <p className="text-[12px] font-semibold text-content-muted">
                ยังไม่มีการสอนแทนในวันนี้ — ห้องนี้ใช้ตารางปกติตามชีต
              </p>
            ) : (
              daySubs.map((sub) => (
                <div
                  key={sub.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border ${isDark ? 'bg-rose-950/20 border-rose-900/30' : 'bg-rose-50 border-rose-100'
                    }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12px] font-bold truncate ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                      คาบ {sub.period} · {sub.subject || 'ไม่ระบุวิชา'}
                    </div>
                    <div className="text-[11px] font-semibold text-content-muted truncate">
                      {sub.original_teacher || 'ครูเดิมไม่ระบุ'} → {sub.substitute_teacher || 'ยังไม่ระบุ'}
                      {' · '}
                      {sub.substitute_room ? `ย้ายไปห้อง ${sub.substitute_room}` : 'ห้องเดิมตามตาราง'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPeriod(Number(sub.period))}
                    className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg shrink-0 transition-all ${isDark
                      ? 'bg-white/10 text-content-secondary hover:bg-white/20'
                      : 'bg-surface-card text-ink-secondary hover:bg-slate-100'
                      }`}
                  >
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClearSubstitution(Number(sub.period))}
                    disabled={savingSlot}
                    aria-label={`ยกเลิกสอนแทนคาบ ${sub.period}`}
                    className="text-accent-rose hover:opacity-70 shrink-0 transition-opacity disabled:opacity-40"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
        </div>
      )}

      {activeTab === 'scores' && (
        <div
          role="tabpanel"
          id="panel-scores"
          aria-labelledby="tab-scores"
          tabIndex={-1}
          className="space-y-4"
        >
          {/* ============================================================
              สมุดคะแนนระหว่างภาค T1-T5 (40_gradebook.sql)
              ฝ่ายวิชาการแก้ได้ทุกวิชาทุกห้อง (app_can_grade_subject คืน true ให้ role นี้เสมอ)
              ครูประจำวิชาใช้ตัวเดียวกันนี้ผ่านโมดัลในหน้า /teacher
              ============================================================ */}
          <section aria-labelledby="head-scores" className="space-y-3">
            <h3
              id="head-scores"
              className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}
            >
              <BookOpen size={18} className="text-accent-emerald" aria-hidden="true" />
              คะแนนระหว่างภาค (T1-T5)
            </h3>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
              เลือกรายวิชาเพื่อกรอกคะแนนรายคน กรอกทั้งห้องทีเดียว หรือแก้โครงสร้างหัวข้อ T1-T5
              — ทุกการเปลี่ยนแปลงจะแจ้งเตือนนักเรียนทันทีและถูกบันทึกไว้ในปูมคะแนน
            </p>

            <TeacherGradebookPanel />
          </section>
        </div>
      )}

      {activeTab === 'students' && (
        <div
          role="tabpanel"
          id="panel-students"
          aria-labelledby="tab-students"
          tabIndex={-1}
          className="space-y-6"
        >
        {/* ============================================================
            จัดการพฤติกรรมและการตัดคะแนนนักเรียน (ฝ่ายวิชาการ)
            - Workflow แบบ step-by-step อยู่ใน BehaviorDeductionWizard.jsx
            - รายการทั้งหมด: role academic เห็น/แก้ไข/ลบได้ทุกรายการของทุกครู
              (list_behavior_logs() กรองสิทธิ์ให้แล้วฝั่ง DB — ดู 21_behavior_crud_and_academic.sql)
            ============================================================ */}
        {/* การ์ดครอบถูกถอดออกด้วยเหตุผลเดียวกับแท็บ "รอดำเนินการ" — ดูคอมเมนต์ที่นั่น */}
        <section aria-labelledby="head-behavior" className="space-y-3">
          <h3
            id="head-behavior"
            className={`text-sm font-extrabold flex items-center gap-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}
          >
            <Award size={18} className="text-brand" aria-hidden="true" />
            จัดการพฤติกรรมและการตัดคะแนนนักเรียน
          </h3>

          <div className="grid gap-4 xl:grid-cols-[300px_1fr] items-start">
            <BehaviorDeductionWizard />

            <div className="space-y-2.5">
              <span className={`text-xs font-bold flex items-center gap-1.5 ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
                <ListChecks size={14} aria-hidden="true" />
                รายการทั้งหมด ({allBehaviorLogs.length})
              </span>
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <BehaviorLogList
                  logs={allBehaviorLogs}
                  loading={allBehaviorLogsLoading}
                  showStudentName
                  onEdit={setEditingBehaviorLog}
                  onDeleteRequest={handleDeleteBehaviorLog}
                />
              </div>
            </div>
          </div>
        </section>
        </div>
      )}

      {activeTab === 'events' && (
        <div
          role="tabpanel"
          id="panel-events"
          aria-labelledby="tab-events"
          tabIndex={-1}
          className="space-y-6"
        >
          {/* ปฏิทินกิจกรรม เขียนลงตาราง events ใน Supabase ตัวเดียวกับที่นักเรียนอ่าน */}
          <EventManager />
        </div>
      )}

      {/* โมดัล/กล่องยืนยัน mount ไว้เสมอ ไม่ผูกกับแท็บ
          ไม่งั้นสลับแท็บระหว่างที่กล่องเปิดอยู่ = กล่องหายไปพร้อม promise ที่ยังไม่ถูก resolve */}
      <BehaviorLogEditModal
        log={editingBehaviorLog}
        onClose={() => setEditingBehaviorLog(null)}
        onSave={(logId, payload) => updateBehaviorLog(logId, payload)}
      />

      {behaviorConfirmDialog}
      {clearSubConfirmDialog}
    </div>
  );
}
