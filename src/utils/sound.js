/* เสียงแจ้งเตือนสั้น ๆ สังเคราะห์เองด้วย Web Audio

   ทำไมไม่โหลดไฟล์เสียง:
     เสียงแจ้งเตือนต้องดังตอนที่ "เน็ตเพิ่งกระตุก" หรือกำลังยุ่ง ซึ่งเป็นจังหวะ
     ที่การไปดึงไฟล์จาก CDN ภายนอกมักช้าหรือล้มพอดี แถมยังบล็อกไม่ให้ใช้ออฟไลน์
     สองสามบรรทัดนี้ดังทันทีเสมอ ไม่กินแบนด์วิดท์ ไม่ต้องมีไฟล์ในโปรเจกต์

   ข้อจำกัดของเบราว์เซอร์: AudioContext เริ่มในสถานะ suspended จนกว่าผู้ใช้
   จะแตะหน้าจอสักครั้ง จึงมี unlockAudio() ไว้ให้เรียกตอนผู้ใช้กดปุ่ม
   (เช่นตอนกดสั่งซื้อ) เพื่อ "ปลดล็อก" ไว้ล่วงหน้าก่อนถึงเวลาต้องดังจริง */

let ctx = null;

function audioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** เรียกตอนผู้ใช้กดอะไรสักอย่าง เพื่อให้เสียงที่จะดังทีหลัง (ตอนออเดอร์เสร็จ) ดังได้จริง */
export function unlockAudio() {
  try {
    const ac = audioContext();
    if (ac && ac.state === 'suspended') ac.resume();
  } catch {
    /* เบราว์เซอร์ไม่รองรับก็ปล่อยผ่าน เสียงเป็นของแถม ไม่ใช่ของจำเป็น */
  }
}

/** โน้ตเดียว: ซองเสียงแบบ attack สั้น decay ยาว ให้ฟังคล้ายกระดิ่งมากกว่าเสียงบี๊บ */
function tone(ac, freq, startAt, duration, peak) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/* คนละเสียงกันตามความหมาย จะได้แยกออกโดยไม่ต้องมองจอ
     ready  — สองโน้ตไล่ขึ้น (C6→E6) ฟังแล้วรู้ว่า "เสร็จ/ดีแล้ว"
     new    — สามโน้ตสั้นเร็ว เรียกความสนใจบาริสต้าตอนมือไม่ว่าง */
const PATTERNS = {
  ready: [
    [1046.5, 0, 0.5, 0.22],
    [1318.5, 0.13, 0.6, 0.22],
  ],
  new: [
    [880, 0, 0.18, 0.2],
    [1174.7, 0.1, 0.18, 0.2],
    [880, 0.2, 0.25, 0.16],
  ],
};

/** เล่นเสียงแจ้งเตือน — ล้มเหลวเงียบ ๆ เสมอ ห้ามให้เรื่องเสียงทำหน้าจอพัง */
export function playChime(kind = 'ready') {
  try {
    const ac = audioContext();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();

    const now = ac.currentTime + 0.02;
    for (const [freq, offset, duration, peak] of PATTERNS[kind] || PATTERNS.ready) {
      tone(ac, freq, now + offset, duration, peak);
    }
  } catch {
    /* ผู้ใช้ยังไม่เคยแตะหน้าจอ หรือเบราว์เซอร์บล็อกเสียง — ข้ามไป ยังมี toast กับ overlay อยู่ */
  }
}

export default playChime;
