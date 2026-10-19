// คำสั่งทั้งหมดที่รับจาก LINE — ฟังก์ชันนี้คืน "ข้อความที่จะตอบ" (null = ไม่ตอบ)
import { TYPES, SELLERS, JOB_STATUSES, WHT_ALLOWED_BP, getSeller, sellerCanIssue } from './config.js';
import { compute } from './money.js';
import { parseDocNo } from './numbering.js';
import { parseCommand } from './ai.js';
import {
  findCustomer, mergeCustomer, issueDocument, docByNo, voidDocument, searchDocs, monthSummary,
  createJob, jobById, findJobs, updateJob, addJobEvent, openJobs,
  savePending, takePending, clearPending, addHoliday, holidayOn,
} from './db.js';
import { readVatMode, parseTaxId } from './text.js';
import { todayBkk, monthBkk, addDays, dayOfWeek, isValidYmd, thaiDate, thaiMonth, fmtBaht } from './thai.js';

const QT_VALID_DAYS = 30;   // ใบเสนอราคายืนราคา 30 วัน (ตรงกับแม่แบบ)

export const HELP = `คำสั่งที่ใช้ได้

📄 ออกเอกสาร
• ทำใบเสนอราคา คุณสมชาย 081-234-5678 ติดตั้งโบว์ 4 ชุด ชุดละ 2900 ส่วนลด 500 ไม่รวม vat
• ออกใบกำกับภาษีจาก QT181069001
• ยกเลิก RC181069003

🔎 ค้นหา / สรุป
• หา QT181069001  หรือ  หา โตโยต้าพัทยา
• สรุปเดือนนี้

🛠 งาน
• เพิ่มงาน ติดตั้งโบว์บ้านคุณสมชาย ส่งมอบศุกร์หน้า
• งาน 3 กำลังทำ / งาน 3 เสร็จแล้ว
• งานค้าง

📅 วันหยุด
• เพิ่มวันหยุด 31 ธันวาคม สิ้นปี

ทุกเอกสารต้องพิมพ์ "ยืนยัน" ก่อนจึงออกเลขที่จริง`;

// ---------- ตัวช่วย ----------

const vatLabel = { none: 'ไม่มี VAT', exclusive: 'ราคายังไม่รวม VAT (บวก 7%)', inclusive: 'ราคารวม VAT แล้ว' };

const askVat = (tax) => tax
  ? 'เอกสารนี้ต้องมี VAT 7% — ราคาที่แจ้งมา "รวม vat" หรือ "ไม่รวม vat" ครับ'
  : 'ยังไม่ได้ระบุ VAT — ตอบว่า "รวม vat" / "ไม่รวม vat" / "ไม่มี vat" ครับ';

/**
 * ผู้ขายที่ไม่มีเลขประจำตัวผู้เสียภาษี ออกใบกำกับภาษีไม่ได้ตามกฎหมาย
 * คืนข้อความอธิบายถ้าออกไม่ได้ คืน null ถ้าออกได้
 */
function sellerCannotIssue(seller, type) {
  if (sellerCanIssue(seller, type)) return null;
  const other = Object.values(SELLERS).find((s) => s.tax_id);
  return `${seller.label} ไม่มีเลขประจำตัวผู้เสียภาษี จึงออก${TYPES[type].th}ไม่ได้\n`
    + (other ? `ถ้าต้องการเอกสารภาษี ให้ออกในนาม ${other.label} แทน (พิมพ์ "ในนาม${other.label}" ต่อท้าย)` : '')
    + `\nหรือออกเป็นใบเสนอราคา/ใบเสร็จรับเงินในนาม ${seller.label} ได้ตามปกติ`;
}

/**
 * ตรวจข้อมูลลูกค้าก่อนออกเอกสาร — คืนข้อความให้ตอบกลับถ้าต้องถามเพิ่ม, null ถ้าผ่าน
 * แก้ customer.tax_id เป็นรูปแบบมาตรฐานให้ในตัว
 *
 * เลขภาษีผิดจำนวนหลัก = หยุดทันที เพราะถ้าปล่อยผ่านจะพิมพ์เลขผิดลงเอกสารภาษี
 * ใบกำกับภาษีแบบเต็มรูปต้องมีที่อยู่ผู้ซื้อ ขาดไม่ได้
 */
export function checkCustomer(customer, type) {
  const tax = parseTaxId(customer.tax_id);
  if (!tax.ok) {
    return `เลขประจำตัวผู้เสียภาษีของลูกค้าไม่ถูกต้อง\n"${customer.tax_id}" นับได้ ${tax.digits.length} หลัก แต่ต้องมี 13 หลัก\n\n`
      + 'ส่งคำสั่งเดิมมาใหม่พร้อมเลขที่ถูกต้องครับ';
  }
  customer.tax_id = tax.formatted;

  if (TYPES[type]?.tax && !customer.address) {
    return `${TYPES[type].th}แบบเต็มรูปต้องมีที่อยู่ของลูกค้า แต่ไม่พบที่อยู่ในข้อความ\n\n`
      + 'ส่งคำสั่งเดิมมาใหม่พร้อมที่อยู่เต็มของลูกค้าครับ';
  }
  return null;
}

/** เตือนเมื่อกำหนดส่งตรงวันหยุดหรือเสาร์-อาทิตย์ */
async function dateWarn(db, ymd) {
  const h = await holidayOn(db, ymd);
  if (h) return `\n⚠️ ตรงกับวันหยุด: ${h.name}`;
  const dow = dayOfWeek(ymd);
  return dow === 0 || dow === 6 ? '\n⚠️ ตรงกับวันเสาร์-อาทิตย์' : '';
}

function docSummary(d) {
  const lines = d.lines.map((l) => `• ${l.name} ${l.qty} × ${fmtBaht(l.unit_price)} = ${fmtBaht(l.amount)}`).join('\n');
  const parts = [
    `${TYPES[d.type].th} (ยังไม่ออกเลขที่)`,
    `ออกในนาม: ${getSeller(d.seller).label}`,
    `ลูกค้า: ${d.customer.name}`,
    // โชว์ที่อยู่เต็มเสมอ เพื่อให้เห็นก่อนยืนยันว่า AI ดึงมาครบหรือตกหล่น
    `ที่อยู่: ${d.customer.address || '— ไม่มี —'}`,
    d.customer.tax_id
      ? `เลขภาษี: ${d.customer.tax_id}${d.customer.branch ? ` (${d.customer.branch})` : ''}`
      : (TYPES[d.type].tax ? '⚠️ ไม่มีเลขภาษีลูกค้า' : null),
    `วันที่: ${thaiDate(d.issue_date, true)}`,
    d.ref_doc_no ? `อ้างอิง: ${d.ref_doc_no}` : null,
    '',
    lines,
    d.discount ? `ส่วนลด ${fmtBaht(d.discount)}` : null,
    `VAT: ${vatLabel[d.vat_mode]}`,
    d.vat ? `ภาษีมูลค่าเพิ่ม 7% ${fmtBaht(d.vat)}` : null,
    `รวมทั้งสิ้น ${fmtBaht(d.total)} บาท`,
    d.wht_rate ? `หัก ณ ที่จ่าย ${d.wht_rate / 100}% −${fmtBaht(d.wht)}\nยอดชำระสุทธิ ${fmtBaht(d.net_payable)} บาท` : null,
    '',
    'พิมพ์ "ยืนยัน" เพื่อออกเอกสาร หรือ "ยกเลิก" เพื่อทิ้งรายการนี้',
  ];
  return parts.filter((x) => x !== null).join('\n');
}

export function jobListText(rows, today, heading) {
  if (!rows.length) return 'ไม่มีงานค้าง 🎉';
  const body = rows.map((r) => {
    const tag = !r.due_date ? '' : r.due_date < today ? ' ❗เลยกำหนด' : r.due_date === today ? ' ⏰ครบวันนี้' : '';
    return `#${r.id} ${r.title} [${r.status}] ${r.due_date ? thaiDate(r.due_date) : 'ไม่มีกำหนด'}${tag}`;
  }).join('\n');
  return `${heading}\n${body}`;
}

/** ประกอบร่างเอกสารจากข้อมูลที่พร้อมแล้ว (คำนวณยอดในโค้ด) */
function buildDraft({ type, seller, customer, items, discount, vat_mode, wht_rate, note, payment_terms, ref_doc_no, issue_date }) {
  const c = compute({ items, discount, vat_mode, wht_rate });
  return {
    type, seller: getSeller(seller).key, issue_date, customer,
    valid_until: type === 'quotation' ? addDays(issue_date, QT_VALID_DAYS) : null,
    lines: c.lines, discount: c.discount, vat_mode,
    subtotal: c.subtotal, base: c.base, vat: c.vat,
    wht_rate: c.wht_rate, wht: c.wht, total: c.total, net_payable: c.net_payable,
    note: note ?? null, payment_terms: payment_terms ?? null, ref_doc_no: ref_doc_no ?? null,
  };
}

// ---------- ตัวจัดการแต่ละคำสั่ง ----------

async function doCreateDoc(env, uid, cmd) {
  const db = env.DB;
  const type = cmd.doc_type;
  const missing = [];
  if (!TYPES[type]) missing.push('ประเภทเอกสาร (ใบเสนอราคา/ใบเสร็จ/ใบกำกับภาษี)');
  if (!cmd.customer?.name) missing.push('ชื่อลูกค้า');
  if (!cmd.items?.length) missing.push('รายการสินค้า/บริการ พร้อมราคา');
  if (missing.length) return 'ขาดข้อมูล: ' + missing.join(', ');

  // ลูกค้าเดิมที่เคยออกบิลแล้ว ดึงที่อยู่/เลขภาษี/สาขา มาเติมให้เอง
  const saved = await findCustomer(db, cmd.customer.name);
  const customer = mergeCustomer(cmd.customer, saved);

  const badCustomer = checkCustomer(customer, type);
  if (badCustomer) return badCustomer;

  const wht_rate = cmd.wht_percent ? cmd.wht_percent * 100 : 0;
  if (wht_rate && !WHT_ALLOWED_BP.includes(wht_rate)) return 'หัก ณ ที่จ่าย รับเฉพาะ 1% หรือ 3% ครับ';

  const seller = getSeller(cmd.seller);
  const blocked = sellerCannotIssue(seller, type);
  if (blocked) return blocked;

  const base = {
    type, seller: seller.key, customer, items: cmd.items, discount: cmd.discount || 0, wht_rate,
    note: cmd.note, payment_terms: cmd.payment_terms, ref_doc_no: null, issue_date: todayBkk(),
  };

  // VAT: ไม่ระบุ = ถามกลับ ห้ามเดา  /  TI กับ RT บังคับมี VAT จะตอบ "ไม่มี vat" ไม่ได้
  let vat_mode = cmd.vat_mode;
  if (TYPES[type].tax && vat_mode === 'none') vat_mode = null;
  if (!vat_mode) {
    await savePending(db, uid, { kind: 'need_vat', base });
    return askVat(TYPES[type].tax);
  }

  const draft = buildDraft({ ...base, vat_mode });
  await savePending(db, uid, { kind: 'doc', doc: draft });
  return docSummary(draft);
}

async function doConvertDoc(env, uid, cmd) {
  const db = env.DB;
  const src = cmd.from_doc_no ? await docByNo(db, cmd.from_doc_no) : null;
  if (!src) return 'ไม่พบเอกสารต้นทาง ' + (cmd.from_doc_no || '(ไม่ได้ระบุเลขที่)');
  if (src.status === 'void') return `${src.doc_no} ถูกยกเลิกไปแล้ว ออกเอกสารต่อจากใบนี้ไม่ได้`;
  if (!TYPES[cmd.doc_type]) return 'ระบุประเภทเอกสารปลายทางด้วยครับ เช่น "ออกใบกำกับภาษีจาก ' + src.doc_no + '"';

  // ออกในนามเดิมของใบต้นทาง เว้นแต่ผู้ใช้สั่งเปลี่ยนมาในข้อความนี้
  const seller = getSeller(cmd.seller ?? src.seller);
  const blocked = sellerCannotIssue(seller, cmd.doc_type);
  if (blocked) return blocked;

  // เอกสารต้นทางอาจออกตอนที่ยังไม่มีด่านตรวจนี้ จึงตรวจซ้ำก่อนออกใบใหม่
  const srcCustomer = JSON.parse(src.customer);
  const badCustomer = checkCustomer(srcCustomer, cmd.doc_type);
  if (badCustomer) return `${src.doc_no} มีข้อมูลลูกค้าไม่ครบ\n\n` + badCustomer;

  const base = {
    type: cmd.doc_type,
    seller: seller.key,
    customer: srcCustomer,
    items: JSON.parse(src.items).map((l) => ({ name: l.name, note: l.note, qty: l.qty, unit_price: l.unit_price / 100 })),
    discount: src.discount / 100,
    wht_rate: src.wht_rate,
    note: cmd.note ?? src.note,
    payment_terms: null,
    ref_doc_no: src.doc_no,
    issue_date: todayBkk(),
  };

  // เอกสารต้นทางไม่ได้คิด VAT แต่ปลายทางเป็นเอกสารภาษี -> ต้องถามก่อน ห้ามเดาให้
  let vat_mode = src.vat_mode;
  if (TYPES[cmd.doc_type].tax && vat_mode === 'none') {
    await savePending(db, uid, { kind: 'need_vat', base });
    return `${src.doc_no} ไม่ได้คิด VAT แต่${TYPES[cmd.doc_type].th}ต้องมี VAT 7%\n` + askVat(true);
  }

  const draft = buildDraft({ ...base, vat_mode });
  await savePending(db, uid, { kind: 'doc', doc: draft });
  return docSummary(draft);
}

async function doVoidDoc(env, uid, cmd) {
  const db = env.DB;
  const no = cmd.doc_no || cmd.query;
  if (!no) return 'ระบุเลขที่เอกสารที่จะยกเลิกด้วยครับ เช่น "ยกเลิก RC181069003"';
  const doc = await docByNo(db, no);
  if (!doc) return 'ไม่พบเอกสารเลขที่ ' + no;
  if (doc.status === 'void') return `${doc.doc_no} ถูกยกเลิกไปแล้ว${doc.void_reason ? ` (${doc.void_reason})` : ''}`;
  await savePending(db, uid, { kind: 'void', doc_no: doc.doc_no, reason: cmd.note ?? null });
  return `จะยกเลิก ${TYPES[doc.type].th} ${doc.doc_no}\nลูกค้า: ${JSON.parse(doc.customer).name}\nยอด: ${fmtBaht(doc.total)} บาท\n\n`
    + 'เอกสารจะถูกประทับลายน้ำ "ยกเลิก" และเลขที่นี้จะใช้ซ้ำไม่ได้\nพิมพ์ "ยืนยัน" เพื่อยกเลิกเอกสาร';
}

async function doCreateJob(env, cmd) {
  const db = env.DB;
  const j = cmd.job || {};
  if (!j.title) return 'ขาดชื่องานครับ เช่น "เพิ่มงาน ติดตั้งโบว์บ้านคุณสมชาย ส่งมอบศุกร์หน้า"';
  const due = isValidYmd(j.due_date) ? j.due_date : null;
  const job = await createJob(db, {
    title: j.title, customer: cmd.customer?.name ?? null, due_date: due, note: j.note ?? null,
  });
  return `เพิ่มงาน #${job.id}: ${job.title}\nกำหนดส่ง: ${due ? thaiDate(due, true) + (await dateWarn(db, due)) : 'ยังไม่ระบุ'}`;
}

async function doUpdateJob(env, cmd) {
  const db = env.DB;
  const j = cmd.job || {};
  if (!j.ref) return 'ระบุเลขงานหรือชื่องานด้วยครับ เช่น "งาน 3 เสร็จแล้ว"';

  const m = String(j.ref).match(/^#?(\d+)$/);
  let found;
  if (m) {
    const one = await jobById(db, Number(m[1]));
    found = one ? [one] : [];
  } else {
    found = await findJobs(db, j.ref);
  }
  if (!found.length) return 'ไม่พบงานที่ตรงกับ ' + j.ref;
  if (found.length > 1) {
    return 'พบหลายงาน ระบุเลขงานครับ:\n' + found.map((x) => `#${x.id} ${x.title} [${x.status}]`).join('\n');
  }

  const job = found[0];
  if (j.status && !JOB_STATUSES.includes(j.status)) return 'สถานะใช้ได้เฉพาะ: ' + JOB_STATUSES.join(', ');
  const due = isValidYmd(j.due_date) ? j.due_date : null;
  const updated = await updateJob(db, job.id, { status: j.status ?? null, due_date: due, note: j.note ?? null });

  const changes = [
    j.status && j.status !== job.status ? `สถานะ → ${j.status}` : null,
    due && due !== job.due_date ? `กำหนดส่ง → ${thaiDate(due)}` : null,
    j.note || null,
  ].filter(Boolean);
  await addJobEvent(db, job.id, changes.join(' | ') || 'อัปเดต');

  return `อัปเดตงาน #${updated.id} ${updated.title}\nสถานะ: ${updated.status}\n`
    + `กำหนดส่ง: ${updated.due_date ? thaiDate(updated.due_date, true) + (await dateWarn(db, updated.due_date)) : '-'}`;
}

async function doSearch(env, cmd) {
  const db = env.DB;
  const q = (cmd.query || cmd.doc_no || cmd.customer?.name || '').trim();
  if (!q) return 'ระบุเลขที่เอกสารหรือชื่อลูกค้าด้วยครับ เช่น "หา โตโยต้าพัทยา"';
  const rows = await searchDocs(db, q);
  if (!rows.length) return 'ไม่พบเอกสารที่ตรงกับ ' + q;
  const base = env.BASE_URL || '';
  return `พบ ${rows.length} รายการ\n\n` + rows.map((r) => {
    const c = JSON.parse(r.customer);
    return `${r.doc_no} ${TYPES[r.type].th}${r.status === 'void' ? ' (ยกเลิกแล้ว)' : ''}\n`
      + `${c.name} · ${fmtBaht(r.total)} บาท · ${thaiDate(r.issue_date)}\n${base}/d/${r.token}`;
  }).join('\n\n');
}

async function doMonthSummary(env) {
  const ym = monthBkk();
  const s = await monthSummary(env.DB, ym);
  if (!s.byType.length) return `${thaiMonth(ym)} ยังไม่มีเอกสารที่ออกครับ`;

  // แยกตามบริษัท เพราะคนละนิติบุคคล ยื่น VAT คนละชุด เอายอดมารวมกันไม่ได้
  const bySeller = new Map();
  for (const r of s.byType) {
    if (!bySeller.has(r.seller)) bySeller.set(r.seller, []);
    bySeller.get(r.seller).push(r);
  }

  const blocks = [...bySeller.entries()].map(([key, rows]) => {
    const total = rows.reduce((a, r) => a + r.total, 0);
    const vat = rows.reduce((a, r) => a + r.vat, 0);
    return [
      `━ ${getSeller(key).label}`,
      ...rows.map((r) => `• ${TYPES[r.type].th} ${r.cnt} ใบ — ${fmtBaht(r.total)} บาท`),
      `รวม ${fmtBaht(total)} บาท · VAT ขาย ${fmtBaht(vat)} บาท`,
    ].join('\n');
  });

  const open = await openJobs(env.DB);
  const today = todayBkk();
  const late = open.filter((j) => j.due_date && j.due_date < today).length;

  return [
    `📊 สรุป ${thaiMonth(ym)}`,
    '',
    blocks.join('\n\n'),
    s.voidCount ? `\nยกเลิก ${s.voidCount} ใบ (ไม่นับในยอด)` : null,
    '',
    `งานค้าง ${open.length} งาน${late ? ` (เลยกำหนด ${late})` : ''}`,
  ].filter((x) => x !== null).join('\n');
}

async function doAddHoliday(env, cmd) {
  const h = cmd.holiday || {};
  if (!isValidYmd(h.date)) return 'ระบุวันที่ให้ชัดครับ เช่น "เพิ่มวันหยุด 31 ธันวาคม สิ้นปี"';
  await addHoliday(env.DB, h.date, h.name || 'วันหยุด');
  return `เพิ่มวันหยุด ${thaiDate(h.date, true)} — ${h.name || 'วันหยุด'}`;
}

// ---------- ยืนยัน ----------

async function doConfirm(env, uid) {
  const db = env.DB;
  const p = await takePending(db, uid);
  if (!p) return 'ไม่มีรายการที่รอยืนยัน (รายการหมดอายุภายใน 15 นาที)';

  if (p.kind === 'void') {
    const ok = await voidDocument(db, p.doc_no, p.reason);
    return ok ? `🚫 ยกเลิก ${p.doc_no} แล้ว เอกสารยังเปิดดูได้แต่มีลายน้ำ "ยกเลิก"` : `${p.doc_no} ถูกยกเลิกไปก่อนหน้านี้แล้ว`;
  }

  if (p.kind === 'need_vat') return 'ยังไม่ได้ตอบเรื่อง VAT ครับ — ' + askVat(TYPES[p.base.type].tax);

  if (p.kind === 'doc') {
    const row = await issueDocument(db, p.doc);
    const base = env.BASE_URL || '';
    return `✅ ออก${TYPES[row.type].th} เลขที่ ${row.doc_no} แล้ว\n`
      + `${JSON.parse(row.customer).name} · ${fmtBaht(row.total)} บาท\n\n${base}/d/${row.token}`;
  }

  return 'ไม่มีรายการที่รอยืนยัน';
}

// ---------- ทางเข้าหลัก ----------

/** คืนข้อความที่จะตอบ หรือ null ถ้าไม่ต้องตอบ (คนอื่นที่ไม่ได้รับอนุญาต) */
export async function handleText(env, uid, text) {
  const db = env.DB;
  const msg = String(text).trim();

  const allowed = (env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) {
    return `userId ของคุณคือ\n${uid}\n\nนำไปใส่ secret ALLOWED_USER_IDS ด้วยคำสั่ง\nwrangler secret put ALLOWED_USER_IDS`;
  }
  if (!allowed.includes(uid)) {
    // คนอื่นสั่งงานไม่ได้ และไม่ตอบอะไรเลย — แต่บันทึก userId ไว้ใน log
    // เพื่อให้เจ้าของเอาไปเพิ่มใน ALLOWED_USER_IDS ได้ถ้าเป็นคนของร้าน
    // (ดูด้วย wrangler tail) ไม่บันทึกเนื้อข้อความ
    console.log('ไม่ได้รับอนุญาต userId=' + uid);
    return null;
  }

  if (msg === 'ยืนยัน') return doConfirm(env, uid);
  if (msg === 'ยกเลิก') {
    await clearPending(db, uid);
    return 'ทิ้งรายการที่รออยู่แล้วครับ';
  }
  if (/^(help|ช่วย|คำสั่ง|เมนู)$/i.test(msg)) return HELP;

  // ถ้ากำลังรอคำตอบเรื่อง VAT ให้อ่านจากข้อความตรงๆ ไม่ต้องเสียเวลาเรียก AI
  const vatAnswer = readVatMode(msg);
  if (vatAnswer) {
    const p = await takePending(db, uid);
    if (p?.kind === 'need_vat') {
      const tax = TYPES[p.base.type].tax;
      if (tax && vatAnswer === 'none') {
        await savePending(db, uid, p);
        return `${TYPES[p.base.type].th}ต้องมี VAT 7% ครับ — ตอบ "รวม vat" หรือ "ไม่รวม vat"`;
      }
      const draft = buildDraft({ ...p.base, vat_mode: vatAnswer });
      await savePending(db, uid, { kind: 'doc', doc: draft });
      return docSummary(draft);
    }
    if (p) await savePending(db, uid, p);   // ไม่ได้รออยู่ ก็คืนรายการเดิมกลับไป
  }

  // เลขที่เอกสารโดดๆ = ขอดูเอกสารนั้น
  if (parseDocNo(msg)) return doSearch(env, { query: msg });

  const cmd = await parseCommand(env, msg);
  if (cmd.failed) {
    // บอกไปตรงๆ ว่าระบบขัดข้อง ไม่ใช่ตอบ help ซึ่งทำให้เข้าใจผิดว่าบอทอ่านไม่เข้าใจ
    return `⚠️ เรียกระบบอ่านข้อความไม่สำเร็จ ข้อความของคุณยังไม่ถูกประมวลผล\nลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้ดู log ด้วย wrangler tail\n\n(${cmd.failed})`;
  }
  switch (cmd.intent) {
    case 'create_doc':    return doCreateDoc(env, uid, cmd);
    case 'convert_doc':   return doConvertDoc(env, uid, cmd);
    case 'void_doc':      return doVoidDoc(env, uid, cmd);
    case 'create_job':    return doCreateJob(env, cmd);
    case 'update_job':    return doUpdateJob(env, cmd);
    case 'list_jobs':     return jobListText(await openJobs(db), todayBkk(), `🛠 งานค้าง (${thaiDate(todayBkk(), true)})`);
    case 'search':        return doSearch(env, cmd);
    case 'month_summary': return doMonthSummary(env);
    case 'add_holiday':   return doAddHoliday(env, cmd);
    default:              return HELP;
  }
}

/** ข้อความแจ้งเตือนเช้า 08:00 — เลยกำหนด / ครบวันนี้ / ครบพรุ่งนี้ */
export async function morningDigest(env) {
  const today = todayBkk();
  const rows = await openJobs(env.DB, addDays(today, 1));
  if (!rows.length) return null;
  return '🔔 ' + jobListText(rows, today, `งานที่ต้องดู (${thaiDate(today, true)})`);
}

