// หน้าเอกสาร A4 — โครงสร้างและ class ทุกตัวตรงกับแม่แบบ baanbow-doc-a4.html
// CSS อยู่ใน doc-style.js (คัดลอกมาจากแม่แบบทั้งบล็อก) ที่นี่แค่ใส่ข้อมูลจริงลงช่อง
// ของในแม่แบบที่เป็น JS ฝั่งหน้าเว็บ (ปุ่มสลับประเภท / ปุ่มลายน้ำ) ตัดออก
// เพราะเอกสารจริงประเภทเดียว สถานะเดียว ตายตัวแล้วตอน render
import { SELLER, TYPES } from './config.js';
import { thaiSlash, fmtBaht, bahtText, bahtTextEn } from './thai.js';
import { DOC_CSS } from './doc-style.js';
import { LOGO_PNG, QR_PNG } from './brand.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const dash = (s) => {
  const v = String(s ?? '').trim();
  return v === '' ? '-' : esc(v);
};

// แม่แบบมีแถวว่างไว้ให้หน้ากระดาษเต็ม — เติมให้ครบ 6 แถวเหมือนเดิม
const MIN_ROWS = 6;

export function renderDoc(row) {
  const t = TYPES[row.type];
  const c = JSON.parse(row.customer);
  const items = JSON.parse(row.items);
  const isVoid = row.status === 'void';
  const hasVat = row.vat_mode !== 'none';

  const itemRows = items.map((l, i) => `      <tr><td class="c">${i + 1}</td><td>${esc(l.name)}${
    l.note ? `<small>${esc(l.note)}</small>` : ''
  }</td><td class="c">${esc(l.qty)}</td><td class="r">${fmtBaht(l.unit_price)}</td><td class="r">${fmtBaht(l.amount)}</td></tr>`).join('\n');

  const fillRows = Array.from(
    { length: Math.max(0, MIN_ROWS - items.length) },
    () => '      <tr class="fill"><td></td><td></td><td></td><td></td><td></td></tr>',
  ).join('\n');

  // ช่องยอดเงินฝั่งขวา — บรรทัดภาษีและหัก ณ ที่จ่าย โชว์เฉพาะเมื่อมีจริง
  const totals = [
    `      <div><span>รวมเป็นเงิน</span><b>${fmtBaht(row.subtotal)}</b></div>`,
    `      <div><span>ส่วนลด</span><b>${fmtBaht(row.discount)}</b></div>`,
    hasVat ? `      <div><span>มูลค่าก่อนภาษี</span><b>${fmtBaht(row.base)}</b></div>` : '',
    hasVat ? `      <div><span>ภาษีมูลค่าเพิ่ม 7%</span><b>${fmtBaht(row.vat)}</b></div>` : '',
    `      <div class="grand"><span>รวมทั้งสิ้น</span><b>${fmtBaht(row.total)}</b></div>`,
    row.wht_rate
      ? `      <div class="wht" style="border:0;font-size:11px">หัก ณ ที่จ่าย ${row.wht_rate / 100}% −${fmtBaht(row.wht)}</div>
      <div><span><b>ยอดชำระสุทธิ</b></span><b>${fmtBaht(row.net_payable)}</b></div>`
      : '',
    row.vat_mode === 'inclusive'
      ? '      <div class="wht" style="border:0;font-size:11px">ราคารวมภาษีมูลค่าเพิ่มแล้ว</div>'
      : '',
  ].filter(Boolean).join('\n');

  // บล็อกหมายเหตุ: QT โชว์เงื่อนไข, RC/RT โชว์ช่องรับชำระ — ตรงกับ data-only ของแม่แบบ
  const noteBlock = row.type === 'quotation'
    ? `      <div class="note">
        <h4>เงื่อนไข / Terms</h4>
        <ul>
          <li>สินค้าสั่งทำพิเศษ จัดส่งภายใน 3–4 วันหลังชำระเงิน</li>
          <li>ชำระเต็มจำนวน หรือมัดจำ 50% ก่อนผลิต ส่วนที่เหลือชำระในวันที่สินค้าเสร็จ</li>
        </ul>
      </div>`
    : (row.type === 'receipt' || row.type === 'receipt_tax_invoice')
      ? `      <div class="note">
        <h4>การชำระเงิน / Payment received</h4>
        ☐ เงินสด &nbsp; ☑ โอนเงิน กสิกรไทย &nbsp; วันที่ ${thaiSlash(row.issue_date)}
      </div>`
      : '';

  const termsLine = row.payment_terms
    ? `      <div class="note"><h4>เงื่อนไขการชำระเงิน / Payment terms</h4>${esc(row.payment_terms)}</div>`
    : '';

  const memoLine = row.note
    ? `      <div class="note"><h4>หมายเหตุ / Note</h4>${esc(row.note)}</div>`
    : '';

  // แถวที่ 3 ของกล่อง meta: QT โชว์วันยืนราคา, เอกสารอื่นโชว์เลขที่อ้างอิง
  const metaExtra = row.type === 'quotation'
    ? (row.valid_until ? `      <div><span>ยืนราคาถึง / Valid until</span><b>${thaiSlash(row.valid_until)}</b></div>` : '')
    : (row.ref_doc_no ? `      <div><span>อ้างอิง / Ref.</span><b>${esc(row.ref_doc_no)}</b></div>` : '');

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(t.th)} ${esc(row.doc_no)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=Prompt:wght@500;600;700&display=swap" rel="stylesheet">
<style>${DOC_CSS}</style>
</head>
<body>
<div class="toolbar">
  <button class="print" onclick="print()">พิมพ์ / บันทึก PDF</button>
</div>

<div class="page${isVoid ? ' is-void' : ''}" id="pg">
  <div class="void"><span>ยกเลิก</span></div>

  <header>
    <div class="brand">
      <img src="data:image/png;base64,${LOGO_PNG}" alt="BAANBOW" style="width:30mm;height:30mm;object-fit:contain">
      <div><div class="n" style="color:var(--wine)">${esc(SELLER.brand_th)}</div><div class="t">${esc(SELLER.brand_tagline)}</div></div>
    </div>
    <div class="seller">
      <b>${esc(SELLER.name)}</b><br>
      ${esc(SELLER.address_line1)}<br>
      ${esc(SELLER.address_line2)}<br>
      เลขประจำตัวผู้เสียภาษี ${esc(SELLER.tax_id)}<br>
      โทร ${esc(SELLER.phone)}
    </div>
  </header>

  <div class="titlebar">
    <div class="title">
      <h1 id="en">${esc(t.en)}</h1>
      <h2 id="th">${esc(t.th)}</h2>
      ${t.tax ? '<span class="copy">ต้นฉบับ / ORIGINAL</span>' : ''}
    </div>
    <div class="meta">
      <div><span>เลขที่ / No.</span><b id="no">${esc(row.doc_no)}</b></div>
      <div><span>วันที่ / Date</span><b>${thaiSlash(row.issue_date)}</b></div>
${metaExtra}
    </div>
  </div>

  <section class="cust">
    <div class="h">ข้อมูลลูกค้า / Customer</div>
    <div class="full"><label>ชื่อลูกค้า / Customer name</label><p>${dash(c.name)}</p></div>
    <div class="full"><label>ที่อยู่ / Address</label><p>${dash(c.address)}</p></div>
    <div><label>เลขประจำตัวผู้เสียภาษี / Tax ID</label><p>${dash(c.tax_id)}</p></div>
    <div><label>สาขา / Branch</label><p>${dash(c.branch)}</p></div>
    <div><label>ผู้ติดต่อ / Contact</label><p>${dash(c.contact)}</p></div>
    <div><label>โทร / Tel.</label><p>${dash(c.phone)}</p></div>
  </section>

  <table>
    <thead><tr>
      <th style="width:12mm">ลำดับ<small>No.</small></th>
      <th style="text-align:left">รายการ<small>Description</small></th>
      <th style="width:16mm">จำนวน<small>Qty</small></th>
      <th style="width:26mm" class="r">ราคา/หน่วย<small>Unit price</small></th>
      <th style="width:28mm" class="r">จำนวนเงิน<small>Amount</small></th>
    </tr></thead>
    <tbody>
${itemRows}
${fillRows}
    </tbody>
  </table>

  <div class="bottom">
    <div>
      <div class="words">(${esc(bahtText(row.total))})<small>${esc(bahtTextEn(row.total))}</small></div>
      <div class="pay">
        <img src="data:image/png;base64,${QR_PNG}" alt="KBank" style="width:30mm;height:auto;border-radius:6px;flex:none">
        <div>
          <h4>ช่องทางชำระเงิน / Payment</h4>
          ${esc(SELLER.bank)}<br>เลขที่บัญชี <b>${esc(SELLER.bank_account)}</b><br>ชื่อบัญชี ${esc(SELLER.bank_account_name)}
        </div>
      </div>
${noteBlock}
${termsLine}
${memoLine}
    </div>
    <div class="tot">
${totals}
    </div>
  </div>

  <div class="sign">
    <div><div class="ln" id="s1">${esc(t.sign[0])}</div><small>วันที่ ____/____/______</small></div>
    <div><div class="ln" id="s2">${esc(t.sign[1])}</div><small>วันที่ ____/____/______</small></div>
  </div>
  <footer>${esc(SELLER.footer)}</footer>
</div>
</body>
</html>`;
}
