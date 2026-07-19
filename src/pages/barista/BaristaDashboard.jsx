import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { showToast } from '../../components/ui/Toast';
import { Coffee, LogOut, Clock, Check, RefreshCw } from 'lucide-react';

export default function BaristaDashboard() {
  const { logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Audio notification ref
  const audioRef = useRef(null);

  useEffect(() => {
    // Audio element setup
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-500.wav');

    const q = query(
      collection(db, 'coffee_orders'),
      orderBy('created_at', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      let hasNewOrder = false;
      const fetched = snapshot.docs.map((doc, idx) => {
        const data = doc.data();
        // Check if there's a new pending order that wasn't in our previous list
        if (data.status === 'pending' && loading === false) {
          hasNewOrder = true;
        }
        return {
          id: doc.id,
          ...data
        };
      });

      // Play sound notification if new order arrived
      if (hasNewOrder && audioRef.current) {
        audioRef.current.play().catch(e => console.log('Audio play blocked:', e));
        showToast('มีคำสั่งซื้อกาแฟใหม่เข้ามา!', 'info');
      }

      setOrders(fetched);
      setLoading(false);
    }, (err) => {
      console.error('Barista snapshot error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [loading]);

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const orderRef = doc(db, 'coffee_orders', orderId);
      await updateDoc(orderRef, { status: newStatus });
      showToast(`อัปเดตสถานะออเดอร์เป็น [${newStatus}] สำเร็จ`, 'success');
    } catch (err) {
      console.error('Failed updating status:', err);
      showToast('ไม่สามารถอัปเดตสถานะได้', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-2xl">
            <Coffee size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">SBAC COFFEE BARISTA</h1>
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest mt-1.5 block">
              ● Live Queue Management
            </span>
          </div>
        </div>

        <button 
          onClick={logout}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-rose-500 hover:text-rose-400 rounded-xl transition-all"
          title="ออกจากระบบ"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Main Order Queue Content */}
      <main className="flex-1 p-6 max-w-lg mx-auto w-full space-y-4 overflow-y-auto">
        <h2 className="text-sm font-extrabold text-slate-400 uppercase tracking-wider block">
          📋 รายการคิวเครื่องดื่มทั้งหมด
        </h2>

        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="animate-spin text-amber-500 mx-auto mb-2" size={28} />
            <span className="text-xs font-semibold text-slate-400">กำลังเชื่อมต่อคิวเรียลไทม์...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
            <span className="text-4xl block">😴</span>
            <h3 className="text-sm font-extrabold text-slate-300">ยังไม่มีคิวออเดอร์ในขณะนี้</h3>
            <p className="text-xs text-slate-500 leading-normal">
              เมื่อนักเรียนสั่งซื้อผ่านแอป ออเดอร์จะแสดงขึ้นที่นี่พร้อมเสียงเตือนทันที
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div 
                key={order.id}
                className={`border rounded-3xl p-5 space-y-4 transition-all ${
                  order.status === 'pending' 
                    ? 'bg-amber-500/5 border-amber-500/25 ring-1 ring-amber-500/10' 
                    : order.status === 'preparing'
                    ? 'bg-blue-500/5 border-blue-500/25'
                    : order.status === 'ready'
                    ? 'bg-emerald-500/5 border-emerald-500/25'
                    : 'bg-slate-950 border-slate-800 opacity-60'
                }`}
              >
                {/* Order Top Details */}
                <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">นักเรียน: {order.student_name} ({order.student_id})</span>
                    <span className="text-2xl font-black text-white tracking-tight mt-1 block">
                      คิว #{order.queue_number || '00'}
                    </span>
                  </div>
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider ${
                    order.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    order.status === 'preparing' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    order.status === 'ready' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {order.status === 'pending' ? 'รอรับออเดอร์' :
                     order.status === 'preparing' ? 'กำลังชง' :
                     order.status === 'ready' ? 'รอรับของ' : 'เสร็จสิ้น'}
                  </span>
                </div>

                {/* Items */}
                <div className="space-y-2.5">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="flex gap-3 items-center">
                      <span className="text-2xl">{item.emoji || '☕'}</span>
                      <div className="flex-1">
                        <div className="text-sm font-extrabold text-white">{item.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.temp} • หวาน {item.sweet} {item.note ? `• โน้ต: ${item.note}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status Update Actions */}
                <div className="flex gap-2 pt-2 border-t border-slate-800">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'preparing')}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <Clock size={14} />
                      เริ่มชงเครื่องดื่ม
                    </button>
                  )}
                  
                  {order.status === 'preparing' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'ready')}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-black py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <Coffee size={14} />
                      ชงเสร็จแล้ว
                    </button>
                  )}

                  {order.status === 'ready' && (
                    <button
                      onClick={() => updateOrderStatus(order.id, 'picked_up')}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <Check size={14} />
                      รับของแล้ว
                    </button>
                  )}

                  {order.status === 'picked_up' && (
                    <span className="text-xs font-bold text-slate-500 text-center w-full py-1.5">
                      ออเดอร์นี้เสร็จสิ้นอย่างสมบูรณ์แล้ว
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
