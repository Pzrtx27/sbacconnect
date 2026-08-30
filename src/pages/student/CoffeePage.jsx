import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { showToast } from '../../components/ui/Toast';
import Modal from '../../components/ui/Modal';
import GlassCard from '../../components/layout/GlassCard';
import {
  ShoppingCart, History, Coffee, Minus, Plus, RefreshCw, Trash2, X, Check,
} from 'lucide-react';
import { formatBaht } from '../../utils/identity';
import {
  productEmoji, newIdempotencyKey, placeOrderErrorText, optionSummary,
} from '../../utils/orders';

/* หน้าสั่งเครื่องดื่ม SBAC COFFEE

   ปัญหาของเวอร์ชันเดิม (ข้อ 02 ในแผน):
     เลือกได้แค่ "เมนู" กับ "จำนวน" ไม่มีร้อน/เย็น/ปั่น ไม่มีความหวาน ไม่มีท็อปปิ้ง
     และสั่งได้ทีละเมนูเดียวเท่านั้น ไม่มีตะกร้า
     ออเดอร์ที่เด้งเข้าหน้าร้านจึงบอกอะไรบาริสต้าไม่ได้เลย

   เวอร์ชันนี้:
     เมนู + ตัวเลือก มาจาก DB ทั้งหมด (rpc menu_with_options)
     ไม่มีรายการตัวเลือกไหน hard-code ไว้ในไฟล์นี้ — ร้านแก้ใน DB แล้วหน้านี้เปลี่ยนตาม

   เรื่องราคา:
     ตัวเลขที่โชว์ในหน้านี้เป็น "ตัวอย่างให้ผู้ใช้เห็น" เท่านั้น
     ตอนกดสั่งจริง ส่งไปแค่ product_id / qty / option_ids
     ฝั่ง DB (place_order_v2) คำนวณราคาใหม่ทั้งหมดเอง ไม่รับตัวเลขราคาจากที่นี่
     ต่อให้แก้ค่าใน DevTools ก็เปลี่ยนยอดที่ถูกหักจริงไม่ได้ */

/** ตัวเลือกที่ติ๊กไว้ให้ตั้งแต่แรก — ใช้ is_default จาก DB
 *  ถ้ากลุ่มไหนบังคับเลือกแต่ไม่มีตัว default ให้หยิบตัวแรกมาแทน ผู้ใช้จะได้ไม่ต้องเริ่มจากศูนย์ */
function defaultSelection(groups = []) {
  const selected = {};
  for (const g of groups) {
    const defaults = g.options.filter((o) => o.is_default).map((o) => o.id);
    if (defaults.length > 0) {
      selected[g.id] = defaults.slice(0, Math.max(1, g.max_select));
    } else if (g.min_select > 0 && g.options.length > 0) {
      selected[g.id] = [g.options[0].id];
    } else {
      selected[g.id] = [];
    }
  }
  return selected;
}

/** ราคาต่อแก้ว = ราคาเมนู + ผลรวมส่วนต่างของตัวเลือกที่เลือก
 *  สูตรเดียวกับใน place_order_v2 — ถ้าแก้ที่นี่ต้องแก้ที่ DB ด้วย ไม่งั้นตัวเลขไม่ตรง */
function unitPrice(product, selection) {
  let total = product.price_satang;
  for (const g of product.option_groups) {
    for (const optId of selection[g.id] || []) {
      const opt = g.options.find((o) => o.id === optId);
      if (opt) total += opt.price_delta_satang;
    }
  }
  return total;
}

/** กลุ่มไหนยังเลือกไม่ครบตามที่บังคับ */
function missingRequired(product, selection) {
  return product.option_groups.filter((g) => (selection[g.id] || []).length < g.min_select);
}

export default function CoffeePage() {
  const { user, updateBalance } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);

  // ตัวเลือกที่กำลังตั้งค่าอยู่ในโมดัล
  const [editing, setEditing] = useState(null); // { product, selection, qty, note, cartIndex }

  const [cart, setCart] = useState([]);
  const [orderNote, setOrderNote] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadMenu = useCallback(async () => {
    setLoadingMenu(true);
    const { data, error } = await supabase.rpc('menu_with_options');

    if (error) {
      console.error('[coffee] โหลดเมนูไม่สำเร็จ:', error);
      showToast('โหลดรายการเครื่องดื่มไม่สำเร็จ', 'error');
      setProducts([]);
    } else {
      setProducts(data?.products || []);
    }
    setLoadingMenu(false);
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  /* แยกเมนูตามหมวดเพื่อให้เลื่อนหาง่าย — ร้านมีทั้งกาแฟ ชา โซดา ขนม
     ถ้าเรียงรวมกันหมดจะหาไม่เจอเวลามีเมนูเยอะ */
  const byCategory = useMemo(() => {
    const groups = new Map();
    for (const p of products) {
      const key = p.category || 'อื่น ๆ';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    return [...groups.entries()];
  }, [products]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPriceSatang * line.qty, 0),
    [cart]
  );
  const cartCount = useMemo(() => cart.reduce((n, line) => n + line.qty, 0), [cart]);

  // ---------- โมดัลตั้งค่าตัวเลือก ----------
  const openProduct = (product) => {
    setEditing({
      product,
      selection: defaultSelection(product.option_groups),
      qty: 1,
      note: '',
      cartIndex: null,
    });
  };

  const openCartLine = (index) => {
    const line = cart[index];
    setEditing({
      product: line.product,
      selection: line.selection,
      qty: line.qty,
      note: line.note,
      cartIndex: index,
    });
    setCartOpen(false);
  };

  /** ติ๊กตัวเลือก — พฤติกรรมต่างกันตาม max_select
   *  เลือกได้ 1 (ประเภท/ขนาด/ความหวาน) = กดแล้วสลับตัวเดิมออก เหมือน radio
   *  เลือกได้หลายตัว (ท็อปปิ้ง)          = กดซ้ำเพื่อเอาออก และเตือนเมื่อครบโควตา */
  const toggleOption = (group, optionId) => {
    setEditing((prev) => {
      const current = prev.selection[group.id] || [];
      let next;

      if (group.max_select === 1) {
        // กลุ่มที่ไม่บังคับและเลือกได้ 1 ตัว กดซ้ำ = ยกเลิกการเลือก
        next = current.includes(optionId) && group.min_select === 0 ? [] : [optionId];
      } else if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId);
      } else if (current.length >= group.max_select) {
        showToast(`"${group.name}" เลือกได้ไม่เกิน ${group.max_select} อย่าง`, 'info');
        return prev;
      } else {
        next = [...current, optionId];
      }

      return { ...prev, selection: { ...prev.selection, [group.id]: next } };
    });
  };

  const confirmEditing = () => {
    if (!editing) return;

    const missing = missingRequired(editing.product, editing.selection);
    if (missing.length > 0) {
      showToast(`กรุณาเลือก "${missing[0].name}"`, 'error');
      return;
    }

    // เก็บ "ชื่อ+ราคา" ของตัวเลือกไว้ในตะกร้าด้วย เพื่อแสดงผลโดยไม่ต้องไปไล่หาใน products อีก
    const chosen = editing.product.option_groups.flatMap((g) =>
      (editing.selection[g.id] || []).map((id) => {
        const opt = g.options.find((o) => o.id === id);
        return { id, name: opt?.name || '', group: g.name, delta: opt?.price_delta_satang || 0 };
      })
    );

    const line = {
      product: editing.product,
      selection: editing.selection,
      qty: editing.qty,
      note: editing.note.trim(),
      chosen,
      unitPriceSatang: unitPrice(editing.product, editing.selection),
    };

    setCart((prev) =>
      editing.cartIndex === null
        ? [...prev, line]
        : prev.map((l, i) => (i === editing.cartIndex ? line : l))
    );

    showToast(
      editing.cartIndex === null ? 'เพิ่มลงตะกร้าแล้ว' : 'แก้ไขรายการแล้ว',
      'success'
    );
    setEditing(null);
  };

  const removeLine = (index) => setCart((prev) => prev.filter((_, i) => i !== index));

  const changeLineQty = (index, delta) =>
    setCart((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, qty: Math.min(20, Math.max(1, l.qty + delta)) } : l
      )
    );

  // ---------- ส่งออเดอร์ ----------
  const submitOrder = async () => {
    if (cart.length === 0 || submitting || cannotAfford) return;

    setSubmitting(true);
    try {
      // ส่งไปเฉพาะ id — ไม่ส่งราคา ไม่ส่งยอดรวม ให้ DB คิดเองทั้งหมด
      const items = cart.map((line) => ({
        product_id: line.product.id,
        qty: line.qty,
        option_ids: line.chosen.map((o) => o.id),
        note: line.note || null,
      }));

      const { data, error } = await supabase.rpc('place_order_v2', {
        p_items: items,
        p_idem: newIdempotencyKey('coffee'),
        p_note: orderNote.trim() || null,
      });

      if (error) {
        console.error('[coffee] place_order_v2 error:', error);
        showToast(`สั่งซื้อไม่สำเร็จ: ${error.message}`, 'error');
        return;
      }

      if (!data?.ok) {
        showToast(placeOrderErrorText(data?.error, data), 'error');
        return;
      }

      await updateBalance(); // ดึงยอดจริงจาก DB มาแสดงใหม่
      setCart([]);
      setOrderNote('');
      setCartOpen(false);
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

  // ---------- สไตล์ที่ใช้ซ้ำ ----------
  const textPrimary = isDark ? 'text-white' : 'text-sbac-navy';
  const textMuted = isDark ? 'text-content-secondary' : 'text-ink-muted';
  const panel = isDark ? 'bg-white/[0.06] border-white/10' : 'bg-surface-card border-slate-100';

  const editingUnit = editing ? unitPrice(editing.product, editing.selection) : 0;

  /* กันยอดเงินไม่พอตั้งแต่ฝั่งหน้าเว็บ
     เดิมปล่อยให้กดยืนยันไปก่อน แล้วรอเซิร์ฟเวอร์ตอบ INSUFFICIENT_FUNDS กลับมา
     นักเรียนเสียเที่ยวไปหนึ่งรอบ แล้วต้องมานั่งเดาว่าจะเอาแก้วไหนออก
     การเช็คฝั่ง DB ยังอยู่เหมือนเดิม (ห้ามเอาออก) อันนี้แค่บอกล่วงหน้า */
  const balance = user?.balance_satang || 0;
  const shortfall = Math.max(0, cartTotal - balance);
  const cannotAfford = shortfall > 0;

  // เพิ่มแก้วนี้แล้วจะเกินยอดเงินไหม ใช้เตือนตั้งแต่ในหน้าเลือกตัวเลือก
  const editingWouldExceed =
    editing !== null &&
    editing.cartIndex === null &&
    cartTotal + editingUnit * editing.qty > balance;

  return (
    <div className="space-y-6 pb-24 xl:pb-28">
      {/* Header */}
      <div
        className={`flex justify-between items-center p-4 rounded-2xl border transition-colors duration-300 ${
          isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
        }`}
      >
        <h2 className={`text-xl font-extrabold flex items-center gap-2 ${textPrimary}`}>
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
            <History size={14} aria-hidden="true" />
            ประวัติ
          </button>
          <span className={`text-xs font-bold ${textMuted}`}>
            บัตร:{' '}
            <span className={`font-extrabold ${isDark ? 'text-accent-amber' : 'text-sbac-navy'}`}>
              {formatBaht(user?.balance_satang || 0)} ฿
            </span>
          </span>
        </div>
      </div>

      {/* ---------- เมนู ---------- */}
      {loadingMenu ? (
        <div className="text-center py-10">
          <RefreshCw className="animate-spin text-brand mx-auto mb-2" size={24} aria-hidden="true" />
          <span className={`text-xs font-semibold ${textMuted}`}>กำลังโหลดเมนู...</span>
        </div>
      ) : products.length === 0 ? (
        <div className={`rounded-3xl border shadow-sm p-8 text-center space-y-2 ${panel}`}>
          <div className="text-4xl" aria-hidden="true">🗒️</div>
          <h3 className={`text-sm font-extrabold ${textPrimary}`}>ยังไม่มีรายการเครื่องดื่ม</h3>
          <p className={`text-xs ${textMuted}`}>
            กรุณาติดต่อผู้ดูแลระบบให้เพิ่มสินค้าในตาราง products
          </p>
        </div>
      ) : (
        byCategory.map(([category, items]) => (
          <section key={category} className="space-y-3">
            <h3 className={`text-sm font-extrabold ${textPrimary}`}>{category}</h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map((item) => (
                <GlassCard key={item.id} onClick={() => openProduct(item)}>
                  <div className="text-center py-4 space-y-2">
                    <div
                      className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-sm overflow-hidden ${
                        isDark ? 'bg-white/10' : 'bg-slate-50'
                      }`}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        productEmoji(item.name, item.category)
                      )}
                    </div>

                    <h4 className={`text-sm font-extrabold ${textPrimary}`}>{item.name}</h4>

                    {item.option_groups.length > 0 && (
                      <p className={`text-[10px] ${textMuted}`}>
                        เลือก{item.option_groups.map((g) => g.name).slice(0, 2).join(' / ')}ได้
                      </p>
                    )}

                    <div
                      className={`text-sm font-extrabold pt-1 ${
                        isDark ? 'text-accent-amber font-black' : 'text-sbac-red'
                      }`}
                    >
                      {formatBaht(item.price_satang)} ฿
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </section>
        ))
      )}

      {/* ---------- แถบตะกร้าลอยด้านล่าง ---------- */}
      {cart.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 z-40 pointer-events-none xl:bottom-6 xl:left-64">
          <div className="max-w-md xl:max-w-[1200px] mx-auto pointer-events-auto">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-4 rounded-2xl text-sm transition-all shadow-button flex items-center justify-between px-5"
            >
              <span className="flex items-center gap-2">
                <ShoppingCart size={18} aria-hidden="true" />
                ตะกร้า {cartCount} แก้ว
              </span>
              <span>{formatBaht(cartTotal)} ฿</span>
            </button>
          </div>
        </div>
      )}

      {/* ---------- โมดัลเลือกตัวเลือก ---------- */}
      <Modal
        isOpen={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? editing.product.name : ''}
        footer={
          editing && (
            <div className="space-y-2">
              {editingWouldExceed && (
                <p className="text-[11px] font-bold text-accent-rose text-center">
                  ใส่แก้วนี้แล้วยอดจะเกินเงินในบัตร
                </p>
              )}
              <button
                onClick={confirmEditing}
                className="w-full bg-sbac-blue hover:bg-sbac-navy text-white font-extrabold py-4 rounded-2xl text-sm transition-all shadow-button flex items-center justify-center gap-2"
              >
                <ShoppingCart size={18} aria-hidden="true" />
                {editing.cartIndex === null
                  ? `ใส่ตะกร้า (${formatBaht(editingUnit * editing.qty)} ฿)`
                  : `บันทึกการแก้ไข (${formatBaht(editingUnit * editing.qty)} ฿)`}
              </button>
            </div>
          )
        }
      >
        {editing && (
          <div className="space-y-5">
            {editing.product.option_groups.length === 0 && (
              <p className={`text-xs font-semibold ${textMuted}`}>
                เมนูนี้ยังไม่ได้ตั้งตัวเลือกไว้ในระบบ สั่งได้ตามจำนวนที่ต้องการเลย
              </p>
            )}

            {editing.product.option_groups.map((group) => {
              const selected = editing.selection[group.id] || [];
              const required = group.min_select > 0;

              return (
                <fieldset key={group.id} className="space-y-2">
                  <legend className="flex items-center gap-2 mb-2">
                    <span className={`text-sm font-extrabold ${textPrimary}`}>{group.name}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        required
                          ? 'bg-rose-500/10 text-accent-rose'
                          : isDark
                          ? 'bg-white/10 text-content-muted'
                          : 'bg-slate-100 text-ink-muted'
                      }`}
                    >
                      {required
                        ? `บังคับเลือก ${group.min_select}`
                        : `ไม่บังคับ สูงสุด ${group.max_select}`}
                    </span>
                  </legend>

                  <div className="grid grid-cols-2 gap-2">
                    {group.options.map((opt) => {
                      const isOn = selected.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleOption(group, opt.id)}
                          aria-pressed={isOn}
                          className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                            isOn
                              ? 'bg-sbac-blue border-sbac-blue text-white'
                              : isDark
                              ? 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                              : 'bg-slate-50 border-slate-200 text-ink-secondary hover:bg-slate-100'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {isOn && <Check size={12} className="shrink-0" aria-hidden="true" />}
                            <span className="truncate">{opt.name}</span>
                          </span>
                          {opt.price_delta_satang !== 0 && (
                            <span className="shrink-0 opacity-80">
                              {opt.price_delta_satang > 0 ? '+' : ''}
                              {formatBaht(opt.price_delta_satang)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            {/* หมายเหตุรายแก้ว */}
            <div>
              <label
                htmlFor="item-note"
                className={`text-sm font-extrabold block mb-2 ${textPrimary}`}
              >
                หมายเหตุถึงบาริสต้า (ไม่บังคับ)
              </label>
              <input
                id="item-note"
                type="text"
                value={editing.note}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                maxLength={200}
                placeholder="เช่น ไม่ใส่หลอด / น้ำแข็งน้อย"
                className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold border focus:outline-none transition-all ${
                  isDark
                    ? 'bg-slate-900 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50'
                    : 'bg-slate-50 border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-surface-card'
                }`}
              />
            </div>

            {/* จำนวน */}
            <div className={`p-4 rounded-2xl border space-y-3 ${isDark ? 'bg-white/[0.04] border-white/5' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => setEditing({ ...editing, qty: Math.max(1, editing.qty - 1) })}
                  disabled={editing.qty <= 1}
                  aria-label="ลดจำนวน"
                  className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                    isDark
                      ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      : 'bg-surface-card border-slate-200 text-sbac-navy hover:bg-slate-100'
                  }`}
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
                <span className={`text-3xl font-black tabular-nums ${textPrimary}`}>
                  {editing.qty}
                </span>
                <button
                  onClick={() => setEditing({ ...editing, qty: Math.min(20, editing.qty + 1) })}
                  disabled={editing.qty >= 20}
                  aria-label="เพิ่มจำนวน"
                  className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 ${
                    isDark
                      ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      : 'bg-surface-card border-slate-200 text-sbac-navy hover:bg-slate-100'
                  }`}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>

              <div
                className={`flex justify-between items-center pt-3 border-t text-sm font-bold ${
                  isDark ? 'border-white/10 text-slate-200' : 'border-slate-200 text-ink-secondary'
                }`}
              >
                <span>รวม {editing.qty} แก้ว</span>
                <span className={`text-lg font-extrabold ${isDark ? 'text-accent-amber' : 'text-sbac-red'}`}>
                  {formatBaht(editingUnit * editing.qty)} ฿
                </span>
              </div>
            </div>

          </div>
        )}
      </Modal>

      {/* ---------- โมดัลตะกร้า + ยืนยันสั่ง ---------- */}
      <Modal
        isOpen={cartOpen}
        onClose={() => !submitting && setCartOpen(false)}
        title="🛒 ตะกร้าของคุณ"
        footer={
          cart.length > 0 && (
            <button
              onClick={submitOrder}
              disabled={submitting || cannotAfford}
              className="w-full bg-sbac-blue hover:bg-sbac-navy disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold py-4 rounded-2xl text-sm transition-all shadow-button flex items-center justify-center gap-2"
            >
              <ShoppingCart size={18} aria-hidden="true" />
              {cannotAfford
                ? `ยอดเงินไม่พอ ขาดอีก ${formatBaht(shortfall)} ฿`
                : submitting
                ? 'กำลังทำรายการ...'
                : `ยืนยันสั่ง (${formatBaht(cartTotal)} ฿)`}
            </button>
          )
        }
      >
        <div className="space-y-5">
          {cart.length === 0 ? (
            <p className={`text-xs font-semibold text-center py-6 ${textMuted}`}>
              ตะกร้าว่างอยู่
            </p>
          ) : (
            <ul className="space-y-3">
              {cart.map((line, index) => (
                <li
                  key={`${line.product.id}-${index}`}
                  className={`p-3 rounded-2xl border space-y-2 ${
                    isDark ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openCartLine(index)}
                      className="text-left min-w-0 flex-1"
                    >
                      <span className={`text-sm font-extrabold block ${textPrimary}`}>
                        {line.product.name}
                      </span>
                      {line.chosen.length > 0 && (
                        <span className={`text-[10px] font-semibold block mt-0.5 ${textMuted}`}>
                          {optionSummary(line.chosen)}
                        </span>
                      )}
                      {line.note && (
                        <span className="text-[10px] font-semibold block mt-0.5 text-accent-amber">
                          หมายเหตุ: {line.note}
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-brand block mt-1">
                        แตะเพื่อแก้ไขตัวเลือก
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      aria-label={`เอา ${line.product.name} ออกจากตะกร้า`}
                      className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-surface-card'}`}
                    >
                      <Trash2 size={14} className="text-accent-rose" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => changeLineQty(index, -1)}
                        disabled={line.qty <= 1}
                        aria-label="ลดจำนวน"
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center disabled:opacity-40 ${
                          isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-surface-card border-slate-200 text-sbac-navy'
                        }`}
                      >
                        <Minus size={14} aria-hidden="true" />
                      </button>
                      <span className={`text-sm font-black tabular-nums ${textPrimary}`}>{line.qty}</span>
                      <button
                        type="button"
                        onClick={() => changeLineQty(index, 1)}
                        disabled={line.qty >= 20}
                        aria-label="เพิ่มจำนวน"
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center disabled:opacity-40 ${
                          isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-surface-card border-slate-200 text-sbac-navy'
                        }`}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                    </div>

                    <span className={`text-sm font-extrabold ${isDark ? 'text-accent-amber' : 'text-sbac-red'}`}>
                      {formatBaht(line.unitPriceSatang * line.qty)} ฿
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {cart.length > 0 && (
            <>
              <div>
                <label
                  htmlFor="order-note"
                  className={`text-sm font-extrabold block mb-2 ${textPrimary}`}
                >
                  หมายเหตุถึงร้าน (ทั้งออเดอร์)
                </label>
                <input
                  id="order-note"
                  type="text"
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  maxLength={300}
                  placeholder="เช่น ขอถุงแยก 2 ใบ"
                  className={`w-full rounded-xl px-4 py-2.5 text-xs font-semibold border focus:outline-none transition-all ${
                    isDark
                      ? 'bg-slate-900 border-white/10 text-white placeholder:text-content-muted focus:border-sbac-blue-light/50'
                      : 'bg-slate-50 border-slate-200 text-ink placeholder:text-ink-light focus:border-sbac-blue focus:bg-surface-card'
                  }`}
                />
              </div>

              <div
                className={`p-4 rounded-2xl border space-y-2 text-sm font-semibold ${
                  isDark ? 'bg-white/[0.06] border-white/10' : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex justify-between">
                  <span className={textMuted}>ยอดชำระ</span>
                  <span className={`text-lg font-extrabold ${isDark ? 'text-accent-amber' : 'text-sbac-red'}`}>
                    {formatBaht(cartTotal)} ฿
                  </span>
                </div>
                <div className={`flex justify-between border-t pt-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <span className={textMuted}>ยอดคงเหลือหลังหัก</span>
                  <span className={cannotAfford ? 'text-accent-rose font-extrabold' : textPrimary}>
                    {formatBaht(balance - cartTotal)} ฿
                  </span>
                </div>

                {cannotAfford && (
                  <p className="text-[11px] font-bold text-accent-rose pt-1 leading-relaxed">
                    ยอดเงินในบัตรไม่พอ ขาดอีก {formatBaht(shortfall)} บาท
                    <span className={`block font-semibold ${textMuted}`}>
                      เอาบางรายการออก หรือเติมเงินที่จุดบริการการเงินก่อน
                    </span>
                  </p>
                )}
              </div>

              <button
                onClick={() => setCartOpen(false)}
                disabled={submitting}
                className={`w-full border-2 font-extrabold py-3 rounded-2xl text-sm transition-all flex items-center justify-center gap-2 ${
                  isDark
                    ? 'border-white/20 text-slate-200 hover:bg-white/10'
                    : 'border-slate-200 text-ink-secondary hover:bg-slate-50'
                }`}
              >
                <X size={16} aria-hidden="true" />
                สั่งเพิ่ม
              </button>

              <p className={`text-[10px] leading-relaxed ${textMuted}`}>
                ระบบคำนวณราคาจากฝั่งเซิร์ฟเวอร์ และมีระบบกันตัดเงินซ้ำ
                หากกดค้างหรือเน็ตสะดุด จะไม่ถูกหักเงินสองรอบ
              </p>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
