import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, X, Send, ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useUpcomingEvents } from '../../hooks/useEvents';
import { useLeaveRequests } from '../../hooks/useLeaveRequests';
import { useRepairTickets } from '../../hooks/useRepairTickets';
import { supabase } from '../../config/supabase';
import { ACTIVE_STATUSES } from '../../utils/orders';
import {
  ASYNC_ANSWERS,
  answerFor,
  detectEquipment,
  extractRoom,
  greetingFor,
  isCancelWord,
  matchIntent,
  quickActionsFor,
  repairErrorText,
  repairStatusLabel,
} from '../../utils/assistant';

/* ผู้ช่วย SBAC Connect
   ตรรกะคำตอบอยู่ใน utils/assistant.js ไฟล์นี้ดูแลแค่หน้าตากับสถานะการสนทนา

   สามข้อที่แชทบอทตัวเดิมทำไม่ได้แล้วตัวนี้ต้องได้:
     1. ตอบจากข้อมูลจริง — ยอดเงิน คะแนน กิจกรรม ใบลา ดึงสดทุกครั้งที่ถาม
     2. แจ้งซ่อมแล้วบันทึกจริง — เลขใบมาจาก DB และสรุปให้ยืนยันก่อนส่งเสมอ
     3. เข้าถึงได้ด้วยคีย์บอร์ด — role=dialog, Esc ปิด, โฟกัสวนในกล่อง, คืนโฟกัสตอนปิด
        (ตัวเดิมเป็น div ลอย ๆ ไม่มีอะไรเลยสักข้อ)
*/

const FLOW = {
  IDLE: 'idle',
  ASK_ROOM: 'ask_room',
  ASK_PROBLEM: 'ask_problem',
  CONFIRM: 'confirm',
};

let messageSeq = 0;
const nextId = () => `m${++messageSeq}`;

/** ข้อความบอทรองรับ **ตัวหนา** — แปลงเป็น element จริง ไม่ใช้ dangerouslySetInnerHTML */
function MessageBody({ text }) {
  return text.split('\n').map((line, i) => (
    <span key={i} className="block">
      {line.split(/(\*\*.+?\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={j}>{part.slice(2, -2)}</strong>
        ) : (
          part
        )
      )}
    </span>
  ));
}

export default function AssistantFAB() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  /* บทสนทนาอยู่ที่นี่ ไม่ได้อยู่ใน AssistantPanel เพราะ panel ถูก unmount ทุกครั้งที่ปิด
     ถ้าเก็บไว้ข้างในด้วย ผู้ใช้ปิดแล้วเปิดใหม่จะเจอกล่องเปล่าทุกครั้ง */
  const [messages, setMessages] = useState([]);
  const openerRef = useRef(null);
  const isDark = theme === 'dark';

  if (!user) return null;

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="เปิดผู้ช่วย SBAC Connect"
        aria-expanded={isOpen}
        /* bottom-24 หลบ BottomNav บนมือถือ บนคอมไม่มีแถบล่างแล้วจึงลงมาชิดขอบได้ */
        className="fixed bottom-24 right-4 xl:bottom-6 xl:right-6 z-40 flex items-center justify-center
                   w-14 h-14 rounded-full bg-sbac-blue hover:bg-sbac-navy text-white
                   shadow-button hover:shadow-button-hover
                   transition-[background-color,box-shadow,transform] duration-200 active:scale-95"
      >
        <MessageSquare size={22} aria-hidden="true" />
      </button>

      {/* mount เฉพาะตอนเปิดจริง — hook ข้างในเปิด realtime channel สามช่อง
          ถ้าปล่อยให้ mount ค้างไว้ทุกหน้า ทุกผู้ใช้จะกิน connection เพิ่มเท่าตัว
          ทั้งที่ส่วนใหญ่ไม่เคยเปิดกล่องแชทเลย

          AnimatePresence ต้องอยู่ตรงนี้ ไม่ใช่ข้างในตัว panel
          ของเดิมใส่ไว้ข้างใน AssistantPanel ซึ่งไม่มีผลอะไรเลย เพราะพอ isOpen
          เป็น false ตัว panel ถูกถอดออกจาก tree ทันที AnimatePresence ที่อยู่
          ข้างในนั้นก็หายไปพร้อมกัน ไม่มีใครเหลือรอไว้เล่นแอนิเมชันขาออก
          ผลคือกล่องแชท "กระพริบหาย" ทั้งที่โค้ดเขียน exit ไว้ครบ */}
      <AnimatePresence>
        {isOpen && (
          <AssistantPanel
            user={user}
            isDark={isDark}
            messages={messages}
            setMessages={setMessages}
            openerRef={openerRef}
            onClose={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function AssistantPanel({ user, isDark, messages, setMessages, openerRef, onClose }) {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [thinking, setThinking] = useState(false);
  const [flow, setFlow] = useState(FLOW.IDLE);
  const [draft, setDraft] = useState({ room: '', equipment: '', problem: '' });
  const [behaviorScore, setBehaviorScore] = useState(null);
  const [activeOrderCount, setActiveOrderCount] = useState(0);
  const [activePickupCodes, setActivePickupCodes] = useState([]);

  const listEndRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);

  const role = user?.role || 'student';

  // ข้อมูลสดที่บอทใช้ตอบ — component นี้ mount เฉพาะตอนกล่องเปิด จึงไม่มี channel ค้าง
  const { events, loading: eventsLoading } = useUpcomingEvents(5);
  const { requests: leaveRequests, loading: leaveLoading } = useLeaveRequests();
  const { tickets, loading: ticketsLoading, submit: submitTicket } = useRepairTickets();

  useEffect(() => {
    if (!user?.uid) return undefined;

    let alive = true;

    // คะแนนความประพฤติ: เฉพาะนักเรียน (RPC คืน null ให้ role อื่นอยู่แล้ว)
    if (role === 'student') {
      supabase.rpc('my_behavior_logs').then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error('[assistant] ดึงคะแนนความประพฤติไม่สำเร็จ:', error);
          return;
        }
        if (data?.ok) setBehaviorScore(data.score ?? 100);
      });
    }

    /* ออเดอร์ที่ยังไม่เสร็จ — ดึงเฉพาะ role ที่บอทตอบเรื่องนี้จริง
       บาริสต้ากับฝ่ายวิชาการถูกส่งไปหน้าคิวของร้านอยู่แล้ว ไม่ได้ใช้ตัวเลขนี้
       และสองบทบาทนั้นอ่านออเดอร์ได้ทุกใบ ถ้าปล่อยให้ยิงต่อไปก็เป็นการนับ
       ทั้งร้านทิ้งเปล่า ๆ ทุกครั้งที่มีคนเปิดกล่องแชท

       เอา pickup_code มาด้วยเลย ไม่ใช่แค่ count — เพราะคำถามที่คนถามจริง
       คือ "รหัสรับของเลขอะไร" ไม่ใช่ "มีกี่ใบ" */
    if (role === 'student' || role === 'teacher') {
      supabase
        .from('orders')
        .select('pickup_code')
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data, error }) => {
          if (!alive) return;
          if (error) {
            console.error('[assistant] ดึงออเดอร์ที่ค้างไม่สำเร็จ:', error);
            return;
          }
          setActiveOrderCount(data?.length ?? 0);
          setActivePickupCodes((data || []).map((o) => o.pickup_code).filter(Boolean).slice(0, 3));
        });
    }

    return () => {
      alive = false;
    };
  }, [user?.uid, role]);

  const quickActions = useMemo(() => quickActionsFor(role), [role]);

  const pushBot = useCallback(
    (payload) => setMessages((prev) => [...prev, { id: nextId(), sender: 'bot', ...payload }]),
    [setMessages]
  );

  const pushUser = useCallback(
    (text) => setMessages((prev) => [...prev, { id: nextId(), sender: 'user', text }]),
    [setMessages]
  );

  // ทักทายครั้งแรกเท่านั้น — บทสนทนาเก็บไว้ที่ AssistantFAB จึงไม่หายตอนปิด-เปิดใหม่
  useEffect(() => {
    if (messages.length === 0) pushBot(greetingFor(user));
  }, [messages.length, pushBot, user]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  /* ล้างบทสนทนาแล้วเริ่มใหม่ด้วยคำทักทาย ไม่ปล่อยกล่องว่างเปล่า
     ต้องรีเซ็ต flow กับ draft ด้วย ไม่งั้นถ้าล้างตอนกำลังกรอกใบแจ้งซ่อมค้างอยู่
     ข้อความถัดไปที่พิมพ์จะถูกตีความว่าเป็นคำตอบของขั้นตอนที่หายไปแล้ว */
  const handleClearChat = useCallback(() => {
    setFlow(FLOW.IDLE);
    setDraft({ room: '', equipment: '', problem: '' });
    setInputValue('');
    setThinking(false);
    setMessages([{ id: nextId(), sender: 'bot', ...greetingFor(user) }]);
  }, [setMessages, user]);

  /* กล่องสนทนาเป็น dialog จริง: Esc ปิด, Tab วนอยู่ข้างใน, คืนโฟกัสให้ปุ่มเดิมตอนปิด
     onClose อ่านผ่าน ref ไม่ใส่ใน deps — ผู้เรียกส่งมาเป็น arrow inline
     ถ้าใส่ effect จะรันใหม่ทุกตัวอักษรที่พิมพ์ในช่องแชท แล้วดึงโฟกัสซ้ำ ๆ
     (บั๊กเดียวกับที่เจอใน Modal.jsx) */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href]'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const previouslyFocused = document.activeElement;
    document.addEventListener('keydown', onKeyDown);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(raf);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
      else openerRef.current?.focus();
    };
    // เจตนาไม่ใส่ onClose — อ่านผ่าน onCloseRef (ดูเหตุผลด้านบน)
  }, [openerRef]);

  const goTo = (path) => {
    onClose();
    navigate(path);
  };

  /** ส่งใบแจ้งซ่อมจริง — ตอบว่าสำเร็จเฉพาะตอน DB คืนเลขใบกลับมาแล้วเท่านั้น */
  const commitRepair = useCallback(async () => {
    setThinking(true);
    const { ticket, error } = await submitTicket(draft);
    setThinking(false);
    setFlow(FLOW.IDLE);

    if (error) {
      pushBot({ text: `แจ้งซ่อมไม่สำเร็จครับ\n${repairErrorText(error)}`, tone: 'error' });
      return;
    }

    setDraft({ room: '', equipment: '', problem: '' });
    pushBot({
      text:
        `บันทึกใบแจ้งซ่อมเรียบร้อยครับ\n\n` +
        `เลขที่ **${ticket.ticket_no}**\n` +
        `สถานที่ ${ticket.room_label}\n` +
        `อุปกรณ์ ${ticket.equipment}\n` +
        `สถานะ รอฝ่ายวิชาการรับเรื่อง\n\n` +
        `ใบนี้เข้าคิวฝ่ายวิชาการแล้ว และคุณจะได้รับแจ้งเตือนทุกครั้งที่สถานะเปลี่ยน\n` +
        `พิมพ์ "ใบแจ้งซ่อมของฉัน" เพื่อตามสถานะได้ตลอดครับ`,
    });
  }, [draft, pushBot, submitTicket]);

  const answerRepairStatus = useCallback(() => {
    if (ticketsLoading) {
      pushBot({ text: 'กำลังดึงใบแจ้งซ่อมอยู่ครับ สักครู่' });
      return;
    }
    if (tickets.length === 0) {
      pushBot({
        text:
          role === 'academic'
            ? 'ตอนนี้ไม่มีใบแจ้งซ่อมในระบบครับ'
            : 'คุณยังไม่เคยแจ้งซ่อมในระบบครับ\nพิมพ์ "แจ้งซ่อม" เพื่อเปิดใบใหม่ได้เลย',
      });
      return;
    }
    const lines = tickets
      .slice(0, 5)
      .map(
        (t) =>
          `• **${t.ticket_no}** ${t.room_label} · ${t.equipment}\n  ${repairStatusLabel(t.status)}` +
          (role === 'academic' && t.reporter_name ? ` · แจ้งโดย ${t.reporter_name}` : '')
      );
    pushBot({
      text: `ใบแจ้งซ่อม ${tickets.length} รายการครับ\n${lines.join('\n')}`,
      actions: role === 'academic' ? [{ label: 'จัดการคิวแจ้งซ่อม', path: '/academic' }] : undefined,
    });
  }, [pushBot, role, tickets, ticketsLoading]);

  const startRepairFlow = useCallback(
    (seedText) => {
      const room = extractRoom(seedText);
      const equipment = detectEquipment(seedText);

      if (room) {
        setDraft({ room, equipment: equipment || '', problem: '' });
        setFlow(FLOW.ASK_PROBLEM);
        pushBot({
          text: `แจ้งซ่อมห้อง **${room}** ครับ\nช่วยอธิบายสั้น ๆ ว่าเสียยังไง (เช่น แอร์ไม่เย็น, หลอดไฟกะพริบ)`,
        });
        return;
      }

      setDraft({ room: '', equipment: equipment || '', problem: '' });
      setFlow(FLOW.ASK_ROOM);
      pushBot({
        text:
          'แจ้งซ่อมครับ ขอสองอย่าง\n1. ห้องหรือสถานที่ (เช่น 1406 หรือ โรงอาหาร)\n2. ปัญหาที่เจอ\n\nเริ่มจากห้องก่อนครับ',
      });
    },
    [pushBot]
  );

  const handleIntent = useCallback(
    async (intentId) => {
      if (intentId === 'repair') {
        startRepairFlow('');
        return;
      }
      if (intentId === 'repair_status') {
        answerRepairStatus();
        return;
      }

      /* intent ที่ต้องยิงถาม DB ก่อน (เมนู / ตารางวันนี้ / เวลาเข้าเรียน / รายการเงิน)
         โชว์ตัวหมุนระหว่างรอ ไม่งั้นกดปุ่มแล้วเงียบไปสองวินาทีเหมือนกดไม่ติด */
      const fetcher = ASYNC_ANSWERS[intentId];
      if (fetcher) {
        setThinking(true);
        try {
          pushBot(await fetcher(user));
        } finally {
          setThinking(false);
        }
        return;
      }

      pushBot(
        answerFor(intentId, {
          user,
          events,
          eventsLoading,
          leaveRequests,
          leaveLoading,
          behaviorScore,
          activeOrderCount,
          activePickupCodes,
        })
      );
    },
    [
      activeOrderCount,
      activePickupCodes,
      answerRepairStatus,
      behaviorScore,
      events,
      eventsLoading,
      leaveLoading,
      leaveRequests,
      pushBot,
      startRepairFlow,
      user,
    ]
  );

  const handleSend = (overrideText) => {
    const text = String(overrideText ?? inputValue).trim();
    if (!text || thinking) return;

    pushUser(text);
    setInputValue('');

    /* ทางออกจากขั้นตอนแจ้งซ่อม

       ระหว่างที่บอทถามหาห้องหรือรายละเอียดปัญหา ข้อความทุกข้อความจะถูกเก็บเป็น
       คำตอบของคำถามนั้น ไม่ว่าคนพิมพ์จะตั้งใจตอบหรือไม่
       ของเดิมจึงไม่มีทางถอยออกมาเลย พิมพ์ "ยกเลิก" ก็ได้ห้องชื่อ "ยกเลิก"
       แล้วบอทถามต่อว่าเสียยังไง — ติดอยู่ในลูปจนต้องปิดกล่องแชททิ้ง */
    if (flow !== FLOW.IDLE && isCancelWord(text)) {
      cancelRepair();
      return;
    }

    // อยู่ระหว่างเก็บข้อมูลแจ้งซ่อม — ข้อความถัดไปคือคำตอบของคำถามที่ค้างอยู่
    if (flow === FLOW.ASK_ROOM) {
      setDraft((prev) => ({ ...prev, room: text }));
      setFlow(FLOW.ASK_PROBLEM);
      pushBot({ text: `รับทราบครับ ห้อง **${text}**\nแล้วเสียยังไงครับ` });
      return;
    }

    if (flow === FLOW.ASK_PROBLEM) {
      const equipment = draft.equipment || detectEquipment(text) || 'อุปกรณ์ทั่วไป';
      setDraft((prev) => ({ ...prev, problem: text, equipment }));
      setFlow(FLOW.CONFIRM);
      pushBot({
        text:
          `ตรวจสอบก่อนส่งครับ\n\n` +
          `สถานที่ **${draft.room}**\n` +
          `อุปกรณ์ **${equipment}**\n` +
          `ปัญหา ${text}\n\n` +
          `ถูกต้องไหมครับ`,
        confirmRepair: true,
      });
      return;
    }

    const intentId = matchIntent(text);

    if (!intentId) {
      /* ตอบว่าไม่เข้าใจแล้วต้องบอกต่อว่า "แล้วถามอะไรได้บ้าง"
         ของเดิมบอกไว้แค่ห้าหัวข้อในประโยคเดียว ซึ่งไม่ตรงกับสิ่งที่บอททำได้จริงแล้ว
         ดึงรายการเดียวกับ intent 'help' มาใช้ จะได้ไม่มีวันหลุดกัน */
      const fallback = answerFor('help', { user, events, leaveRequests });
      pushBot({ ...fallback, text: `ยังไม่เข้าใจคำถามนี้ครับ\n\n${fallback.text}` });
      return;
    }

    if (intentId === 'repair') {
      startRepairFlow(text);
      return;
    }

    handleIntent(intentId);
  };

  const cancelRepair = () => {
    setFlow(FLOW.IDLE);
    setDraft({ room: '', equipment: '', problem: '' });
    pushBot({ text: 'ยกเลิกใบแจ้งซ่อมแล้วครับ ยังไม่มีอะไรถูกบันทึก' });
  };

  const placeholder =
    flow === FLOW.ASK_ROOM
      ? 'พิมพ์ห้องหรือสถานที่ เช่น 1406'
      : flow === FLOW.ASK_PROBLEM
        ? 'อธิบายปัญหาสั้น ๆ เช่น แอร์ไม่เย็น'
        : 'พิมพ์คำถาม หรือ "แจ้งซ่อม"';

  const surface = isDark
    ? 'bg-surface-dark-elev border-white/10 text-white'
    : 'bg-surface-card border-border text-ink';

  return createPortal(
    <>
      {/* AnimatePresence อยู่ที่ AssistantFAB (ผู้เรียก) ไม่ใช่ตรงนี้
          framer-motion ส่งสถานะ present ลงมาทาง context ผ่าน portal ได้
          motion.div ข้างล่างจึงได้เล่น exit ก่อนถูกถอดออกจริง */}
      <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={onClose}
                className="fixed inset-0 bg-black/45 z-[70]"
              />

              <motion.div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="ผู้ช่วย SBAC Connect"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="fixed z-[71] inset-x-0 bottom-0 mx-auto max-w-lg px-3 pb-3
                           xl:inset-auto xl:right-6 xl:bottom-6 xl:px-0 xl:pb-0 xl:w-[26rem]"
              >
                <div className={`flex flex-col h-[72vh] xl:h-[34rem] rounded-3xl border shadow-glass-lg overflow-hidden ${surface}`}>
                  <header className={`flex items-center justify-between px-5 py-3 border-b shrink-0 ${isDark ? 'border-white/10' : 'border-border'}`}>
                    <div className="min-w-0">
                      <h2 className="text-sm font-extrabold truncate">ผู้ช่วย SBAC Connect</h2>
                      <p className="text-[12px] font-semibold text-content-muted">
                        ตอบจากข้อมูลจริงในระบบ
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {/* ล้างบทสนทนา — บทสนทนาเก็บไว้ที่ AssistantFAB จึงไม่หายตอนปิด-เปิดใหม่
                          ถ้าไม่มีปุ่มนี้ ข้อความจะกองสะสมจนต้องรีเฟรชทั้งหน้าถึงจะหาย
                          โผล่เฉพาะตอนมีข้อความจริงมากกว่าคำทักทายใบเดียว */}
                      {messages.length > 1 && (
                        <button
                          type="button"
                          onClick={handleClearChat}
                          aria-label="ล้างบทสนทนา"
                          title="ล้างบทสนทนา"
                          className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                        >
                          <Trash2 size={17} className="text-content-muted" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onClose}
                        aria-label="ปิดผู้ช่วย"
                        className={`-mr-1 p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                      >
                        <X size={18} className="text-content-muted" aria-hidden="true" />
                      </button>
                    </div>
                  </header>

                  <div
                    className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
                    role="log"
                    aria-live="polite"
                    aria-relevant="additions"
                  >
                    {messages.map((msg) => (
                      <div key={msg.id} className={msg.sender === 'user' ? 'flex justify-end' : 'space-y-2'}>
                        <div
                          className={`max-w-[88%] px-4 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed ${
                            msg.sender === 'user'
                              ? 'bg-sbac-blue text-white rounded-br-md'
                              : msg.tone === 'error'
                                ? isDark
                                  ? 'bg-rose-950/50 border border-rose-900/50 text-white rounded-bl-md'
                                  : 'bg-rose-50 border border-rose-200 text-ink rounded-bl-md'
                                : isDark
                                  ? 'bg-white/[0.07] border border-white/10 rounded-bl-md'
                                  : 'bg-slate-50 border border-border rounded-bl-md'
                          }`}
                        >
                          <MessageBody text={msg.text} />
                        </div>

                        {msg.confirmRepair && flow === FLOW.CONFIRM && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={cancelRepair}
                              disabled={thinking}
                              className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-colors disabled:opacity-50 ${
                                isDark ? 'border-white/20 hover:bg-white/10' : 'border-border text-ink-secondary hover:bg-slate-50'
                              }`}
                            >
                              แก้ไข / ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={commitRepair}
                              disabled={thinking}
                              className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-sbac-blue hover:bg-sbac-navy text-white transition-colors disabled:opacity-60"
                            >
                              {thinking ? 'กำลังส่ง...' : 'ยืนยันแจ้งซ่อม'}
                            </button>
                          </div>
                        )}

                        {msg.actions?.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.actions.map((action) => (
                              <button
                                key={action.path + action.label}
                                type="button"
                                onClick={() => goTo(action.path)}
                                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border transition-colors ${
                                  isDark
                                    ? 'border-white/15 text-brand hover:bg-white/10'
                                    : 'border-border text-brand hover:bg-sbac-blue-50'
                                }`}
                              >
                                {action.label}
                                <ArrowRight size={13} aria-hidden="true" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {thinking && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-content-muted">
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        {/* ข้อความเดิมเขียนว่า "กำลังบันทึก..." ตายตัว ซึ่งถูกเฉพาะตอนส่งใบแจ้งซ่อม
                            ตอนนี้ตัวหมุนตัวเดียวกันถูกใช้ระหว่างดึงเมนู/ตาราง/ยอดเงินด้วย */}
                        {flow === FLOW.CONFIRM ? 'กำลังบันทึกใบแจ้งซ่อม...' : 'กำลังดึงข้อมูล...'}
                      </div>
                    )}

                    <div ref={listEndRef} />
                  </div>

                  {/* ปุ่มลัดขึ้นบรรทัดใหม่แทนการเลื่อนซ้ายขวา
                      ของเดิมเป็น overflow-x-auto + whitespace-nowrap ปุ่มจึงล้นออกนอกจอ
                      กล่องแชทกว้างราว 360px แต่ปุ่มของนักเรียนมีหกอัน รวมกันยาวเกินสองเท่า
                      และไม่มีอะไรบอกว่ายังมีต่อ คนใช้เลยไม่รู้ว่ามีปุ่มที่เหลืออยู่
                      แบบ wrap เห็นครบทุกปุ่มในครั้งเดียว ไม่ต้องเลื่อนอะไรเลย */}
                  {flow === FLOW.IDLE ? (
                    <div className={`px-4 py-2.5 border-t shrink-0 ${isDark ? 'border-white/10' : 'border-border'}`}>
                      <div className="flex flex-wrap gap-1.5">
                        {quickActions.map((action) => (
                          <button
                            key={action.intent + action.label}
                            type="button"
                            disabled={thinking}
                            onClick={() => {
                              pushUser(action.label);
                              handleIntent(action.intent);
                            }}
                            className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors disabled:opacity-50 ${
                              isDark
                                ? 'border-white/15 text-slate-200 hover:bg-white/10'
                                : 'border-border text-ink-secondary hover:bg-slate-50'
                            }`}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* ระหว่างกรอกใบแจ้งซ่อม ปุ่มลัดหายไปทั้งแถบ (ถูกต้องแล้ว เพราะกดไปก็
                       ตอบไม่ได้อยู่ดี) แต่ของเดิมไม่เหลืออะไรให้กดถอยออกเลยสักปุ่ม
                       จนกว่าจะถึงหน้าจอยืนยัน — แถบนี้จึงบอกว่าตอนนี้อยู่ขั้นไหน
                       และมีทางออกให้เห็นตลอด */
                    flow !== FLOW.CONFIRM && (
                      <div className={`px-4 py-2.5 border-t shrink-0 flex items-center justify-between gap-2 ${isDark ? 'border-white/10' : 'border-border'}`}>
                        <span className="text-[12px] font-bold text-content-muted truncate">
                          {flow === FLOW.ASK_ROOM ? 'กำลังแจ้งซ่อม · ขั้นที่ 1 จาก 2' : 'กำลังแจ้งซ่อม · ขั้นที่ 2 จาก 2'}
                        </span>
                        <button
                          type="button"
                          onClick={cancelRepair}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
                            isDark
                              ? 'border-white/15 text-slate-200 hover:bg-white/10'
                              : 'border-border text-ink-secondary hover:bg-slate-50'
                          }`}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    )
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className={`flex gap-2 items-center p-3 border-t shrink-0 ${isDark ? 'border-white/10' : 'border-border'}`}
                  >
                    <label htmlFor="assistant-input" className="sr-only">
                      พิมพ์ข้อความถึงผู้ช่วย
                    </label>
                    <input
                      id="assistant-input"
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={placeholder}
                      maxLength={500}
                      autoComplete="off"
                      className={`flex-1 min-w-0 rounded-xl px-4 py-2.5 text-xs font-semibold border transition-colors focus:outline-none ${
                        isDark
                          ? 'bg-white/5 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue/60'
                          : 'bg-slate-50 border-border text-ink placeholder:text-content-muted focus:border-sbac-blue'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || thinking}
                      aria-label="ส่งข้อความ"
                      className="p-2.5 rounded-xl bg-sbac-blue hover:bg-sbac-navy text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Send size={16} aria-hidden="true" />
                    </button>
                  </form>
                </div>
              </motion.div>
      </>
    </>,
    document.body
  );
}
