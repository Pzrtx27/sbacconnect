import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Wrench, BookOpen, Calendar, FileText } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { showToast } from '../ui/Toast';

// Comprehensive bot knowledge base
const BOT_KNOWLEDGE = {
  greeting: {
    keywords: ['สวัสดี', 'หวัดดี', 'hello', 'hi', 'ดี', 'hey'],
    response: 'สวัสดีครับ! 👋 ยินดีต้อนรับสู่ SBAC Connect Assistant\n\nผมช่วยอะไรได้บ้าง:\n• แจ้งซ่อม อุปกรณ์ / แอร์ / ไฟ\n• สอบถามเรื่องวิชาการ\n• ข้อมูลห้องเรียน / สาขา\n• ตารางสอน / ปฏิทินกิจกรรม\n• ยื่นใบลา / เกรด / คะแนน\n\nพิมพ์ถามได้เลยครับ! 😊'
  },
  repair: {
    keywords: ['แจ้งซ่อม', 'ซ่อม', 'แอร์', 'พัง', 'เสีย', 'พัดลม', 'ไฟ', 'โปรเจคเตอร์', 'projector', 'เครื่องเสียง', 'คอม', 'อินเตอร์เน็ต', 'wifi', 'ประปา', 'น้ำ', 'ไฟดับ'],
    response: null, // Handled by repair flow
  },
  academic: {
    keywords: ['วิชาการ', 'ติดต่อ', 'ฝ่ายวิชาการ', 'ทะเบียน'],
    response: '🏫 **ฝ่ายวิชาการ SBAC**\n\n📍 สถานที่: อาคาร 1 ชั้น 2\n📞 โทร: 02-588-6000 ต่อ 121\n🕐 เปิดทำการ: จ-ศ 08:00 - 16:30 น.\n\n**บริการ:**\n• ขอใบรับรอง / ทรานสคริปต์\n• เปลี่ยนแปลงข้อมูลนักเรียน\n• ลงทะเบียนเรียน / ถอนวิชา\n• ตรวจสอบผลการเรียน'
  },
  leave: {
    keywords: ['ลา', 'ใบลา', 'ลาเรียน', 'ลาป่วย', 'ลากิจ'],
    response: '📋 **การยื่นใบลา**\n\nคุณสามารถยื่นใบลาได้ 2 วิธี:\n\n1️⃣ **ผ่านแอป SBAC Connect** → กดปุ่ม "ยื่นใบลา" บนหน้าแดชบอร์ด\n2️⃣ **ติดต่อครูที่ปรึกษา** โดยตรง\n\n**ประเภทการลา:**\n• ลาป่วย (ต้องมีใบรับรองแพทย์ถ้าเกิน 3 วัน)\n• ลากิจ (ต้องได้รับอนุมัติล่วงหน้า)\n• ลากิจกรรม (กิจกรรมของวิทยาลัย)'
  },
  password: {
    keywords: ['รหัส', 'ลืม', 'ลืมรหัส', 'เปลี่ยนรหัส', 'password', 'reset'],
    response: '🔐 **ลืมรหัสผ่าน / เปลี่ยนรหัส**\n\nกรุณาดำเนินการดังนี้:\n1. นำ **บัตรนักเรียน** ติดต่อ **ฝ่ายทะเบียน**\n2. ยืนยันตัวตนด้วยเลขบัตรประชาชน\n3. รับรหัสผ่านใหม่ภายใน 5 นาที\n\n📍 ฝ่ายทะเบียน: อาคาร 1 ชั้น 1\n📞 โทร: 02-588-6000 ต่อ 100'
  },
  timetable: {
    keywords: ['ตาราง', 'เรียน', 'สอน', 'คาบ', 'ตารางเรียน', 'ตารางสอน'],
    response: '📅 **ตารางเรียน**\n\nดูตารางเรียนได้จาก:\n• กดเมนู "ตารางสอน" บนแถบเมนูด้านล่าง\n• กดปุ่ม "ตารางสอน" บนหน้าแดชบอร์ด\n\n⚠️ หากมีการ **สอนแทน** คาบเรียนจะเปลี่ยนเป็น **สีแดง** เตือนให้ทราบทันทีครับ\n\nตารางจะอัปเดตแบบ **real-time** ตามที่ฝ่ายวิชาการกำหนด'
  },
  grade: {
    keywords: ['เกรด', 'ผลการเรียน', 'GPA', 'gpa', 'ผลเรียน', 'เกรดเฉลี่ย'],
    response: '📊 **ผลการเรียน / GPA**\n\nดูผลการเรียนได้จาก:\n• กดปุ่ม "ผลการเรียน" บนหน้าแดชบอร์ด\n• กดปุ่ม "คะแนนระหว่างภาค" เพื่อดูคะแนนเก็บ\n\nหากมีข้อสงสัยเรื่องเกรด กรุณาติดต่อ:\n📍 ฝ่ายวิชาการ อาคาร 1 ชั้น 2\n📞 02-588-6000 ต่อ 121'
  },
  payment: {
    keywords: ['ชำระ', 'ค่าเทอม', 'เงิน', 'จ่าย', 'เติมเงิน', 'โอนเงิน', 'wallet'],
    response: '💳 **การเงิน / ค่าเทอม**\n\n**Wallet SBAC Connect:**\n• กดที่ยอดเงินมุมขวาบน เพื่อเติม/โอน\n• เติมเงินด่วน: 50, 100, 200, 500 บาท\n• โอนเงินให้เพื่อนได้ทันที\n\n**ค่าเทอม:**\n• ตรวจสอบยอดค้างชำระจากปุ่ม "รายการค้างชำระ"\n• ชำระผ่านธนาคาร / เคาน์เตอร์เซอร์วิส\n• นำใบเสร็จติดต่อฝ่ายการเงิน อาคาร 1 ชั้น 1'
  },
  activity: {
    keywords: ['กิจกรรม', 'ปฏิทิน', 'อีเว้น', 'event', 'รด', 'สอบ', 'วันหยุด'],
    response: '📅 **ปฏิทินกิจกรรม ก.ค. 2569**\n\n🟢 **รด. (ROTC):** ทุกวันพฤหัส (2, 9, 16, 23, 30 ก.ค.)\n📍 สนามกีฬา 13:00-16:00\n\n🔴 **วันหยุดราชการ:**\n• 13 ก.ค. — วันอาสาฬหบูชา\n• 14 ก.ค. — วันเข้าพรรษา\n• 28 ก.ค. — วันเฉลิมฯ ร.10\n\n📝 **สอบกลางภาค:** 18-24 ก.ค.\n\nดูปฏิทินแบบเต็มได้ที่หน้าแดชบอร์ดครับ'
  },
  room: {
    keywords: ['ห้อง', 'ห้องเรียน', 'อาคาร', 'ชั้น'],
    response: '🏢 **ข้อมูลห้องเรียน SBAC**\n\n**อาคาร 1 (ตึกหลัก):**\n• ชั้น 1: ห้อง 1101-1109 (ห้องปฏิบัติการ)\n• ชั้น 2: ห้อง 1201-1209 (ฝ่ายวิชาการ)\n• ชั้น 3: ห้อง 1301-1312 (ห้องเรียนทั่วไป)\n• ชั้น 4: ห้อง 1401-1412 (ห้องคอมพิวเตอร์)\n• ชั้น 5: ห้อง 1501-1512 (ห้องเรียนรวม)\n\n**ห้องเรียนพิเศษ:**\n• 1406: ห้องปฏิบัติการคอมพิวเตอร์\n• 1409: ห้อง Game Lab\n• 1503: ห้อง English Lab\n• 1509: ห้อง Digital Lab'
  },
  branch: {
    keywords: ['สาขา', 'แผนก', 'หลักสูตร', 'วิชาเอก'],
    response: '📚 **สาขาวิชา SBAC (12 สาขา)**\n\n💻 **กลุ่มเทคโนโลยี:**\n1. เทคโนโลยีสารสนเทศ (IT)\n2. คอมพิวเตอร์ธุรกิจ\n3. ดิจิทัลมีเดีย\n4. กราฟิกดีไซน์\n\n📊 **กลุ่มบริหารธุรกิจ:**\n5. การบัญชี\n6. การตลาด\n7. โลจิสติกส์\n\n🏨 **กลุ่มบริการ:**\n8. การท่องเที่ยว\n9. การโรงแรม\n10. อาหารและโภชนาการ\n\n🔧 **กลุ่มช่างอุตสาหกรรม:**\n11. ช่างยนต์\n12. ไฟฟ้ากำลัง'
  },
  behavior: {
    keywords: ['ความประพฤติ', 'คะแนนความประพฤติ', 'ตัดคะแนน', 'พฤติกรรม'],
    response: '📊 **คะแนนความประพฤติ**\n\nตรวจสอบคะแนนได้จากปุ่ม "คะแนนความประพฤติ" บนหน้าแดชบอร์ด\n\n**กฎการตัดคะแนน:**\n• มาสาย = -1 คะแนน/ครั้ง\n• แต่งกายผิดระเบียบ = -5 คะแนน\n• ใช้โทรศัพท์ในห้องเรียน = -2 คะแนน\n• ไม่ส่งงาน = -5 ถึง -10 คะแนน\n\n⚠️ หากคะแนนต่ำกว่า 20 จะถูกเรียกผู้ปกครอง'
  },
  thanks: {
    keywords: ['ขอบคุณ', 'ขอบใจ', 'thank', 'thanks'],
    response: 'ยินดีครับ! 😊 หากมีอะไรให้ช่วยเพิ่มเติม พิมพ์ถามได้ตลอดเวลาครับ'
  },
};

// Repair flow states
const REPAIR_FLOW = {
  IDLE: 'idle',
  ASK_ROOM: 'ask_room',
  ASK_PROBLEM: 'ask_problem',
  CONFIRM: 'confirm',
};

// Equipment types for auto-detection
const EQUIPMENT_KEYWORDS = {
  'แอร์': 'เครื่องปรับอากาศ',
  'air': 'เครื่องปรับอากาศ',
  'พัดลม': 'พัดลม',
  'ไฟ': 'ระบบไฟฟ้า',
  'หลอดไฟ': 'หลอดไฟ',
  'โปรเจคเตอร์': 'โปรเจคเตอร์',
  'projector': 'โปรเจคเตอร์',
  'คอม': 'คอมพิวเตอร์',
  'computer': 'คอมพิวเตอร์',
  'เครื่องเสียง': 'ระบบเสียง',
  'ลำโพง': 'ลำโพง',
  'อินเตอร์เน็ต': 'ระบบอินเตอร์เน็ต',
  'wifi': 'ระบบ WiFi',
  'ประปา': 'ระบบประปา',
  'น้ำ': 'ระบบน้ำ',
};

// Quick action chips
const QUICK_ACTIONS = [
  { label: '🔧 แจ้งซ่อม', keyword: 'แจ้งซ่อม' },
  { label: '🏫 วิชาการ', keyword: 'วิชาการ' },
  { label: '📅 ตารางสอน', keyword: 'ตารางสอน' },
  { label: '📋 ใบลา', keyword: 'ใบลา' },
  { label: '📅 กิจกรรม', keyword: 'กิจกรรม' },
  { label: '📚 สาขา', keyword: 'สาขา' },
];

export default function ChatbotFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 1, text: BOT_KNOWLEDGE.greeting.response, sender: 'bot' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [repairFlow, setRepairFlow] = useState(REPAIR_FLOW.IDLE);
  const [repairData, setRepairData] = useState({ room: '', equipment: '', problem: '' });
  const messagesEndRef = useRef(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen, isTyping]);

  const addBotMessage = (text, delay = 800) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        text,
        sender: 'bot'
      }]);
    }, delay);
  };

  const extractRoom = (text) => {
    // Try to extract room number from text
    const roomMatch = text.match(/(\d{3,4})/);
    return roomMatch ? roomMatch[1] : null;
  };

  const detectEquipment = (text) => {
    const lower = text.toLowerCase();
    for (const [key, value] of Object.entries(EQUIPMENT_KEYWORDS)) {
      if (lower.includes(key)) return value;
    }
    return null;
  };

  const handleSend = (overrideText) => {
    const userText = (overrideText || inputValue).trim();
    if (!userText) return;

    const newUserMessage = {
      id: Date.now(),
      text: userText,
      sender: 'user'
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInputValue('');

    const lowerText = userText.toLowerCase();

    // Handle repair flow states
    if (repairFlow === REPAIR_FLOW.ASK_ROOM) {
      const room = extractRoom(userText) || userText.trim();
      setRepairData(prev => ({ ...prev, room }));
      setRepairFlow(REPAIR_FLOW.ASK_PROBLEM);
      addBotMessage(`📍 ห้อง **${room}** รับทราบครับ\n\nกรุณาระบุ **ปัญหาที่พบ** (เช่น แอร์ไม่เย็น, ไฟดับ, โปรเจคเตอร์เสีย)`);
      return;
    }

    if (repairFlow === REPAIR_FLOW.ASK_PROBLEM) {
      const equipment = detectEquipment(userText) || 'อุปกรณ์ทั่วไป';
      setRepairData(prev => ({ ...prev, problem: userText, equipment }));
      setRepairFlow(REPAIR_FLOW.CONFIRM);
      
      const ticketId = `RPR-${Date.now().toString(36).toUpperCase()}`;
      addBotMessage(
        `✅ **สร้างใบแจ้งซ่อมเรียบร้อย!**\n\n📋 **เลขที่แจ้ง:** ${ticketId}\n📍 **ห้อง:** ${repairData.room}\n🔧 **อุปกรณ์:** ${equipment}\n📝 **ปัญหา:** ${userText}\n📊 **สถานะ:** รอดำเนินการ\n\nฝ่ายอาคารจะดำเนินการภายใน 24-48 ชม. ครับ\nสามารถแจ้งซ่อมรายการอื่นได้อีกครับ 🔧`, 
        1000
      );
      setRepairFlow(REPAIR_FLOW.IDLE);
      setRepairData({ room: '', equipment: '', problem: '' });
      return;
    }

    // Check for repair keywords with room number in same message
    const isRepairRelated = BOT_KNOWLEDGE.repair.keywords.some(k => lowerText.includes(k));
    if (isRepairRelated) {
      const room = extractRoom(userText);
      const equipment = detectEquipment(userText);
      
      if (room && equipment) {
        // Full info provided in one message
        const ticketId = `RPR-${Date.now().toString(36).toUpperCase()}`;
        const problemDesc = userText;
        addBotMessage(
          `✅ **สร้างใบแจ้งซ่อมเรียบร้อย!**\n\n📋 **เลขที่แจ้ง:** ${ticketId}\n📍 **ห้อง:** ${room}\n🔧 **อุปกรณ์:** ${equipment}\n📝 **ปัญหา:** ${problemDesc}\n📊 **สถานะ:** รอดำเนินการ\n\nฝ่ายอาคารจะดำเนินการภายใน 24-48 ชม. ครับ 🔧`,
          1000
        );
        return;
      } else if (room) {
        // Has room but no specific equipment
        setRepairData({ room, equipment: '', problem: '' });
        setRepairFlow(REPAIR_FLOW.ASK_PROBLEM);
        addBotMessage(`📍 ห้อง **${room}** รับทราบครับ\n\nกรุณาระบุ **ปัญหาที่พบ** (เช่น แอร์ไม่เย็น, ไฟดับ, โปรเจคเตอร์เสีย)`);
        return;
      } else {
        // No room number
        setRepairFlow(REPAIR_FLOW.ASK_ROOM);
        if (equipment) {
          setRepairData(prev => ({ ...prev, equipment }));
        }
        addBotMessage('🔧 **แจ้งซ่อม**\n\nกรุณาระบุ **เลขห้อง** ที่ต้องการแจ้งซ่อมครับ (เช่น 1406, 1503)');
        return;
      }
    }

    // Normal keyword matching
    let matched = false;
    for (const [key, data] of Object.entries(BOT_KNOWLEDGE)) {
      if (key === 'repair') continue; // Already handled above
      if (data.keywords.some(k => lowerText.includes(k))) {
        addBotMessage(data.response);
        matched = true;
        break;
      }
    }

    if (!matched) {
      addBotMessage(
        'ขออภัยครับ ผมไม่เข้าใจคำถาม 🤔\n\nลองพิมพ์:\n• **"แจ้งซ่อม"** — แจ้งปัญหาอุปกรณ์\n• **"วิชาการ"** — ติดต่อฝ่ายวิชาการ\n• **"ตารางสอน"** — ดูตารางเรียน\n• **"ใบลา"** — ยื่นใบลาเรียน\n• **"สาขา"** — ข้อมูลสาขาวิชา\n• **"ห้อง"** — ข้อมูลห้องเรียน\n• **"เกรด"** — ผลการเรียน\n• **"กิจกรรม"** — ปฏิทินกิจกรรม'
      );
    }
  };

  // Safe markdown-like formatting for bot messages (no dangerouslySetInnerHTML)
  const formatMessage = (text) => {
    return text.split('\n').map((line, i) => {
      // Parse bold text (**text**) into React elements safely
      const parts = line.split(/(\*\*.+?\*\*)/g);
      return (
        <span key={i} className="block">
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={j}>{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </span>
      );
    });
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        id="chat-fab-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-4 z-50 p-4 bg-sbac-blue hover:bg-sbac-navy text-white rounded-full shadow-button active:scale-95 transition-all"
        aria-label="เปิดแชทบอท"
      >
        <MessageSquare size={24} />
      </button>

      {/* Chat Window Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]"
            />
            {/* Chat Box */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="fixed bottom-0 left-0 right-0 z-[61] max-w-md mx-auto px-4 pb-4"
            >
              <div className={`rounded-t-3xl shadow-glass-lg flex flex-col h-[75vh] transition-colors duration-300 ${
                isDark 
                  ? 'bg-slate-800 border border-white/10' 
                  : 'bg-white border border-slate-100'
              }`}>
                {/* Drag Handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className={`w-10 h-1 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`} />
                </div>

                {/* Header */}
                <div className={`flex items-center justify-between px-5 py-2 border-b ${
                  isDark ? 'border-white/5' : 'border-slate-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                      SBAC Connect Assistant
                    </span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className={`p-1.5 rounded-xl transition-colors ${
                      isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                    }`}
                  >
                    <X size={18} className={isDark ? 'text-slate-400' : 'text-ink-muted'} />
                  </button>
                </div>

                {/* Messages Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 scrollbar-hide">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm ${
                          msg.sender === 'user'
                            ? 'bg-sbac-blue text-white rounded-tr-none'
                            : isDark
                              ? 'bg-slate-700 border border-white/5 text-slate-200 rounded-tl-none'
                              : 'bg-slate-50 border border-slate-100 text-ink-secondary rounded-tl-none'
                        }`}
                      >
                        {msg.sender === 'bot' ? formatMessage(msg.text) : msg.text}
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className={`px-4 py-3 rounded-2xl rounded-tl-none ${
                        isDark
                          ? 'bg-slate-700 border border-white/5'
                          : 'bg-slate-50 border border-slate-100'
                      }`}>
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-slate-400' : 'bg-slate-400'}`} 
                               style={{ animationDelay: '0ms' }} />
                          <div className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-slate-400' : 'bg-slate-400'}`} 
                               style={{ animationDelay: '150ms' }} />
                          <div className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-slate-400' : 'bg-slate-400'}`} 
                               style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Action Chips */}
                <div className={`px-4 py-2 border-t overflow-x-auto scrollbar-hide ${
                  isDark ? 'border-white/5' : 'border-slate-50'
                }`}>
                  <div className="flex gap-2 whitespace-nowrap">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.keyword}
                        onClick={() => handleSend(action.keyword)}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 shrink-0 ${
                          isDark
                            ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            : 'bg-slate-50 border-slate-200 text-ink-secondary hover:bg-slate-100'
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Area */}
                <div className={`p-3 border-t flex gap-2 items-center ${
                  isDark 
                    ? 'border-white/5 bg-slate-900/50' 
                    : 'border-slate-50 bg-slate-50/50'
                }`}>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder={
                      repairFlow === REPAIR_FLOW.ASK_ROOM 
                        ? 'พิมพ์เลขห้อง เช่น 1406...' 
                        : repairFlow === REPAIR_FLOW.ASK_PROBLEM
                        ? 'ระบุปัญหา เช่น แอร์ไม่เย็น...'
                        : 'พิมพ์สอบถาม หรือ แจ้งซ่อม...'
                    }
                    className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none transition-colors duration-200 ${
                      isDark 
                        ? 'bg-slate-700 border border-white/10 text-white placeholder:text-slate-400 focus:border-sbac-blue/50'
                        : 'bg-white border border-slate-200 text-ink focus:border-sbac-blue'
                    }`}
                  />
                  <button
                    onClick={() => handleSend()}
                    className="p-2.5 bg-sbac-blue hover:bg-sbac-navy text-white rounded-xl shadow-button active:scale-95 transition-all"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
