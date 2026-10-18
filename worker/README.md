# baanbow-office — ระบบออกเอกสาร + ติดตามงาน สั่งผ่าน LINE OA

Worker แยกตัวหนึ่ง ผูกเฉพาะ 3 path บน `baanbow.online` **ไม่แตะ deploy ของหน้าเว็บเดิมเลย**

```
LINE OA ──▶ POST /webhook ──▶ Claude อ่านข้อความ ──▶ โค้ดคำนวณยอด/ออกเลขที่ (D1) ──▶ ตอบลิงก์ /d/<token>
Cron 08:00 น. ───────────────▶ push งานเลยกำหนด/ครบวันนี้/ครบพรุ่งนี้
```

| Path | ทำอะไร |
|---|---|
| `POST /webhook` | รับ LINE ตรวจ `x-line-signature` ด้วย Web Crypto |
| `GET /d/:token` | เอกสาร A4 พิมพ์/บันทึก PDF (token สุ่ม 32 ตัว เดาไม่ได้) |
| `GET /admin` | หลังบ้านมือถือ 3 แท็บ — **ต้องกั้นด้วย Cloudflare Access** (ดูขั้นที่ 7) |

path อื่นทั้งหมดของเว็บ (`/`, `styles.css`, `/design-tool/*`, assets) ไม่ผ่าน Worker ตัวนี้

---

## ขั้นตอน deploy

ทำใน `worker/` ทั้งหมด

### 1. ติดตั้ง

```bash
cd worker && npm install
```

### 2. สร้างฐานข้อมูล D1

```bash
npx wrangler d1 create baanbow-office
```

คำสั่งนี้จะพิมพ์ `database_id` ออกมา — **เอาไปใส่แทน `PUT_D1_DATABASE_ID_HERE` ใน `wrangler.toml`**

### 3. สร้างตาราง

```bash
npx wrangler d1 migrations apply baanbow-office --remote
```

(ตัด `--remote` ออก = ลงฐานข้อมูลในเครื่องสำหรับทดสอบ)

### 4. ใส่ secret ทั้ง 4 ตัว

รันทีละคำสั่ง แล้วพิมพ์ค่าตอนที่มันถาม (ค่าไม่ถูกเก็บลง git และไม่ขึ้นบนหน้าจอ)

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
```

```bash
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
```

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

```bash
npx wrangler secret put ALLOWED_USER_IDS
```

- `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` — จาก LINE Developers Console แท็บ Messaging API
- `ANTHROPIC_API_KEY` — จาก console.anthropic.com
- `ALLOWED_USER_IDS` — userId ของเจ้าของ คั่นด้วย `,` **ยังไม่รู้ให้ข้ามไปก่อน** แล้วทำขั้นที่ 6

`CLAUDE_MODEL` ไม่ใช่ secret อยู่ใน `[vars]` ของ `wrangler.toml` ค่าเริ่มต้น `claude-sonnet-5-5`

### 5. deploy

```bash
npx wrangler deploy
```

ครั้งแรก wrangler จะถามว่าจะสร้าง route ให้ไหม — ตอบ yes
ถ้าสร้างไม่สำเร็จ หรืออยากตั้งเอง ไปที่ Cloudflare dashboard → Workers & Pages → `baanbow-office` → Settings → Domains & Routes → Add route แล้วใส่ครบ 6 เส้น:

```
baanbow.online/webhook          www.baanbow.online/webhook
baanbow.online/d/*              www.baanbow.online/d/*
baanbow.online/admin*           www.baanbow.online/admin*
```

> **ทำไม 6 เส้น** — `baanbow.online` กับ `www.baanbow.online` เสิร์ฟ 200 ทั้งคู่ ไม่ redirect หากัน ถ้าผูกแค่ apex แล้ว LINE ยิง webhook มาที่ `www` จะตก 404 เงียบๆ
>
> **ชนกับเว็บเดิมไหม** — ไม่ชน Cloudflare เลือก route ที่เจาะจงกว่าเสมอ 3 path นี้เข้า Worker ใหม่ ที่เหลือไปที่ deploy เดิม ใช้ได้ทั้งกรณีเว็บเดิมเป็น Pages และเป็น Worker static assets

### 6. ตั้ง LINE webhook แล้วหา userId

1. LINE Developers Console → Messaging API → **Webhook URL** = `https://www.baanbow.online/webhook` → กด Verify → เปิด **Use webhook**
2. ปิด **Auto-reply messages** กับ **Greeting messages** ไม่งั้นบอทจะตอบทับ
3. ทักบอทในแอป LINE ครั้งแรก — ถ้ายังไม่ได้ตั้ง `ALLOWED_USER_IDS` บอทจะตอบ userId ของคุณกลับมา
4. เอา userId ไปใส่: `npx wrangler secret put ALLOWED_USER_IDS` แล้ว `npx wrangler deploy` อีกครั้ง

หลังจากนี้คนอื่นที่ไม่ได้อยู่ในรายการสั่งงานไม่ได้ และบอทจะไม่ตอบอะไรเลย

### 7. กั้น /admin ด้วย Cloudflare Access

Worker ตัวนี้ **ไม่มีระบบ login ของตัวเอง** ตั้งใจให้ Access กั้นจากข้างนอก ถ้าไม่ตั้ง = ใครก็เปิดดูได้

Zero Trust → Access → Applications → Add a self-hosted application
- Application domain: `baanbow.online` path `admin`
- เพิ่ม path `admin` ของ `www.baanbow.online` ด้วย
- Policy: Allow → Emails → อีเมลของคุณ

อย่าใส่ `/webhook` กับ `/d/*` เข้า Access เด็ดขาด — LINE กับลูกค้าจะเข้าไม่ได้

### 8. ตั้งเลขเริ่มต้นของเอกสาร (ถ้าต้องการ)

เลขรันเริ่มที่ 1 โดยอัตโนมัติ ถ้าเคยออกเอกสารมาก่อนแล้วอยากให้เดินต่อจากของเดิม ตั้งค่าในตาราง `counters` — ใส่ **เลขใบล่าสุดที่ออกไปแล้ว** ใบถัดไปจะเป็นเลขนั้น +1

```bash
npx wrangler d1 execute baanbow-office --remote --command "UPDATE counters SET n=120 WHERE key='quotation'"
```

key ที่ใช้ได้: `quotation` `receipt` `tax_invoice` `receipt_tax_invoice`

### 9. ใส่วันหยุดประจำปี

สั่งจาก LINE ได้เลย (`เพิ่มวันหยุด 31 ธันวาคม สิ้นปี`) หรือใส่ทีเดียวหลายวัน:

```bash
npx wrangler d1 execute baanbow-office --remote --command "INSERT OR REPLACE INTO holidays(date,name) VALUES ('2027-01-01','วันขึ้นปีใหม่'),('2027-04-13','สงกรานต์')"
```

วันหยุดใช้เตือนตอนตั้งกำหนดส่งงานว่าตรงวันหยุดหรือเสาร์-อาทิตย์

---

## คำสั่งใน LINE

| พิมพ์ | ได้อะไร |
|---|---|
| `ทำใบเสนอราคา คุณสมชาย 081-234-5678 โบว์ 4 ชุด ชุดละ 2900 ส่วนลด 500 ไม่รวม vat` | สรุปยอดให้ดูก่อน |
| `ออกใบกำกับภาษีจาก QT181069001` | ดึงรายการจากใบเดิมมาออกใบใหม่ |
| `ยกเลิก RC181069003` | ประทับลายน้ำ "ยกเลิก" |
| `หา โตโยต้าพัทยา` / `หา QT181069001` | รายการเอกสารพร้อมลิงก์ |
| `สรุปเดือนนี้` | ยอดตามประเภท VAT ขาย งานค้าง |
| `เพิ่มงาน ติดตั้งโบว์บ้านคุณสมชาย ส่งมอบศุกร์หน้า` | สร้างงาน + เตือนถ้าตรงวันหยุด |
| `งาน 3 เสร็จแล้ว` | อัปเดตสถานะ |
| `งานค้าง` | งานที่ยังไม่ปิด เรียงตามกำหนดส่ง |
| `เพิ่มวันหยุด 31 ธันวาคม สิ้นปี` | เพิ่มลงตาราง holidays |
| `ยืนยัน` | ออกเลขที่จริง (เอกสารทุกใบต้องผ่านขั้นนี้) |
| `ยกเลิก` | ทิ้งรายการที่รออยู่ |

**เรื่อง VAT** — ถ้าไม่พิมพ์ว่า "รวม vat" / "ไม่รวม vat" / "ไม่มี vat" บอทจะถามกลับเสมอ ไม่เดาให้
ใบกำกับภาษี (TI) และใบเสร็จ/ใบกำกับภาษี (RT) บังคับมี VAT 7% ตอบ "ไม่มี vat" ไม่ได้

**หัก ณ ที่จ่าย** — พิมพ์ "หัก ณ ที่จ่าย 3%" ต่อท้าย รับเฉพาะ 1% กับ 3% ไม่พูดถึง = ไม่มี และไม่ขึ้นบนเอกสาร

---

## กฎที่เขียนไว้ในโค้ด

- **เงินเป็นสตางค์ (integer) ทุกจุด** AI ไม่เคยคิดเลข ทุกยอดคำนวณใน `src/money.js`
- **เลขที่เอกสาร** = คำนำหน้า + `ddmmyy` (พ.ศ. 2 หลัก) + เลขรัน 3 หลัก
  เลขรัน **ต่อเนื่องตลอด แยกตามประเภท ไม่รีเซ็ตรายวัน** และออกด้วย SQL คำสั่งเดียวแบบ atomic ตอนพิมพ์ "ยืนยัน" เท่านั้น
  เกิน 999 แล้วเลขจะยาวขึ้นเอง ไม่ตัดหลักทิ้ง เลขจึงไม่ซ้ำตลอดอายุระบบ
- **ไม่มีคำสั่งลบเอกสาร** ยกเลิกได้อย่างเดียว (`status='void'`) เลขที่ที่ใช้แล้วไม่ถูกนำกลับมาใช้ซ้ำ
- **ลูกค้า** บันทึกอัตโนมัติ ออกบิลครั้งถัดไปพิมพ์แค่ชื่อ ที่อยู่/เลขภาษี/สาขา จะถูกดึงมาเติมเอง
  ข้อมูลลูกค้าบนเอกสารเก่าเป็นสำเนา ณ วันออก แก้ที่อยู่วันนี้ไม่กระทบเอกสารที่ออกไปแล้ว
- **เวลา Asia/Bangkok เสมอ** ไม่ขึ้นกับเวลาของเครื่องที่รัน (Worker รันที่ UTC)
- **รายการที่รอยืนยันหมดอายุ 15 นาที** และอ่านแล้วลบทันที กดยืนยันซ้ำไม่ได้เอกสารสองใบ

---

## เอกสาร A4

`src/render.js` สร้างหน้าจากแม่แบบที่อนุมัติแล้ว `baanbow-doc-a4.html` — class และโครงสร้างตรงกันทั้งหมด

- `src/doc-style.js` คือบล็อก `<style>` ของแม่แบบ คัดลอกมาทั้งก้อนด้วยสคริปต์ **ไฟล์นี้ห้ามแก้มือ** ถ้าแม่แบบเปลี่ยน ให้คัดลอกบล็อก `<style>` มาทับทั้งก้อน
- `src/brand.js` คือโลโก้กับ QR แบบ base64 จากแม่แบบ ฝังในหน้าเหมือนเดิม เอกสารจึงพิมพ์ออกมาเหมือนกันทุกเครื่องโดยไม่ต้องโหลดรูปจากที่อื่น
- ปุ่มสลับประเภทเอกสารกับปุ่มลายน้ำในแม่แบบเป็นของไว้พรีวิว ตัดออกแล้ว เพราะเอกสารจริงประเภทเดียวสถานะเดียวตายตัวตอน render

---

## ทดสอบ

```bash
npm test
```

ครอบคลุม: คำนวณยอดทั้ง 3 โหมด VAT + ส่วนลด + หัก ณ ที่จ่าย, `bahtText` ไทย/อังกฤษ,
เลขที่เอกสารและการออกเลขแบบ atomic, จับคู่ลูกค้าเดิม, อ่านคำตอบ VAT, ตรวจลายเซ็น LINE

รันในเครื่องพร้อมฐานข้อมูลจำลอง:

```bash
npx wrangler d1 migrations apply baanbow-office --local
```

```bash
npx wrangler dev
```

Cron ไม่ยิงเองตอน dev — ทดสอบด้วย `curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"`

---

## หมายเหตุ

- Cron `0 1 * * *` = 01:00 UTC = **08:00 น. เวลาไทย** Cloudflare รับ cron เป็น UTC เท่านั้น
- รูปแบบใบกำกับภาษีเป็นร่างตามข้อมูลที่ต้องมีโดยทั่วไป **ให้นักบัญชีตรวจก่อนใช้จริง**
- `/d/:token` ตั้ง `noindex` ไว้แล้ว และ token สุ่ม 128 บิต แต่ใครได้ลิงก์ไปก็เปิดดูได้ — ส่งให้เฉพาะลูกค้าเจ้าของบิล
