import { formatBaht } from '../../utils/identity';

/* แถบโปรไฟล์หัวหน้าแรก — ใช้ร่วมกันทั้งฝั่งนักเรียนและฝั่งอาจารย์

   ก่อนหน้านี้สองหน้านี้เป็นคนละภาษาภาพกันคนละเรื่อง:
     หน้าครู     แถบไล่สีน้ำเงินเข้ม การ์ดใหญ่ ป้ายบอกบทบาท
     หน้านักเรียน กล่องเทาจาง ๆ ตัวอักษรเล็ก ไม่มีป้ายบอกอะไรเลย
   ทั้งที่เป็น "หัวหน้าแรก" เหมือนกัน ทำหน้าที่เดียวกัน และวางอยู่ตำแหน่งเดียวกัน

   รวมเป็นตัวเดียวเพื่อให้แก้ครั้งเดียวแล้วเหมือนกันทุกหน้าจริง ๆ
   ไม่ใช่ก๊อปคลาสไปวางแล้วรอเพี้ยนกันอีกรอบตอนแก้ครั้งถัดไป

   facts = รายการข้อมูลระบุตัวตน (ป้าย + ค่า) หน้าไหนอยากโชว์อะไรก็ส่งมา
   ฝั่งนักเรียนส่งสามอย่าง: รหัสประจำตัว / ระดับชั้น / ครูที่ปรึกษา */
export default function ProfileBanner({
  roleLabel,
  name,
  facts = [],
  balanceSatang = 0,
  onWalletClick,
}) {
  return (
    <div className="bg-gradient-to-r from-sbac-navy to-sbac-blue p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
      <div className="absolute top-0 right-0 w-36 h-36 bg-white/5 rounded-full -mr-10 -mt-10 pointer-events-none" />

      <div className="relative z-10 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div className="space-y-2 min-w-0">
            <span className="text-[11px] bg-white/20 text-white font-bold px-3 py-1 rounded-full inline-block">
              {roleLabel}
            </span>
            <h2 className="text-2xl font-extrabold truncate">{name}</h2>
          </div>

          {/* Wallet — ดึง balance_satang ตัวเดียวกันจาก AuthContext ทั้งสองฝั่ง */}
          {onWalletClick && (
            <button
              type="button"
              onClick={onWalletClick}
              aria-label="ดูยอดเงินในบัตรและเติมเงิน"
              className="shrink-0 p-3 rounded-2xl bg-white/15 hover:bg-white/20 border border-white/20 flex flex-col items-end active:scale-95 transition-all"
            >
              <span className="text-[9px] font-bold text-white/70">Wallet</span>
              <span className="text-base font-extrabold text-white">
                {formatBaht(balanceSatang)} <span className="text-xs font-semibold text-white/80">฿</span>
              </span>
            </button>
          )}
        </div>

        {facts.length > 0 && (
          /* grid ไม่ใช่ flex-wrap: ป้ายกับค่าของแต่ละช่องจะได้อยู่ระดับเดียวกัน
             แม้ค่าจะยาวไม่เท่ากัน (ชื่อครูยาวกว่ารหัสนักเรียนเกือบเท่าตัวเสมอ) */
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 pt-4 border-t border-white/15">
            {facts.map((fact) => (
              /* wide = กินสองช่องตอนอยู่บนมือถือ (จอแคบเหลือแค่ 2 คอลัมน์)
                 ใช้กับค่าที่ยาวอย่างชื่อครู ไม่งั้นจะโดนตัดเหลือ "อ.ณัฐธิดา สุข..." */
              <div key={fact.label} className={`min-w-0 ${fact.wide ? 'col-span-2 sm:col-span-1' : ''}`}>
                <dt className="text-[11px] font-bold text-white/70">{fact.label}</dt>
                <dd className="text-xs font-extrabold text-white truncate" title={fact.value || undefined}>
                  {fact.value || '—'}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
