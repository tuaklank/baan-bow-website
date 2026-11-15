// หน้าตารางรายการโบว์ของหนึ่งเดือน — กระดาษ A4 หน้าตาเดียวกับใบเสนอราคา
// บอทส่งลิงก์หน้านี้กลับทางไลน์แทนการพิมพ์รายการเป็นข้อความ เพราะหลายช่องต่อรายการ
// อ่านในแชตไม่รู้เรื่อง ต้องเห็นเป็นตารางเหมือนในสมุดจด เปิดแล้วกดบันทึก PDF ได้
// ใช้ CSS ชุดเดียวกับเอกสาร (doc-style.js) ไม่แตะไฟล์นั้น เพิ่มเฉพาะส่วนที่ต่างไว้ข้างล่าง
import { BRAND } from './config.js';
import { thaiMonth, thaiSlash, dayMonth, fmtBaht } from './thai.js';
import { DOC_CSS } from './doc-style.js';
import { LOGO_PNG } from './brand.js';
import { esc } from './render.js';

// ลำดับช่อง: แบบโบว์กับรายละเอียดคือ "ของ" ที่รู้ตั้งแต่ตอนสั่งมาไว้
// ช่องทางกับผู้สั่งอยู่ติดกันเพราะเติมพร้อมกันทีหลังตอนมีลูกค้า ตามด้วยราคากับช่องติ๊กว่าลูกค้าจ่ายแล้ว
// ปิดท้ายด้วยค่าจ้างทำโบว์กับช่องติ๊กว่าจ่ายช่างแล้ว — เงินเข้าอยู่ซ้าย เงินออกอยู่ขวา คั่นด้วยเส้น
// ช่องที่ยังไม่มีข้อมูลเว้นว่างจริงๆ ไม่ใส่ขีด — ตารางนี้ส่วนใหญ่ว่างตอนเพิ่งสั่งของมา ขีดเต็มหน้าจะรก

// แถวว่างเติมให้กระดาษไม่โล่งตอนรายการยังน้อย เหมือนสมุดที่ตีเส้นรอไว้
const MIN_ROWS = 8;
const COLS = 10;

/**
 * ยอดสรุปของรายการชุดหนึ่ง — ใช้ทั้งหน้าตาราง A4 คำตอบในไลน์ และหน้าหลังบ้าน
 * รวมไว้ที่เดียวเพื่อให้สามที่นี้ได้ตัวเลขเดียวกันเสมอ
 * เงินทุกช่องเป็นสตางค์; ช่องที่ยังไม่ใส่ราคา/ค่าจ้างนับเป็น 0 ในยอดรวม แล้วแจ้งจำนวนที่ยังไม่ใส่แยกไว้
 */
export function summarizeOrders(rows) {
  const s = {
    count: rows.length,
    free: 0,            // ยังไม่มีผู้สั่ง
    noPrice: 0, noWage: 0,
    price: 0, pricePaid: 0, paidCount: 0,       // ราคาขาย / ลูกค้าจ่ายแล้ว
    wage: 0, wagePaid: 0, wagePaidCount: 0,     // ค่าจ้างทำ / จ่ายช่างแล้ว
    byStyle: [],
  };
  const styles = new Map();
  for (const r of rows) {
    const price = r.price ?? 0;
    const wage = r.wage ?? 0;
    if (!r.customer) s.free++;
    if (r.price == null) s.noPrice++;
    if (r.wage == null) s.noWage++;
    s.price += price;
    s.wage += wage;
    if (r.paid_at) { s.pricePaid += price; s.paidCount++; }
    if (r.wage_paid_at) { s.wagePaid += wage; s.wagePaidCount++; }

    let g = styles.get(r.style);
    if (!g) styles.set(r.style, g = { style: r.style, count: 0, taken: 0, paid: 0, price: 0, wage: 0 });
    g.count++;
    if (r.customer) g.taken++;
    if (r.paid_at) g.paid++;
    g.price += price;
    g.wage += wage;
  }
  s.byStyle = [...styles.values()];
  return s;
}

/**
 * ส่วนที่ต่างจากหน้าเอกสาร
 * - หัวกระดาษไม่มีที่อยู่ผู้ขาย จึงจัดหัวข้อไว้ขวาแทน
 * - ตารางยาวได้หลายหน้า: ตอนพิมพ์ต้องปล่อยความสูงตามเนื้อหา (แม่แบบล็อก 297mm ไว้
 *   แล้วซ่อนส่วนเกิน รายการแถวที่ 30 จะหายเงียบๆ) และห้ามตัดแถวกลางหน้า
 * - text-size-adjust กันเบราว์เซอร์มือถือขยายตัวอักษรเองตอนหน้าถูกย่อ (เหตุผลเดียวกับ render.js)
 */
const SHEET_CSS = `
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
header{margin-top:1mm;align-items:center}
.sheet-title{text-align:right}
.sheet-title h1{font:700 26px 'Prompt';line-height:1.1;color:var(--ink)}
.sheet-title h2{font:500 18px 'Prompt';color:var(--wine);margin-top:2px}
.stats{display:flex;gap:3mm;margin:6mm 0 5mm}
.stats div{flex:1;background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:7px 12px}
.stats span{display:block;color:var(--mute);font-size:11.5px}
.stats b{font:600 16px 'Prompt';font-variant-numeric:tabular-nums;white-space:nowrap}
.stats .grand{background:var(--wine);border-color:var(--wine)}
.stats .grand span,.stats .grand b{color:#fff}
/* แม่แบบไล่สีทีละช่อง สามช่องดูเนียน แต่สิบช่องเห็นเป็นแถบสลับ จึงใช้สีเดียวทั้งแถว */
thead th{background:var(--wine);white-space:nowrap;padding:6px 5px;font-size:12px;vertical-align:middle}
tbody td{font-size:12px;vertical-align:middle;padding:6px 5px}
td.style{font-weight:600}
/* เส้นคั่นระหว่างฝั่งเงินเข้า (ราคา/ลูกค้าจ่าย) กับฝั่งเงินออก (ค่าจ้าง/จ่ายช่าง) */
.out{border-left:1.5px solid var(--gold)}
thead th.out{border-left-color:rgba(255,255,255,.55)}
/* ช่องติ๊ก: ว่างไว้เป็นกรอบเปล่า แจ้งว่าจ่ายแล้วจึงมีเครื่องหมายถูก */
.tick{display:inline-block;width:4.4mm;height:4.4mm;border:1.4px solid #9CA3AF;border-radius:3px;
  font:700 12px/3.8mm 'Sarabun';text-align:center;color:#fff;vertical-align:middle}
.tick.on{background:#15803D;border-color:#15803D}
tfoot td{padding:7px 5px;font-weight:600;border-top:2px solid var(--wine);font-size:12px}
tfoot td.sum{font:700 13px 'Prompt';color:var(--wine)}

/* สรุปยอดท้ายตาราง */
.recap{margin-top:7mm;break-inside:avoid;page-break-inside:avoid}
.recap h3{font:600 14px 'Prompt';color:var(--wine);margin-bottom:3mm}
.recap .cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:3mm;margin-bottom:4mm}
.recap .card{border:1px solid var(--line);border-radius:8px;overflow:hidden}
.recap .card h4{font:600 12.5px 'Prompt';background:var(--soft);color:var(--ink);padding:5px 10px;border-bottom:1px solid var(--line)}
.recap .card div{display:flex;justify-content:space-between;gap:8px;padding:4px 10px;font-size:12px}
.recap .card div b{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.recap .card div.top{font-weight:600;border-bottom:1px dashed var(--line)}
.recap .card div.warn b{color:var(--wine)}
.recap .card div.ok b{color:#15803D}
.recap .card.net{border-color:var(--wine)}
.recap .card.net h4{background:var(--wine);color:#fff;border-color:var(--wine)}
.recap table th{background:var(--soft);color:var(--ink);border-bottom:1px solid var(--line);border-radius:0!important}
.recap small{display:block;margin-top:2mm;color:var(--mute);font-size:11px}

.updated{margin-top:auto;padding-top:6mm;font-size:11px;color:var(--mute);text-align:right}
tr{break-inside:avoid;page-break-inside:avoid}
@media print{
  .page{height:auto;min-height:0;overflow:visible}
  thead{display:table-header-group}
}
`;

const cell = (v) => `<td>${v == null ? '' : esc(v)}</td>`;
const money = (v) => (v != null ? fmtBaht(v) : '');
const tick = (on) => `<span class="tick${on ? ' on' : ''}">${on ? '✓' : ''}</span>`;

/**
 * rows = รายการของเดือนนั้นที่ยังไม่ถูกยกเลิก เรียงตามวันที่ (monthOrders)
 * today ใช้บอกว่าตารางนี้เป็นข้อมูล ณ วันไหน — หน้านี้ดึงสดทุกครั้งที่เปิด
 */
export function renderOrderSheet({ ym, rows, today }) {
  const s = summarizeOrders(rows);
  const eg = rows[0]?.id ?? 1;

  const body = rows.map((r) => `      <tr><td class="c">${r.id}</td><td class="c">${dayMonth(r.order_date)}</td>`
    + `<td class="style">${esc(r.style)}</td>${cell(r.detail)}${cell(r.channel)}${cell(r.customer)}`
    + `<td class="r">${money(r.price)}</td><td class="c">${tick(r.paid_at)}</td>`
    + `<td class="r out">${money(r.wage)}</td><td class="c">${tick(r.wage_paid_at)}</td></tr>`).join('\n');

  const fill = Array.from(
    { length: Math.max(0, MIN_ROWS - rows.length) },
    () => `      <tr class="fill">${'<td></td>'.repeat(COLS)}</tr>`,
  ).join('\n');

  const styleRows = s.byStyle.map((g) => `        <tr><td class="style">${esc(g.style)}</td><td class="c">${g.count}</td>`
    + `<td class="c">${g.taken}</td><td class="c">${g.count - g.taken}</td><td class="c">${g.paid}</td>`
    + `<td class="r">${fmtBaht(g.price)}</td><td class="r">${fmtBaht(g.wage)}</td></tr>`).join('\n');

  const pending = [
    s.noPrice ? `ยังไม่ใส่ราคา ${s.noPrice} ชิ้น` : null,
    s.noWage ? `ยังไม่ใส่ค่าจ้าง ${s.noWage} ชิ้น` : null,
  ].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>รายการโบว์ ${esc(thaiMonth(ym))}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=Prompt:wght@500;600;700&display=swap" rel="stylesheet">
<style>${DOC_CSS}</style>
<style>${SHEET_CSS}</style>
</head>
<body>
<div class="toolbar">
  <button class="print" onclick="print()">พิมพ์ / บันทึก PDF</button>
</div>

<div class="page">
  <header>
    <div class="brand">
      <img src="data:image/png;base64,${LOGO_PNG}" alt="BAANBOW" style="width:26mm;height:26mm;object-fit:contain">
      <div><div class="n" style="color:var(--wine)">${esc(BRAND.brand_th)}</div><div class="t">${esc(BRAND.brand_tagline)}</div></div>
    </div>
    <div class="sheet-title">
      <h1>รายการสั่งโบว์</h1>
      <h2>${esc(thaiMonth(ym))}</h2>
    </div>
  </header>

  <div class="stats">
    <div><span>จำนวนทั้งหมด</span><b>${s.count} ชิ้น</b></div>
    <div><span>ยังไม่มีผู้สั่ง</span><b>${s.free} ชิ้น</b></div>
    <div><span>ลูกค้าจ่ายแล้ว</span><b>${s.paidCount} / ${s.count}</b></div>
    <div><span>จ่ายค่าจ้างแล้ว</span><b>${s.wagePaidCount} / ${s.count}</b></div>
  </div>

  <table class="orders">
    <thead><tr>
      <th style="width:11mm">รายการ</th>
      <th style="width:12mm">วันที่</th>
      <th style="width:22mm;text-align:left">แบบโบว์</th>
      <th style="text-align:left">รายละเอียด</th>
      <th style="width:15mm;text-align:left">ช่องทาง</th>
      <th style="width:26mm;text-align:left">ผู้สั่ง</th>
      <th style="width:20mm" class="r">ราคา</th>
      <th style="width:14mm">จ่ายแล้ว</th>
      <th style="width:18mm" class="r out">ค่าจ้างทำ</th>
      <th style="width:14mm">จ่ายแล้ว</th>
    </tr></thead>
    <tbody>
${body}
${fill}
    </tbody>
    <tfoot><tr><td colspan="6" class="r">รวม ${s.count} ชิ้น</td><td class="r sum">${fmtBaht(s.price)}</td><td></td><td class="r sum out">${fmtBaht(s.wage)}</td><td></td></tr></tfoot>
  </table>

  <section class="recap">
    <h3>สรุปยอด ${esc(thaiMonth(ym))}</h3>
    <div class="cards">
      <div class="card">
        <h4>ราคาขาย (ลูกค้าจ่าย)</h4>
        <div class="top"><span>รวมทั้งหมด</span><b>${fmtBaht(s.price)}</b></div>
        <div class="ok"><span>จ่ายแล้ว ${s.paidCount} ชิ้น</span><b>${fmtBaht(s.pricePaid)}</b></div>
        <div class="warn"><span>ยังไม่จ่าย ${s.count - s.paidCount} ชิ้น</span><b>${fmtBaht(s.price - s.pricePaid)}</b></div>
      </div>
      <div class="card">
        <h4>ค่าจ้างทำโบว์ (จ่ายช่าง)</h4>
        <div class="top"><span>รวมทั้งหมด</span><b>${fmtBaht(s.wage)}</b></div>
        <div class="ok"><span>จ่ายแล้ว ${s.wagePaidCount} ชิ้น</span><b>${fmtBaht(s.wagePaid)}</b></div>
        <div class="warn"><span>ค้างจ่าย ${s.count - s.wagePaidCount} ชิ้น</span><b>${fmtBaht(s.wage - s.wagePaid)}</b></div>
      </div>
      <div class="card net">
        <h4>คงเหลือหลังหักค่าจ้าง</h4>
        <div class="top"><span>ถ้าขายและจ่ายครบทุกชิ้น</span><b>${fmtBaht(s.price - s.wage)}</b></div>
        <div><span>ตอนนี้รับเงินมาแล้ว</span><b>${fmtBaht(s.pricePaid)}</b></div>
        <div><span>หักค่าจ้างที่จ่ายไป เหลือ</span><b>${fmtBaht(s.pricePaid - s.wagePaid)}</b></div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th style="text-align:left">สรุปตามแบบโบว์</th>
        <th style="width:17mm">จำนวน</th>
        <th style="width:19mm">มีผู้สั่ง</th>
        <th style="width:17mm">ยังว่าง</th>
        <th style="width:19mm">จ่ายแล้ว</th>
        <th style="width:27mm" class="r">ราคาขาย</th>
        <th style="width:27mm" class="r">ค่าจ้างทำ</th>
      </tr></thead>
      <tbody>
${styleRows}
      </tbody>
    </table>
    ${pending ? `<small>${pending} — ยอดรวมข้างบนยังไม่นับชิ้นเหล่านี้</small>` : ''}
  </section>

  <div class="updated">ข้อมูล ณ วันที่ ${thaiSlash(today)} · เติมทางไลน์ได้ เช่น "รายการ ${eg} ผู้สั่ง คุณเอ ช่องทาง Line" · "รายการ ${eg} จ่ายแล้ว" · "รายการ ${eg} ค่าจ้าง 150" แล้วเปิดหน้านี้ใหม่</div>
  <footer>${esc(BRAND.footer)}</footer>
</div>
</body>
</html>`;
}
