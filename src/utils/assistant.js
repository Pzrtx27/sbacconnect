/* ตรรกะของผู้ช่วย SBAC Connect — แยกจาก UI เพื่อให้ทดสอบและแก้คำตอบได้โดยไม่ต้องแตะ JSX
   สิ่งที่ต่างจากแชทบอทตัวเดิมโดยตั้งใจ:

   1) ไม่ท่องข้อมูลตายตัวที่หมดอายุได้
      ตัวเดิมฝัง "ปฏิทินกิจกรรม ก.ค. 2569", รายชื่อ 12 สาขา, เลขห้อง 1101-1512
      และเบอร์โทรต่อไว้ในโค้ด พอฝ่ายวิชาการย้ายปฏิทินมาอยู่ใน DB (10_events.sql)
      บอทก็ยังตอบปฏิทินเดือนเดิมต่อไป = ตอบผิดโดยที่ไม่มีใครรู้
      ตัวนี้ตอบจากข้อมูลที่ดึงสดทุกครั้ง (context) ถ้าดึงไม่ได้ก็บอกตรง ๆ ว่าดึงไม่ได้

   2) ไม่ปลอมผลลัพธ์
      ตัวเดิมสร้างเลขใบแจ้งซ่อมจาก Date.now() แล้วตอบว่า "ฝ่ายอาคารจะดำเนินการภายใน
      24-48 ชม." ทั้งที่ไม่ได้บันทึกที่ไหนเลย ตัวนี้เลขใบมาจาก DB (23_repair_tickets.sql)
      และจะตอบว่าสำเร็จก็ต่อเมื่อ RPC ตอบ ok กลับมาแล้วเท่านั้น

   3) พาไปหน้าที่ทำงานจริง แทนที่จะอธิบายว่าปุ่มอยู่ตรงไหน
*/

/** ปุ่มลัดใต้ช่องพิมพ์ — ต่างกันตาม role เพราะเมนูของแต่ละ role ไม่เหมือนกัน
 *
 *  ป้ายต้องสั้น: กล่องแชทกว้างราว 360px ป้ายยาวอย่าง 'ใบแจ้งซ่อมของฉัน' หรือ
 *  'คะแนนความประพฤติ' ทำให้ปุ่มล้นออกนอกจอ ต้องเลื่อนซ้ายขวาถึงจะเห็นครบ
 *  ซึ่งไม่มีอะไรบอกด้วยว่ายังมีต่อ คนใช้จึงไม่รู้ว่ามีปุ่มที่เหลืออยู่
 *  ตอนนี้ปุ่มขึ้นบรรทัดใหม่แทนการเลื่อน (ดู AssistantFAB) ป้ายจึงต้องสั้นพอ
 *  ให้สองบรรทัดจบ ไม่ใช่สี่บรรทัดจนดันช่องพิมพ์ตกจอ */
export function quickActionsFor(role) {
  const repair = { label: 'แจ้งซ่อม', intent: 'repair' };
  const myRepairs = { label: 'ใบซ่อมของฉัน', intent: 'repair_status' };

  if (role === 'academic') {
    return [
      { label: 'คิวแจ้งซ่อม', intent: 'repair_status' },
      { label: 'ใบลารออนุมัติ', intent: 'leave' },
      { label: 'กิจกรรม', intent: 'events' },
      repair,
    ];
  }

  if (role === 'teacher') {
    return [
      { label: 'ใบลารออนุมัติ', intent: 'leave' },
      { label: 'กิจกรรม', intent: 'events' },
      repair,
      myRepairs,
    ];
  }

  if (role === 'barista') {
    return [repair, myRepairs, { label: 'ช่วยเหลือ', intent: 'help' }];
  }

  return [
    { label: 'ยอดเงิน', intent: 'balance' },
    { label: 'คะแนนพฤติกรรม', intent: 'behavior' },
    { label: 'กิจกรรม', intent: 'events' },
    { label: 'สถานะใบลา', intent: 'leave' },
    repair,
    myRepairs,
  ];
}

/* คำที่ใช้จับความตั้งใจ เรียงจากเฉพาะเจาะจงไปกว้าง — ตัวแรกที่แมตช์ชนะ
   ลำดับสำคัญ: 'สถานะแจ้งซ่อม' ต้องมาก่อน 'แจ้งซ่อม' ไม่งั้นคนถามสถานะจะโดนพาไปเปิดใบใหม่ */
const INTENTS = [
  { id: 'repair_status', keywords: ['สถานะแจ้งซ่อม', 'ใบแจ้งซ่อม', 'แจ้งซ่อมของฉัน', 'ตามเรื่องซ่อม', 'ซ่อมถึงไหน', 'เลขที่แจ้ง'] },
  { id: 'repair', keywords: ['แจ้งซ่อม', 'ซ่อม', 'แอร์', 'พัดลม', 'โปรเจคเตอร์', 'projector', 'หลอดไฟ', 'ไฟดับ', 'ไฟไม่ติด', 'น้ำรั่ว', 'ประปา', 'ชักโครก', 'เน็ตไม่ติด', 'wifi', 'ไวไฟ', 'เครื่องเสียง', 'ลำโพง', 'พัง', 'เสีย', 'ไม่เย็น'] },
  { id: 'balance', keywords: ['ยอดเงิน', 'เงินเหลือ', 'คงเหลือ', 'เติมเงิน', 'wallet', 'กระเป๋าเงิน', 'เงินในบัตร', 'balance'] },
  { id: 'behavior', keywords: ['ความประพฤติ', 'คะแนนพฤติกรรม', 'ตัดคะแนน', 'พฤติกรรม', 'โดนหัก'] },
  { id: 'events', keywords: ['กิจกรรม', 'ปฏิทิน', 'อีเวนต์', 'event', 'วันหยุด', 'สอบ', 'รด.', 'กำหนดส่ง'] },
  { id: 'leave', keywords: ['ใบลา', 'ลาป่วย', 'ลากิจ', 'ขอลา', 'ยื่นลา', 'ลาเรียน', 'อนุมัติลา'] },
  { id: 'orders', keywords: ['ออเดอร์', 'คำสั่งซื้อ', 'กาแฟ', 'เครื่องดื่ม', 'สั่งน้ำ', 'คิว', 'order'] },
  { id: 'timetable', keywords: ['ตารางเรียน', 'ตารางสอน', 'ตาราง', 'คาบ', 'เรียนอะไร'] },
  { id: 'password', keywords: ['ลืมรหัส', 'เปลี่ยนรหัส', 'รหัสผ่าน', 'password', 'reset', 'เข้าระบบไม่ได้', 'ล็อกอินไม่ได้'] },
  { id: 'greeting', keywords: ['สวัสดี', 'หวัดดี', 'hello', 'hi', 'ดีครับ', 'ดีค่ะ'] },
  { id: 'thanks', keywords: ['ขอบคุณ', 'ขอบใจ', 'thank'] },
  { id: 'help', keywords: ['ช่วย', 'ทำอะไรได้', 'help', 'เมนู', 'คำสั่ง'] },
];

/** ข้อความผู้ใช้ -> id ความตั้งใจ (null = ไม่รู้จัก) */
export function matchIntent(text) {
  const lower = String(text || '').toLowerCase().trim();
  if (!lower) return null;
  for (const intent of INTENTS) {
    if (intent.keywords.some((k) => lower.includes(k.toLowerCase()))) return intent.id;
  }
  return null;
}

/* คำที่บอกว่าน่าจะเป็นอุปกรณ์อะไร ใช้เดาให้ผู้ใช้ไม่ต้องพิมพ์ซ้ำ
   เดาผิดไม่เสียหาย เพราะสรุปให้ยืนยันก่อนส่งเสมอ และผู้ใช้แก้ได้ */
const EQUIPMENT_HINTS = [
  [['แอร์', 'เครื่องปรับอากาศ', 'ไม่เย็น'], 'เครื่องปรับอากาศ'],
  [['พัดลม'], 'พัดลม'],
  [['โปรเจคเตอร์', 'projector', 'โปรเจ็คเตอร์'], 'โปรเจคเตอร์'],
  [['หลอดไฟ', 'ไฟดับ', 'ไฟไม่ติด', 'ไฟ'], 'ระบบไฟฟ้า / หลอดไฟ'],
  [['คอม', 'computer', 'พีซี', 'จอ'], 'คอมพิวเตอร์'],
  [['ลำโพง', 'เครื่องเสียง', 'ไมค์'], 'ระบบเสียง'],
  [['wifi', 'ไวไฟ', 'เน็ต', 'อินเทอร์เน็ต', 'อินเตอร์เน็ต'], 'ระบบเครือข่าย / WiFi'],
  [['ประปา', 'น้ำรั่ว', 'ก๊อก', 'ชักโครก', 'ห้องน้ำ'], 'ระบบประปา / สุขภัณฑ์'],
  [['โต๊ะ', 'เก้าอี้', 'ประตู', 'หน้าต่าง', 'กระจก'], 'ครุภัณฑ์ / อาคาร'],
];

export function detectEquipment(text) {
  const lower = String(text || '').toLowerCase();
  for (const [keys, label] of EQUIPMENT_HINTS) {
    if (keys.some((k) => lower.includes(k))) return label;
  }
  return null;
}

/** ดึงเลขห้องจากข้อความ เช่น "แอร์ห้อง 1406 ไม่เย็น" -> "1406"
 *  ยอมรับ 3-4 หลักเท่านั้น กันไม่ให้ไปหยิบปีหรือจำนวนเงินมาเป็นเลขห้อง */
export function extractRoom(text) {
  const match = String(text || '').match(/(?:ห้อง|ที่|room)\s*(\d{3,4})|(\b\d{3,4}\b)/i);
  return match ? match[1] || match[2] : null;
}

const STATUS_LABELS = {
  open: 'รอฝ่ายวิชาการรับเรื่อง',
  in_progress: 'กำลังดำเนินการ',
  done: 'ซ่อมเสร็จแล้ว',
  cancelled: 'ยกเลิกแล้ว',
};

export const repairStatusLabel = (status) => STATUS_LABELS[status] || status;

const LEAVE_STATUS_LABELS = {
  pending_teacher: 'รอครูประจำชั้นอนุมัติ',
  pending_academic: 'รอฝ่ายวิชาการอนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected_by_teacher: 'ครูประจำชั้นไม่อนุมัติ',
  rejected_by_academic: 'ฝ่ายวิชาการไม่อนุมัติ',
};

export const leaveStatusLabel = (status) => LEAVE_STATUS_LABELS[status] || status;

const bahtText = (n) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dayText = (date) => {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays === 0) return 'วันนี้';
  if (diffDays === 1) return 'พรุ่งนี้';
  if (diffDays > 1 && diffDays <= 7) return `อีก ${diffDays} วัน`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
};

/* คำตอบของแต่ละ intent
   รับ context ที่ดึงสดมาจาก DB แล้ว (ไม่มี intent ไหนตอบจากค่าที่ฝังไว้ในไฟล์นี้)
   คืน { text, actions? } — actions คือปุ่มพาไปหน้าที่ทำงานนั้นได้จริง */
export function answerFor(intentId, ctx) {
  const { user, events, eventsLoading, leaveRequests, leaveLoading, activeOrderCount } = ctx;
  const role = user?.role || 'student';
  const isStudent = role === 'student';

  switch (intentId) {
    case 'greeting':
      return {
        text: `สวัสดีครับคุณ ${user?.name || ''}\nถามได้เลย หรือกดปุ่มลัดด้านล่างก็ได้ครับ`,
      };

    case 'thanks':
      return { text: 'ยินดีครับ มีอะไรให้ช่วยอีกพิมพ์บอกได้ตลอดครับ' };

    case 'balance': {
      const baht = bahtText(user?.card_balance);
      return {
        text: `ยอดเงินในบัตรตอนนี้ ${baht} บาท\n(ยอดนี้ดึงสดจากระบบ อัปเดตทุกครั้งที่มีรายการเข้า-ออก)`,
        actions: [
          { label: 'เติมเงิน / ดูรายการ', path: '/home' },
          { label: 'สั่งเครื่องดื่ม', path: '/coffee' },
        ],
      };
    }

    case 'behavior': {
      if (!isStudent) {
        return {
          text: 'คะแนนความประพฤติเป็นข้อมูลรายบุคคลของนักเรียนครับ\nถ้าต้องการดูหรือบันทึกคะแนนของนักเรียน ใช้หน้าจัดการได้เลย',
          actions: [{ label: 'ไปหน้าหลัก', path: role === 'teacher' ? '/teacher' : '/academic' }],
        };
      }
      const score = ctx.behaviorScore;
      if (score === null || score === undefined) {
        return { text: 'ตอนนี้ดึงคะแนนความประพฤติไม่ได้ครับ ลองเปิดหน้าหลักดูอีกครั้ง', actions: [{ label: 'ไปหน้าหลัก', path: '/home' }] };
      }
      const deducted = 100 - score;
      return {
        text:
          `คะแนนความประพฤติของคุณตอนนี้ ${score} / 100 คะแนน` +
          (deducted > 0 ? `\nถูกหักไปแล้วรวม ${deducted} คะแนน` : '\nยังไม่เคยถูกหักคะแนนเลยครับ') +
          '\nดูประวัติการหักคะแนนแต่ละครั้งได้ที่หน้าหลัก',
        actions: [{ label: 'ดูประวัติคะแนน', path: '/home' }],
      };
    }

    case 'events': {
      if (eventsLoading) return { text: 'กำลังดึงปฏิทินกิจกรรมอยู่ครับ สักครู่' };
      if (!events || events.length === 0) {
        return {
          text: 'ตอนนี้ยังไม่มีกิจกรรมที่กำลังจะถึงในปฏิทินครับ\nถ้าฝ่ายวิชาการเพิ่มเข้ามาใหม่จะขึ้นให้เห็นทันที',
        };
      }
      const lines = events
        .slice(0, 5)
        .map((e) => `• ${e.title} — ${dayText(e.start)}${e.location ? ` ที่ ${e.location}` : ''}`);
      return {
        text: `กิจกรรมที่กำลังจะถึง ${events.length} รายการครับ\n${lines.join('\n')}`,
        actions: [{ label: 'ดูปฏิทินเต็ม', path: isStudent ? '/home' : role === 'teacher' ? '/teacher' : '/academic' }],
      };
    }

    case 'leave': {
      if (leaveLoading) return { text: 'กำลังดึงข้อมูลใบลาอยู่ครับ สักครู่' };

      if (isStudent) {
        if (!leaveRequests || leaveRequests.length === 0) {
          return {
            text: 'คุณยังไม่เคยยื่นใบลาในระบบครับ\nยื่นได้จากหน้าหลัก เลือกประเภทการลา วันที่ และเหตุผล\nยื่นแล้วจะผ่านครูประจำชั้นก่อน แล้วจึงถึงฝ่ายวิชาการ',
            actions: [{ label: 'ยื่นใบลา', path: '/home' }],
          };
        }
        const latest = leaveRequests[0];
        const lines = leaveRequests
          .slice(0, 3)
          .map((r) => `• ${r.start_date}${r.end_date && r.end_date !== r.start_date ? ` ถึง ${r.end_date}` : ''} — ${leaveStatusLabel(r.status)}`);
        return {
          text:
            `ใบลาล่าสุดของคุณ: ${leaveStatusLabel(latest.status)}` +
            (latest.rejection_reason ? `\nเหตุผล: ${latest.rejection_reason}` : '') +
            `\n\nรายการล่าสุด\n${lines.join('\n')}`,
          actions: [{ label: 'ดูใบลาทั้งหมด', path: '/home' }],
        };
      }

      const pending = (leaveRequests || []).filter((r) =>
        role === 'teacher' ? r.status === 'pending_teacher' : r.status === 'pending_academic'
      );
      if (pending.length === 0) {
        return { text: 'ตอนนี้ไม่มีใบลาที่รอคุณอนุมัติครับ' };
      }
      const lines = pending
        .slice(0, 5)
        .map((r) => `• ${r.student_name}${r.class_label ? ` (${r.class_label})` : ''} — ${r.start_date}`);
      return {
        text: `มีใบลารอคุณอนุมัติ ${pending.length} ใบครับ\n${lines.join('\n')}`,
        actions: [{ label: 'ไปอนุมัติใบลา', path: role === 'teacher' ? '/teacher' : '/academic' }],
      };
    }

    case 'orders': {
      if (!isStudent && role !== 'teacher') {
        return { text: 'หน้าคิวเครื่องดื่มอยู่ที่หน้าร้านกาแฟครับ', actions: [{ label: 'ไปหน้าร้าน', path: '/barista' }] };
      }
      const n = activeOrderCount;
      return {
        text:
          n > 0
            ? `ตอนนี้คุณมีออเดอร์ที่ยังไม่เสร็จอยู่ ${n} รายการครับ`
            : 'ตอนนี้คุณไม่มีออเดอร์ที่ค้างอยู่ครับ',
        actions: [
          { label: 'สั่งเครื่องดื่ม', path: '/coffee' },
          { label: 'ดูออเดอร์ของฉัน', path: '/orders' },
        ],
      };
    }

    case 'timetable':
      return {
        text: 'เปิดตารางเรียนได้จากเมนูตารางสอนครับ\nถ้ามีการสอนแทน คาบนั้นจะขึ้นสีต่างจากปกติให้เห็นชัด',
        actions: [{ label: 'เปิดตารางสอน', path: '/timetable' }],
      };

    case 'password':
      return {
        text: 'รหัสผ่านตั้งใหม่ได้ที่ฝ่ายทะเบียนเท่านั้นครับ (ระบบไม่เปิดให้ตั้งเองเพื่อความปลอดภัย)\nกรุณานำบัตรประจำตัวนักเรียนติดต่อฝ่ายทะเบียน อาคาร 1 ชั้น 1',
      };

    case 'help':
    default:
      return {
        text:
          'ผมช่วยเรื่องพวกนี้ได้ครับ\n' +
          (isStudent ? '• ยอดเงินในบัตร คะแนนความประพฤติ สถานะใบลา ออเดอร์เครื่องดื่ม\n' : '• ใบลาที่รออนุมัติ กิจกรรมในปฏิทิน\n') +
          '• กิจกรรมที่กำลังจะถึง\n' +
          '• แจ้งซ่อมอุปกรณ์ และตามสถานะใบแจ้งซ่อม\n\n' +
          'ทุกคำตอบดึงจากข้อมูลจริงในระบบ ไม่ใช่ข้อความสำเร็จรูปครับ',
      };
  }
}

/** ข้อความเปิดตอนเปิดหน้าต่างครั้งแรก */
export function greetingFor(user) {
  const name = user?.name ? `คุณ${user.name}` : '';
  return {
    text: `สวัสดีครับ ${name}\nผมดูข้อมูลจริงในระบบให้ได้ และรับแจ้งซ่อมเข้าคิวฝ่ายวิชาการได้ด้วย\nกดปุ่มลัดด้านล่าง หรือพิมพ์ถามได้เลยครับ`,
  };
}

/** ข้อความ error ของ submit_repair_ticket -> ภาษาที่ผู้ใช้เข้าใจ */
export function repairErrorText(code) {
  const map = {
    NOT_AUTHENTICATED: 'เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่',
    ROOM_REQUIRED: 'ยังไม่ได้ระบุห้อง กรุณาพิมพ์เลขห้องหรือสถานที่',
    PROBLEM_REQUIRED: 'ยังไม่ได้ระบุปัญหา กรุณาอธิบายสั้น ๆ ว่าเสียยังไง',
    PROBLEM_TOO_LONG: 'คำอธิบายยาวเกินไป กรุณาสรุปให้สั้นลง (ไม่เกิน 500 ตัวอักษร)',
    RATE_LIMITED: 'แจ้งซ่อมครบ 5 ใบในชั่วโมงนี้แล้ว กรุณารอสักครู่แล้วลองใหม่',
  };
  return map[code] || 'บันทึกใบแจ้งซ่อมไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
}
