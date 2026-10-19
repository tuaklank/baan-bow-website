// หน้าหลังบ้านสำหรับมือถือ — 3 แท็บ งาน / เอกสาร / สรุป
// ไม่มีระบบ login ในนี้ ตั้งใจให้ Cloudflare Access กั้นหน้า /admin จากข้างนอก
import { TYPES, getSeller } from './config.js';
import { thaiDateShort, thaiDate, thaiMonth, fmtBaht } from './thai.js';
import { esc } from './render.js';

const CSS = `
:root{--wine:#B5161F;--wine2:#D23A44;--gold:#B8895A;--ink:#1F2430;--mute:#6B7280;--line:#E6E1DC;--soft:#FBF7F4;--bg:#F4F1EE}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:var(--bg);font-family:'Sarabun',sans-serif;color:var(--ink);font-size:15px;line-height:1.5;padding-bottom:24px}
header{position:sticky;top:0;z-index:10;background:linear-gradient(90deg,var(--wine),var(--wine2) 70%,var(--gold));color:#fff;padding:14px 16px 0}
header h1{font-size:18px;font-weight:600;letter-spacing:.5px}
header .date{font-size:12px;opacity:.85;margin-bottom:10px}
nav{display:flex;gap:4px}
nav a{flex:1;text-align:center;padding:9px 4px;font-size:14px;font-weight:500;color:#fff;text-decoration:none;
  border-radius:8px 8px 0 0;background:rgba(0,0,0,.18)}
nav a.on{background:var(--bg);color:var(--wine);font-weight:600}
main{padding:14px 12px}
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
.empty{text-align:center;color:var(--mute);padding:30px 10px;font-size:14px}
footer{text-align:center;font-size:10px;letter-spacing:2px;color:var(--gold);margin-top:18px;text-transform:uppercase}
`;

const TAB_LABEL = { jobs: 'งาน', docs: 'เอกสาร', summary: 'สรุป' };

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

function summaryView(s, openCount, lateCount, todayCount) {
  // แยกกล่องตามบริษัท — คนละนิติบุคคล ยื่น VAT คนละชุด ห้ามเอายอดมารวมกัน
  const bySeller = new Map();
  for (const r of s.byType) {
    if (!bySeller.has(r.seller)) bySeller.set(r.seller, []);
    bySeller.get(r.seller).push(r);
  }

  const blocks = bySeller.size
    ? [...bySeller.entries()].map(([key, rows]) => {
      const total = rows.reduce((a, r) => a + r.total, 0);
      const vat = rows.reduce((a, r) => a + r.vat, 0);
      const base = rows.reduce((a, r) => a + r.base, 0);
      return `<div class="sum">
  <h2>${esc(getSeller(key).label)} · ${esc(thaiMonth(s.month))}</h2>
  ${rows.map((r) => `<div class="line"><span>${esc(TYPES[r.type].th)} · ${r.cnt} ใบ</span><b>${fmtBaht(r.total)}</b></div>`).join('')}
  <div class="line"><span>มูลค่าก่อนภาษี</span><b>${fmtBaht(base)}</b></div>
  <div class="line"><span>VAT ขาย (7%)</span><b>${fmtBaht(vat)}</b></div>
  <div class="line grand"><span>รวม</span><b>${fmtBaht(total)}</b></div>
</div>`;
    }).join('\n')
    : `<div class="sum">
  <h2>ยอดเดือน ${esc(thaiMonth(s.month))}</h2>
  <div class="line"><span>ยังไม่มีเอกสารเดือนนี้</span><b>0.00</b></div>
</div>`;

  return `${blocks}
${s.voidCount ? `<div class="sum"><h2>ยกเลิก</h2><div class="line"><span>เอกสารที่ยกเลิก (ไม่นับในยอด)</span><b>${s.voidCount} ใบ</b></div></div>` : ''}

<div class="sum">
  <h2>งาน</h2>
  <div class="line"><span>งานค้างทั้งหมด</span><b>${openCount}</b></div>
  <div class="line"><span>เลยกำหนด</span><b style="color:var(--wine)">${lateCount}</b></div>
  <div class="line"><span>ครบวันนี้</span><b style="color:#C2410C">${todayCount}</b></div>
</div>`;
}

export function renderAdmin({ tab, today, jobs, docs, summary, q }) {
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
  } else {
    const late = jobs.filter((j) => j.due_date && j.due_date < today).length;
    const due = jobs.filter((j) => j.due_date === today).length;
    body = summaryView(summary, jobs.length, late, due);
  }

  const nav = ['jobs', 'docs', 'summary']
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
