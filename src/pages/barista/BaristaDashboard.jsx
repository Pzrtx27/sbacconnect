import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { LogOut, Clock, Check, RefreshCw, Coffee, X, Archive } from 'lucide-react';
import { formatBaht } from '../../utils/identity';
import { ORDER_STATUS_TEXT, productEmoji, optionSummary, bulkErrorText } from '../../utils/orders';
import { useRealtimeTable, useSerialCallback } from '../../hooks/useRealtimeTable';
import { playChime, unlockAudio } from '../../utils/sound';

/* คิวหน้าร้าน — ต้องเรียกผ่านฟังก์ชันใน 07_pos_ops.sql เท่านั้น
   เพราะ RLS ให้เห็นแค่ออเดอร์ของตัวเอง และ revoke สิทธิ์ update บน orders ไว้
   ผู้ใช้ต้องมี role 'pos' หรือ 'cashier' ใน user_roles ถึงจะเรียกได้ */

export default function BaristaDashboard() {
  const { logout, user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  /* หน้านี้ต่างจากหน้าอื่นในแอป: มันคือจอที่ตั้งอยู่บนเคาน์เตอร์
     คนใช้คือบาริสต้าคนเดียว มองข้ามเคาน์เตอร์ตอนมือไม่ว่าง
     สิ่งที่ต้องเห็นคือ "ยังเหลืออะไรต้องชง" ไม่ใช่ประวัติทั้งวัน
     ของเสร็จแล้วจึงย้ายไปอีกแท็บ ไม่ปนอยู่ในคิว */
  const [tab, setTab] = useState('active');

  /* เลือกหลายใบแล้วจัดการทีเดียว

     ช่วงพีคคิวยาวเป็นสิบใบ การกดปิดทีละใบทำให้บาริสต้าต้องหยุดชงมานั่งกด
     ที่ทำได้ต่างกันตามแท็บ:
       แท็บรอทำ    -> ยกเลิกที่เลือก (pos_bulk_set_status)
       แท็บเสร็จแล้ว -> เก็บเข้าคลัง (pos_archive_orders)

     "เก็บเข้าคลัง" ไม่ใช่ "ลบ" — แค่ประทับ archived_at แล้วคิวกรองทิ้ง
     ของเดิมเป็นการลบแถวจริง ซึ่งทำให้ประวัติการสั่งซื้อของนักเรียนหายไปด้วย
     เพราะหน้าประวัติอ่านจากตาราง orders ตัวเดียวกัน (ดู 17_archive_orders.sql) */
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const knownIdsRef = useRef(new Set());
  const firstLoadRef = useRef(true);

  const fetchQueue = useSerialCallback(async () => {
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
        playChime('new');
        showToast('มีคำสั่งซื้อกาแฟใหม่เข้ามา!', 'info');
      }
    }
    knownIdsRef.current = new Set(list.map((o) => o.id));
    firstLoadRef.current = false;

    setOrders(list);
    setLoading(false);
  });

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  /* ออเดอร์ใหม่ถูก insert โดยฟังก์ชันฝั่ง DB — ฟัง event แล้วดึงคิวใหม่
     ถ้าเรียลไทม์ต่อไม่ติด (เช่นยังไม่ได้รัน 18_realtime_orders.sql) hook จะสลับไปถามถี่ ๆ ให้เอง
     จอเคาน์เตอร์จึงไม่มีวันค้างจนต้องกดรีเฟรชมือ */
  const live = useRealtimeTable({ table: 'orders', onChange: fetchQueue });

  /* เบราว์เซอร์ห้ามเล่นเสียงจนกว่าผู้ใช้จะแตะหน้าจอสักครั้ง
     จอเคาน์เตอร์เปิดทิ้งไว้ทั้งวันโดยไม่มีใครแตะ = ออเดอร์แรกจะเงียบ
     ดักการแตะครั้งแรก (ครั้งเดียว) เพื่อปลดล็อกไว้ล่วงหน้า */
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

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

  // คิวที่ต้องทำเรียงเก่าไปใหม่ ใครสั่งก่อนได้ก่อน — ตรงข้ามกับหน้าประวัติที่เรียงใหม่ไปเก่า
  const activeOrders = orders
    .filter((o) => o.status === 'paid' || o.status === 'preparing')
    .slice()
    .reverse();
  const doneOrders = orders.filter((o) => o.status === 'done' || o.status === 'cancelled');
  const visibleOrders = tab === 'active' ? activeOrders : doneOrders;

  const allVisibleSelected =
    visibleOrders.length > 0 && visibleOrders.every((o) => selected.has(o.id));

  const toggleSelected = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visibleOrders.map((o) => o.id)));

  // สลับแท็บแล้วล้างการเลือก กันเผลอสั่งงานกับใบที่มองไม่เห็นอยู่บนจอ
  const switchTab = (name) => {
    setTab(name);
    setSelected(new Set());
  };

  const bulkCancel = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `ยกเลิกออเดอร์ ${ids.length} ใบ`,
      message: 'ออเดอร์ที่เลือกจะถูกเปลี่ยนสถานะเป็นยกเลิก และหายจากคิวรอทำ',
      detail: 'ใบที่เปลี่ยนสถานะไม่ได้จะถูกข้ามไป',
      confirmLabel: `ยกเลิก ${ids.length} ใบ`,
      danger: true,
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const { data, error } = await supabase.rpc('pos_bulk_set_status', {
        p_ids: ids,
        p_status: 'cancelled',
      });

      if (error || !data?.ok) {
        showToast(bulkErrorText(data?.error, error), 'error');
        return;
      }

      showToast(
        data.skipped > 0
          ? `ยกเลิกแล้ว ${data.updated} ใบ (ข้าม ${data.skipped} ใบที่เปลี่ยนสถานะไม่ได้)`
          : `ยกเลิกแล้ว ${data.updated} ใบ`,
        'success'
      );
      setSelected(new Set());
      await fetchQueue();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkArchive = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `เก็บออเดอร์ ${ids.length} ใบเข้าคลัง`,
      message: 'ออเดอร์ที่เลือกจะหายจากหน้าจอนี้ เพื่อให้คิวโล่ง',
      detail: 'ไม่ได้ลบข้อมูล ประวัติการสั่งซื้อของนักเรียนยังอยู่ครบเหมือนเดิม',
      confirmLabel: `เก็บ ${ids.length} ใบ`,
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const { data, error } = await supabase.rpc('pos_archive_orders', { p_ids: ids });

      if (error || !data?.ok) {
        showToast(bulkErrorText(data?.error, error), 'error');
        return;
      }

      showToast(
        data.blocked > 0
          ? `เก็บแล้ว ${data.archived} ใบ (ข้าม ${data.blocked} ใบที่ยังทำไม่เสร็จ)`
          : `เก็บแล้ว ${data.archived} ใบ`,
        'success'
      );
      setSelected(new Set());
      await fetchQueue();
    } finally {
      setBulkBusy(false);
    }
  };

  const tabClass = (name) =>
    `flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
      tab === name
        ? 'bg-amber-500 text-slate-950'
        : 'bg-neutral-900 text-content-secondary hover:bg-neutral-800'
    }`;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {confirmDialog}

      <header className="bg-neutral-950 border-b border-neutral-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-accent-amber rounded-2xl">
            <Coffee size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">SBAC COFFEE BARISTA</h1>
            {/* บอกสถานะการเชื่อมต่อจริง ไม่ใช่จุดเขียวที่ติดค้างไว้เฉย ๆ
                ถ้าเรียลไทม์หลุด บาริสต้าต้องรู้ว่าคิวมาช้ากว่าปกติ ไม่ใช่เดาเอา */}
            <span
              className={`text-[10px] font-extrabold uppercase tracking-widest mt-1.5 flex items-center gap-1.5 ${
                live ? 'text-accent-emerald' : 'text-accent-amber'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  live ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
                aria-hidden="true"
              />
              {live ? 'Live Queue — เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ — ดึงคิวทุก 8 วินาที'}
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

      {/* กว้างเต็มจอบนคอมที่เคาน์เตอร์ แต่หยุดที่ 1600px กันไม่ให้การ์ดยืดจนอ่านยากบนจอ 4K */}
      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full space-y-4 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2 flex-1 sm:flex-none" role="tablist" aria-label="สถานะออเดอร์">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'active'}
              onClick={() => switchTab('active')}
              className={tabClass('active')}
            >
              รอทำ ({activeOrders.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'done'}
              onClick={() => switchTab('done')}
              className={tabClass('done')}
            >
              เสร็จแล้ว ({doneOrders.length})
            </button>
          </div>

          {visibleOrders.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="px-3 py-2.5 rounded-xl text-[11px] font-bold border border-neutral-800 text-content-secondary hover:bg-neutral-900 transition-colors"
            >
              {allVisibleSelected ? 'ล้างการเลือก' : `เลือกทั้งหมด (${visibleOrders.length})`}
            </button>
          )}
        </div>

        {/* แถบสั่งงาน โผล่เฉพาะตอนมีของถูกเลือก
            ปุ่มต่างกันตามแท็บ เพราะ DB ยอมให้ทำคนละอย่าง */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <span className="text-xs font-black text-accent-amber">
              เลือกไว้ {selected.size} ใบ
            </span>

            {tab === 'active' ? (
              <button
                type="button"
                onClick={bulkCancel}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black bg-accent-rose text-white disabled:opacity-60 transition-all active:scale-95"
              >
                <X size={13} aria-hidden="true" />
                {bulkBusy ? 'กำลังทำรายการ...' : `ยกเลิกทั้ง ${selected.size} ใบ`}
              </button>
            ) : (
              <button
                type="button"
                onClick={bulkArchive}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black bg-accent-rose text-white disabled:opacity-60 transition-all active:scale-95"
              >
                <Archive size={13} aria-hidden="true" />
                {bulkBusy ? 'กำลังเก็บ...' : `เก็บ ${selected.size} ใบเข้าคลัง`}
              </button>
            )}
          </div>
        )}

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
        ) : visibleOrders.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-10 text-center space-y-3">
            <span className="text-4xl block" aria-hidden="true">
              {tab === 'active' ? '😴' : '📭'}
            </span>
            <h3 className="text-sm font-extrabold text-slate-200">
              {tab === 'active' ? 'ชงหมดแล้ว ไม่มีคิวค้าง' : 'ยังไม่มีออเดอร์ที่เสร็จวันนี้'}
            </h3>
            <p className="text-xs text-content-muted leading-normal">
              {tab === 'active'
                ? 'เมื่อนักเรียนสั่งซื้อผ่านแอป ออเดอร์จะเด้งขึ้นที่นี่พร้อมเสียงเตือนทันที'
                : 'ออเดอร์ที่ส่งมอบหรือยกเลิกแล้วจะย้ายมาเก็บที่แท็บนี้'}
            </p>
          </div>
        ) : (
          /* auto-fill + minmax: จอเคาน์เตอร์กว้าง ๆ ได้ 4-5 คอลัมน์ แท็บเล็ตได้ 2 มือถือได้ 1
             โดยไม่ต้องเขียน breakpoint ไล่ทีละขนาด */
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))] items-start">
            {visibleOrders.map((order) => {
              const busy = updatingId === order.id;
              return (
                <div
                  key={order.id}
                  className={`border rounded-3xl p-5 space-y-4 transition-all ${
                    order.status === 'paid'
                      ? 'bg-amber-500/5 border-amber-500/25 ring-1 ring-amber-500/10'
                      : order.status === 'preparing'
                      ? 'bg-blue-500/5 border-blue-500/25'
                      : 'bg-neutral-900 border-neutral-800'
                  }`}
                >
                  <div className="flex justify-between items-start border-b border-neutral-800 pb-3 gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={() => toggleSelected(order.id)}
                        aria-label={`เลือกออเดอร์ ${order.pickup_code}`}
                        className="w-5 h-5 mt-1 shrink-0 accent-amber-500 cursor-pointer"
                      />
                      <div className="min-w-0">
                      <span className="text-[10px] text-content-secondary font-bold block">
                        นักเรียน: {order.student_name} ({order.student_code || '—'})
                      </span>
                      <span className="text-2xl xl:text-3xl font-black text-white tracking-tight mt-1 block tabular-nums">
                        รหัสรับของ #{order.pickup_code}
                      </span>
                      </div>
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
                      <div key={idx} className="flex gap-3 items-start">
                        <span className="text-2xl leading-none pt-0.5" aria-hidden="true">
                          {productEmoji(item.name, item.category)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-extrabold text-white">
                            {item.name} × {item.qty}
                          </div>

                          {/* ตัวเลือกคือสิ่งที่บาริสต้าต้องอ่านก่อนอย่างอื่น
                              ตัวใหญ่กว่าราคา เพราะราคาไม่ได้ใช้ตอนชง */}
                          {item.options?.length > 0 && (
                            <div className="text-xs font-bold text-accent-amber mt-1 leading-snug">
                              {optionSummary(item.options)}
                            </div>
                          )}

                          {item.note && (
                            <div className="text-[11px] font-bold text-brand mt-1 leading-snug">
                              📝 {item.note}
                            </div>
                          )}

                          <div className="text-[10px] text-content-muted mt-1">
                            {formatBaht(item.unit_price_satang)} ฿ / หน่วย
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* หมายเหตุระดับทั้งออเดอร์ */}
                  {order.order_note && (
                    <div className="bg-blue-500/5 border border-blue-500/25 rounded-xl px-3 py-2">
                      <span className="text-[10px] font-extrabold text-content-secondary uppercase tracking-wider block">
                        หมายเหตุถึงร้าน
                      </span>
                      <span className="text-xs font-bold text-white">{order.order_note}</span>
                    </div>
                  )}

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
