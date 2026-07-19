import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import { Coffee, ShoppingCart, ChevronRight, Check } from 'lucide-react';

const MENU_ITEMS = [
  { id: '1', name: 'Iced Americano', price: 35, emoji: '☕', description: 'เข้มข้น หอมกรุ่น เมล็ดกาแฟอาราบิก้าแท้' },
  { id: '2', name: 'Iced Latte', price: 20, emoji: '🥛', description: 'นุ่มละมุน ผสมนมสดแท้ 100%' },
  { id: '3', name: 'Iced Cocoa', price: 35, emoji: '🍫', description: 'โกโก้พรีเมียม เข้มข้นหวานมันสะใจ' },
  { id: '4', name: 'Pepsi on Ice', price: 30, emoji: '🥤', description: 'เป๊ปซี่เย็นซ่า ชื่นใจ ดับกระหาย' }
];

export default function CoffeePage() {
  const { user, updateBalance } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Menu, 2: Customize/Summary, 3: Payment
  const [selectedItem, setSelectedItem] = useState(null);
  
  // Customization states
  const [temp, setTemp] = useState('เย็น');
  const [sweet, setSweet] = useState('ปกติ');
  const [note, setNote] = useState('');

  // Payment States
  const [paymentMethod, setPaymentMethod] = useState(null); // 'card' or 'qr'
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const selectItem = (item) => {
    setSelectedItem(item);
    setStep(2);
  };

  const handlePlaceOrder = () => {
    setPaymentModalOpen(true);
  };

  const executePayment = async (method) => {
    if (method === 'card') {
      const price = selectedItem.price;
      if (user.card_balance < price) {
        showToast('ยอดเงินคงเหลือในบัตรไม่เพียงพอ กรุณาเติมเงิน', 'error');
        return;
      }
      // Deduct balance
      updateBalance(user.card_balance - price);
    }

    try {
      // Save order to Firestore
      const orderData = {
        student_id: user.id,
        student_name: user.name,
        items: [
          {
            name: selectedItem.name,
            price: selectedItem.price,
            emoji: selectedItem.emoji,
            temp,
            sweet,
            note
          }
        ],
        total_thb: selectedItem.price,
        status: 'pending',
        payment_method: method,
        queue_number: Math.floor(Math.random() * 90) + 10, // Mock random queue number
        created_at: serverTimestamp()
      };

      await addDoc(collection(db, 'coffee_orders'), orderData);
      showToast('สั่งซื้อเครื่องดื่มสำเร็จ!', 'success');
      setPaymentModalOpen(false);
      navigate('/orders');
    } catch (err) {
      console.error('Error placing order:', err);
      showToast('ไม่สามารถทำรายการได้ในขณะนี้', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className={`flex justify-between items-center p-4 rounded-2xl border transition-colors duration-300 ${
        isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
      }`}>
        <h2 className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${
          isDark ? 'text-white' : 'text-sbac-navy'
        }`}>
          <Coffee size={24} className="text-sbac-blue-light" />
          SBAC Coffee
        </h2>
        <span className={`text-xs font-bold transition-colors duration-300 ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>
          บัตร: <span className={`font-extrabold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>{user?.card_balance} ฿</span>
        </span>
      </div>

      {step === 1 && (
        <div className="space-y-4 animate-slide-up">
          <span className={`text-sm font-extrabold block transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            ☕ เลือกเมนูเครื่องดื่ม
          </span>
          <div className="grid grid-cols-2 gap-4">
            {MENU_ITEMS.map((item) => (
              <GlassCard key={item.id} onClick={() => selectItem(item)}>
                <div className="text-center py-4 space-y-2">
                  <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm transition-colors ${
                    isDark ? 'bg-white/5' : 'bg-slate-50'
                  }`}>
                    {item.emoji}
                  </div>
                  <h3 className={`text-sm font-extrabold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>{item.name}</h3>
                  <p className={`text-[10px] line-clamp-2 px-1 leading-normal transition-colors duration-300 ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>{item.description}</p>
                  <div className={`text-sm font-extrabold pt-1 transition-colors duration-300 ${isDark ? 'text-sbac-red-light' : 'text-sbac-red'}`}>{item.price} THB</div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {step === 2 && selectedItem && (
        <div className="space-y-6 animate-slide-up">
          {/* Selected Item Brief */}
          <div className={`p-4 rounded-2xl border flex gap-4 items-center transition-colors duration-300 ${
            isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
          }`}>
            <div className={`text-4xl p-3 rounded-xl shadow-sm transition-colors duration-300 ${
              isDark ? 'bg-white/5' : 'bg-white'
            }`}>{selectedItem.emoji}</div>
            <div>
              <h3 className={`text-base font-extrabold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>{selectedItem.name}</h3>
              <p className={`text-sm font-extrabold mt-0.5 transition-colors duration-300 ${isDark ? 'text-sbac-red-light' : 'text-sbac-red'}`}>{selectedItem.price} THB</p>
            </div>
          </div>

          {/* Customisation options */}
          <div className={`space-y-4 p-5 rounded-3xl border shadow-sm transition-colors duration-300 ${
            isDark ? 'bg-white/[0.04] border-white/5' : 'bg-white border-slate-100'
          }`}>
            <h4 className={`text-sm font-extrabold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>🎛️ ปรับแต่งเครื่องดื่ม</h4>

            {/* Temperature */}
            <div className="space-y-2">
              <span className={`text-xs font-bold block transition-colors duration-300 ${isDark ? 'text-slate-300' : 'text-ink-secondary'}`}>ประเภท / Type</span>
              <div className="flex gap-2">
                {['ร้อน', 'เย็น', 'ปั่น'].map(option => (
                  <button
                    key={option}
                    onClick={() => setTemp(option)}
                    className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all ${
                      temp === option 
                        ? 'bg-sbac-blue text-white border-sbac-blue shadow-sm' 
                        : isDark
                        ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                        : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {option === 'ร้อน' ? '🔥 ร้อน' : option === 'เย็น' ? '🧊 เย็น' : '🌪️ ปั่น'}
                  </button>
                ))}
              </div>
            </div>

            {/* Sweetness */}
            <div className="space-y-2 pt-2">
              <span className={`text-xs font-bold block transition-colors duration-300 ${isDark ? 'text-slate-300' : 'text-ink-secondary'}`}>ความหวาน / Sweetness</span>
              <div className="flex gap-2">
                {['หวานน้อย', 'ปกติ', 'หวานมาก'].map(option => (
                  <button
                    key={option}
                    onClick={() => setSweet(option)}
                    className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all ${
                      sweet === option 
                        ? 'bg-sbac-blue text-white border-sbac-blue shadow-sm' 
                        : isDark
                        ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                        : 'bg-slate-50 text-ink-secondary border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2 pt-2">
              <span className={`text-xs font-bold block transition-colors duration-300 ${isDark ? 'text-slate-300' : 'text-ink-secondary'}`}>📝 โน้ตเพิ่มเติม</span>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="เช่น ไม่หวานเลย, ขอนมจืด..."
                className={`w-full rounded-xl p-3 text-xs font-semibold focus:outline-none transition-all duration-200 ${
                  isDark
                    ? 'bg-white/5 border border-white/10 text-white placeholder:text-slate-400 focus:border-sbac-blue-light/50 focus:bg-white/10'
                    : 'bg-slate-50 border border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-white'
                }`}
                rows={2}
              />
            </div>
          </div>

          {/* Place Order CTA */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handlePlaceOrder}
              className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-4 rounded-2xl text-sm transition-all shadow-button flex items-center justify-center gap-2"
            >
              <ShoppingCart size={18} />
              สั่งเครื่องดื่ม ({selectedItem.price} THB)
            </button>
            <button
              onClick={() => setStep(1)}
              className={`w-full border-2 font-extrabold py-3 rounded-2xl text-sm transition-all ${
                isDark
                  ? 'border-white/10 text-slate-300 hover:bg-white/5'
                  : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
              }`}
            >
              ← เลือกเมนูใหม่
            </button>
          </div>
        </div>
      )}

      {/* Payment Sheet Modal */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title="🛒 ชำระเงินค่าเครื่องดื่ม"
      >
        <div className="space-y-6">
          <div className={`p-4 rounded-2xl border flex justify-between items-center text-sm font-semibold transition-colors duration-300 ${
            isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
          }`}>
            <span className={isDark ? 'text-slate-300' : 'text-ink-secondary'}>ยอดชำระทั้งหมด:</span>
            <span className={`text-lg font-extrabold transition-colors duration-300 ${isDark ? 'text-sbac-red-light' : 'text-sbac-red'}`}>{selectedItem?.price} THB</span>
          </div>

          <div className="space-y-3">
            <span className={`text-xs font-extrabold uppercase tracking-wider block transition-colors duration-300 ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>
              เลือกช่องทางการชำระเงิน
            </span>

            {/* Option 1: Card Balance */}
            <button
              onClick={() => executePayment('card')}
              className={`w-full p-4 border rounded-2xl flex justify-between items-center active:scale-98 transition-all duration-200 ${
                isDark 
                  ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-sbac-blue-light/30' 
                  : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-sbac-blue/30'
              }`}
            >
              <div className="flex items-center gap-3 text-left">
                <div className={`p-2 rounded-xl transition-colors ${
                  isDark ? 'bg-blue-900/30 text-sbac-blue-light' : 'bg-blue-50 text-sbac-blue'
                }`}>
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <div className={`text-sm font-extrabold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>หักจากเงินในบัตร</div>
                  <div className={`text-[10px] transition-colors duration-300 ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>ยอดคงเหลือของคุณ: {user?.card_balance} ฿</div>
                </div>
              </div>
              <ChevronRight size={18} className={isDark ? 'text-slate-500' : 'text-ink-light'} />
            </button>

            {/* Option 2: Scan QR */}
            <button
              onClick={() => executePayment('qr')}
              className={`w-full p-4 border rounded-2xl flex justify-between items-center active:scale-98 transition-all duration-200 ${
                isDark 
                  ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-sbac-blue-light/30' 
                  : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-sbac-blue/30'
              }`}
            >
              <div className="flex items-center gap-3 text-left">
                <div className={`p-2 rounded-xl transition-colors ${
                  isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  <Coffee size={20} />
                </div>
                <div>
                  <div className={`text-sm font-extrabold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>สแกน QR Code จ่ายเงิน</div>
                  <div className={`text-[10px] transition-colors duration-300 ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>พร้อมเพย์ / คิวอาร์โค้ด</div>
                </div>
              </div>
              <ChevronRight size={18} className={isDark ? 'text-slate-500' : 'text-ink-light'} />
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
