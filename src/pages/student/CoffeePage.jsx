import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import { ShoppingCart, ChevronRight, History, Coffee, Minus, Plus, RefreshCw } from 'lucide-react';
import { formatBaht } from '../../utils/identity';
import { productEmoji, newIdempotencyKey, placeOrderErrorText } from '../../utils/orders';

/* การสั่งซื้อทั้งหมดผ่านฟังก์ชัน place_order() ฝั่ง DB เท่านั้น
   - ราคาคำนวณฝั่งเซิร์ฟเวอร์ ไม่เชื่อราคาที่หน้าเว็บส่งไป
   - หักเงินกับสร้างออเดอร์อยู่ใน transaction เดียวกัน
   - idempotency_key กันตัดเงินซ้ำถ้าเน็ตสะดุดแล้วกดส่งใหม่ */

export default function CoffeePage() {
  const { user, updateBalance } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [step, setStep] = useState(1); // 1: เลือกเมนู, 2: ยืนยัน
  const [selectedItem, setSelectedItem] = useState(null);
  const [qty, setQty] = useState(1);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      // RLS อนุญาตให้ผู้ล็อกอินอ่าน products ที่ is_active เท่านั้น
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price_satang, category, stock')
        .eq('is_active', true)
        .order('id');

      if (error) {
        console.error('[coffee] โหลดเมนูไม่สำเร็จ:', error);
        showToast('โหลดรายการเครื่องดื่มไม่สำเร็จ', 'error');
      } else {
        setProducts(data || []);
      }
      setLoadingProducts(false);
    })();
  }, []);

  const selectItem = (item) => {
    setSelectedItem(item);
    setQty(1);
    setStep(2);
  };

  const totalSatang = selectedItem ? selectedItem.price_satang * qty : 0;

  const executePayment = async () => {
    if (!selectedItem || submitting) return;

    // รหัสนักเรียนของตัวเอง = ค่าใน user_credentials (kind='code')
    const credential = user?.id;
    if (!credential) {
      showToast('ไม่พบรหัสประจำตัวของคุณ กรุณาเข้าสู่ระบบใหม่', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('place_order', {
        p_credential: String(credential),
        p_items: [{ id: selectedItem.id, qty }],
        p_idem: newIdempotencyKey('coffee'),
      });

      if (error) {
        console.error('[coffee] place_order error:', error);
        showToast(`สั่งซื้อไม่สำเร็จ: ${error.message}`, 'error');
        return;
      }

      if (!data?.ok) {
        showToast(placeOrderErrorText(data?.error, data), 'error');
        return;
      }

      await updateBalance(); // ดึงยอดจริงจาก DB มาแสดงใหม่
      setPaymentModalOpen(false);
      showToast(
        data.duplicate
          ? 'รายการนี้ถูกบันทึกไว้แล้ว ไม่ถูกตัดเงินซ้ำ'
          : `สั่งซื้อสำเร็จ! รหัสรับของ ${data.pickup_code}`,
        'success'
      );
      navigate('/orders');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className={`flex justify-between items-center p-4 rounded-2xl border transition-colors duration-300 ${
          isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
        }`}
      >
        <h2
          className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${
            isDark ? 'text-white' : 'text-sbac-navy'
          }`}
        >
          <span className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-accent-amber shrink-0">
            <Coffee size={18} aria-hidden="true" />
          </span>
          SBAC Coffee
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/orders/history')}
            className={`flex items-center gap-1 text-xs font-extrabold px-3 py-1.5 rounded-xl border active:scale-95 transition-all ${
              isDark
                ? 'bg-amber-500/20 text-accent-amber border-amber-500/30 hover:bg-amber-500/30'
                : 'bg-amber-500/10 text-accent-amber border-amber-500/20 hover:bg-amber-500/20'
            }`}
          >
            <History size={14} />
            ประวัติการสั่งซื้อ
          </button>
          <span
            className={`text-xs font-bold transition-colors duration-300 ${
              isDark ? 'text-content-secondary' : 'text-ink-muted'
            }`}
          >
            บัตร:{' '}
            <span
              className={`font-extrabold transition-colors duration-300 ${
                isDark ? 'text-accent-amber' : 'text-sbac-navy'
              }`}
            >
              {formatBaht(user?.balance_satang || 0)} ฿
            </span>
          </span>
        </div>
      </div>

      {/* STEP 1 — เลือกเมนู */}
      {step === 1 && (
        <div className="space-y-4 animate-slide-up">
          <span
            className={`text-sm font-extrabold block transition-colors duration-300 ${
              isDark ? 'text-white' : 'text-sbac-navy'
            }`}
          >
            ☕ เลือกเมนูเครื่องดื่ม
          </span>

          {loadingProducts ? (
            <div className="text-center py-10">
              <RefreshCw className="animate-spin text-brand mx-auto mb-2" size={24} />
              <span className={`text-xs font-semibold ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
                กำลังโหลดเมนู...
              </span>
            </div>
          ) : products.length === 0 ? (
            <div
              className={`rounded-3xl border shadow-sm p-8 text-center space-y-2 ${
                isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white border-slate-100'
              }`}
            >
              <div className="text-4xl">🗒️</div>
              <h3 className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                ยังไม่มีรายการเครื่องดื่ม
              </h3>
              <p className={`text-xs ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
                กรุณาติดต่อผู้ดูแลระบบให้เพิ่มสินค้าในตาราง products
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {products.map((item) => (
                <GlassCard key={item.id} onClick={() => selectItem(item)}>
                  <div className="text-center py-4 space-y-2">
                    <div
                      className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm transition-colors ${
                        isDark ? 'bg-white/10' : 'bg-slate-50'
                      }`}
                    >
                      {productEmoji(item.name, item.category)}
                    </div>
                    <h3
                      className={`text-sm font-extrabold transition-colors duration-300 ${
                        isDark ? 'text-white' : 'text-sbac-navy'
                      }`}
                    >
                      {item.name}
                    </h3>
                    {item.category && (
                      <p
                        className={`text-[10px] transition-colors duration-300 ${
                          isDark ? 'text-content-secondary' : 'text-ink-muted'
                        }`}
                      >
                        {item.category}
                      </p>
                    )}
                    <div
                      className={`text-sm font-extrabold pt-1 transition-colors duration-300 ${
                        isDark ? 'text-accent-amber font-black' : 'text-sbac-red'
                      }`}
                    >
                      {formatBaht(item.price_satang)} ฿
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — ยืนยันจำนวน */}
      {step === 2 && selectedItem && (
        <div className="space-y-6 animate-slide-up">
          <div
            className={`p-4 rounded-2xl border flex gap-4 items-center transition-colors duration-300 ${
              isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'
            }`}
          >
            <div
              className={`text-4xl p-3 rounded-xl shadow-sm transition-colors duration-300 ${
                isDark ? 'bg-white/5' : 'bg-white'
              }`}
            >
              {productEmoji(selectedItem.name, selectedItem.category)}
            </div>
            <div>
              <h3
                className={`text-base font-extrabold transition-colors duration-300 ${
                  isDark ? 'text-white' : 'text-sbac-navy'
                }`}
              >
                {selectedItem.name}
              </h3>
              <p
                className={`text-sm font-extrabold mt-0.5 transition-colors duration-300 ${
                  isDark ? 'text-sbac-red-light' : 'text-sbac-red'
                }`}
              >
                {formatBaht(selectedItem.price_satang)} ฿ / แก้ว
              </p>
            </div>
          </div>

          {/* จำนวน */}
          <div
            className={`p-5 rounded-3xl border shadow-sm space-y-4 transition-colors duration-300 ${
              isDark ? 'bg-white/[0.04] border-white/5' : 'bg-white border-slate-100'
            }`}
          >
            <h4
              className={`text-sm font-extrabold transition-colors duration-300 ${
                isDark ? 'text-white' : 'text-sbac-navy'
              }`}
            >
              จำนวน
            </h4>
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="ลดจำนวน"
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                  isDark
                    ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                    : 'bg-slate-50 border-slate-200 text-sbac-navy hover:bg-slate-100'
                }`}
              >
                <Minus size={18} />
              </button>
              <span className={`text-3xl font-black tabular-nums ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                {qty}
              </span>
              <button
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                disabled={qty >= 20}
                aria-label="เพิ่มจำนวน"
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                  isDark
                    ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                    : 'bg-slate-50 border-slate-200 text-sbac-navy hover:bg-slate-100'
                }`}
              >
                <Plus size={18} />
              </button>
            </div>

            <div
              className={`flex justify-between items-center pt-3 border-t text-sm font-bold ${
                isDark ? 'border-white/10 text-slate-200' : 'border-slate-100 text-ink-secondary'
              }`}
            >
              <span>ยอดรวม</span>
              <span
                className={`text-lg font-extrabold ${
                  isDark ? 'text-accent-amber font-black' : 'text-sbac-red'
                }`}
              >
                {formatBaht(totalSatang)} ฿
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => setPaymentModalOpen(true)}
              className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-4 rounded-2xl text-sm transition-all shadow-button flex items-center justify-center gap-2"
            >
              <ShoppingCart size={18} />
              สั่งเครื่องดื่ม ({formatBaht(totalSatang)} ฿)
            </button>
            <button
              onClick={() => setStep(1)}
              className={`w-full border-2 font-extrabold py-3 rounded-2xl text-sm transition-all ${
                isDark
                  ? 'border-white/20 text-slate-200 hover:bg-white/10'
                  : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
              }`}
            >
              ← เลือกเมนูใหม่
            </button>
          </div>
        </div>
      )}

      {/* ยืนยันการชำระเงิน */}
      <Modal
        isOpen={paymentModalOpen}
        onClose={() => !submitting && setPaymentModalOpen(false)}
        title="🛒 ยืนยันการชำระเงิน"
      >
        <div className="space-y-6">
          <div
            className={`p-4 rounded-2xl border space-y-2 text-sm font-semibold transition-colors duration-300 ${
              isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
            }`}
          >
            <div className="flex justify-between">
              <span className={isDark ? 'text-content-secondary' : 'text-ink-secondary'}>รายการ</span>
              <span className={isDark ? 'text-white' : 'text-sbac-navy'}>
                {selectedItem?.name} × {qty}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={isDark ? 'text-content-secondary' : 'text-ink-secondary'}>ยอดชำระ</span>
              <span
                className={`text-lg font-extrabold ${
                  isDark ? 'text-accent-amber font-black' : 'text-sbac-red'
                }`}
              >
                {formatBaht(totalSatang)} ฿
              </span>
            </div>
            <div className={`flex justify-between border-t pt-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <span className={isDark ? 'text-content-secondary' : 'text-ink-secondary'}>ยอดคงเหลือหลังหัก</span>
              <span className={isDark ? 'text-white' : 'text-sbac-navy'}>
                {formatBaht((user?.balance_satang || 0) - totalSatang)} ฿
              </span>
            </div>
          </div>

          <button
            onClick={executePayment}
            disabled={submitting}
            className={`w-full p-4 border rounded-2xl flex justify-between items-center transition-all duration-200 disabled:opacity-60 ${
              isDark
                ? 'bg-white/[0.06] border-white/15 hover:bg-white/10'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3 text-left">
              <div className={`p-2 rounded-xl ${isDark ? 'bg-blue-900/40 text-brand' : 'bg-blue-50 text-brand'}`}>
                <ShoppingCart size={20} />
              </div>
              <div>
                <div className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                  {submitting ? 'กำลังทำรายการ...' : 'หักจากเงินในบัตร'}
                </div>
                <div className={`text-[10px] ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
                  ยอดคงเหลือ: {formatBaht(user?.balance_satang || 0)} ฿
                </div>
              </div>
            </div>
            <ChevronRight size={18} className={isDark ? 'text-content-secondary' : 'text-ink-light'} />
          </button>

          <p className={`text-[10px] leading-relaxed ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
            ระบบคำนวณราคาจากฝั่งเซิร์ฟเวอร์ และมีระบบกันตัดเงินซ้ำ
            หากกดค้างหรือเน็ตสะดุด จะไม่ถูกหักเงินสองรอบ
          </p>
        </div>
      </Modal>
    </div>
  );
}
