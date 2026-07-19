import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Coffee, RefreshCw } from 'lucide-react';

const STATUS_TEXT = {
  pending: 'รอรับออเดอร์ ⏳',
  preparing: 'กำลังชงเครื่องดื่ม ☕',
  ready: 'เครื่องดื่มเสร็จแล้ว! 🔔',
  picked_up: 'รับเครื่องดื่มแล้ว ✓'
};

const STATUS_COLOR = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
  preparing: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30',
  picked_up: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
};

export default function MyOrdersPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Listen to real-time updates for user's coffee orders
    const q = query(
      collection(db, 'coffee_orders'),
      where('student_id', '==', user.id),
      orderBy('created_at', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrders(fetched);
      setLoading(false);
    }, (err) => {
      console.warn('Real-time orders listener failed:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className={`text-xl font-extrabold flex items-center gap-2 transition-colors duration-300 ${
          isDark ? 'text-white' : 'text-sbac-navy'
        }`}>
          <Coffee size={24} className="text-sbac-blue-light" />
          สถานะคำสั่งซื้อ
        </h2>
        <span className={`text-xs font-bold flex items-center gap-1 px-3 py-1 rounded-full transition-colors duration-300 ${
          isDark ? 'bg-emerald-950/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
        }`}>
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Live updates
        </span>
      </div>

      {loading ? (
        <div className="text-center py-10">
          <RefreshCw className="animate-spin text-sbac-blue mx-auto mb-2" size={24} />
          <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>กำลังโหลดสถานะออเดอร์...</span>
        </div>
      ) : orders.length === 0 ? (
        <div className={`rounded-3xl border shadow-sm p-8 text-center space-y-3 transition-colors duration-300 ${
          isDark ? 'bg-white/[0.04] border-white/5' : 'bg-white border-slate-100'
        }`}>
          <div className="text-5xl">☕</div>
          <h3 className={`text-sm font-extrabold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>ยังไม่มีคำสั่งซื้อที่ดำเนินการอยู่</h3>
          <p className={`text-xs leading-relaxed transition-colors duration-300 ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>
            สามารถสั่งเครื่องดื่มแก้วโปรดของคุณได้ง่ายๆ ผ่านแทบสั่งกาแฟด้านล่าง
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div 
              key={order.id}
              className={`rounded-3xl border shadow-sm p-5 space-y-4 transition-colors duration-300 ${
                isDark ? 'bg-white/[0.04] border-white/5' : 'bg-white border-slate-100'
              }`}
            >
              {/* Order status header */}
              <div className={`flex justify-between items-start border-b pb-3 transition-colors duration-300 ${
                isDark ? 'border-white/5' : 'border-slate-50'
              }`}>
                <div>
                  <span className={`text-[10px] font-bold block transition-colors duration-300 ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>หมายเลขคิว / Queue No.</span>
                  <span className={`text-3xl font-black tracking-tight mt-1 block transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>
                    #{order.queue_number || '00'}
                  </span>
                </div>
                <span className={`text-xs font-extrabold px-3 py-1.5 rounded-full border ${STATUS_COLOR[order.status] || STATUS_COLOR.pending}`}>
                  {STATUS_TEXT[order.status] || STATUS_TEXT.pending}
                </span>
              </div>

              {/* Order items detail */}
              <div className="space-y-3">
                {order.items?.map((item, idx) => (
                  <div key={idx} className="flex gap-3 items-center">
                    <div className={`text-2xl p-2 rounded-xl transition-colors duration-300 ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>{item.emoji || '☕'}</div>
                    <div className="flex-1">
                      <div className={`text-sm font-extrabold transition-colors duration-300 ${isDark ? 'text-white' : 'text-sbac-navy'}`}>{item.name}</div>
                      <div className={`text-[10px] mt-0.5 transition-colors duration-300 ${isDark ? 'text-slate-400' : 'text-ink-muted'}`}>
                        {item.temp} • หวาน {item.sweet} {item.note ? `• โน้ต: ${item.note}` : ''}
                      </div>
                    </div>
                    <span className={`text-xs font-bold transition-colors duration-300 ${isDark ? 'text-slate-300' : 'text-ink-secondary'}`}>{item.price} ฿</span>
                  </div>
                ))}
              </div>

              {/* Total & payment details */}
              <div className={`flex justify-between items-center text-xs font-bold pt-2 border-t transition-colors duration-300 ${
                isDark ? 'text-slate-300 border-white/5' : 'text-ink-secondary border-slate-50'
              }`}>
                <span>วิธีชำระ: {order.payment_method === 'card' ? '💳 บัตรนักเรียน' : '📱 สแกน QR'}</span>
                <span className={`text-sm font-extrabold transition-colors duration-300 ${isDark ? 'text-sbac-red-light' : 'text-sbac-red'}`}>ยอดรวม: {order.total_thb} ฿</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
