import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { ArrowLeft, RefreshCw, Receipt } from 'lucide-react';
import { formatBaht } from '../../utils/identity';
import { ORDER_STATUS_TEXT, ORDER_STATUS_COLOR, productEmoji, optionSummary } from '../../utils/orders';

/* ประวัติการสั่งซื้อทั้งหมด แยกจากหน้าสถานะปัจจุบัน (/orders)
   จัดเป็นลิสต์แถวเดียวต่อออเดอร์ แบบแอปช้อปปิ้ง (Shopee / LINE MAN)
   RLS กรองให้เห็นเฉพาะออเดอร์ของตัวเองอยู่แล้ว */

// ต้องดึง order_item_options ด้วย ไม่งั้นประวัติจะขึ้นแค่ "ลาเต้" เฉย ๆ
// แยกไม่ออกว่าแก้วนั้นร้อนหรือเย็น หวานเท่าไหร่ ใส่ท็อปปิ้งอะไร
// (หน้า /orders ดึงครบอยู่แล้ว หน้านี้ตกไปตอนย้ายมาใช้ตัวเลือกใน 11_menu_options.sql)
const ORDER_SELECT =
  'id, total_satang, status, pickup_code, created_at, ' +
  'order_items(qty, unit_price_satang, products(name, category), order_item_options(option_name, group_name))';

export default function OrderHistoryPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      // เหมือนหน้า /orders — "ดึงไม่ได้" กับ "ไม่เคยสั่ง" ต้องไม่หน้าตาเหมือนกัน
      console.warn('[history] โหลดประวัติไม่สำเร็จ:', error);
      setLoadFailed(true);
      setLoading(false);
      return;
    }

    setLoadFailed(false);
    setOrders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchHistory();
  }, [user, fetchHistory]);

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';

  return (
    <div className="space-y-5 xl:max-w-3xl">
      <button
        type="button"
        onClick={() => navigate('/orders')}
        className={`flex items-center gap-1.5 text-xs font-extrabold transition-colors ${
          isDark ? 'text-content-secondary hover:text-white' : 'text-ink-muted hover:text-sbac-navy'
        }`}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        กลับไปหน้าสถานะการสั่งซื้อ
      </button>

      <h2 className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${textPrimary}`}>
        <span className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-accent-amber shrink-0">
          <Receipt size={18} aria-hidden="true" />
        </span>
        ประวัติการสั่งซื้อ
      </h2>

      {loading ? (
        <div className="text-center py-10">
          <RefreshCw className="animate-spin text-brand mx-auto mb-2" size={24} />
          <span className={`text-xs font-semibold ${textMuted}`}>กำลังโหลดประวัติออเดอร์...</span>
        </div>
      ) : loadFailed ? (
        <div
          role="alert"
          className={`rounded-3xl border p-8 text-center space-y-3 transition-colors duration-300 ${
            isDark ? 'bg-rose-950/30 border-rose-900/40' : 'bg-rose-50 border-rose-200'
          }`}
        >
          <h3 className="text-sm font-extrabold text-accent-rose">โหลดประวัติการสั่งซื้อไม่สำเร็จ</h3>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
            ประวัติของคุณยังอยู่ในระบบครบถ้วน แค่หน้านี้ดึงมาแสดงไม่ได้ชั่วคราว
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchHistory();
            }}
            className="px-5 py-2.5 rounded-2xl text-xs font-extrabold bg-sbac-blue hover:bg-sbac-navy text-white transition-colors"
          >
            ลองโหลดใหม่
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div
          className={`rounded-3xl border shadow-sm p-8 text-center space-y-3 transition-colors duration-300 ${
            isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
          }`}
        >
          <div className="text-5xl">🧾</div>
          <h3 className={`text-sm font-extrabold ${textPrimary}`}>ยังไม่มีประวัติการสั่งซื้อ</h3>
          <p className={`text-xs leading-relaxed ${textMuted}`}>
            เมื่อคุณสั่งเครื่องดื่ม ประวัติคำสั่งซื้อจะแสดงที่นี่
          </p>
        </div>
      ) : (
        <div
          className={`rounded-3xl border shadow-sm divide-y transition-colors duration-300 ${
            isDark
              ? 'bg-white/[0.06] border-white/10 divide-white/10'
              : 'bg-surface-card border-slate-100 divide-slate-100'
          }`}
        >
          {orders.map((order) => {
            const items = order.order_items || [];
            const first = items[0];
            const extraCount = items.length - 1;
            return (
              <div key={order.id} className="flex items-center gap-3 p-4">
                <div
                  className={`text-xl w-11 h-11 shrink-0 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                    isDark ? 'bg-white/10' : 'bg-slate-50'
                  }`}
                >
                  {productEmoji(first?.products?.name, first?.products?.category)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-extrabold truncate transition-colors duration-300 ${textPrimary}`}>
                    {first?.products?.name || 'เครื่องดื่ม'}
                    {first?.qty > 1 ? ` ×${first.qty}` : ''}
                    {extraCount > 0 ? ` และอีก ${extraCount} รายการ` : ''}
                  </div>
                  {first?.order_item_options?.length > 0 && (
                    <div className="text-[10px] font-bold mt-0.5 text-accent-amber truncate">
                      {optionSummary(first.order_item_options.map((o) => ({ name: o.option_name })))}
                    </div>
                  )}
                  <div className={`text-[10px] mt-0.5 transition-colors duration-300 ${textMuted}`}>
                    {new Date(order.created_at).toLocaleString('th-TH', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {order.pickup_code ? ` • รหัสรับของ #${order.pickup_code}` : ''}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div
                    className={`text-sm font-extrabold transition-colors duration-300 ${
                      isDark ? 'text-accent-amber' : 'text-sbac-red'
                    }`}
                  >
                    {formatBaht(order.total_satang)} ฿
                  </div>
                  <span
                    className={`inline-block text-[9px] font-extrabold px-2 py-0.5 rounded-full mt-1 border ${
                      ORDER_STATUS_COLOR[order.status] || ORDER_STATUS_COLOR.paid
                    }`}
                  >
                    {ORDER_STATUS_TEXT[order.status] || order.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
