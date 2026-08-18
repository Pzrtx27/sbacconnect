import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import AcademicCalendar from '../../components/ui/AcademicCalendar';
import { readJSON, writeJSON } from '../../utils/storage';
import { formatBaht } from '../../utils/identity';
import { 
  CreditCard, 
  Clock, 
  Coins, 
  Award, 
  BookOpen, 
  GraduationCap, 
  Calendar, 
  FileText, 
  UserX, 
  MessageSquare, 
  ArrowRight,
  TrendingUp,
  Download,
  AlertCircle,
  CheckCircle2,
  ShoppingBag,
  History,
  Receipt,
  Coffee
} from 'lucide-react';

/** คะแนนเก็บภาคเรียน 1/2569 — mock data ของหน้าคะแนนระหว่างภาค */
const SCORE_ITEMS = [
  { subject: 'การสร้างเกมคอมพิวเตอร์', score: 42, total: 50 },
  { subject: 'English for Project Work', score: 38, total: 50 },
  { subject: 'ทักษะดิจิทัล', score: 45, total: 50 },
  { subject: 'การซ่อมบำรุงคอมพิวเตอร์', score: 40, total: 50 },
  { subject: 'การออกแบบกราฟิกพื้นฐาน', score: 47, total: 50 },
  { subject: 'โครงงาน', score: 48, total: 50 },
];

/** จัดระดับคะแนนเป็น 4 เฉด — ใช้ทั้งกับวงกลมสรุปและแถบคะแนนรายวิชา */
function getScoreTier(pct) {
  if (pct >= 85) return { label: 'ดีเยี่ยม', emoji: '🌟', bar: 'bg-emerald-500', text: 'text-accent-emerald', chip: 'bg-emerald-500/10' };
  if (pct >= 70) return { label: 'ดี', emoji: '👍', bar: 'bg-sbac-blue', text: 'text-brand', chip: 'bg-sbac-blue/10' };
  if (pct >= 50) return { label: 'ปานกลาง', emoji: '📘', bar: 'bg-amber-500', text: 'text-accent-amber', chip: 'bg-amber-500/10' };
  return { label: 'ควรพัฒนา', emoji: '💪', bar: 'bg-rose-500', text: 'text-accent-rose', chip: 'bg-rose-500/10' };
}

export default function StudentHome() {
  const { user, updateBalance } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const getBehaviorScore = () => {
    const logs = readJSON('sbac_behavior_logs', []);
    const studentLogs = logs.filter(log => log.studentId === user.id);
    const totalDeductions = studentLogs.reduce((acc, log) => acc + Number(log.score), 0);
    return Math.max(0, Math.min(100, 100 + totalDeductions));
  };

  const getBehaviorLogs = () => {
    const logs = readJSON('sbac_behavior_logs', []);
    return logs.filter(log => log.studentId === user.id);
  };

  const getBehaviorColor = (score) => {
    if (score >= 90) return isDark ? 'bg-emerald-950/40 text-accent-emerald border border-emerald-500/20' : 'bg-emerald-50 text-accent-emerald border border-emerald-200';
    if (score >= 70) return isDark ? 'bg-blue-950/40 text-brand border border-blue-500/20' : 'bg-blue-50 text-brand border border-blue-200';
    if (score >= 50) return isDark ? 'bg-amber-950/40 text-accent-amber border border-amber-500/20' : 'bg-amber-50 text-accent-amber border border-amber-200';
    return isDark ? 'bg-rose-950/40 text-accent-rose border border-rose-500/20' : 'bg-rose-50 text-accent-rose border border-rose-200';
  };

  const getLeaveStatus = (ticketId) => {
    const existing = readJSON('sbac_leave_requests', []);
    const found = existing.find(req => req.id === ticketId);
    if (!found) return 'รอครูอนุมัติ';
    if (found.status === 'approved') return 'อนุมัติแล้ว';
    if (found.status === 'rejected') return 'ไม่อนุมัติ';
    return 'รอครูอนุมัติ';
  };

  // Modal states
  const [activeModal, setActiveModal] = useState(null);
  
  // Custom top-up amount
  const [customTopup, setCustomTopup] = useState('');
  
  // Transfer Form States
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');

  // Leave Request Form States
  const [leaveType, setLeaveType] = useState('sick');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSubmitted, setLeaveSubmitted] = useState(false);
  const [leaveTicketId, setLeaveTicketId] = useState('');

  /* เติมเงิน/โอนเงินทำเองจากหน้าเว็บไม่ได้แล้วหลังย้ายมา Supabase
     RLS revoke สิทธิ์เขียน wallet_entries ทิ้งทั้งหมด ทางเข้าเดียวคือฟังก์ชัน
     topup_cash() ซึ่งบังคับว่าต้องมี role 'cashier' (ดู 02_functions.sql)
     — ตั้งใจให้เป็นแบบนี้ ไม่งั้นนักเรียนเสกเงินให้ตัวเองได้ */
  const CASHIER_ONLY_MSG = 'การเติมเงินต้องทำที่จุดบริการการเงิน กรุณาติดต่อฝ่ายการเงิน';

  const handleTopUp = () => {
    showToast(CASHIER_ONLY_MSG, 'info');
  };

  const handleCustomTopUp = () => {
    showToast(CASHIER_ONLY_MSG, 'info');
    setCustomTopup('');
  };

  /* การโอนเงินระหว่างนักเรียนยังไม่มีฟังก์ชันรองรับฝั่ง DB
     ถ้าจะเปิดใช้จริงต้องเขียนฟังก์ชัน transfer() ที่หักและเพิ่มใน transaction เดียว
     พร้อม idempotency_key เหมือน place_order ไม่งั้นเงินหายกลางทางได้ */
  const handleTransfer = () => {
    showToast('ระบบโอนเงินระหว่างนักเรียนยังไม่เปิดให้บริการ', 'info');
  };

  // Leave Request Submit
  const handleLeaveSubmit = () => {
    if (!leaveStartDate) {
      showToast('กรุณาเลือกวันที่เริ่มลา', 'error');
      return;
    }
    if (!leaveReason.trim()) {
      showToast('กรุณาระบุเหตุผลการลา', 'error');
      return;
    }
    const ticketId = `LV-${Date.now().toString(36).toUpperCase()}`;
    
    // Save to localStorage so Teacher can see it
    const newRequest = {
      id: ticketId,
      studentId: user.id,
      studentName: user.name,
      branch: user.branch || 'เทคโนโลยีสารสนเทศ',
      type: leaveType,
      startDate: leaveStartDate,
      endDate: leaveEndDate,
      reason: leaveReason,
      status: 'pending',
      timestamp: new Date().toISOString()
    };
    
    const existing = readJSON('sbac_leave_requests', []);
    existing.push(newRequest);
    writeJSON('sbac_leave_requests', existing);

    setLeaveTicketId(ticketId);
    setLeaveSubmitted(true);
    showToast('ยื่นใบลาเรียบร้อยแล้ว', 'success');
  };

  const resetLeaveForm = () => {
    setLeaveType('sick');
    setLeaveStartDate('');
    setLeaveEndDate('');
    setLeaveReason('');
    setLeaveSubmitted(false);
    setLeaveTicketId('');
  };

  const leaveTypeLabels = {
    sick: { label: '🏥 ลาป่วย', desc: 'ป่วย ไม่สบาย' },
    personal: { label: '📋 ลากิจ', desc: 'ธุระส่วนตัว' },
    activity: { label: '🎯 ลากิจกรรม', desc: 'กิจกรรมวิทยาลัย' },
    other: { label: '📝 อื่นๆ', desc: 'เหตุผลอื่นๆ' },
  };

  // Dark mode aware colors
  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textSecondary = isDark ? 'text-slate-200' : 'text-ink-secondary';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const bgSubtle = isDark ? 'bg-white/[0.06]' : 'bg-slate-50/50';
  const borderSubtle = isDark ? 'border-white/10' : 'border-slate-100';
  const bgInput = isDark ? 'bg-neutral-900 border-white/20 text-white placeholder:text-content-muted focus:border-sbac-blue-light' : 'bg-slate-50 border-slate-200 text-ink focus:border-sbac-blue';

  // สรุปคะแนนเก็บ — ใช้ในโมดัล "คะแนนระหว่างภาค"
  const scoreTotal = SCORE_ITEMS.reduce((sum, item) => sum + item.score, 0);
  const scoreMax = SCORE_ITEMS.reduce((sum, item) => sum + item.total, 0);
  const scoreAvgPct = Math.round((scoreTotal / scoreMax) * 100);
  const scoreTier = getScoreTier(scoreAvgPct);
  const gaugeCircumference = 2 * Math.PI * 15.5;

  return (
    <div className="space-y-6">
      {/* Profile Section */}
      <div className={`flex justify-between items-end p-4 rounded-3xl border transition-colors duration-300 ${bgSubtle} ${borderSubtle}`}>
        <div>
          <span className="text-[10px] text-brand font-extrabold uppercase tracking-wider block mb-1">
            Welcome back
          </span>
          <h2 className={`text-xl font-extrabold ${textPrimary}`}>
            {user?.name || 'นักเรียน SBAC'}
          </h2>
          <p className={`text-xs mt-0.5 ${textMuted}`}>
            ID: {user?.id} • {user?.branch || 'เทคโนโลยีสารสนเทศ'}
          </p>
        </div>

        <div 
          onClick={() => setActiveModal('balance')}
          className={`p-3 rounded-2xl border shadow-sm flex flex-col items-end cursor-pointer active:scale-95 transition-all ${
            isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white/80 border-slate-200'
          }`}
        >
          <span className={`text-[9px] font-bold uppercase tracking-wider ${textMuted}`}>Wallet</span>
          <span className="text-base font-extrabold text-brand">
            {formatBaht(user?.balance_satang || 0)} <span className={`text-xs font-semibold ${textSecondary}`}>฿</span>
          </span>
        </div>
      </div>

      {/* Academic Calendar */}
      <AcademicCalendar />

      {/* Dashboard Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Entrance Times */}
        <GlassCard onClick={() => setActiveModal('entry')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <Clock className="text-brand mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>เวลาเข้า-ออก</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>เวลาผ่านประตู / Gate check times</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              ดูข้อมูล <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Payment Debts */}
        <GlassCard onClick={() => setActiveModal('debt')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <div className="w-9 h-9 rounded-2xl bg-rose-500/10 flex items-center justify-center text-accent-rose mb-2">
                <Receipt size={20} />
              </div>
              <div className={`text-sm font-extrabold ${textPrimary}`}>รายการค้างชำระ</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ยอดคงเหลือ / Outstanding</div>
            </div>
            <span className={`inline-block self-start text-xs font-extrabold px-3 py-1 rounded-full mt-2 ${
              isDark ? 'bg-emerald-900/30 text-accent-emerald' : 'bg-emerald-50 text-accent-emerald'
            }`}>
              0 THB
            </span>
          </div>
        </GlassCard>

        {/* Behavior Score */}
        <GlassCard onClick={() => setActiveModal('behavior')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <Award className="text-accent-amber mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>คะแนนความประพฤติ</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ดูคะแนนความประพฤติสะสม</div>
            </div>
            <span className={`inline-block self-start text-xs font-extrabold px-3 py-1 rounded-full mt-2 ${
              getBehaviorColor(getBehaviorScore())
            }`}>
              {getBehaviorScore()} / 100
            </span>
          </div>
        </GlassCard>

        {/* Score */}
        <GlassCard onClick={() => setActiveModal('score')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <BookOpen className="text-accent-emerald mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>คะแนนระหว่างภาค</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>คะแนนเก็บและโครงงาน</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              ดูข้อมูล <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Grade */}
        <GlassCard onClick={() => setActiveModal('grade')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <GraduationCap className="text-accent-violet mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>ผลการเรียน</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ดูเกรดเฉลี่ยเทอมนี้</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              ดูข้อมูล <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Timetable */}
        <GlassCard onClick={() => navigate('/timetable')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <Calendar className="text-brand mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>ตารางสอน</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ดูตารางเรียนรายคาบ</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              ดูข้อมูล <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Exam Schedule */}
        <GlassCard onClick={() => setActiveModal('exam')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <FileText className="text-accent-cyan mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>กำหนดการสอบ</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>สถานที่สอบ / เวลาสอบ</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              เปิดดู <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* E-Document */}
        <GlassCard onClick={() => setActiveModal('edoc')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <FileText className="text-accent-emerald mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>เอกสารอิเล็กทรอนิกส์</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ใบรับรอง, ทรานสคริปต์</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              เปิดดู <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Leave Request — now opens in-app modal */}
        <GlassCard onClick={() => { resetLeaveForm(); setActiveModal('leave'); }}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <UserX className="text-accent-rose mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>ยื่นใบลา</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ยื่นใบลาผ่านแอป SBAC</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              ยื่นใบลา <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Coffee Shop */}
        <GlassCard onClick={() => navigate('/coffee')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <div className="w-9 h-9 rounded-2xl bg-amber-500/10 flex items-center justify-center text-accent-amber mb-2">
                <Coffee size={22} aria-hidden="true" />
              </div>
              <div className={`text-sm font-extrabold ${textPrimary}`}>สั่งกาแฟบาริสต้า</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>SBAC Barista Coffee</div>
            </div>
            <div className="flex items-center text-xs font-bold text-accent-amber mt-2">
              สั่งเครื่องดื่ม <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Order History */}
        <GlassCard onClick={() => navigate('/orders/history')}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <History className="text-accent-emerald mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>ประวัติการสั่งซื้อ</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ดูประวัติและสถานะคิวสั่งซื้อ</div>
            </div>
            <div className="flex items-center text-xs font-bold text-accent-emerald mt-2">
              ดูประวัติ <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>

        {/* Chatbot Assistant */}
        <GlassCard onClick={() => {
          const btn = document.getElementById('chat-fab-btn');
          if (btn) btn.click();
        }}>
          <div className="flex flex-col h-full justify-between min-h-[110px]">
            <div>
              <MessageSquare className="text-accent-cyan mb-2" size={24} />
              <div className={`text-sm font-extrabold ${textPrimary}`}>แชทบอทช่วยเหลือ</div>
              <div className={`text-[10px] mt-1 leading-snug ${textMuted}`}>ติดต่อวิชาการ / แจ้งซ่อม</div>
            </div>
            <div className="flex items-center text-xs font-bold text-brand mt-2">
              เริ่มคุย <ArrowRight size={14} className="ml-1" />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* MODAL: Balance & Topup */}
      <Modal 
        isOpen={activeModal === 'balance'} 
        onClose={() => setActiveModal(null)} 
        title="💳 ยอดเงินบัตร"
      >
        <div className="space-y-6">
          <div className={`text-center py-4 rounded-2xl border transition-colors ${
            isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={`text-5xl font-extrabold block ${textPrimary}`}>
              {formatBaht(user?.balance_satang || 0)}
            </span>
            <span className={`text-xs font-extrabold mt-2 block ${textMuted}`}>THB</span>
          </div>

          <div className="space-y-3">
            <span className={`text-xs font-extrabold uppercase tracking-wider block ${textMuted}`}>
              ✨ เติมเงินด่วน (Quick Top Up)
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[50, 100, 200, 500].map(amt => (
                <button 
                  key={amt}
                  onClick={() => handleTopUp(amt)}
                  className={`py-2.5 border rounded-xl font-bold text-sm active:scale-95 transition-all ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      : 'bg-slate-50 border-slate-200 text-sbac-navy hover:bg-slate-100'
                  }`}
                >
                  +{amt}฿
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input 
                type="number"
                value={customTopup}
                onChange={e => setCustomTopup(e.target.value)}
                placeholder="ระบุจำนวนเงินอื่นๆ"
                className={`flex-1 border rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none ${bgInput}`}
              />
              <button 
                onClick={handleCustomTopUp}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold px-6 rounded-xl text-sm transition-all"
              >
                เติมเงิน
              </button>
            </div>
          </div>

          <div className={`border-t pt-4 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
            <button 
              onClick={() => setActiveModal('transfer')}
              className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-button flex items-center justify-center gap-2"
            >
              <Coins size={16} />
              โอนเงินให้เพื่อน (Transfer)
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Transfer */}
      <Modal
        isOpen={activeModal === 'transfer'}
        onClose={() => setActiveModal('balance')}
        title="💸 โอนเงินภายในแอป"
      >
        <div className="space-y-4">
          <p className={`text-xs leading-relaxed ${textMuted}`}>
            โอนเงินไปยังรหัสนักเรียนอื่นทันทีด้วยระบบ SBAC Connect Wallet
          </p>

          <div>
            <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>รหัสนักเรียนผู้รับ (Student ID)</label>
            <input 
              type="text"
              value={transferRecipient}
              onChange={e => setTransferRecipient(e.target.value)}
              placeholder="ระบุรหัสนักเรียนผู้รับ (เช่น 66002)"
              className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none ${bgInput}`}
            />
          </div>

          <div>
            <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>จำนวนเงินที่ต้องการโอน (THB)</label>
            <input 
              type="number"
              value={transferAmount}
              onChange={e => setTransferAmount(e.target.value)}
              placeholder="ระบุจำนวนเงิน"
              className={`w-full border rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none ${bgInput}`}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <button 
              onClick={handleTransfer}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3 rounded-xl text-sm transition-all"
            >
              ✓ ยืนยันการโอน
            </button>
            <button 
              onClick={() => setActiveModal('balance')}
              className={`flex-1 border-2 font-extrabold py-3 rounded-xl text-sm transition-all ${
                isDark 
                  ? 'border-white/10 text-content-secondary hover:bg-white/5'
                  : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
              }`}
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Leave Request (In-App) */}
      <Modal 
        isOpen={activeModal === 'leave'} 
        onClose={() => setActiveModal(null)} 
        title="📝 ยื่นใบลา"
      >
        {leaveSubmitted ? (
          <div className="space-y-5 text-center py-4">
            <div className={`inline-flex p-4 border rounded-full mb-2 ${
              isDark ? 'bg-emerald-900/30 border-emerald-800/30 text-accent-emerald' : 'bg-emerald-50 border-emerald-100 text-accent-emerald'
            }`}>
              <CheckCircle2 size={40} />
            </div>
            <div>
              <h3 className={`text-lg font-extrabold ${textPrimary}`}>ยื่นใบลาเรียบร้อย!</h3>
              <p className={`text-xs mt-1 ${textMuted}`}>ระบบได้ส่งใบลาไปยังครูที่ปรึกษาแล้ว</p>
            </div>
            <div className={`rounded-2xl p-4 border space-y-2 text-left ${
              isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
            }`}>
              <div className="flex justify-between text-sm">
                <span className={`font-semibold ${textMuted}`}>เลขที่ใบลา</span>
                <span className={`font-extrabold text-brand`}>{leaveTicketId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className={`font-semibold ${textMuted}`}>ประเภท</span>
                <span className={`font-bold ${textSecondary}`}>{leaveTypeLabels[leaveType].label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className={`font-semibold ${textMuted}`}>วันที่ลา</span>
                <span className={`font-bold ${textSecondary}`}>{leaveStartDate}{leaveEndDate ? ` ถึง ${leaveEndDate}` : ''}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className={`font-semibold ${textMuted}`}>สถานะ</span>
                <span className={`font-extrabold ${
                  getLeaveStatus(leaveTicketId) === 'อนุมัติแล้ว' ? 'text-accent-emerald' :
                  getLeaveStatus(leaveTicketId) === 'ไม่อนุมัติ' ? 'text-accent-rose' : 'text-accent-amber'
                }`}>{getLeaveStatus(leaveTicketId) === 'อนุมัติแล้ว' ? 'อนุมัติแล้ว' : getLeaveStatus(leaveTicketId) === 'ไม่อนุมัติ' ? 'ปฏิเสธคำขอลา' : 'รอครูอนุมัติ'}</span>
              </div>
            </div>
            <button 
              onClick={() => setActiveModal(null)}
              className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-button"
            >
              ปิด
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className={`text-xs leading-relaxed ${textMuted}`}>
              กรุณากรอกข้อมูลการลาให้ครบถ้วน ระบบจะส่งแจ้งเตือนไปยังครูที่ปรึกษาอัตโนมัติ
            </p>

            {/* Leave Type */}
            <div>
              <label className={`text-xs font-bold block mb-2 ${textPrimary}`}>ประเภทการลา</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(leaveTypeLabels).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => setLeaveType(key)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-left ${
                      leaveType === key
                        ? 'bg-sbac-blue text-white border-sbac-blue shadow-sm'
                        : isDark
                        ? 'bg-white/5 border-white/10 text-content-secondary hover:bg-white/10'
                        : 'bg-slate-50 border-slate-200 text-ink-secondary hover:bg-slate-100'
                    }`}
                  >
                    <div>{val.label}</div>
                    <div className={`text-[9px] mt-0.5 ${leaveType === key ? 'text-white/70' : textMuted}`}>{val.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>วันที่เริ่มลา *</label>
                <input 
                  type="date"
                  value={leaveStartDate}
                  onChange={e => setLeaveStartDate(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
                />
              </div>
              <div>
                <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>ถึงวันที่ (ไม่บังคับ)</label>
                <input 
                  type="date"
                  value={leaveEndDate}
                  onChange={e => setLeaveEndDate(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none ${bgInput}`}
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className={`text-xs font-bold block mb-1 ${textPrimary}`}>เหตุผลการลา *</label>
              <textarea 
                value={leaveReason}
                onChange={e => setLeaveReason(e.target.value)}
                rows={3}
                className={`w-full border rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none resize-none ${bgInput}`}
                placeholder="ระบุเหตุผลการลา เช่น ไม่สบาย มีไข้สูง"
              />
            </div>

            {/* Student Info */}
            <div className={`rounded-xl p-3 border ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${textMuted}`}>ข้อมูลผู้ยื่น</div>
              <div className={`text-xs font-semibold ${textSecondary}`}>
                {user?.name} • รหัส {user?.id} • {user?.branch || 'IT'}
              </div>
            </div>

            <button 
              onClick={handleLeaveSubmit}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <UserX size={16} />
              ยืนยันการยื่นใบลา
            </button>
          </div>
        )}
      </Modal>

      {/* MODAL: Entrance Times */}
      <Modal isOpen={activeModal === 'entry'} onClose={() => setActiveModal(null)} title="🕐 เวลาเข้า–ออก">
        <div className="space-y-4">
          <p className={`text-xs ${textMuted}`}>ภาคเรียน 1/2569 • ห้อง ม.3/6</p>
          <div className={`border-l-2 pl-4 space-y-4 ml-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="relative">
              <div className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-4 ${isDark ? 'ring-slate-800' : 'ring-white'}`} />
              <div className="flex justify-between items-center">
                <div>
                  <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-ink'}`}>เข้าสถานศึกษา</div>
                  <div className={`text-[10px] ${textMuted}`}>ประตูหน้า (Main Gate)</div>
                </div>
                <div className="text-sm font-extrabold text-accent-emerald">07:42</div>
              </div>
            </div>
            <div className="relative">
              <div className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-rose-500 rounded-full ring-4 ${isDark ? 'ring-slate-800' : 'ring-white'}`} />
              <div className="flex justify-between items-center">
                <div>
                  <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-ink'}`}>ออกนอกสถานศึกษา</div>
                  <div className={`text-[10px] ${textMuted}`}>ประตูหลัง (Back Gate)</div>
                </div>
                <div className="text-sm font-extrabold text-accent-rose">16:30</div>
              </div>
            </div>
            <div className="relative">
              <div className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-4 ${isDark ? 'ring-slate-800' : 'ring-white'}`} />
              <div className="flex justify-between items-center">
                <div>
                  <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-ink'}`}>เข้าสถานศึกษา (เมื่อวาน)</div>
                  <div className={`text-[10px] ${textMuted}`}>ประตูหน้า (Main Gate)</div>
                </div>
                <div className="text-sm font-extrabold text-accent-emerald">07:55</div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL: Debts */}
      <Modal isOpen={activeModal === 'debt'} onClose={() => setActiveModal(null)} title="💰 รายการค้างชำระ">
        <div className="space-y-6 text-center py-4">
          <div className={`inline-flex p-4 border rounded-full mb-2 ${
            isDark ? 'bg-emerald-900/30 border-emerald-800/30 text-accent-emerald' : 'bg-emerald-50 border-emerald-100 text-accent-emerald'
          }`}>
            <Receipt size={32} />
          </div>
          <div>
            <h3 className="text-3xl font-extrabold text-accent-emerald">0 THB</h3>
            <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full mt-2 ${
              isDark ? 'bg-emerald-900/30 text-accent-emerald' : 'bg-emerald-50 text-accent-emerald'
            }`}>
              ✓ ไม่มีรายการค้างชำระ
            </span>
          </div>
          <div className={`border-t pt-4 text-left space-y-3 text-sm font-semibold ${textSecondary} ${
            isDark ? 'border-white/5' : 'border-slate-100'
          }`}>
            <div className="flex justify-between">
              <span>ค่าเทอม 1/2569</span>
              <span className="text-accent-emerald font-extrabold">ชำระแล้ว</span>
            </div>
            <div className="flex justify-between">
              <span>ค่าอุปกรณ์การเรียน</span>
              <span className="text-accent-emerald font-extrabold">ชำระแล้ว</span>
            </div>
            <div className="flex justify-between">
              <span>ค่ากิจกรรมพิเศษ</span>
              <span className="text-accent-emerald font-extrabold">ชำระแล้ว</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL: Behavior */}
      <Modal isOpen={activeModal === 'behavior'} onClose={() => setActiveModal(null)} title="📊 คะแนนความประพฤติ">
        <div className="space-y-6">
          <div className={`text-center py-5 border rounded-2xl ${
            isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={`text-5xl font-extrabold block ${
              getBehaviorScore() >= 90 ? 'text-accent-emerald' :
              getBehaviorScore() >= 70 ? 'text-brand' :
              getBehaviorScore() >= 50 ? 'text-accent-amber' : 'text-accent-rose'
            }`}>
              {getBehaviorScore()} <span className={`text-lg font-bold ${textMuted}`}>/ 100</span>
            </span>
            <span className={`text-xs font-bold mt-1 block ${
              getBehaviorScore() >= 90 ? 'text-accent-emerald dark:text-accent-emerald' :
              getBehaviorScore() >= 70 ? 'text-brand' :
              getBehaviorScore() >= 50 ? 'text-accent-amber dark:text-accent-amber' : 'text-accent-rose dark:text-accent-rose'
            }`}>
              {getBehaviorScore() >= 90 ? 'ดีเยี่ยม (Excellent)' :
               getBehaviorScore() >= 70 ? 'ดี (Good)' :
               getBehaviorScore() >= 50 ? 'ปานกลาง (Fair)' : 'ควรปรับปรุง (Needs Improvement)'}
            </span>
            <div className={`w-[80%] h-2.5 rounded-full mx-auto mt-4 overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <div className={`h-full rounded-full transition-all duration-500 ${
                getBehaviorScore() >= 90 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' :
                getBehaviorScore() >= 70 ? 'bg-gradient-to-r from-blue-500 to-indigo-500' :
                getBehaviorScore() >= 50 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                'bg-gradient-to-r from-rose-500 to-red-500'
              }`} style={{ width: `${getBehaviorScore()}%` }} />
            </div>
          </div>

          <div className="space-y-3">
            <span className={`text-xs font-extrabold uppercase tracking-wider block ${textMuted}`}>
              ประวัติรายการตัดคะแนน
            </span>
            {getBehaviorLogs().length === 0 ? (
              <div className={`rounded-2xl p-6 border text-center transition-all ${
                isDark ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-100'
              }`}>
                <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-accent-emerald mb-2">
                  <CheckCircle2 size={24} />
                </div>
                <p className={`text-sm font-extrabold ${textPrimary}`}>ไม่มีประวัติการถูกหักคะแนน</p>
                <p className={`text-xs mt-1 ${textMuted}`}>นักเรียนปฏิบัติตามกฎระเบียบของวิทยาลัยได้อย่างดีเยี่ยม</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {getBehaviorLogs().map((item, idx) => (
                  <div key={idx} className={`flex justify-between items-center text-sm font-semibold border-b pb-2 ${
                    isDark ? 'border-white/5' : 'border-slate-50'
                  }`}>
                    <div>
                      <span className={textSecondary}>{item.reason}</span>
                      <span className={`text-[9px] font-normal block ${textMuted}`}>
                        โดย {item.teacherName} • {new Date(item.timestamp).toLocaleDateString('th-TH')}
                      </span>
                    </div>
                    <span className={`font-extrabold ${item.score > 0 ? 'text-accent-emerald' : 'text-accent-rose'}`}>
                      {item.score > 0 ? `+${item.score}` : item.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL: Score */}
      <Modal isOpen={activeModal === 'score'} onClose={() => setActiveModal(null)} title="📈 คะแนนระหว่างภาค">
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className={`text-xs font-bold ${textMuted}`}>ภาคเรียน 1/2569</p>
            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${scoreTier.chip} ${scoreTier.text}`}>
              {scoreTier.emoji} {scoreTier.label}
            </span>
          </div>

          {/* การ์ดสรุป: วงกลมแสดงเปอร์เซ็นต์รวม */}
          <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
            isDark ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-100'
          }`}>
            <div className="relative w-16 h-16 shrink-0">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle
                  cx="18" cy="18" r="15.5" fill="none" strokeWidth="3"
                  className={isDark ? 'stroke-white/10' : 'stroke-slate-200'}
                />
                <motion.circle
                  cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round"
                  stroke="currentColor"
                  className={scoreTier.text}
                  strokeDasharray={gaugeCircumference}
                  initial={{ strokeDashoffset: gaugeCircumference }}
                  animate={{ strokeDashoffset: gaugeCircumference * (1 - scoreAvgPct / 100) }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-sm font-extrabold ${textPrimary}`}>{scoreAvgPct}%</span>
              </div>
            </div>
            <div>
              <div className={`text-sm font-extrabold ${textPrimary}`}>{scoreTotal} / {scoreMax} คะแนน</div>
              <div className={`text-[11px] mt-0.5 ${textMuted}`}>คะแนนเก็บรวม {SCORE_ITEMS.length} รายวิชา</div>
            </div>
          </div>

          {/* แถบคะแนนรายวิชา — ทยอยเลื่อนเข้าทีละแถวให้ดูมีชีวิตชีวา */}
          <div className="space-y-3.5">
            {SCORE_ITEMS.map((item, idx) => {
              const pct = Math.round((item.score / item.total) * 100);
              const rowTier = getScoreTier(pct);
              return (
                <motion.div
                  key={item.subject}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex justify-between items-baseline mb-1">
                    <span className={`text-xs font-bold ${textSecondary}`}>{item.subject}</span>
                    <span className={`text-xs font-extrabold ${textPrimary}`}>
                      {item.score}<span className={`text-[10px] font-normal ${textMuted}`}>/{item.total}</span>
                    </span>
                  </div>
                  <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                    <motion.div
                      className={`h-full rounded-full ${rowTier.bar}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: idx * 0.06 + 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* MODAL: Grade */}
      <Modal isOpen={activeModal === 'grade'} onClose={() => setActiveModal(null)} title="🎓 ผลการเรียน">
        <div className="space-y-4">
          <div className={`flex justify-between items-center p-3 rounded-xl border ${
            isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={`text-sm font-bold ${textPrimary}`}>ภาคเรียน 1/2569</span>
            <span className="text-sm font-extrabold text-brand">GPA: 3.45</span>
          </div>

          <div className="space-y-2.5">
            {[
              { subject: 'การสร้างเกมคอมพิวเตอร์', credit: 3, grade: 'A', color: 'text-accent-emerald', chip: 'bg-emerald-500/10' },
              { subject: 'English for Project Work', credit: 3, grade: 'B+', color: 'text-brand', chip: 'bg-sbac-blue/10' },
              { subject: 'ทักษะดิจิทัล', credit: 2, grade: 'A', color: 'text-accent-emerald', chip: 'bg-emerald-500/10' },
              { subject: 'การซ่อมบำรุงคอมพิวเตอร์', credit: 3, grade: 'B+', color: 'text-brand', chip: 'bg-sbac-blue/10' },
              { subject: 'การออกแบบกราฟิกพื้นฐาน', credit: 3, grade: 'A', color: 'text-accent-emerald', chip: 'bg-emerald-500/10' },
              { subject: 'โครงงาน', credit: 4, grade: 'A', color: 'text-accent-emerald', chip: 'bg-emerald-500/10' },
            ].map((item, idx) => (
              <motion.div
                key={item.subject}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className={`flex justify-between items-center border-b pb-2.5 ${
                  isDark ? 'border-white/5' : 'border-slate-50'
                }`}
              >
                <div>
                  <div className={`text-sm font-semibold ${textSecondary}`}>{item.subject}</div>
                  <div className={`text-[10px] ${textMuted}`}>หน่วยกิต: {item.credit}</div>
                </div>
                <span className={`text-sm font-extrabold px-2.5 py-1 rounded-full ${item.chip} ${item.color}`}>
                  {item.grade}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </Modal>

      {/* MODAL: Exam Schedule */}
      <Modal isOpen={activeModal === 'exam'} onClose={() => setActiveModal(null)} title="📝 กำหนดการสอบ">
        <div className="space-y-4">
          <p className={`text-xs ${textMuted}`}>ภาคเรียน 1/2569 • ห้อง 1503</p>
          <div className="space-y-3">
            {[
              { day: '18', month: 'ก.ค.', subject: 'การสร้างเกมคอมพิวเตอร์', time: '08:30 – 10:30 น.', room: 'ห้อง 1409' },
              { day: '19', month: 'ก.ค.', subject: 'English for Project Work', time: '08:30 – 10:30 น.', room: 'ห้อง 1503' },
              { day: '21', month: 'ก.ค.', subject: 'ทักษะดิจิทัล', time: '08:30 – 10:30 น.', room: 'ห้อง 1509' },
              { day: '22', month: 'ก.ค.', subject: 'การซ่อมบำรุงคอมพิวเตอร์', time: '08:30 – 10:30 น.', room: 'ห้อง 1401' },
              { day: '24', month: 'ก.ค.', subject: 'การออกแบบกราฟิกพื้นฐาน', time: '08:30 – 10:30 น.', room: 'ห้อง 1406' },
            ].map((item, idx) => (
              <div key={idx} className={`flex gap-4 items-center border-b pb-2 ${
                isDark ? 'border-white/5' : 'border-slate-50'
              }`}>
                <div className={`rounded-xl px-3 py-1.5 text-center min-w-[55px] border ${
                  isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
                }`}>
                  <span className={`text-base font-extrabold block leading-none ${textPrimary}`}>{item.day}</span>
                  <span className={`text-[10px] font-bold mt-1 block leading-none ${textMuted}`}>{item.month}</span>
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-bold ${textSecondary}`}>{item.subject}</div>
                  <div className={`text-[10px] mt-0.5 ${textMuted}`}>{item.time}</div>
                </div>
                <span className={`text-[10px] font-extrabold px-2 py-1 rounded-md ${
                  isDark ? 'bg-white/5 text-content-secondary' : 'bg-slate-100 text-ink-secondary'
                }`}>
                  {item.room}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* MODAL: E-Document */}
      <Modal isOpen={activeModal === 'edoc'} onClose={() => setActiveModal(null)} title="📄 เอกสารอิเล็กทรอนิกส์">
        <div className="space-y-3">
          {[
            { title: '📋 ใบรับรองการเป็นนักเรียน', sub: 'Student Certificate', status: 'ready' },
            { title: '📊 ทรานสคริปต์', sub: 'Academic Transcript', status: 'ready' },
            { title: '🎓 วุฒิการศึกษา', sub: 'Education Certificate', status: 'pending' },
          ].map((doc, idx) => (
            <div key={idx} className={`flex justify-between items-center p-3 border rounded-xl transition-all ${
              isDark 
                ? 'border-white/5 hover:bg-white/5' 
                : 'border-slate-100 hover:bg-slate-50'
            }`}>
              <div>
                <div className={`text-sm font-bold ${textSecondary}`}>{doc.title}</div>
                <div className={`text-[10px] ${textMuted}`}>{doc.sub}</div>
              </div>
              {doc.status === 'ready' ? (
                <button 
                  onClick={() => showToast('กำลังดาวน์โหลด...', 'success')}
                  className="bg-sbac-blue text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 active:scale-95 transition-all"
                >
                  <Download size={12} />
                  ดาวน์โหลด
                </button>
              ) : (
                <span className={`text-xs font-bold py-1.5 px-3 rounded-lg ${
                  isDark ? 'bg-white/5 text-content-muted' : 'bg-slate-100 text-ink-muted'
                }`}>
                  รอดำเนินการ
                </span>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
