import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { RefreshCw, History, Coffee, ChevronRight } from 'lucide-react';
import { formatBaht } from '../../utils/identity';
import {
  ORDER_STATUS_TEXT_LONG,
  ORDER_STATUS_COLOR,
  ACTIVE_STATUSES,
  productEmoji,
  optionSummary,
} from '../../utils/orders';

/* หน้านี้แสดงเฉพาะ "ออเดอร์ที่กำลังดำเนินการอยู่" (paid / preparing)
   ส่วนประวัติทั้งหมดแยกไปหน้า /orders/history
   RLS (orders_self_select) กรองให้เห็นเฉพาะออเดอร์ของตัวเองอยู่แล้ว */

const ORDER_SELECT =
  'id, total_satang, status, pickup_code, note, created_at, ' +
  'order_items(qty, unit_price_satang, note, products(name, category), order_item_options(option_name, group_name))';

export default function MyOrdersPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false });

    if (error) console.warn('[orders] โหลดออเดอร์ไม่สำเร็จ:', error);
    else setOrders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchOrders();

    // ติดตามการเปลี่ยนสถานะแบบเรียลไทม์ (บาริสต้ากดเปลี่ยน -> หน้านี้อัปเดตเอง)
    const channel = supabase
      .channel('my-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchOrders]);

  return (
    <div className="space-y-6 xl:max-w-3xl">
      <div className="flex justify-between items-center gap-3">
        <h2
          className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${
            isDark ? 'text-white' : 'text-sbac-navy'
          }`}
        >
          <span className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-accent-amber shrink-0">
            <Coffee size={18} aria-hidden="true" />
          </span>
          สถานะการสั่งซื้อ
        </h2>
        <span
          className={`text-xs font-bold flex items-center gap-1 px-3 py-1 rounded-full shrink-0 transition-colors duration-300 ${
            isDark ? 'bg-emerald-950/30 text-accent-emerald' : 'bg-emerald-50 text-accent-emerald'
          }`}
        >
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Live status
        </span>
      </div>

      <button
        type="button"
        onClick={() => navigate('/orders/history')}
        className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
          isDark
            ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'
            : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
        }`}
      >
        <span
          className={`flex items-center gap-2 text-xs font-extrabold transition-colors duration-300 ${
            isDark ? 'text-white' : 'text-sbac-navy'
          }`}
        >
          <History size={16} className={isDark ? 'text-content-secondary' : 'text-ink-muted'} aria-hidden="true" />
          ดูประวัติการสั่งซื้อทั้งหมด
        </span>
        <ChevronRight size={16} className={isDark ? 'text-content-secondary' : 'text-ink-light'} aria-hidden="true" />
      </button>

      {loading ? (
        <div className="text-center py-10">
          <RefreshCw className="animate-spin text-brand mx-auto mb-2" size={24} />
          <span className={`text-xs font-semibold ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
            กำลังโหลดสถานะออเดอร์...
          </span>
        </div>
      ) : orders.length === 0 ? (
        <div
          className={`rounded-3xl border shadow-sm p-8 text-center space-y-3 transition-colors duration-300 ${
            isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
          }`}
        >
          <div className="text-5xl">☕</div>
          <h3 className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
            ยังไม่มีคำสั่งซื้อที่ดำเนินการอยู่
          </h3>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
            สามารถสั่งเครื่องดื่มแก้วโปรดของคุณได้ง่ายๆ ผ่านแถบสั่งกาแฟด้านล่าง
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className={`rounded-3xl border shadow-sm p-5 space-y-4 transition-colors duration-300 ${
                isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
              }`}
            >
              <div
                className={`flex justify-between items-start border-b pb-3 transition-colors duration-300 ${
                  isDark ? 'border-white/10' : 'border-slate-50'
                }`}
              >
                <div>
                  <span
                    className={`text-[10px] font-bold block ${
                      isDark ? 'text-content-secondary' : 'text-ink-muted'
                    }`}
                  >
                    รหัสรับของ / Pickup Code
                  </span>
                  <span
                    className={`text-3xl font-black tracking-tight mt-1 block tabular-nums ${
                      isDark ? 'text-white' : 'text-sbac-navy'
                    }`}
                  >
                    #{order.pickup_code}
                  </span>
                </div>
                <span
                  className={`text-xs font-extrabold px-3 py-1.5 rounded-full border ${
                    ORDER_STATUS_COLOR[order.status] || ORDER_STATUS_COLOR.paid
                  }`}
                >
                  {ORDER_STATUS_TEXT_LONG[order.status] || order.status}
                </span>
              </div>

              <div className="space-y-3">
                {order.order_items?.map((item, idx) => (
                  <div key={idx} className="flex gap-3 items-center">
                    <div
                      className={`text-2xl p-2 rounded-xl transition-colors duration-300 ${
                        isDark ? 'bg-white/10' : 'bg-slate-50'
                      }`}
                    >
                      {productEmoji(item.products?.name, item.products?.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-extrabold ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                        {item.products?.name || 'สินค้า'}
                      </div>

                      {/* ตัวเลือกที่สั่งไว้ — ชื่อกับราคาเป็น snapshot จากตอนสั่ง
                          ต่อให้ร้านขึ้นราคาทีหลัง ออเดอร์ใบนี้ก็ยังแสดงของเดิม */}
                      {item.order_item_options?.length > 0 && (
                        <div className="text-[10px] font-bold mt-0.5 text-accent-amber leading-snug">
                          {optionSummary(
                            item.order_item_options.map((o) => ({ name: o.option_name }))
                          )}
                        </div>
                      )}

                      {item.note && (
                        <div className="text-[10px] font-semibold mt-0.5 text-brand leading-snug">
                          📝 {item.note}
                        </div>
                      )}

                      <div
                        className={`text-[10px] mt-0.5 ${
                          isDark ? 'text-content-secondary' : 'text-ink-muted'
                        }`}
                      >
                        จำนวน {item.qty} × {formatBaht(item.unit_price_satang)} ฿
                      </div>
                    </div>
                    <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-ink-secondary'}`}>
                      {formatBaht(item.unit_price_satang * item.qty)} ฿
                    </span>
                  </div>
                ))}
              </div>

              <div
                className={`flex justify-between items-center text-xs font-bold pt-2 border-t transition-colors duration-300 ${
                  isDark ? 'text-slate-200 border-white/10' : 'text-ink-secondary border-slate-50'
                }`}
              >
                <span>
                  {new Date(order.created_at).toLocaleString('th-TH', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span
                  className={`text-sm font-extrabold ${
                    isDark ? 'text-accent-amber font-black' : 'text-sbac-red'
                  }`}
                >
                  ยอดรวม: {formatBaht(order.total_satang)} ฿
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
