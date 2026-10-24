// หน้าหลังบ้านสำหรับมือถือ — 5 แท็บ งาน / เอกสาร / สต๊อก / รายจ่าย / สรุป
// ไม่มีระบบ login ในนี้ ตั้งใจให้ Cloudflare Access กั้นหน้า /admin จากข้างนอก
import { TYPES, EXPENSE_CATEGORIES, LEAD_STATUSES, getSeller, splitIncome, roleOf } from './config.js';
import { thaiDateShort, thaiDate, thaiMonth, thaiMonthShort, fmtBaht } from './thai.js';
import { esc } from './render.js';
import { C, CHART_CSS, monthlyBars, hBars, legend, signed } from './chart.js';

const CSS = `
:root{--wine:#B5161F;--wine2:#D23A44;--gold:#B8895A;--ink:#1F2430;--mute:#6B7280;--line:#E6E1DC;--soft:#FBF7F4;--bg:#F4F1EE}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:var(--bg);font-family:'Sarabun',sans-serif;color:var(--ink);font-size:15px;line-height:1.5;padding-bottom:24px}
header{position:sticky;top:0;z-index:10;background:linear-gradient(90deg,var(--wine),var(--wine2) 70%,var(--gold));color:#fff;padding:14px 16px 0}
header h1{font-size:18px;font-weight:600;letter-spacing:.5px}
header .date{font-size:12px;opacity:.85;margin-bottom:10px}
nav{display:flex;gap:4px}
/* 5 แท็บต้องพอดีจอ 360px จึงบีบ font กับ padding ลง ไม่ให้ตกบรรทัด */
nav a{flex:1;min-width:0;text-align:center;padding:9px 2px;font-size:13px;font-weight:500;color:#fff;text-decoration:none;
  border-radius:8px 8px 0 0;background:rgba(0,0,0,.18);white-space:nowrap}
nav a.on{background:var(--bg);color:var(--wine);font-weight:600}
/* หน้านี้ทำมาเพื่อมือถือ บนจอกว้างจึงจัดเป็นคอลัมน์เดียวกลางจอ
   ไม่งั้น SVG ที่กว้าง 100% จะขยายจนตัวอักษรในกราฟใหญ่กว่าหัวข้อของการ์ด */
main{padding:14px 12px;max-width:480px;margin:0 auto}
header{padding-left:max(16px,calc((100% - 480px)/2 + 4px));padding-right:max(16px,calc((100% - 480px)/2 + 4px))}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:10px;
  box-shadow:0 1px 3px rgba(0,0,0,.04)}
.card h3{font-size:15px;font-weight:600;margin-bottom:4px}
.card .meta{font-size:12.5px;color:var(--mute);display:flex;flex-wrap:wrap;gap:4px 10px}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.tag{flex:none;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--soft);
  border:1px solid var(--line);color:var(--mute);white-space:nowrap}
.tag.doing{background:#FFF4E5;border-color:#F3C98B;color:#9A5B06}
.tag.waiting{background:#EEF2FF;border-color:#C7D2FE;color:#3730A3}
.tag.late{background:#FDE8E8;border-color:#F5B5B5;color:var(--wine)}
.tag.today{background:#FFF1E0;border-color:#F6C98A;color:#B45309}
.due.late{color:var(--wine);font-weight:600}
.due.today{color:#C2410C;font-weight:600}
a.doc{display:block;text-decoration:none;color:inherit}
.no{font-family:'Sarabun';font-weight:600;color:var(--wine)}
.amt{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.amt.negqty{color:var(--wine)}
.void{text-decoration:line-through;opacity:.55}
form.search{display:flex;gap:8px;margin-bottom:12px}
form.search input{flex:1;min-width:0;font:400 15px 'Sarabun';padding:10px 12px;border:1px solid var(--line);
  border-radius:10px;background:#fff}
form.search button{font:600 14px 'Sarabun';border:0;border-radius:10px;padding:10px 16px;background:var(--wine);color:#fff}
.sum{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:12px}
.sum h2{font-size:14px;font-weight:600;padding:10px 14px;background:var(--soft);border-bottom:1px solid var(--line);color:var(--wine)}
.sum div.line{display:flex;justify-content:space-between;gap:12px;padding:9px 14px;border-bottom:1px solid var(--line)}
.sum div.line:last-child{border-bottom:0}
.sum .grand{background:var(--wine);color:#fff;font-weight:600}
.sum .line em{font-style:normal;font-size:11.5px;color:var(--mute)}
.hero .pend{margin-top:8px;padding-top:7px;border-top:1px solid var(--line);font-size:12.5px;color:var(--mute);line-height:1.6}
.empty{text-align:center;color:var(--mute);padding:30px 10px;font-size:14px}
footer{text-align:center;font-size:10px;letter-spacing:2px;color:var(--gold);margin-top:18px;text-transform:uppercase}
details.nums{margin-top:8px;border-top:1px solid var(--line);padding-top:7px}
details.nums summary{font-size:12.5px;color:var(--mute);cursor:pointer;list-style:none}
details.nums summary::-webkit-details-marker{display:none}
details.nums summary::before{content:'▸ ';font-size:10px}
details.nums[open] summary::before{content:'▾ '}
details.nums table{width:100%;border-collapse:collapse;margin-top:6px;font-size:12.5px}
details.nums th,details.nums td{padding:4px 0;text-align:right;border-bottom:1px solid var(--line)}
details.nums th:first-child,details.nums td:first-child{text-align:left}
details.nums th{font-weight:500;color:var(--mute)}
details.nums td{font-variant-numeric:tabular-nums}
${CHART_CSS}`;

export const TABS = ['jobs', 'docs', 'stock', 'expenses', 'leads', 'summary'];
const TAB_LABEL = {
  jobs: 'งาน', docs: 'เอกสาร', stock: 'สต๊อก', expenses: 'รายจ่าย', leads: 'มุ่งหวัง', summary: 'สรุป',
};

const statusClass = (s) => (s === 'กำลังทำ' ? 'doing' : s === 'รอลูกค้า' ? 'waiting' : '');

function jobCard(j, today) {
  const late = j.due_date && j.due_date < today;
  const isToday = j.due_date === today;
  const dueCls = late ? 'late' : isToday ? 'today' : '';
  const due = j.due_date
    ? `<span class="due ${dueCls}">${thaiDateShort(j.due_date)}${late ? ' · เลยกำหนด' : isToday ? ' · ครบวันนี้' : ''}</span>`
    : '<span>ไม่มีกำหนด</span>';
  const tagCls = late ? 'late' : isToday ? 'today' : statusClass(j.status);
  return `<div class="card">
  <div class="row"><h3>#${j.id} ${esc(j.title)}</h3><span class="tag ${tagCls}">${esc(j.status)}</span></div>
  <div class="meta">${due}${j.customer ? `<span>${esc(j.customer)}</span>` : ''}${j.note ? `<span>${esc(j.note)}</span>` : ''}</div>
</div>`;
}

function docCard(d) {
  const c = JSON.parse(d.customer);
  const voided = d.status === 'void';
  return `<a class="doc" href="/d/${esc(d.token)}">
  <div class="card${voided ? ' void' : ''}">
    <div class="row"><h3 class="no">${esc(d.doc_no)}</h3><span class="amt">${fmtBaht(d.total)}</span></div>
    <div class="meta"><span>${esc(TYPES[d.type].th)}</span><span>${esc(c.name)}</span><span>${thaiDateShort(d.issue_date)}</span><span>${esc(getSeller(d.seller).label)}</span>${
    voided ? '<span class="tag late">ยกเลิกแล้ว</span>' : ''
  }</div>
  </div></a>`;
}

function stockCard(p) {
  const neg = p.qty < 0;
  const zero = p.qty === 0;
  return `<div class="card">
  <div class="row"><h3>${esc(p.name)}</h3><span class="amt${neg ? ' negqty' : ''}">${p.qty} ${esc(p.unit)}</span></div>
  <div class="meta">${
    p.cost != null ? `<span>ต้นทุน ${fmtBaht(p.cost)}/${esc(p.unit)}</span>` : '<span>ยังไม่ได้ใส่ต้นทุน</span>'
  }${p.price != null ? `<span>ขาย ${fmtBaht(p.price)}</span>` : ''}${
    neg ? '<span class="tag late">ติดลบ</span>' : zero ? '<span class="tag">หมด</span>' : ''
  }</div>
</div>`;
}

/**
 * การ์ดลูกค้ามุ่งหวัง — จุดสำคัญคือช่องติดต่อทุกช่องเป็นลิงก์ไปหน้าต้นทางได้
 * ถ้าเบอร์โทรบนจอไม่มีที่มาให้กดดู มันก็คือเบอร์ที่เชื่อไม่ได้
 */
function leadCardHtml(l) {
  const why = JSON.parse(l.why || '[]');
  const src = JSON.parse(l.sources || '{}');
  const st = LEAD_STATUSES[l.status];
  const cls = l.status === 'won' ? 'doing' : l.status === 'dropped' ? '' : l.status === 'new' ? 'today' : 'waiting';

  // ค่าที่มีที่มาแสดงเป็นลิงก์ ค่าที่ไม่มีแสดงเป็นข้อความเฉยๆ (ตอนนี้ยังไม่มีทางเกิด แต่กันไว้)
  const field = (key, label, text) => {
    if (!text) return '';
    const url = src[key];
    return url
      ? `<div><span style="color:var(--mute)">${label}</span> <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a></div>`
      : `<div><span style="color:var(--mute)">${label}</span> ${esc(text)}</div>`;
  };

  return `<div class="card">
  <div class="row"><h3>#${l.id} ${esc(l.name)}</h3><span class="tag ${cls}">${esc(st?.th ?? l.status)}</span></div>
  <div class="meta">${[l.category, l.province].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}
    <span>ความน่าคุย ${l.fit + l.reach + l.timing}/15</span><span>${thaiDateShort(l.found_date)}</span></div>
  ${why.length ? `<ul style="margin:8px 0 0 16px;font-size:12.5px;line-height:1.6">${why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
  <div style="margin-top:8px;font-size:12.5px;line-height:1.7">
    ${field('phone', 'โทร', l.phone)}
    ${field('facebook', 'เพจ', l.facebook)}
    ${field('website', 'เว็บ', l.website)}
    ${l.line_id ? field('line_id', 'ไลน์', l.line_id) : '<div style="color:var(--mute)">ไม่พบไลน์สาธารณะ</div>'}
  </div>
  ${l.draft ? `<div style="margin-top:8px;background:var(--soft);border-left:3px solid var(--gold);padding:8px 10px;font-size:12.5px;line-height:1.6">${esc(l.draft)}</div>` : ''}
  ${l.status_note ? `<div class="meta" style="margin-top:6px"><span>เหตุผล: ${esc(l.status_note)}</span></div>` : ''}
</div>`;
}

function leadsView(rows, monthly) {
  const n = (s) => monthly.find((r) => r.status === s)?.cnt ?? 0;
  const total = monthly.reduce((a, r) => a + r.cnt, 0);
  const head = `<div class="sum">
  <h2>เดือนนี้</h2>
  <div class="line"><span>ระบบหามาให้</span><b>${total} เจ้า</b></div>
  <div class="line"><span>คุณกดสนใจ</span><b>${n('interested') + n('contacted') + n('replied') + n('won')} เจ้า</b></div>
  <div class="line"><span>ติดต่อไปแล้ว</span><b>${n('contacted') + n('replied') + n('won')} เจ้า</b></div>
  <div class="line"><span>เขาตอบกลับ</span><b>${n('replied') + n('won')} เจ้า</b></div>
  <div class="line"><span>ปิดการขายได้</span><b>${n('won')} เจ้า</b></div>
</div>`;

  if (!rows.length) {
    return head + '<p class="empty">ยังไม่มีลูกค้ามุ่งหวัง<br>สั่งค้นได้ทางไลน์ด้วยคำว่า "หาลูกค้า"</p>';
  }
  return head + rows.map(leadCardHtml).join('\n')
    + '<p class="empty" style="font-size:12.5px">ตอบสถานะทางไลน์ได้เลย เช่น "สนใจ 12" หรือ "ไม่สนใจ 12 ร้านเล็กเกินไป"</p>';
}

function stockView(rows, value) {
  if (!rows.length) return '<p class="empty">ยังไม่มีรายการในสต๊อก<br>สั่ง "รับเข้า โบว์ริบบิ้นแดง 3" ทางไลน์ได้เลย</p>';
  const neg = rows.filter((r) => r.qty < 0).length;
  const pieces = rows.reduce((a, r) => a + Math.max(0, r.qty), 0);
  return `<div class="sum">
  <h2>สต๊อก ${rows.length} รายการ</h2>
  <div class="line"><span>รวมของที่มี</span><b>${pieces} ชิ้น</b></div>
  <div class="line"><span>มูลค่าตามต้นทุน</span><b>${fmtBaht(value?.value || 0)}</b></div>
  ${value?.unpriced ? `<div class="line"><span>ยังไม่ได้ใส่ต้นทุน (ไม่นับในมูลค่า)</span><b>${value.unpriced} รายการ</b></div>` : ''}
  ${neg ? `<div class="line"><span>ยอดติดลบ</span><b style="color:var(--wine)">${neg} รายการ</b></div>` : ''}
</div>
${rows.map(stockCard).join('\n')}`;
}

function expenseCard(e) {
  // ยกเลิกแล้วยังต้องเห็นว่าเคยลงอะไรไว้ แค่ขีดฆ่าให้รู้ว่าไม่นับในยอด (เหมือน docCard)
  const voided = e.status === 'void';
  return `<div class="card${voided ? ' void' : ''}">
  <div class="row"><h3>${esc(e.category)}</h3><span class="amt">${fmtBaht(e.amount)}</span></div>
  <div class="meta"><span>#${e.id}</span><span>${thaiDateShort(e.spent_date)}</span>${
    e.note ? `<span>${esc(e.note)}</span>` : ''
  }${e.job_id ? `<span>งาน #${e.job_id}</span>` : ''}<span>${esc(getSeller(e.seller).label)}</span>${
    voided ? `<span class="tag late">ยกเลิกแล้ว${e.void_reason ? ' · ' + esc(e.void_reason) : ''}</span>` : ''
  }${voided && e.replaced_by ? `<span>แทนด้วย #${e.replaced_by}</span>` : ''}</div>
</div>`;
}

function expensesView(rows, month) {
  if (!rows.length) return '<p class="empty">ยังไม่มีรายจ่าย<br>สั่ง "ค่าวัสดุ 450 ซื้อริบบิ้น" ทางไลน์ได้เลย</p>';
  // สรุปหัวหน้าเป็นของ "เดือนนี้" ส่วนการ์ดข้างล่างเป็นรายการล่าสุดย้อนหลัง ไม่จำกัดเดือน
  const byCat = new Map();
  for (const r of month) {
    const cur = byCat.get(r.category) ?? 0;
    byCat.set(r.category, cur + r.total);
  }
  const total = month.reduce((a, r) => a + r.total, 0);
  const voided = rows.filter((r) => r.status === 'void').length;
  return `<div class="sum">
  <h2>รายจ่ายเดือนนี้</h2>
  ${EXPENSE_CATEGORIES.filter((c) => byCat.has(c))
    .map((c) => `<div class="line"><span>${esc(c)}</span><b>${fmtBaht(byCat.get(c))}</b></div>`).join('')}
  <div class="line grand"><span>รวม</span><b>${fmtBaht(total)}</b></div>
  ${voided ? `<div class="line"><span>ยกเลิกแล้ว (ในรายการล่าสุด ไม่นับในยอด)</span><b>${voided} รายการ</b></div>` : ''}
</div>
${rows.map(expenseCard).join('\n')}`;
}

function summaryView(s, openCount, lateCount, todayCount, monthExp, stock, trend) {
  // แยกกล่องตามบริษัท — คนละนิติบุคคล ยื่น VAT คนละชุด ห้ามเอายอดมารวมกัน
  const bySeller = new Map();
  for (const r of s.byType) {
    if (!bySeller.has(r.seller)) bySeller.set(r.seller, []);
    bySeller.get(r.seller).push(r);
  }

  const blocks = bySeller.size
    ? [...bySeller.entries()].map(([key, rows]) => {
      // ยอดยื่น VAT นับเฉพาะเอกสารภาษี (TI/RT) ใบเสนอราคาไม่เกี่ยวกับภาษีขาย
      const taxRows = rows.filter((r) => TYPES[r.type].tax);
      const vat = taxRows.reduce((a, r) => a + r.vat, 0);
      const base = taxRows.reduce((a, r) => a + r.base, 0);
      const paid = splitIncome(rows).paid;
      return `<div class="sum">
  <h2>${esc(getSeller(key).label)} · ${esc(thaiMonth(s.month))}</h2>
  ${rows.map((r) => {
    // บอกข้างบรรทัดว่าใบไหนนับเป็นรายรับแล้ว ไม่งั้นคนอ่านจะบวกเองแล้วได้คนละยอดกับหัวหน้าจอ
    const role = roleOf(r.type);
    const tag = role === 'paid' ? '' : role === 'due' ? ' <em>ค้างรับ</em>' : ' <em>ยังไม่นับเป็นรายรับ</em>';
    return `<div class="line"><span>${esc(TYPES[r.type].th)} · ${r.cnt} ใบ${tag}</span><b>${fmtBaht(r.total)}</b></div>`;
  }).join('')}
  ${taxRows.length ? `<div class="line"><span>มูลค่าก่อนภาษี (เฉพาะเอกสารภาษี)</span><b>${fmtBaht(base)}</b></div>
  <div class="line"><span>VAT ขาย (7%)</span><b>${fmtBaht(vat)}</b></div>` : ''}
  <div class="line grand"><span>รับเงินแล้ว</span><b>${fmtBaht(paid)}</b></div>
</div>`;
    }).join('\n')
    : `<div class="sum">
  <h2>ยอดเดือน ${esc(thaiMonth(s.month))}</h2>
  <div class="line"><span>ยังไม่มีเอกสารเดือนนี้</span><b>0.00</b></div>
</div>`;

  // รายรับ = เฉพาะใบที่รับเงินแล้ว ใบเสนอราคาแยกไปอีกกอง ใบกำกับภาษีเป็นค้างรับ
  const split = splitIncome(s.byType);
  const income = split.paid;
  const spent = (monthExp || []).reduce((a, r) => a + r.total, 0);
  const left = income - spent;

  const expByCat = new Map();
  for (const r of monthExp || []) expByCat.set(r.category, (expByCat.get(r.category) ?? 0) + r.total);

  // ตัวเลขนำของหน้านี้ มีได้ตัวเดียว — กำไรเดือนนี้คือสิ่งที่เจ้าของอยากรู้ก่อนอย่างอื่น
  const hero = `<div class="hero">
  <div class="lb">เหลือเดือนนี้ · ${esc(thaiMonth(s.month))}</div>
  <div class="big ${left < 0 ? 'down' : 'up'}">${signed(left)}</div>
  <div class="split">
    <span><i style="background:${C.income}"></i>รายรับ <b>${fmtBaht(income)}</b></span>
    <span><i style="background:${C.spend}"></i>รายจ่าย <b>${fmtBaht(spent)}</b></span>
  </div>
  ${split.due || split.quote ? `<div class="pend">${[
    split.due ? `ค้างรับ ${fmtBaht(split.due)} (ใบกำกับภาษี ${split.dueCount} ใบ)` : null,
    split.quote ? `เสนอราคาไป ${fmtBaht(split.quote)} (${split.quoteCount} ใบ ยังไม่นับเป็นรายรับ)` : null,
  ].filter(Boolean).join('<br>')}</div>` : ''}
</div>`;

  const trendPanel = (trend || []).length ? `<div class="panel">
  <h2>รายรับเทียบรายจ่าย</h2>
  <div class="sub">ย้อนหลัง ${trend.length} เดือน</div>
  ${legend([{ color: C.income, label: 'รายรับ' }, { color: C.spend, label: 'รายจ่าย' }])}
  ${monthlyBars(trend)}
  <details class="nums"><summary>ดูเป็นตัวเลข</summary>
    <table><thead><tr><th>เดือน</th><th>รายรับ</th><th>รายจ่าย</th><th>เหลือ</th></tr></thead><tbody>
    ${trend.map((r) => `<tr><td>${esc(thaiMonthShort(r.ym))}</td><td>${fmtBaht(r.income)}</td><td>${fmtBaht(r.spent)}</td><td>${signed(r.income - r.spent)}</td></tr>`).join('')}
    </tbody></table>
  </details>
</div>` : '';

  const expRows = EXPENSE_CATEGORIES.filter((c) => expByCat.has(c))
    .map((c) => ({ label: c, value: expByCat.get(c) }))
    .sort((a, b) => b.value - a.value);

  const expPanel = `<div class="panel">
  <h2>รายจ่ายแยกหมวด</h2>
  <div class="sub">${esc(thaiMonth(s.month))} · รวม ${fmtBaht(spent)} บาท</div>
  ${expRows.length ? hBars(expRows, C.spend) : '<p class="empty">ยังไม่ได้บันทึกรายจ่ายเดือนนี้</p>'}
</div>`;

  // แท่งนี้ต้องเป็นรายรับจริงเหมือนตัวเลขนำ ไม่งั้นสองที่ในหน้าเดียวกันจะไม่ตรงกัน
  const sellerRows = [...bySeller.entries()]
    .map(([key, rows]) => ({ label: getSeller(key).label, value: splitIncome(rows).paid }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const sellerPanel = sellerRows.length ? `<div class="panel">
  <h2>รายรับแยกบริษัท</h2>
  <div class="sub">${esc(thaiMonth(s.month))} · รวม ${fmtBaht(income)} บาท</div>
  ${hBars(sellerRows, C.income)}
</div>` : '';

  const kpi = `<div class="kpi">
  <div class="k"><div class="n">${openCount}</div><div class="t">งานค้าง</div></div>
  <div class="k"><div class="n${lateCount ? ' warn' : ''}">${lateCount}</div><div class="t">เลยกำหนด</div></div>
  <div class="k"><div class="n">${todayCount}</div><div class="t">ครบวันนี้</div></div>
</div>
<div class="kpi">
  <div class="k"><div class="n">${stock?.count ?? 0}</div><div class="t">รายการสต๊อก</div></div>
  <div class="k"><div class="n">${esc(fmtBaht(stock?.value || 0).split('.')[0])}</div><div class="t">มูลค่าสต๊อก</div></div>
  <div class="k"><div class="n${stock?.negative ? ' warn' : ''}">${stock?.negative ?? 0}</div><div class="t">ยอดติดลบ</div></div>
</div>`;

  return `${hero}
${trendPanel}
${expPanel}
${sellerPanel}
${kpi}
${blocks}
${s.voidCount ? `<div class="sum"><h2>ยกเลิก</h2><div class="line"><span>เอกสารที่ยกเลิก (ไม่นับในยอด)</span><b>${s.voidCount} ใบ</b></div></div>` : ''}`;
}

export function renderAdmin({ tab, today, jobs, docs, summary, q, stock, stockVal, expenses, monthExp, trend, leads, monthLead }) {
  let body;
  if (tab === 'jobs') {
    body = jobs.length ? jobs.map((j) => jobCard(j, today)).join('\n') : '<p class="empty">ไม่มีงานค้าง 🎉</p>';
  } else if (tab === 'docs') {
    const list = docs.length
      ? docs.map(docCard).join('\n')
      : `<p class="empty">${q ? 'ไม่พบเอกสารที่ตรงกับ ' + esc(q) : 'ยังไม่มีเอกสาร'}</p>`;
    body = `<form class="search" method="get" action="/admin">
  <input type="hidden" name="tab" value="docs">
  <input name="q" value="${esc(q || '')}" placeholder="เลขที่เอกสาร หรือ ชื่อลูกค้า" autocomplete="off">
  <button type="submit">ค้นหา</button>
</form>
${list}`;
  } else if (tab === 'stock') {
    body = stockView(stock || [], stockVal);
  } else if (tab === 'expenses') {
    body = expensesView(expenses || [], monthExp || []);
  } else if (tab === 'leads') {
    body = leadsView(leads || [], monthLead || []);
  } else {
    const late = jobs.filter((j) => j.due_date && j.due_date < today).length;
    const due = jobs.filter((j) => j.due_date === today).length;
    body = summaryView(summary, jobs.length, late, due, monthExp, {
      count: (stock || []).length,
      value: stockVal?.value || 0,
      negative: (stock || []).filter((r) => r.qty < 0).length,
    }, trend);
  }

  const nav = TABS
    .map((k) => `<a class="${k === tab ? 'on' : ''}" href="/admin?tab=${k}">${TAB_LABEL[k]}</a>`)
    .join('');

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#B5161F">
<title>บ้านโบว์ · หลังบ้าน</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header>
  <h1>บ้านโบว์ · หลังบ้าน</h1>
  <div class="date">${esc(thaiDate(today, true))}</div>
  <nav>${nav}</nav>
</header>
<main>
${body}
</main>
<footer>Baanbow</footer>
</body>
</html>`;
}
