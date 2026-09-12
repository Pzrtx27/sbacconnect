# รูปเมนู

รูปในโฟลเดอร์นี้ใช้แทนไอคอนเส้นในหน้าเมนู (ดู `src/utils/menuPhotos.js`)

## ชุดปัจจุบัน: กราฟิกแบรนด์ SBAC (ของชั่วคราว)

รูปทั้ง 10 ตอนนี้เป็น **ภาพวาดด้วยโค้ด ไม่ใช่ภาพถ่าย** — แก้วใส พื้นหลังน้ำเงินโทนเดียวกับ
โปสเตอร์ Back to School ของร้าน และมีตัวอักษร SBAC COFFEE STUDIO อยู่บนแก้ว

ตัวสร้างอยู่ที่ `tools/menu-tiles.html` เปิดผ่าน
<http://localhost:5173/tools/menu-tiles.html> ตอน `npm run dev`
อยากเปลี่ยนสีเครื่องดื่มหรือสีพื้นหลัง แก้ตัวแปร `MENU` กับ `BG` ในไฟล์นั้นแล้วกดสร้างใหม่

แบ่งเป็น 3 แบบตามลักษณะของจริง:

| แบบ | ใช้กับ | หน้าตา |
|---|---|---|
| แก้วเย็น | `espresso` `latte` `cup` `cocoa` `matcha` `bubble` `soda` | แก้วพลาสติกใสมีฝาโดม น้ำแข็ง โลโก้บนแก้ว |
| แก้วร้อน | `tea` | แก้วกระดาษมีฝาและปลอกกันร้อน มีไอร้อน |
| ของว่าง | `bread` `cookie` | วางในจาน ไม่ใช่แก้ว |

## เป้าหมายถัดไป: เปลี่ยนเป็นรูปถ่ายจริงของร้าน

ชุดกราฟิกนี้เป็นของชั่วคราว ปลายทางคือรูปถ่ายแก้วจริงของ SBAC Coffee Studio
ซึ่งจะได้โลโก้ร้านที่พิมพ์อยู่บนแก้วจริง ๆ โดยไม่ต้องตัดต่ออะไรเลย

หาได้ 2 ทาง:

1. **ขอไฟล์จากเพจร้าน** — เพจ `@sbaccoffeestudio` มีรูปเมนูที่ร้านถ่ายเองอยู่แล้ว
   (เช่นในโปสเตอร์ Back to School มีรูป Milo Milk กับ Classic Thai Tea)
   เป็นของร้านเอง ใช้ทำแอปของร้านได้เต็มที่
2. **ถ่ายเอง** — คำแนะนำการถ่ายอยู่ในหน้าเครื่องมือข้อล่าง

ได้รูปมาแล้วเปิด <http://localhost:5173/tools/menu-photo-prep.html>
ลากรูปใส่ เลือกช่องเมนู จัดครอป แล้วกดเซฟลงโฟลเดอร์ `public/menu`

ไฟล์ใหม่จะทับไฟล์เดิมด้วยชื่อเดียวกัน **ไม่ต้องแก้โค้ดเลย**

## ตั้งรูปเฉพาะเมนูเดียว

ถ้าอยากให้เมนูใดเมนูหนึ่งมีรูปของตัวเอง (ไม่ใช้รูปประจำหมวด) ใส่ URL ลงคอลัมน์
`products.image_url` ใน Supabase ค่านี้ชนะรูปประจำหมวดเสมอ:

```sql
update public.products set image_url = 'https://.../latte.jpg' where id = 1;
```

ถ้ารูปโหลดไม่ขึ้น (ไฟล์หาย / เน็ตตึง) ช่องนั้นจะกลับไปวาดไอคอนเส้นให้เองโดยอัตโนมัติ
ดู `src/components/ui/MenuThumb.jsx`

## ประวัติ: ชุดรูปถ่าย CC0 ที่เคยใช้

ก่อนหน้าชุดกราฟิกนี้เคยใช้ภาพถ่าย CC0 (สาธารณสมบัติ) จาก [Openverse](https://openverse.org)
ถูกเขียนทับไปแล้ว แต่บันทึกที่มาไว้เผื่ออยากย้อนกลับไปใช้:

| ช่อง | แหล่ง | ผู้ถ่าย | หน้าต้นทาง |
|---|---|---|---|
| `espresso` | rawpixel | — | https://www.rawpixel.com/image/5924842 |
| `latte` | stocksnap | Nolan Issac | https://stocksnap.io/photo/coffee-latte-RP0EJV51J6 |
| `matcha` | rawpixel | — | https://www.rawpixel.com/image/6028471 |
| `bubble` | rawpixel | — | https://www.rawpixel.com/image/5904829 |
| `soda` | stocksnap | Tim Sullivan | https://stocksnap.io/photo/summer-cocktail-HGO20PXZVV |
| `cocoa` | stocksnap | Tohm Brigitte | https://stocksnap.io/photo/hot-chocolate-TKMJJ9D81G |
| `tea` | stocksnap | Andrew E Weber | https://stocksnap.io/photo/tea-cup-0ZS74TCOME |
| `bread` | rawpixel | — | https://www.rawpixel.com/image/5916966 |
| `cookie` | stocksnap | PICSELI | https://stocksnap.io/photo/chocolatechip-cookies-PAUNN1ZOQL |
| `cup` | rawpixel | — | https://www.rawpixel.com/image/3295706 |
