/* การแจ้งเตือนระดับระบบปฏิบัติการ (Web Notification)

   ทำไมต้องมีทั้งที่มี toast ในแอปอยู่แล้ว:
     นักเรียนสั่งกาแฟแล้วสลับไปทำอย่างอื่น — ปิดจอ เล่นแอปอื่น เปลี่ยนแท็บ
     toast ที่เด้งในหน้าที่ไม่มีใครมองอยู่เท่ากับไม่ได้เตือน
     ตัวนี้ทำงานตอนหน้าเว็บถูกซ่อนอยู่เท่านั้น ถ้ากำลังดูจออยู่ overlay ในแอปพอแล้ว

   เรื่องการขอสิทธิ์: ห้ามขอทันทีที่เปิดแอป เบราว์เซอร์นับว่าเป็นพฤติกรรมกวนใจ
   และผู้ใช้จะกด "บล็อก" ทิ้งไว้ถาวรตั้งแต่ยังไม่รู้ว่าจะได้อะไร
   จึงไปขอตอนสั่งซื้อสำเร็จแทน — จังหวะที่ผู้ใช้เพิ่งบอกเองว่า "ฉันกำลังรอของ" */

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

/** ขอสิทธิ์แจ้งเตือน — เรียกได้บ่อยเท่าไหร่ก็ได้ ถ้าตอบไปแล้วจะไม่ถามซ้ำ */
export async function requestNotifyPermission() {
  if (!supported() || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    /* บางเบราว์เซอร์โยน error ถ้าเรียกนอก user gesture — ไม่เป็นไร ข้ามไป */
  }
}

/**
 * แจ้งเตือนออกนอกแอป
 * @param {string} title
 * @param {{ body?: string, tag?: string, force?: boolean }} options
 *        tag   — ใบเดิมเตือนซ้ำจะทับอันเก่า ไม่กองเป็นตั้ง
 *        force — ส่งแม้หน้าเว็บกำลังเปิดอยู่ (ปกติไม่ส่ง เพราะมี overlay ให้เห็นแล้ว)
 */
export function notify(title, { body, tag, force = false } = {}) {
  if (!supported() || Notification.permission !== 'granted') return;
  if (!force && document.visibilityState === 'visible') return;

  try {
    const n = new Notification(title, { body, tag, icon: '/apple-touch-icon.png', badge: '/favicon-64.png' });
    // กดแล้วให้เด้งกลับมาที่แท็บของแอป แทนที่จะต้องไปหาเอง
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* Android บางรุ่นบังคับให้ยิงผ่าน service worker เท่านั้น — ปล่อยผ่าน ยังมี overlay กับเสียง */
  }
}

export default notify;
