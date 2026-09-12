import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { notEnabledMessage, logSetupHint, CONTACT } from '../../utils/setupNotice';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import {
  LogOut, Clock, Check, CheckCheck, RefreshCw, X, Archive, Lock, Inbox, Search, Undo2, Receipt,
} from 'lucide-react';
import CoffeeCup from '../../components/ui/icons/CoffeeCup';
import { formatBaht } from '../../utils/identity';
import { ORDER_STATUS_TEXT, optionSummary, bulkErrorText } from '../../utils/orders';
import MenuThumb from '../../components/ui/MenuThumb';
import { useRealtimeTable, useSerialCallback } from '../../hooks/useRealtimeTable';
import { playChime, unlockAudio } from '../../utils/sound';

/* คิวหน้าร้าน — ต้องเรียกผ่านฟังก์ชันใน 07_pos_ops.sql เท่านั้น
   เพราะ RLS ให้เห็นแค่ออเดอร์ของตัวเอง และ revoke สิทธิ์ update บน orders ไว้
   ผู้ใช้ต้องมี role 'pos' หรือ 'cashier' ใน user_roles ถึงจะเรียกได้ */

export default function BaristaDashboard() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  /* ต้องเทียบกับ roles ทั้งอาร์เรย์ ไม่ใช่ user.role เดียวที่ AuthContext เลือกมา
     ใช้กติกาเดียวกับ FinanceRoute ใน App.jsx และ app_can_manage_fees() ฝั่ง DB */
  const canManageFees = (Array.isArray(user?.roles) ? user.roles : []).some(
    (r) => r === 'cashier' || r === 'sysadmin'
  );

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  /* หน้านี้ต่างจากหน้าอื่นในแอป: มันคือจอที่ตั้งอยู่บนเคาน์เตอร์
     คนใช้คือบาริสต้าคนเดียว มองข้ามเคาน์เตอร์ตอนมือไม่ว่าง
     สิ่งที่ต้องเห็นคือ "ยังเหลืออะไรต้องชง" ไม่ใช่ประวัติทั้งวัน
     ของเสร็จแล้วจึงย้ายไปอีกแท็บ ไม่ปนอยู่ในคิว */
  const [tab, setTab] = useState('active');

  /* คลังบิล — บิลที่กด "เก็บเข้าคลัง" ไปแล้ว (archived_at not null)

     ของเดิมพอเก็บแล้วก็หายจากหน้าร้านถาวร ทั้งที่ข้อมูลยังอยู่ครบใน DB
     ลูกค้ามาถามว่าเมื่อวานสั่งอะไร/จ่ายเท่าไหร่ หน้าร้านตอบไม่ได้เลย
     แท็บนี้อ่านผ่าน pos_archived_orders() (45_pos_archive_browser.sql)

     แยก state ออกจาก orders ของคิว เพราะคนละแหล่งและคนละจังหวะโหลด:
     คิวเป็นเรียลไทม์ตลอดเวลา ส่วนคลังโหลดเมื่อเปิดแท็บ/เปลี่ยนคำค้นเท่านั้น
     ถ้าใช้ก้อนเดียวกัน ทุกครั้งที่มีออเดอร์ใหม่เข้ามาผลการค้นในคลังจะถูกล้างทิ้ง */
  const [archiveOrders, setArchiveOrders] = useState([]);
  const [archiveSummary, setArchiveSummary] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveFrom, setArchiveFrom] = useState('');
  const [archiveTo, setArchiveTo] = useState('');

  /* เลือกหลายใบแล้วจัดการทีเดียว

     ช่วงพีคคิวยาวเป็นสิบใบ การกดปิดทีละใบทำให้บาริสต้าต้องหยุดชงมานั่งกด
     ที่ทำได้ต่างกันตามแท็บ:
       แท็บรอทำ     -> ยกเลิกที่เลือก (pos_bulk_set_status)
       แท็บเสร็จแล้ว -> เก็บเข้าคลัง (pos_archive_orders)
       แท็บคลังบิล  -> กู้คืนกลับเข้าคิว (pos_unarchive_orders)

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

  /* โหลดคลังเมื่อเปิดแท็บคลัง และเมื่อคำค้น/ช่วงวันที่เปลี่ยน

     หน่วง 350ms ก่อนยิงจริง — บาริสต้าพิมพ์ชื่อลูกค้าทีละตัว
     ยิงทุกตัวอักษรคือยิง RPC ที่ ilike ทั้งตารางสิบกว่ารอบต่อการค้นหนึ่งครั้ง
     คืน cleanup ไว้ทุกครั้ง คำค้นที่พิมพ์ค้างไว้แล้วเปลี่ยนใจจึงไม่ถูกยิงเลย */
  useEffect(() => {
    if (tab !== 'archive') return undefined;

    setArchiveLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase.rpc('pos_archived_orders', {
        p_search: archiveSearch.trim() || null,
        p_from: archiveFrom || null,
        p_to: archiveTo || null,
        p_limit: 100,
      });
      setArchiveLoading(false);

      if (error) {
        /* ยังไม่ได้รันไฟล์ 45 = ฟังก์ชันยังไม่มีในฐานข้อมูล ซึ่งเป็นสาเหตุที่เจอบ่อยที่สุด
           การแยกสาเหตุนี้ออกมาถูกแล้ว แต่ชื่อไฟล์ .sql เป็นของคนที่แก้ได้ ไม่ใช่ของบาริสต้า
           ที่ยืนอยู่หน้าเคาน์เตอร์ตอนมีคิว — บนจอบอกว่าต้องบอกใคร ชื่อไฟล์ลง console */
        const missing =
          error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || '');
        if (missing) logSetupHint('คลังบิล', '45_pos_archive_browser.sql');
        setArchiveError(
          missing
            ? notEnabledMessage('คลังบิล', CONTACT.admin)
            : `โหลดคลังไม่สำเร็จ: ${error.message}`
        );
        setArchiveOrders([]);
        setArchiveSummary(null);
        return;
      }

      if (!data?.ok) {
        setArchiveError(
          data?.error === 'FORBIDDEN'
            ? 'บัญชีนี้ไม่มีสิทธิ์เปิดคลังบิล'
            : `โหลดคลังไม่สำเร็จ (${data?.error})`
        );
        setArchiveOrders([]);
        setArchiveSummary(null);
        return;
      }

      setArchiveError('');
      setArchiveOrders(data.orders || []);
      setArchiveSummary(data.summary || null);
    }, 350);

    return () => clearTimeout(handle);
  }, [tab, archiveSearch, archiveFrom, archiveTo]);

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
  /* คลังมาจาก RPC คนละตัว จึงไม่ได้กรองจาก orders เหมือนอีกสองแท็บ
     (orders คือคิวที่ยังไม่ถูกเก็บ ซึ่งตัดของในคลังออกไปแล้วตั้งแต่ฝั่ง DB) */
  const visibleOrders = tab === 'active' ? activeOrders : tab === 'done' ? doneOrders : archiveOrders;

  const allVisibleSelected =
    visibleOrders.length > 0 && visibleOrders.every((o) => selected.has(o.id));

  const toggleSelected = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* "เลือกทั้งหมด" กับ "ล้างตัวเลือก" เป็นคนละปุ่มกัน ไม่ใช่ปุ่มเดียวที่สลับคำ
     ของเดิมเป็นปุ่มเดียวที่เปลี่ยนป้ายไปมาตามสถานะ คนที่ทำงานหน้าเคาน์เตอร์
     จึงต้องอ่านป้ายก่อนทุกครั้งว่าตอนนี้มันเป็นปุ่มอะไร แทนที่จะกดตำแหน่งที่จำไว้ได้เลย */
  const selectAllVisible = () => setSelected(new Set(visibleOrders.map((o) => o.id)));
  const clearSelection = () => setSelected(new Set());

  // สลับแท็บแล้วล้างการเลือก กันเผลอสั่งงานกับใบที่มองไม่เห็นอยู่บนจอ
  const switchTab = (name) => {
    setTab(name);
    clearSelection();
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

  /* กู้คืนบิลจากคลังกลับเข้าคิว — ใช้ pos_unarchive_orders() ที่มีมาตั้งแต่ไฟล์ 17
     ไว้ใช้ตอนกดเก็บพลาด หรือต้องหยิบบิลเก่ากลับมาจัดการต่อหน้าลูกค้า */
  const bulkUnarchive = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `กู้คืนบิล ${ids.length} ใบกลับเข้าคิว`,
      message: 'บิลที่เลือกจะกลับไปอยู่ในแท็บ "เสร็จแล้ว" ของคิวหน้าร้านอีกครั้ง',
      detail: 'ข้อมูลในบิลไม่เปลี่ยน และประวัติของนักเรียนไม่ได้รับผลกระทบ',
      confirmLabel: `กู้คืน ${ids.length} ใบ`,
    });
    if (!ok) return;

    setBulkBusy(true);
    try {
      const { data, error } = await supabase.rpc('pos_unarchive_orders', { p_ids: ids });

      if (error || !data?.ok) {
        showToast(bulkErrorText(data?.error, error), 'error');
        return;
      }

      showToast(`กู้คืนแล้ว ${data.restored} ใบ`, 'success');
      setSelected(new Set());

      /* ใบที่กู้คืนต้องหายจากคลังและไปโผล่ในคิวพร้อมกัน
         ฝั่งคิวโหลดใหม่ได้ตรง ๆ ส่วนฝั่งคลังตัดออกจากผลการค้นที่ถืออยู่
         ไม่ยิงค้นซ้ำ เพราะคำค้น/ช่วงวันที่ที่บาริสต้าตั้งไว้ต้องอยู่เหมือนเดิม
         ใช้ ids ที่จับไว้ตอนต้นฟังก์ชัน ไม่ใช่ selected ที่เพิ่งถูกล้างไป */
      const restoredIds = new Set(ids);
      await fetchQueue();
      setArchiveOrders((prev) => prev.filter((o) => !restoredIds.has(o.id)));
      setArchiveSummary((prev) =>
        prev
          ? {
              ...prev,
              count: Math.max(0, (prev.count || 0) - data.restored),
              shown: Math.max(0, (prev.shown || 0) - data.restored),
            }
          : prev
      );
    } finally {
      setBulkBusy(false);
    }
  };

  /* ปุ่มกรองในแถบเมนู — ความกว้างตามข้อความ ไม่ยืดเต็มแถวอีกแล้ว
     ตอนที่ยังเป็นสองแท็บในกล่องของตัวเอง flex-1 ทำให้สองปุ่มแบ่งความกว้างจอมือถือพอดี
     พอปุ่มคำสั่งมาอยู่แถวเดียวกันห้าอัน flex-1 จะดันปุ่มที่ตกไปอยู่แถวล่างให้ยืดเต็มแถวเดี่ยว ๆ
     ซึ่งกว้างไม่เท่ากันเป็นแถว ๆ อ่านยากกว่าเดิม */
  const tabClass = (name) =>
    `px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all ${
      tab === name
        ? 'bg-amber-500 text-slate-950'
        : 'bg-neutral-900 text-content-secondary hover:bg-neutral-800'
    }`;

  /* ปุ่มคำสั่งในแถบเมนู — สูงเท่าแท็บ (py-2.5) ให้แถวเดียวกันเรียงตรงกันพอดี
     disabled ต้องยังอ่านออกว่าเป็นปุ่มอะไร จึงหรี่ที่ opacity ไม่ใช่กลืนไปกับพื้นหลัง */
  const actionClass =
    'px-4 py-2.5 rounded-xl text-xs font-bold border border-neutral-800 text-content-secondary ' +
    'transition-colors enabled:hover:bg-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {confirmDialog}

      <header className="bg-neutral-950 border-b border-neutral-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-accent-amber rounded-2xl">
            <CoffeeCup size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none">SBAC COFFEE BARISTA</h1>
            {/* บอกสถานะการเชื่อมต่อจริง ไม่ใช่จุดเขียวที่ติดค้างไว้เฉย ๆ
                ถ้าเรียลไทม์หลุด บาริสต้าต้องรู้ว่าคิวมาช้ากว่าปกติ ไม่ใช่เดาเอา */}
            <span
              className={`text-[11px] font-bold mt-1.5 flex items-center gap-1.5 ${
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

        <div className="flex items-center gap-2">
          {/* ทางเข้าหน้าการเงิน — เปลือกเต็มจอนี้ไม่มี BottomNav/SideNav เลย
              App.jsx ผูก route /finance ไว้ในเปลือกนี้แล้วพร้อมคอมเมนต์ว่า
              "จึงต้องมีทางเข้าหน้าการเงินจากในเปลือกเต็มจอนี้" แต่ปุ่มไม่เคยถูกใส่
              ลิงก์เดียวที่มีอยู่ไปกองที่ /development ซึ่ง role barista เข้าไม่ได้
              ผลคือคอนโซลการเงินทั้งหน้าเข้าถึงได้ด้วยการพิมพ์ URL อย่างเดียว */}
          {canManageFees && (
            <button
              onClick={() => navigate('/finance')}
              className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-accent-emerald rounded-xl text-xs font-bold transition-all"
              title="ค่าเทอมและค่าธรรมเนียม"
            >
              <Receipt size={16} aria-hidden="true" />
              ฝ่ายการเงิน
            </button>
          )}
          <button
            onClick={logout}
            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-accent-rose rounded-xl transition-all"
            title="ออกจากระบบ"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* กว้างเต็มจอบนคอมที่เคาน์เตอร์ แต่หยุดที่ 1600px กันไม่ให้การ์ดยืดจนอ่านยากบนจอ 4K */}
      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full space-y-4 overflow-y-auto">
        {/* แถบเมนู — ปุ่มชุดเดิมครบห้าอันทุกสถานะ ไม่ซ่อน ไม่สลับคำ ไม่ขยับตำแหน่ง
            เรียง: งานประจำวัน (รอทำ / เสร็จแล้ว) -> คำสั่งกับของที่เลือก -> คลังบิลท้ายสุด
            คลังบิลเป็นของที่เปิดดูนาน ๆ ครั้ง ไม่ใช่ของที่ใช้ระหว่างชง จึงไม่ควรแทรกกลางแถว

            ของเดิมปุ่มเลือกทั้งหมดจะโผล่เฉพาะตอนมีออเดอร์ และเปลี่ยนป้ายเป็น "ล้างการเลือก"
            เองเมื่อเลือกครบ แถบเมนูจึงมีบ้างสองปุ่มบ้างสามปุ่ม และปุ่มเดียวกันหมายถึงคนละคำสั่ง
            คนละเวลา — หน้าเคาน์เตอร์ที่ต้องกดเร็ว ๆ ควรกดตำแหน่งที่จำไว้ได้โดยไม่ต้องอ่านซ้ำ

            อันที่ยังใช้ไม่ได้ใช้ disabled ไม่ใช่ซ่อน ปุ่มจึงอยู่ที่เดิมเสมอ
            และ disabled บอก screen reader ว่า "มีอยู่แต่ตอนนี้กดไม่ได้" ซึ่งตรงกับความจริง

            ARIA: ไม่ใช่ tablist แล้ว เพราะปุ่มกรองสามอันถูกคั่นด้วยปุ่มคำสั่งที่ไม่ใช่แท็บ
            (role="tab" ต้องอยู่ในกล่อง tablist ติดกันเท่านั้น ไม่งั้น screen reader อ่านเพี้ยน)
            ใช้ toolbar + aria-pressed ซึ่งตรงกับของจริงกว่า: แถวปุ่ม โดยสามอันเป็นปุ่มสองสถานะ
            (หน้านี้ไม่เคยมี tabpanel/aria-controls อยู่แล้ว จึงไม่ได้เสียอะไรไป) */}
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="เมนูจัดการคิวหน้าร้าน">
          <button
            type="button"
            aria-pressed={tab === 'active'}
            onClick={() => switchTab('active')}
            className={tabClass('active')}
          >
            รอทำ ({activeOrders.length})
          </button>
          <button
            type="button"
            aria-pressed={tab === 'done'}
            onClick={() => switchTab('done')}
            className={tabClass('done')}
          >
            เสร็จแล้ว ({doneOrders.length})
          </button>

          <button
            type="button"
            onClick={selectAllVisible}
            disabled={visibleOrders.length === 0 || allVisibleSelected}
            className={actionClass}
          >
            เลือกทั้งหมด
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selected.size === 0}
            className={actionClass}
          >
            ล้างตัวเลือก
          </button>

          {/* คลังไม่มีตัวเลขในป้าย เพราะจำนวนขึ้นกับคำค้นที่ตั้งไว้ ไม่ใช่ค่าคงที่ของวันนี้
              ตัวเลขจริงบอกไว้ในแถบสรุปด้านในแท็บ ("พบ n ใบ") ซึ่งตรงกับสิ่งที่เห็นเสมอ */}
          <button
            type="button"
            aria-pressed={tab === 'archive'}
            onClick={() => switchTab('archive')}
            className={tabClass('archive')}
          >
            คลังบิล
          </button>
        </div>

        {/* แถบสั่งงาน โผล่เฉพาะตอนมีของถูกเลือก
            ปุ่มต่างกันตามแท็บ เพราะ DB ยอมให้ทำคนละอย่าง */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <span className="text-xs font-extrabold text-accent-amber">
              เลือกไว้ {selected.size} ใบ
            </span>

            {tab === 'active' && (
              <button
                type="button"
                onClick={bulkCancel}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-extrabold bg-accent-rose text-white disabled:opacity-60 transition-all active:scale-95"
              >
                <X size={13} aria-hidden="true" />
                {bulkBusy ? 'กำลังทำรายการ...' : `ยกเลิกทั้ง ${selected.size} ใบ`}
              </button>
            )}

            {tab === 'done' && (
              <button
                type="button"
                onClick={bulkArchive}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-extrabold bg-accent-rose text-white disabled:opacity-60 transition-all active:scale-95"
              >
                <Archive size={13} aria-hidden="true" />
                {bulkBusy ? 'กำลังเก็บ...' : `เก็บ ${selected.size} ใบเข้าคลัง`}
              </button>
            )}

            {/* ในคลังทำได้อย่างเดียวคือดึงกลับเข้าคิว — ไม่มีปุ่มลบ และตั้งใจไม่มี
                บิลคือหลักฐานการจ่ายเงินของนักเรียน หน้าร้านไม่ควรลบได้จากจอนี้ */}
            {tab === 'archive' && (
              <button
                type="button"
                onClick={bulkUnarchive}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-extrabold bg-amber-500 text-slate-950 disabled:opacity-60 transition-all active:scale-95"
              >
                <Undo2 size={13} aria-hidden="true" />
                {bulkBusy ? 'กำลังกู้คืน...' : `กู้คืน ${selected.size} ใบกลับเข้าคิว`}
              </button>
            )}
          </div>
        )}

        {/* ตัวค้นของคลัง — อยู่ในเนื้อแท็บ ไม่ใช่ในแถบเมนู แถบเมนูจึงเหมือนกันทุกแท็บ
            ค้นจาก "สิ่งที่ลูกค้าพูดได้" คือรหัสรับของบนสลิป ชื่อตัวเอง หรือรหัสนักเรียน */}
        {tab === 'archive' && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                  placeholder="ค้นหา: รหัสรับของ / ชื่อนักเรียน / รหัสนักเรียน"
                  aria-label="ค้นหาบิลในคลัง"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold text-white placeholder:text-content-muted focus:outline-none focus:border-amber-500/60"
                />
              </div>

              {/* [color-scheme:dark] ให้ปฏิทินของเบราว์เซอร์เป็นธีมมืดตามจอเคาน์เตอร์ */}
              <input
                type="date"
                value={archiveFrom}
                onChange={(e) => setArchiveFrom(e.target.value)}
                aria-label="ตั้งแต่วันที่"
                className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white [color-scheme:dark] focus:outline-none focus:border-amber-500/60"
              />
              <span className="self-center text-xs font-bold text-content-muted">ถึง</span>
              <input
                type="date"
                value={archiveTo}
                onChange={(e) => setArchiveTo(e.target.value)}
                aria-label="ถึงวันที่"
                className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs font-bold text-white [color-scheme:dark] focus:outline-none focus:border-amber-500/60"
              />
              <button
                type="button"
                onClick={() => { setArchiveSearch(''); setArchiveFrom(''); setArchiveTo(''); }}
                disabled={!archiveSearch && !archiveFrom && !archiveTo}
                className={actionClass}
              >
                ล้างคำค้น
              </button>
            </div>

            {/* สรุปผล — ต้องบอกด้วยว่ามีมากกว่าที่แสดงอยู่ไหม
                ไม่งั้นบาริสต้าจะสรุปยอดจาก 100 ใบแรกโดยไม่รู้ว่ายังมีอีก */}
            {archiveError ? (
              <p className="text-xs font-bold text-accent-rose leading-relaxed">{archiveError}</p>
            ) : archiveSummary ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold">
                <span className="text-slate-200">
                  พบ {archiveSummary.count} ใบ
                  {archiveSummary.count > archiveSummary.shown && (
                    <span className="text-content-muted font-semibold">
                      {' '}(แสดง {archiveSummary.shown} ใบล่าสุด — ระบุคำค้นหรือช่วงวันที่ให้แคบลงเพื่อดูใบที่เหลือ)
                    </span>
                  )}
                </span>
                <span className="text-accent-amber">
                  ยอดรวมทั้งหมด {formatBaht(archiveSummary.total_satang)} ฿
                </span>
              </div>
            ) : null}
          </div>
        )}

        {forbidden ? (
          <div className="bg-rose-500/5 border border-rose-500/25 rounded-3xl p-8 text-center space-y-3">
            {/* อีโมจิถูกวาดด้วยฟอนต์ของเครื่องผู้ใช้ จึงคุมสี ขนาด และน้ำหนักเส้น
                ให้เข้ากับไอคอนอื่นในหน้าไม่ได้เลย — ใช้ไอคอนเส้นชุดเดียวกับทั้งแอปแทน */}
            <Lock size={34} className="mx-auto text-accent-rose" aria-hidden="true" />
            <h3 className="text-sm font-extrabold text-accent-rose">บัญชีนี้ไม่มีสิทธิ์ดูคิวหน้าร้าน</h3>
            <p className="text-xs text-content-muted leading-relaxed">
              ต้องมี role <code className="text-accent-amber">pos</code> หรือ{' '}
              <code className="text-accent-amber">cashier</code> ในตาราง user_roles
              <br />
              บัญชีปัจจุบัน: {user?.email || '—'}
            </p>
          </div>
        ) : (tab === 'archive' ? archiveLoading : loading) ? (
          <div className="text-center py-12">
            <RefreshCw className="animate-spin text-accent-amber mx-auto mb-2" size={28} />
            <span className="text-xs font-semibold text-content-secondary">
              {tab === 'archive' ? 'กำลังค้นในคลังบิล...' : 'กำลังเชื่อมต่อคิวเรียลไทม์...'}
            </span>
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-10 text-center space-y-3">
            {tab === 'active' ? (
              <CheckCheck size={34} className="mx-auto text-accent-emerald" aria-hidden="true" />
            ) : tab === 'archive' ? (
              <Archive size={34} className="mx-auto text-content-muted" aria-hidden="true" />
            ) : (
              <Inbox size={34} className="mx-auto text-content-muted" aria-hidden="true" />
            )}
            <h3 className="text-sm font-extrabold text-slate-200">
              {tab === 'active'
                ? 'ชงหมดแล้ว ไม่มีคิวค้าง'
                : tab === 'archive'
                ? (archiveSearch || archiveFrom || archiveTo ? 'ไม่พบบิลที่ตรงกับที่ค้น' : 'ยังไม่มีบิลในคลัง')
                : 'ยังไม่มีออเดอร์ที่เสร็จวันนี้'}
            </h3>
            <p className="text-xs text-content-muted leading-normal">
              {tab === 'active'
                ? 'เมื่อนักเรียนสั่งซื้อผ่านแอป ออเดอร์จะเด้งขึ้นที่นี่พร้อมเสียงเตือนทันที'
                : tab === 'archive'
                ? (archiveSearch || archiveFrom || archiveTo
                    ? 'ลองพิมพ์แค่บางส่วนของชื่อ หรือขยายช่วงวันที่ให้กว้างขึ้น'
                    : 'บิลที่กด "เก็บเข้าคลัง" จากแท็บเสร็จแล้ว จะมาอยู่ที่นี่ ไว้ค้นย้อนหลังตอบลูกค้าได้')
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
                      <span className="text-[11px] text-content-secondary font-bold block">
                        นักเรียน: {order.student_name} ({order.student_code || '—'})
                      </span>
                      <span className="text-2xl xl:text-3xl font-black text-white tracking-tight mt-1 block tabular-nums">
                        รหัสรับของ #{order.pickup_code}
                      </span>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${
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
                        {/* รูปจริงของเมนู ช่วยให้จับคู่แก้วกับออเดอร์ได้เร็วกว่าอ่านชื่อทีละบรรทัด
                            ย่อเล็กกว่าฝั่งนักเรียนไว้ เพราะของที่ต้องอ่านจริง ๆ บนจอนี้คือ
                            ชื่อเมนูกับตัวเลือก ไม่ใช่รูป */}
                        <MenuThumb
                          name={item.name}
                          category={item.category}
                          className="w-9 h-9 rounded-lg mt-0.5"
                          iconSize={20}
                        />
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
                            <div className="text-[12px] font-bold text-brand mt-1 leading-snug">
                              📝 {item.note}
                            </div>
                          )}

                          <div className="text-[11px] text-content-muted mt-1">
                            {formatBaht(item.unit_price_satang)} ฿ / หน่วย
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* หมายเหตุระดับทั้งออเดอร์ */}
                  {order.order_note && (
                    <div className="bg-blue-500/5 border border-blue-500/25 rounded-xl px-3 py-2">
                      <span className="text-[11px] font-bold text-content-secondary block">
                        หมายเหตุถึงร้าน
                      </span>
                      <span className="text-xs font-bold text-white">{order.order_note}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-xs font-bold text-slate-300 pt-2 border-t border-neutral-800">
                    {/* คิวเป็นของวันนี้ทั้งหมด เวลาอย่างเดียวจึงพอ
                        ส่วนบิลในคลังมาจากวันไหนก็ได้ ต้องมีวันที่ด้วยถึงจะตอบลูกค้าได้ */}
                    <span>
                      {tab === 'archive'
                        ? new Date(order.created_at).toLocaleString('th-TH', {
                            day: 'numeric',
                            month: 'short',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : new Date(order.created_at).toLocaleTimeString('th-TH', {
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
                          className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <Clock size={14} />
                          เริ่มชงเครื่องดื่ม
                        </button>
                        <button
                          onClick={() => updateOrderStatus(order.id, 'cancelled')}
                          disabled={busy}
                          className="px-3 bg-neutral-800 hover:bg-neutral-700 text-accent-rose font-extrabold py-2.5 rounded-xl text-xs transition-all disabled:opacity-50"
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
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
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
