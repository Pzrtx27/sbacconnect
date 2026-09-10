import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTheme } from '../../contexts/ThemeContext';
import { RefreshCw, History, ChevronRight, Check } from 'lucide-react';
import CoffeeCup from '../../components/ui/icons/CoffeeCup';
import PageHeader from '../../components/layout/PageHeader';
import { READING_WIDTH } from '../../utils/layout';
import { formatBaht } from '../../utils/identity';
import {
  ORDER_STATUS_TEXT_LONG,
  ORDER_STATUS_COLOR,
  drinkShapeFor,
  drinkTone,
  optionSummary,
} from '../../utils/orders';
import DrinkIcon from '../../components/ui/DrinkIcon';
import { useMyOrders } from '../../contexts/OrdersContext';

/* หน้านี้แสดงออเดอร์ที่ยัง "ไม่จบเรื่อง" ในสายตาของนักเรียน:
     ยังไม่ได้ทำ / กำลังชง — รอต่อไป
     ทำเสร็จแล้วแต่ยังไม่ได้กดรับ — ต้องลุกไปรับที่เคาน์เตอร์

   ของเดิมกรองไว้แค่ paid/preparing ใบที่บาริสต้ากดเสร็จจึงหายวับไปจากหน้าจอ
   นักเรียนที่นั่งรออยู่เห็นการ์ดหายไปเฉย ๆ แล้วเหลือหน้าว่างเปล่า
   ซึ่งอ่านได้ว่า "ไม่มีอะไรเกิดขึ้น" ทั้งที่ความจริงคือกาแฟพร้อมแล้ว
   ตอนนี้ใบที่เสร็จจะกลายเป็นการ์ดเขียวเด่นอยู่บนสุดจนกว่าจะกดว่ารับแล้ว

   ข้อมูลทั้งหมดมาจาก OrdersContext ซึ่งฟังเรียลไทม์ให้อยู่แล้ว
   หน้านี้จึงไม่ต้องยิง query เองซ้ำอีกชุด */

/** ลำดับขั้นของออเดอร์ตาม enum order_status (paid -> preparing -> done) */
const STEPS = [
  { key: 'paid', label: 'รับออเดอร์' },
  { key: 'preparing', label: 'กำลังชง' },
  { key: 'done', label: 'พร้อมรับ' },
];

export default function MyOrdersPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const { activeOrders, readyOrders, loading, loadFailed, live, markPickedUp, refresh } =
    useMyOrders();

  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';

  return (
    <div className={`space-y-6 ${READING_WIDTH}`}>
      <PageHeader icon={CoffeeCup} title="สถานะการสั่งซื้อ" tone="amber">
        {/* ป้ายนี้เคยเป็นจุดเขียวกะพริบตายตัว ทั้งที่ข้างหลังไม่ได้ต่อเรียลไทม์จริง
            ตอนนี้ผูกกับสถานะการเชื่อมต่อจริง และกดได้ด้วย
            เพราะเวลาคนสงสัยว่า "มันอัปเดตอยู่จริงไหม" สิ่งที่อยากทำคือกดเช็คเดี๋ยวนั้น
            ไม่ใช่ดึงหน้าจอลงมารีโหลดทั้งแอปแล้วรอโหลดใหม่หมด */}
        <button
          type="button"
          onClick={refresh}
          title="แตะเพื่อตรวจสถานะเดี๋ยวนี้"
          className={`text-xs font-bold flex items-center gap-1.5 px-3 py-1 rounded-full shrink-0 transition-colors duration-300 active:scale-95 ${
            live
              ? isDark
                ? 'bg-emerald-950/30 text-accent-emerald'
                : 'bg-emerald-50 text-accent-emerald'
              : isDark
              ? 'bg-amber-950/30 text-accent-amber'
              : 'bg-amber-50 text-accent-amber'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}
            aria-hidden="true"
          />
          {live ? 'อัปเดตสด' : 'กำลังเชื่อมต่อ'}
        </button>
      </PageHeader>

      {/* ---------- พร้อมรับแล้ว ---------- */}
      {readyOrders.map((order) => (
        <ReadyCard
          key={order.id}
          order={order}
          isDark={isDark}
          onPickedUp={() => markPickedUp(order.id)}
        />
      ))}

      <button
        type="button"
        onClick={() => navigate('/orders/history')}
        className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
          isDark
            ? 'bg-white/[0.06] border-white/10 hover:bg-white/10'
            : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
        }`}
      >
        <span className={`flex items-center gap-2 text-xs font-bold transition-colors duration-300 ${textPrimary}`}>
          <History size={16} className={isDark ? 'text-content-secondary' : 'text-ink-muted'} aria-hidden="true" />
          ดูประวัติการสั่งซื้อทั้งหมด
        </span>
        <ChevronRight size={16} className={isDark ? 'text-content-secondary' : 'text-ink-light'} aria-hidden="true" />
      </button>

      {/* ---------- ยังทำไม่เสร็จ ---------- */}
      {loading ? (
        <div className="text-center py-10">
          <RefreshCw className="animate-spin text-brand mx-auto mb-2" size={24} />
          <span className={`text-xs font-semibold ${isDark ? 'text-content-muted' : 'text-ink-muted'}`}>
            กำลังโหลดสถานะออเดอร์...
          </span>
        </div>
      ) : loadFailed ? (
        <div
          role="alert"
          className={`rounded-3xl border p-8 text-center space-y-3 transition-colors duration-300 ${
            isDark ? 'bg-rose-950/30 border-rose-900/40' : 'bg-rose-50 border-rose-200'
          }`}
        >
          <h3 className="text-sm font-extrabold text-accent-rose">โหลดสถานะออเดอร์ไม่สำเร็จ</h3>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-content-secondary' : 'text-ink-secondary'}`}>
            ออเดอร์ของคุณยังอยู่ในระบบตามปกติ แค่หน้านี้ดึงข้อมูลมาแสดงไม่ได้ชั่วคราว
            <br />
            ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วกดลองใหม่
          </p>
          <button
            type="button"
            onClick={refresh}
            className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-sbac-blue hover:bg-sbac-navy text-white transition-colors"
          >
            ลองโหลดใหม่
          </button>
        </div>
      ) : activeOrders.length === 0 && readyOrders.length === 0 ? (
        <div
          className={`rounded-3xl border shadow-sm p-8 text-center space-y-3 transition-colors duration-300 ${
            isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100'
          }`}
        >
          <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${drinkTone('cup').tile} ${drinkTone('cup').icon}`}>
            <DrinkIcon shape="cup" size={30} />
          </div>
          <h3 className={`text-sm font-extrabold ${textPrimary}`}>ยังไม่มีคำสั่งซื้อที่ดำเนินการอยู่</h3>
          <p className={`text-xs leading-relaxed ${textMuted}`}>
            สามารถสั่งเครื่องดื่มแก้วโปรดของคุณได้ง่ายๆ ผ่านแถบสั่งกาแฟด้านล่าง
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeOrders.map((order) => (
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
                  <span className={`text-[11px] font-bold block ${textMuted}`}>
                    รหัสรับของ / Pickup Code
                  </span>
                  <span className={`text-3xl font-black tracking-tight mt-1 block tabular-nums ${textPrimary}`}>
                    #{order.pickup_code}
                  </span>
                </div>
                <span
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                    ORDER_STATUS_COLOR[order.status] || ORDER_STATUS_COLOR.paid
                  }`}
                >
                  {ORDER_STATUS_TEXT_LONG[order.status] || order.status}
                </span>
              </div>

              {/* แถบขั้นตอน — บอกว่าตอนนี้อยู่ตรงไหนและเหลืออีกกี่ขั้น
                  ข้อความสถานะอย่างเดียวตอบไม่ได้ว่า "ใกล้เสร็จหรือยัง" */}
              <StatusSteps status={order.status} isDark={isDark} />

              <div className="space-y-3">
                {order.order_items?.map((item, idx) => (
                  <div key={idx} className="flex gap-3 items-center">
                    {(() => {
                      const shape = drinkShapeFor(item.products?.name, item.products?.category);
                      const tone = drinkTone(shape);
                      return (
                        <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${tone.tile} ${tone.icon}`}>
                          <DrinkIcon shape={shape} size={24} />
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-extrabold ${textPrimary}`}>
                        {item.products?.name || 'สินค้า'}
                      </div>

                      {/* ตัวเลือกที่สั่งไว้ — ชื่อกับราคาเป็น snapshot จากตอนสั่ง
                          ต่อให้ร้านขึ้นราคาทีหลัง ออเดอร์ใบนี้ก็ยังแสดงของเดิม */}
                      {item.order_item_options?.length > 0 && (
                        <div className="text-[11px] font-bold mt-0.5 text-accent-amber leading-snug">
                          {optionSummary(
                            item.order_item_options.map((o) => ({ name: o.option_name }))
                          )}
                        </div>
                      )}

                      {item.note && (
                        <div className="text-[11px] font-semibold mt-0.5 text-brand leading-snug">
                          📝 {item.note}
                        </div>
                      )}

                      <div className={`text-[11px] mt-0.5 ${textMuted}`}>
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

/* การ์ด "พร้อมรับแล้ว" — ตั้งใจให้ดังกว่าทุกอย่างบนหน้าจอ
   ขอบเรืองแสงเต้นช้า ๆ + รหัสรับของตัวเบ้อเริ่ม เพราะสองอย่างนี้คือสิ่งที่
   ต้องเห็นตั้งแต่เหลือบตามอง และเป็นสิ่งเดียวที่ต้องใช้ตอนไปยืนหน้าเคาน์เตอร์ */
function ReadyCard({ order, isDark, onPickedUp }) {
  /* เครื่องที่เปิด "ลดการเคลื่อนไหว" ไว้ อาจไม่เล่นแอนิเมชันให้เลย
     ถ้าเริ่มที่ opacity 0 แล้วรอแอนิเมชันพาขึ้นมา การ์ดจะอยู่จริงแต่มองไม่เห็น
     ซึ่งแย่กว่าไม่มีแอนิเมชันเยอะ — ของสำคัญขนาดนี้ห้ามผูกการมองเห็นไว้กับแอนิเมชัน
     ปิดโมชันไปเลยดีกว่า แล้วให้มันโผล่มาแบบนิ่ง ๆ แต่เห็นแน่นอน */
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 24, stiffness: 300 }}
      className={`relative rounded-3xl border-2 p-5 space-y-4 overflow-hidden ${
        isDark ? 'bg-emerald-950/30 border-emerald-500/50' : 'bg-emerald-50 border-emerald-400'
      }`}
    >
      {/* วงเรืองแสงจาง ๆ หลังการ์ด ทำให้สะดุดตาโดยไม่ต้องกะพริบจนรบกวนสายตา */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-emerald-500/20 blur-2xl animate-pulse"
      />

      <div className="relative flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-emerald-700 text-white flex items-center justify-center shrink-0">
          <Check size={16} strokeWidth={3.5} aria-hidden="true" />
        </span>
        <span className="text-sm font-extrabold text-accent-emerald">
          พร้อมรับแล้ว — เชิญที่เคาน์เตอร์
        </span>
      </div>

      <div className="relative text-center py-2">
        <span className="text-[11px] font-bold text-accent-emerald block">
          ยื่นรหัสนี้ให้บาริสต้า
        </span>
        <span
          className={`text-6xl font-black tracking-tight tabular-nums block mt-1 ${
            isDark ? 'text-white' : 'text-sbac-navy'
          }`}
        >
          #{order.pickup_code}
        </span>
        <span className={`text-[12px] font-bold ${isDark ? 'text-content-secondary' : 'text-ink-muted'}`}>
          {order.order_items?.map((i) => `${i.products?.name || 'สินค้า'} × ${i.qty}`).join(' · ')}
        </span>
      </div>

      <button
        type="button"
        onClick={onPickedUp}
        className="relative w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold py-3 rounded-2xl text-sm shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
      >
        รับเครื่องดื่มแล้ว
      </button>
    </motion.div>
  );
}

/** แถบขั้นตอน 3 ขั้น — ขั้นที่ผ่านแล้วทึบ ขั้นปัจจุบันเต้น ขั้นที่ยังไม่ถึงจาง */
function StatusSteps({ status, isDark }) {
  const currentIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <ol className="flex items-center gap-1" aria-label="ความคืบหน้าของออเดอร์">
      {STEPS.map((step, idx) => {
        const reached = idx <= currentIndex;
        const isCurrent = idx === currentIndex;

        return (
          <li key={step.key} className="flex-1 space-y-1.5">
            <div
              className={`h-1.5 rounded-full transition-colors duration-500 ${
                reached
                  ? isCurrent
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-emerald-500'
                  : isDark
                  ? 'bg-white/10'
                  : 'bg-slate-200'
              }`}
            />
            <span
              className={`text-[11px] font-bold block text-center ${
                isCurrent
                  ? 'text-accent-amber'
                  : reached
                  ? 'text-accent-emerald'
                  : isDark
                  ? 'text-content-muted'
                  : 'text-ink-light'
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
