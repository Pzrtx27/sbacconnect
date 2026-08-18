import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import { LogOut, Clock, Check, RefreshCw, Coffee, X } from 'lucide-react';
import { formatBaht } from '../../utils/identity';
import { ORDER_STATUS_TEXT, productEmoji } from '../../utils/orders';

/* คิวหน้าร้าน — ต้องเรียกผ่านฟังก์ชันใน 07_pos_ops.sql เท่านั้น
   เพราะ RLS ให้เห็นแค่ออเดอร์ของตัวเอง และ revoke สิทธิ์ update บน orders ไว้
   ผู้ใช้ต้องมี role 'pos' หรือ 'cashier' ใน user_roles ถึงจะเรียกได้ */

export default function BaristaDashboard() {
  const { logout, user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const audioRef = useRef(null);
  const knownIdsRef = useRef(new Set());
  const firstLoadRef = useRef(true);

  const fetchQueue = useCallback(async () => {
    const { data, error } = await supabase.rpc('pos_order_queue', { p_limit: 50 });

    if (error) {
      console.warn('[barista] โหลดคิวไม่สำเร็จ:', error);
      setLoading(false);
      return;
    }

    if (!data?.ok) {
      if (data?.error === 'FORBIDDEN') setForbidden(true);
      setLoading(false);
      return;
    }

    const list = data.orders || [];

    // มีออเดอร์ใหม่เข้ามา -> เตือนด้วยเสียง (ข้ามรอบแรกที่เพิ่งเปิดหน้า)
    if (!firstLoadRef.current) {
      const hasNew = list.some((o) => o.status === 'paid' && !knownIdsRef.current.has(o.id));
      if (hasNew) {
        audioRef.current?.play().catch(() => {});
        showToast('มีคำสั่งซื้อกาแฟใหม่เข้ามา!', 'info');
      }
    }
    knownIdsRef.current = new Set(list.map((o) => o.id));
    firstLoadRef.current = false;

    setOrders(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-500.wav');
    fetchQueue();

    // ออเดอร์ใหม่ถูก insert โดยฟังก์ชันฝั่ง DB — ฟัง event แล้วดึงคิวใหม่
    const channel = supabase
      .channel('pos-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchQueue)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchQueue]);

  const updateOrderStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      const { data, error } = await supabase.rpc('set_order_status', {
        p_order_id: orderId,
        p_status: newStatus,
      });

      if (error) {
        showToast(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`, 'error');
        return;
      }
      if (!data?.ok) {
        const msg =
          data?.error === 'FORBIDDEN'
            ? 'บัญชีนี้ไม่มีสิทธิ์จัดการคิว'
            : data?.error === 'INVALID_TRANSITION'
            ? `เปลี่ยนสถานะจาก "${ORDER_STATUS_TEXT[data.from]}" ไป "${ORDER_STATUS_TEXT[data.to]}" ไม่ได้`
            : `อัปเดตไม่สำเร็จ (${data?.error})`;
        showToast(msg, 'error');
        return;
      }

      showToast(`อัปเดตสถานะเป็น "${ORDER_STATUS_TEXT[newStatus]}" แล้ว`, 'success');
      await fetchQueue();
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="bg-neutral-950 border-b border-neutral-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-accent-amber rounded-2xl">
            <Coffee size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">SBAC COFFEE BARISTA</h1>
            <span className="text-[10px] text-content-secondary font-extrabold uppercase tracking-widest mt-1.5 block">
              ● Live Queue Management
            </span>
          </div>
        </div>

        <button
          onClick={logout}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 text-accent-rose rounded-xl transition-all"
          title="ออกจากระบบ"
        >
          <LogOut size={20} />
        </button>
      </header>

      <main className="flex-1 p-6 max-w-lg mx-auto w-full space-y-4 overflow-y-auto">
        <h2 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider block">
          📋 รายการคิวเครื่องดื่มทั้งหมด
        </h2>

        {forbidden ? (
          <div className="bg-rose-500/5 border border-rose-500/25 rounded-3xl p-8 text-center space-y-3">
            <span className="text-4xl block">🔒</span>
            <h3 className="text-sm font-extrabold text-accent-rose">บัญชีนี้ไม่มีสิทธิ์ดูคิวหน้าร้าน</h3>
            <p className="text-xs text-content-muted leading-relaxed">
              ต้องมี role <code className="text-accent-amber">pos</code> หรือ{' '}
              <code className="text-accent-amber">cashier</code> ในตาราง user_roles
              <br />
              บัญชีปัจจุบัน: {user?.email || '—'}
            </p>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <RefreshCw className="animate-spin text-accent-amber mx-auto mb-2" size={28} />
            <span className="text-xs font-semibold text-content-secondary">กำลังเชื่อมต่อคิวเรียลไทม์...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-10 text-center space-y-3">
            <span className="text-4xl block">😴</span>
            <h3 className="text-sm font-extrabold text-slate-200">ยังไม่มีคิวออเดอร์ในขณะนี้</h3>
            <p className="text-xs text-content-muted leading-normal">
              เมื่อนักเรียนสั่งซื้อผ่านแอป ออเดอร์จะแสดงขึ้นที่นี่พร้อมเสียงเตือนทันที
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const busy = updatingId === order.id;
              return (
                <div
                  key={order.id}
                  className={`border rounded-3xl p-5 space-y-4 transition-all ${
                    order.status === 'paid'
                      ? 'bg-amber-500/5 border-amber-500/25 ring-1 ring-amber-500/10'
                      : order.status === 'preparing'
                      ? 'bg-blue-500/5 border-blue-500/25'
                      : 'bg-neutral-900 border-neutral-800 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                    <div>
                      <span className="text-[10px] text-content-secondary font-bold block">
                        นักเรียน: {order.student_name} ({order.student_code || '—'})
                      </span>
                      <span className="text-2xl font-black text-white tracking-tight mt-1 block tabular-nums">
                        รหัสรับของ #{order.pickup_code}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider ${
                        order.status === 'paid'
                          ? 'bg-amber-500/10 text-accent-amber border border-amber-500/20'
                          : order.status === 'preparing'
                          ? 'bg-blue-500/10 text-brand border border-blue-500/20'
                          : order.status === 'done'
                          ? 'bg-emerald-500/10 text-accent-emerald border border-emerald-500/20'
                          : 'bg-slate-800 text-content-muted'
                      }`}
                    >
                      {ORDER_STATUS_TEXT[order.status] || order.status}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {order.items?.map((item, idx) => (
                      <div key={idx} className="flex gap-3 items-center">
                        <span className="text-2xl">{productEmoji(item.name, item.category)}</span>
                        <div className="flex-1">
                          <div className="text-sm font-extrabold text-white">
                            {item.name} × {item.qty}
                          </div>
                          <div className="text-[10px] text-content-muted mt-0.5">
                            {formatBaht(item.unit_price_satang)} ฿ / หน่วย
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between text-xs font-bold text-slate-300 pt-2 border-t border-neutral-800">
                    <span>
                      {new Date(order.created_at).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-accent-amber">ยอดรวม {formatBaht(order.total_satang)} ฿</span>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-neutral-800">
                    {order.status === 'paid' && (
                      <>
                        <button
                          onClick={() => updateOrderStatus(order.id, 'preparing')}
                          disabled={busy}
                          className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <Clock size={14} />
                          เริ่มชงเครื่องดื่ม
                        </button>
                        <button
                          onClick={() => updateOrderStatus(order.id, 'cancelled')}
                          disabled={busy}
                          className="px-3 bg-neutral-800 hover:bg-neutral-700 text-accent-rose font-black py-2.5 rounded-xl text-xs transition-all disabled:opacity-50"
                          title="ยกเลิกออเดอร์"
                        >
                          <X size={14} />
                        </button>
                      </>
                    )}

                    {order.status === 'preparing' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'done')}
                        disabled={busy}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Check size={14} />
                        เสร็จแล้ว / ส่งมอบ
                      </button>
                    )}

                    {(order.status === 'done' || order.status === 'cancelled') && (
                      <span className="text-xs font-bold text-content-muted text-center w-full py-1.5">
                        {order.status === 'done' ? 'ออเดอร์นี้เสร็จสิ้นแล้ว' : 'ออเดอร์นี้ถูกยกเลิก'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
