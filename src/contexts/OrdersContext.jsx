import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../config/supabase';
import { useRealtimeTable, useSerialCallback } from '../hooks/useRealtimeTable';
import { showToast } from '../components/ui/Toast';
import { readJSON, writeJSON } from '../utils/storage';
import { playChime } from '../utils/sound';
import { notify } from '../utils/notify';
import { isActiveOrder } from '../utils/orders';

/* แหล่งข้อมูลกลางของ "ออเดอร์ของฉัน" — ใช้ร่วมกันทั้งแถบเมนู หน้าสถานะ และกล่องแจ้งเตือน

   ทำไมต้องรวมมาไว้ที่เดียว:
     ของเดิมหน้าสถานะการสั่งซื้อกรองเฉพาะ paid/preparing เท่านั้น
     พอบาริสต้ากด "เสร็จแล้ว" การ์ดใบนั้นก็ "หายไปเฉย ๆ" จากหน้าจอ
     ซึ่งเป็นสัญญาณที่ตรงข้ามกับความจริงโดยสิ้นเชิง — ของเสร็จแล้วแต่หน้าจอว่างเปล่า
     ถ้านักเรียนเปิดแอปหลังบาริสต้ากดไปแล้ว จะไม่เหลือร่องรอยอะไรเลยว่ากาแฟพร้อมรับ

     ป๊อปอัปแจ้งเตือนช่วยได้เฉพาะคนที่เปิดแอปค้างไว้ตอนนั้นพอดี
     สิ่งที่ต้องมีคู่กันคือ "สถานะที่ค้างอยู่บนหน้าจอ" จนกว่าจะกดรับ
     ที่นี่จึงดึงใบที่เสร็จแล้วมาด้วย แล้วให้ทุกหน้าอ่านจากชุดเดียวกัน
     แถบเมนูจะได้ขึ้นตัวเลขแจ้งเตือนพร้อมกันโดยไม่ต้องยิง query เพิ่ม */

const ORDER_SELECT =
  'id, total_satang, status, pickup_code, note, created_at, ' +
  'order_items(qty, unit_price_satang, note, products(name, category), order_item_options(option_name, group_name))';

/** ดึงมาเผื่อพอสำหรับใบที่ยังค้าง + ใบที่เพิ่งเสร็จ ไม่ต้องยิงสองรอบ */
const FETCH_LIMIT = 15;

/* ใบที่เสร็จแล้วค้างบนหน้าจอได้ 12 ชั่วโมง ถ้าไม่ได้กด "รับแล้ว"

   ทำไมต้องกว้างขนาดนี้ ทั้งที่กาแฟชงเสร็จในไม่กี่นาที:
     ตาราง orders มีแต่ created_at ไม่มี updated_at/completed_at
     (ดู set_order_status ใน 07_pos_ops.sql — มันสั่งแค่ update orders set status)
     เราจึงวัดอายุจาก "เวลาที่สั่ง" ไม่ใช่ "เวลาที่ชงเสร็จ" ซึ่งเป็นคนละเรื่องกัน

     ของเดิมตั้งไว้ 3 ชั่วโมงจากเวลาสั่ง = ออเดอร์ที่สั่งตอนเช้าแล้วบาริสต้าเพิ่งมากด
     ตอนบ่าย จะถูกกรองทิ้งทันทีที่เสร็จ นักเรียนไม่เห็นอะไรเลยทั้งที่กาแฟพร้อมแล้ว
     12 ชั่วโมงครอบคลุมทั้งวันเรียน ซึ่งเป็นอายุจริงของออเดอร์หนึ่งใบ

   ถ้าวันหลังเพิ่มคอลัมน์ completed_at ใน DB ค่อยเปลี่ยนมาวัดจากตรงนั้นแทน จะแม่นกว่านี้ */
const READY_WINDOW_MS = 12 * 60 * 60 * 1000;

/** id ของใบที่กด "รับแล้ว" ไปแล้ว — เก็บในเครื่อง เพราะ DB ไม่มีสถานะ "นักเรียนรับของแล้ว"
 *  (enum order_status จบที่ done ซึ่งหมายถึงฝั่งร้านทำเสร็จ ไม่ใช่ว่าลูกค้ามารับแล้ว) */
const PICKED_UP_KEY = 'sbac_picked_up_orders';

const OrdersContext = createContext(null);

export function useMyOrders() {
  const ctx = useContext(OrdersContext);
  // หน้าที่อยู่นอก provider (เช่นจอบาริสต้า) เรียกได้โดยไม่พัง แค่ได้ค่าว่าง
  return ctx || EMPTY;
}

const EMPTY = {
  activeOrders: [],
  readyOrders: [],
  alertQueue: [],
  loading: false,
  loadFailed: false,
  live: false,
  refresh: () => {},
  markPickedUp: () => {},
  dismissAlert: () => {},
};

export function OrdersProvider({ children }) {
  const { user } = useAuth();
  const enabled = Boolean(user?.uid) && user?.role !== 'barista';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  /* ต้องแยก "ดึงไม่ได้" ออกจาก "ไม่มีออเดอร์" ให้ชัด
     ถ้า error แล้วปล่อย orders ค้างเป็น [] หน้าจอจะขึ้นว่า "ยังไม่มีคำสั่งซื้อ"
     ทั้งที่นักเรียนเพิ่งจ่ายเงินไป ซึ่งน่าตกใจกว่าการบอกตรง ๆ ว่าโหลดไม่สำเร็จ */
  const [loadFailed, setLoadFailed] = useState(false);
  const [alertQueue, setAlertQueue] = useState([]);
  const [pickedUp, setPickedUp] = useState(() => readJSON(PICKED_UP_KEY, []));

  // id -> status ของรอบก่อน; null = ยังไม่เคยโหลด (รอบแรกห้ามเตือน ไม่งั้นเปิดแอปมาก็เด้งเลย)
  const snapshotRef = useRef(null);

  const refresh = useSerialCallback(async () => {
    if (!enabled) return;

    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(FETCH_LIMIT);

    if (error) {
      console.warn('[orders] โหลดออเดอร์ไม่สำเร็จ:', error);
      setLoadFailed(true);
      setLoading(false);
      return;
    }

    setLoadFailed(false);
    const rows = data || [];
    const prev = snapshotRef.current;
    const next = new Map(rows.map((o) => [o.id, o.status]));

    if (prev) {
      // เตือนเฉพาะใบที่ "เคยเห็นแล้ว" และสถานะเปลี่ยนไปจริง
      // ใบที่เพิ่งโผล่มารอบนี้ = ใบที่ตัวเองเพิ่งกดสั่ง ไม่ต้องเตือนซ้ำ
      const changed = rows.filter((o) => prev.has(o.id) && prev.get(o.id) !== o.status);
      const done = changed.filter((o) => o.status === 'done');

      for (const order of changed) {
        if (order.status === 'preparing') {
          showToast(`บาริสต้าเริ่มชงออเดอร์ #${order.pickup_code} แล้ว`, 'info');
          notify('เริ่มชงเครื่องดื่มแล้ว', {
            body: `ออเดอร์ #${order.pickup_code} กำลังชงอยู่`,
            tag: `order-${order.id}`,
          });
        } else if (order.status === 'cancelled') {
          showToast(`ออเดอร์ #${order.pickup_code} ถูกยกเลิกโดยหน้าร้าน`, 'error');
          notify('ออเดอร์ถูกยกเลิก', {
            body: `ออเดอร์ #${order.pickup_code} ถูกยกเลิกโดยหน้าร้าน`,
            tag: `order-${order.id}`,
          });
        }
      }

      if (done.length > 0) {
        playChime('ready');
        // สั่นด้วย: มือถืออยู่ในกระเป๋าตอนคาบเรียน เสียงมักถูกปิด แต่การสั่นยังรู้สึกได้
        try {
          navigator.vibrate?.([180, 90, 180, 90, 320]);
        } catch {
          /* iOS Safari ไม่รองรับ vibrate — ยังมีเสียงกับ overlay อยู่ */
        }

        for (const order of done) {
          notify('เครื่องดื่มพร้อมแล้ว', {
            body: `รหัสรับของ #${order.pickup_code} — มารับที่เคาน์เตอร์ได้เลย`,
            tag: `order-${order.id}`,
          });
        }

        // เข้าคิวเผื่อเสร็จพร้อมกันหลายใบ กดปิดทีละใบจะได้ไม่มีใบไหนหล่นหาย
        setAlertQueue((prevQueue) => {
          const seen = new Set(prevQueue.map((o) => o.id));
          return [...prevQueue, ...done.filter((o) => !seen.has(o.id))];
        });
      }
    }

    snapshotRef.current = next;
    setOrders(rows);
    setLoading(false);
  });

  // ล้างของเดิมเมื่อสลับบัญชี ไม่งั้นออเดอร์ของคนก่อนหน้าจะถูกนับว่า "เปลี่ยนสถานะ"
  useEffect(() => {
    snapshotRef.current = null;
    setOrders([]);
    setAlertQueue([]);
    setLoading(Boolean(user?.uid));
  }, [user?.uid]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  // มีของค้างอยู่ในคิวไหม — ใช้ตัดสินว่าจะถามซ้ำถี่แค่ไหน
  const hasPending = orders.some((o) => isActiveOrder(o.status));

  /* ไม่ใส่ filter ที่ user_id แล้ว

     เดิมใส่ไว้เพื่อลดจำนวน event แต่มันสร้างจุดพังเงียบ ๆ ขึ้นมา:
     ถ้าค่าที่ใช้กรองไม่ตรงกับที่อยู่ใน WAL แม้แต่นิดเดียว channel จะ subscribe "สำเร็จ"
     แต่ไม่มี event ไหลมาเลยสักตัว ระบบเข้าใจว่าต่อติดแล้วจึงลดการถามลงเหลือนาทีละครั้ง
     ผลคือกาแฟเสร็จแล้วแต่จอนิ่งเป็นนาที ซึ่งแยกไม่ออกจากอาการ "พัง"
     RLS (orders_self_select) กรองให้อยู่แล้วว่าเราเห็นได้เฉพาะออเดอร์ตัวเอง
     ตัวกรองชั้นที่สองจึงไม่ได้เพิ่มความปลอดภัย แต่เพิ่มโอกาสพังอย่างเดียว

     ช่วงเวลาถามซ้ำผูกกับ "มีของค้างไหม" ไม่ใช่ "เรียลไทม์ต่อติดไหม"
     เพราะ subscribe ติด ไม่ได้แปลว่า event ไหลมาจริง — สองอย่างนี้คนละเรื่องกัน
     ตอนรอกาแฟจึงถามทุก 7 วินาทีเสมอ แย่ที่สุดคือรู้ช้า 7 วิ ไม่ใช่ 1 นาที
     ตอนไม่มีของค้างค่อยลดลงเหลือนาทีละครั้ง จะได้ไม่กวน DB ฟรี ๆ ทั้งวัน */
  const live = useRealtimeTable({
    table: 'orders',
    onChange: refresh,
    enabled,
    livePollMs: hasPending ? 7000 : 60000,
    fallbackPollMs: hasPending ? 5000 : 20000,
  });

  const markPickedUp = (orderId) => {
    setPickedUp((prev) => {
      if (prev.includes(orderId)) return prev;
      // เก็บแค่ 50 ใบล่าสุดพอ ใบเก่ากว่านั้นหลุดกรอบเวลาไปเองอยู่แล้ว
      const next = [...prev, orderId].slice(-50);
      writeJSON(PICKED_UP_KEY, next);
      return next;
    });
  };

  const dismissAlert = () => setAlertQueue((prev) => prev.slice(1));

  const value = useMemo(() => {
    const pickedSet = new Set(pickedUp);
    const cutoff = Date.now() - READY_WINDOW_MS;

    return {
      activeOrders: orders.filter((o) => isActiveOrder(o.status)),
      readyOrders: orders.filter(
        (o) =>
          o.status === 'done' &&
          !pickedSet.has(o.id) &&
          new Date(o.created_at).getTime() >= cutoff
      ),
      alertQueue,
      loading,
      loadFailed,
      live,
      refresh,
      markPickedUp,
      dismissAlert,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, pickedUp, alertQueue, loading, loadFailed, live, refresh]);

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export default OrdersProvider;
