// คำสั่งทั้งหมดที่รับจาก LINE — ฟังก์ชันนี้คืน "ข้อความที่จะตอบ" (null = ไม่ตอบ)
import {
  TYPES, SELLERS, JOB_STATUSES, JOB_DEFAULT_DUE_DAYS, WHT_ALLOWED_BP,
  STOCK_ALLOW_NEGATIVE, EXPENSE_CATEGORIES, getSeller, sellerCanIssue,
  splitIncome, roleOf, LEAD_STATUSES, LEAD_WORD_TO_STATUS,
} from './config.js';
import { compute, toSatang } from './money.js';
import { parseDocNo } from './numbering.js';
import { parseCommand } from './ai.js';
import {
  findCustomer, mergeCustomer, issueDocument, docByNo, voidDocument, searchDocs, monthSummary,
  createJob, jobById, jobByDocNo, findJobs, updateJob, addJobEvent, openJobs,
  savePending, takePending, peekPending, clearPending, addHoliday, holidayOn,
  setLeadStatus, recentLeads,
  findProduct, productKey, upsertProduct, receiveStock, listStock, stockOf,
  addStockMove, stockMovesOfJob, productsByKeys, stockValue,
  addExpense, monthExpenses, expenseById, voidExpense, replaceExpense,
} from './db.js';
import { readVatMode, parseTaxId } from './text.js';
import { readDraftEdit, draftToBase, isEditError, EDIT_HELP } from './draft.js';
import { huntLead } from './leads.js';
import { push } from './line.js';
import {
  todayBkk, monthBkk, addDays, dayOfWeek, isValidYmd, readThaiDate,
  thaiDate, thaiMonth, fmtBaht,
} from './thai.js';

const QT_VALID_DAYS = 15;   // ใบเสนอราคายืนราคา 15 วันนับจากวันที่ออก

export const HELP = `คำสั่งที่ใช้ได้

📄 ออกเอกสาร
• ทำใบเสนอราคา คุณสมชาย 081-234-5678 ติดตั้งโบว์ 4 ชุด ชุดละ 2900 ส่วนลด 500 ไม่รวม vat
• ออกใบกำกับภาษีจาก QT181069001
• ยกเลิก RC181069003
• ...ลงวันที่ 15/10      (ไม่บอกวันที่ = ลงวันนี้ บอกมาก็ลงวันนั้น ย้อนหลังได้)

✏️ แก้ร่างก่อนยืนยัน (ไม่ต้องพิมพ์ใหม่ทั้งก้อน)
• แก้ข้อ 2 ราคา 4500   /   แก้ข้อ 2 จำนวน 3   /   ลบข้อ 4   /   เพิ่มข้อ ค่าส่ง 350
• แก้ที่อยู่ ...   /   แก้เลขภาษี ...   /   แก้ส่วนลด 500   /   แก้ประเภท ใบเสร็จ
• วันที่ 15/10
• พิมพ์ "แก้" เพื่อดูวิธีแก้ทุกช่อง

🔎 ค้นหา / สรุป
• หา QT181069001  หรือ  หา โตโยต้าพัทยา
• สรุปเดือนนี้

🛠 งาน
• เพิ่มงาน ติดตั้งโบว์บ้านคุณสมชาย ส่งมอบศุกร์หน้า
• งาน 3 กำลังทำ / งาน 3 เสร็จแล้ว
• งานค้าง

📦 สต๊อก (นับเป็นชิ้น)
• รับเข้า โบว์ริบบิ้นแดง 3        (ใส่ต้นทุนก็ได้ — ... 3 ต้นทุน 45)
• โบว์แดง ทุน 45 ขาย 99          (ตั้งราคาอย่างเดียว ไม่แตะจำนวน)
• สต๊อก   หรือ   สต๊อก โบว์แดง
• ส่งของงาน 7                   (ตัดสต๊อกตามรายการในบิลของงานนั้น)
• ปรับสต๊อก โบว์แดง = 12         (ตั้งยอดตามที่นับได้จริง)

💸 รายจ่าย
• ค่าวัสดุ 450 ซื้อริบบิ้น
• ค่าส่ง 60 Kerry   /   ค่าแรง 300 พี่หน่อย   /   ค่าเช่า 3500
• ยกเลิกรายจ่าย 12               (ลงผิด — ยกเลิก ไม่ลบ ประวัติยังอยู่)
• แก้รายจ่าย 12 ค่าส่ง 80         (ยกเลิกของเดิมแล้วลงใหม่ ไม่ทับของเดิม)

🔎 ลูกค้ามุ่งหวัง (ค้นเฉพาะตอนสั่ง ไม่มีรอบอัตโนมัติ)
• หาลูกค้า                       (ค้นให้ 1 เจ้า ใช้เวลา 1-3 นาที)
• มุ่งหวัง                        (ดูรายการล่าสุด)
• สนใจ 12                        (น่าทัก เก็บไว้ตามต่อ)
• ไม่สนใจ 12 ร้านเล็กเกินไป      (บอกเหตุผลด้วย รอบหน้าจะหาตรงขึ้น)
• ติดต่อแล้ว 12 / ตอบกลับ 12 / ปิดได้ 12

📅 วันหยุด
• เพิ่มวันหยุด 31 ธันวาคม สิ้นปี

ทุกเอกสารต้องพิมพ์ "ยืนยัน" ก่อนจึงออกเลขที่จริง
ส่งของก็ต้องยืนยันเหมือนกัน เพราะตัดสต๊อกแล้วย้อนไม่ได้`;

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

/**
 * วันที่ที่จะลงในเอกสาร — ผู้ใช้ไม่ได้บอกมา (หรือบอกมาแบบที่อ่านไม่ออก) ใช้วันนี้
 * ไม่ล้มคำสั่งทิ้งเมื่ออ่านวันที่ไม่ออก เพราะร่างยังแก้วันที่ได้ก่อนยืนยัน
 */
const pickIssueDate = (cmd) => (isValidYmd(cmd?.issue_date) ? cmd.issue_date : todayBkk());

/** ป้ายต่อท้ายวันที่ในใบร่าง ให้เห็นว่าไม่ใช่วันนี้ */
function issueDateTag(ymd, today = todayBkk()) {
  if (ymd === today) return '';
  return ymd < today ? ' ⚠️ ย้อนหลัง' : ' ⚠️ ล่วงหน้า';
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
    // ย้อนหลัง/ล่วงหน้าต้องเห็นชัดก่อนยืนยัน เพราะวันที่นี้ไปอยู่ในเลขที่เอกสารด้วย แก้ทีหลังไม่ได้
    `วันที่: ${thaiDate(d.issue_date, true)}${issueDateTag(d.issue_date)}`,
    d.ref_doc_no ? `อ้างอิง: ${d.ref_doc_no}` : null,
    '',
    lines,
    d.discount ? `ส่วนลด ${fmtBaht(d.discount)}` : null,
    `VAT: ${vatLabel[d.vat_mode]}`,
    d.vat ? `ภาษีมูลค่าเพิ่ม 7% ${fmtBaht(d.vat)}` : null,
    `รวมทั้งสิ้น ${fmtBaht(d.total)} บาท`,
    d.wht_rate ? `หัก ณ ที่จ่าย ${d.wht_rate / 100}% −${fmtBaht(d.wht)}\nยอดชำระสุทธิ ${fmtBaht(d.net_payable)} บาท` : null,
    '',
    'พิมพ์ "ยืนยัน" เพื่อออกเอกสาร / "ยกเลิก" เพื่อทิ้งรายการนี้',
    'แก้ได้ทุกช่องโดยไม่ต้องพิมพ์ใหม่ เช่น "แก้ข้อ 2 ราคา 4500" / "ลบข้อ 3" / "วันที่ 15/10" — พิมพ์ "แก้" ดูทั้งหมด',
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
    note: cmd.note, payment_terms: cmd.payment_terms, ref_doc_no: null,
    issue_date: pickIssueDate(cmd),
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
    // ใบใหม่ลงวันที่ที่ผู้ใช้บอกมา ไม่บอกก็วันนี้ — ไม่ใช่วันที่ของใบต้นทาง
    issue_date: pickIssueDate(cmd),
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

// ---------- ลูกค้ามุ่งหวัง ----------

/** การ์ดที่ส่งเข้าไลน์ตอนเช้า — อ่านจบใน 30 วินาที แล้วตัดสินใจได้เลย */
export function leadCard(l, base = '') {
  const why = JSON.parse(l.why || '[]');
  const contact = [
    l.phone ? `โทร ${l.phone}` : null,
    l.facebook ? `เพจ ${l.facebook}` : null,
    l.website ? `เว็บ ${l.website}` : null,
    l.line_id ? `ไลน์ ${l.line_id}` : 'ไม่พบไลน์สาธารณะ',
  ].filter(Boolean);

  return [
    `ลูกค้ามุ่งหวังวันนี้ · รายการที่ ${l.id}`,
    '',
    l.name,
    [l.category, l.province].filter(Boolean).join(' · '),
    '',
    'ทำไมน่าคุย',
    ...why.map((w) => `• ${w}`),
    '',
    'ติดต่อ',
    ...contact,
    '',
    `ความน่าคุย ${l.fit + l.reach + l.timing}/15 (ตรงกลุ่ม ${l.fit} · ติดต่อได้ ${l.reach} · จังหวะ ${l.timing})`,
    l.draft ? `\nข้อความที่ร่างไว้ — อ่านแล้วส่งเอง\n"${l.draft}"` : null,
    '',
    `ที่มาของข้อมูลทุกช่องดูได้ที่ ${base}/admin?tab=leads`,
    `ตอบกลับ: "สนใจ ${l.id}" / "ไม่สนใจ ${l.id}" / "ติดต่อแล้ว ${l.id}"`,
  ].filter((x) => x !== null).join('\n');
}

/**
 * "สนใจ 12" / "ไม่สนใจ 12 ร้านเล็กเกินไป" — อ่านจากข้อความตรงๆ ไม่เรียก AI
 * เหตุผลที่พิมพ์ต่อท้ายสำคัญกว่าตัวสถานะ เพราะมันคือสิ่งที่ป้อนกลับเข้ารอบค้นหาถัดไป
 * คืน null ถ้าไม่ใช่รูปแบบนี้ ให้ข้อความไปเข้าทางปกติต่อ
 */
async function doLeadStatus(env, msg) {
  const words = Object.keys(LEAD_WORD_TO_STATUS).sort((a, b) => b.length - a.length);
  const m = msg.match(new RegExp(`^(${words.join('|')})\\s*#?(\\d+)\\s*(.*)$`, 's'));
  if (!m) return null;

  const status = LEAD_WORD_TO_STATUS[m[1]];
  const id = Number(m[2]);
  const note = m[3].trim() || null;

  const lead = await setLeadStatus(env.DB, id, status, note);
  if (!lead) return `ไม่พบลูกค้ามุ่งหวังรายการที่ ${id} ครับ`;

  const tail = status === 'dropped' && !note
    ? '\n\nบอกเหตุผลสั้นๆ ได้นะครับ เช่น "ไม่สนใจ ' + id + ' ร้านเล็กเกินไป"\nเหตุผลคือสิ่งที่ทำให้รอบหน้าหาตรงขึ้น'
    : status === 'won'
      ? '\n\nออกใบเสนอราคาให้เลยได้ครับ แล้วเขาจะกลายเป็นลูกค้าในระบบเอง'
      : '';

  return `บันทึกแล้ว — ${lead.name} เป็น "${LEAD_STATUSES[status].th}"${note ? `\nเหตุผล: ${note}` : ''}${tail}`;
}

/**
 * สั่งหาเดี๋ยวนี้ ไม่ต้องรอรอบเช้า — ใช้ตอนอยากได้งานเพิ่มวันนี้เลย
 *
 * ค้นเว็บใช้เวลา 1-3 นาที ซึ่งนานกว่าอายุ reply token ของไลน์ จึงตอบรับทันทีก่อน
 * แล้วค่อย push การ์ดตามไปทีหลัง ไม่ใช่ await ค้างไว้แล้วตอบไม่ทัน
 *
 * ต่างจากรอบ cron ตรงที่ "ไม่เจอ" ก็ต้องบอก เพราะคนสั่งกำลังนั่งรอคำตอบอยู่
 */
async function huntAndPush(env, uid) {
  try {
    const { lead, skipped } = await huntLead(env);
    await push(env, uid, lead
      ? '🔎 ' + leadCard(lead, env.BASE_URL || '')
      : `รอบนี้ยังไม่เจอเจ้าที่ข้อมูลครบพอจะติดต่อได้ครับ (${skipped})\nสั่ง "หาลูกค้า" ซ้ำได้เลย`);
  } catch (e) {
    console.error('huntAndPush', e);
    await push(env, uid, '⚠️ หาลูกค้าไม่สำเร็จ ระบบขัดข้อง ดู log ด้วย wrangler tail ครับ');
  }
}

/** รายการที่ยังไม่ได้ตามต่อ — พิมพ์ "มุ่งหวัง" ดูได้ทุกเมื่อ */
async function doListLeads(env) {
  const rows = await recentLeads(env.DB, { limit: 10 });
  if (!rows.length) return 'ยังไม่มีลูกค้ามุ่งหวังในระบบครับ พิมพ์ "หาลูกค้า" เพื่อให้ค้นให้หนึ่งเจ้า';
  const body = rows.map((l) => {
    const st = LEAD_STATUSES[l.status]?.th ?? l.status;
    return `#${l.id} ${l.name} [${st}] ${l.fit + l.reach + l.timing}/15`;
  }).join('\n');
  return `ลูกค้ามุ่งหวังล่าสุด\n${body}\n\nดูรายละเอียดพร้อมที่มาข้อมูลที่ ${env.BASE_URL || ''}/admin?tab=leads`;
}

/**
 * "วันที่ 15/10" ตอนมีร่างเอกสารรออยู่ = แก้วันที่ของร่างนั้นแล้วแสดงใบร่างใหม่
 * อ่านวันที่จากข้อความตรงๆ ไม่เรียก AI เหมือนคำตอบเรื่อง VAT — ถูกกว่าและไม่มีโอกาสเดาผิด
 * คืน null ถ้าไม่มีร่างรออยู่ เพื่อปล่อยข้อความนั้นไปเข้าทางปกติต่อ
 */
async function doSetIssueDate(env, uid, msg) {
  const db = env.DB;
  const p = await peekPending(db, uid);
  if (p?.kind !== 'doc' && p?.kind !== 'need_vat') return null;

  const date = readThaiDate(msg);
  if (!date) {
    return 'อ่านวันที่ไม่ออกครับ พิมพ์ได้แบบนี้\n'
      + '• วันที่ 15/10\n• วันที่ 15/10/2569\n• วันที่ 15 ต.ค.\n• วันที่ เมื่อวาน';
  }

  if (p.kind === 'need_vat') {
    await savePending(db, uid, { ...p, base: { ...p.base, issue_date: date } });
    return `ลงวันที่ ${thaiDate(date, true)}${issueDateTag(date)} ให้แล้ว\n\n` + askVat(TYPES[p.base.type].tax);
  }

  // ยอดเงินไม่ขึ้นกับวันที่ จึงแก้แค่สองช่องนี้ (ใบเสนอราคายืนราคานับจากวันที่ออก)
  const doc = {
    ...p.doc,
    issue_date: date,
    valid_until: p.doc.type === 'quotation' ? addDays(date, QT_VALID_DAYS) : null,
  };
  await savePending(db, uid, { kind: 'doc', doc });
  return docSummary(doc);
}

/**
 * ประกอบร่างใหม่จากข้อมูลตั้งต้นที่แก้แล้ว ตรวจซ้ำทุกด่าน แล้วเก็บเป็นรายการรอยืนยัน
 * ต้องตรวจซ้ำเพราะการแก้เปลี่ยนประเภทเอกสารหรือผู้ขายได้ ซึ่งเปลี่ยนเงื่อนไขทางกฎหมาย
 * (เช่น แก้เป็นใบกำกับภาษีทั้งที่ผู้ขายไม่มีเลขภาษี หรือลูกค้ายังไม่มีที่อยู่)
 */
async function saveDraftFrom(env, uid, base, vat_mode, headline) {
  const db = env.DB;
  const lead = headline ? `✏️ ${headline}\n\n` : '';

  const blocked = sellerCannotIssue(getSeller(base.seller), base.type);
  if (blocked) return lead + blocked;

  const badCustomer = checkCustomer(base.customer, base.type);
  if (badCustomer) return lead + badCustomer;

  // ใบกำกับภาษีบังคับมี VAT — แก้ประเภทมาเป็นใบภาษีทั้งที่ร่างเดิมไม่มี VAT ต้องถามใหม่
  let mode = vat_mode;
  if (TYPES[base.type].tax && mode === 'none') mode = null;
  if (!mode) {
    await savePending(db, uid, { kind: 'need_vat', base });
    return lead + askVat(TYPES[base.type].tax);
  }

  let draft;
  try {
    draft = buildDraft({ ...base, vat_mode: mode });
  } catch (e) {
    // compute() ปฏิเสธ เช่น ส่วนลดมากกว่ายอดรวม — ร่างเดิมยังอยู่ ไม่ได้ถูกเขียนทับ
    return `แก้ไม่ได้ครับ: ${e.message}\n\nร่างเดิมยังอยู่ ลองใหม่หรือพิมพ์ "ยกเลิก" เพื่อทิ้งร่าง`;
  }
  await savePending(db, uid, { kind: 'doc', doc: draft });
  return lead + docSummary(draft);
}

/**
 * แก้ร่างที่รอยืนยันอยู่ทีละช่อง ("แก้ข้อ 2 ราคา 4500", "แก้ที่อยู่ ...", "ลบข้อ 3")
 * อ่านจากข้อความตรงๆ ไม่เรียก AI — เดิมต้อง "ยกเลิก" แล้วพิมพ์ทั้งก้อนใหม่
 * ซึ่งเสียค่าอ่านข้อความเต็มราคาทุกครั้งที่ลูกค้าต่อราคาแค่บรรทัดเดียว
 * คืน null ถ้าไม่มีร่างรออยู่ หรือข้อความนี้ไม่ใช่คำสั่งแก้ร่าง
 */
async function doEditDraft(env, uid, msg) {
  const p = await peekPending(env.DB, uid);
  if (p?.kind !== 'doc' && p?.kind !== 'need_vat') return null;

  const edit = readDraftEdit(msg);
  if (!edit) return null;

  // คัดลอกก่อนแก้ ถ้าแก้ไม่สำเร็จกลางทางร่างเดิมในฐานข้อมูลจะไม่ถูกแตะเลย
  const base = p.kind === 'doc' ? draftToBase(p.doc) : JSON.parse(JSON.stringify(p.base));
  let headline;
  try {
    headline = edit.apply(base);
  } catch (e) {
    if (isEditError(e)) return e.message;
    throw e;
  }
  return saveDraftFrom(env, uid, base, p.kind === 'doc' ? p.doc.vat_mode : null, headline);
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

/**
 * หางานจากเลขงาน ("7" "#7" "งาน 7") หรือจากชื่องาน
 * คืน { job } หรือ { error } ที่ตอบกลับได้เลย — ชื่อซ้ำหลายงานถือว่าหาไม่เจอ ไม่เดาให้
 */
async function resolveJob(db, ref) {
  const t = String(ref).trim().replace(/^(#|งาน|JOB)[\s-]*/i, '');
  const found = /^\d+$/.test(t)
    ? await jobById(db, Number(t)).then((one) => (one ? [one] : []))
    : await findJobs(db, ref);

  if (!found.length) return { error: 'ไม่พบงานที่ตรงกับ ' + ref };
  if (found.length > 1) {
    return {
      error: 'พบหลายงาน ระบุเลขงานครับ:\n'
        + found.map((x) => `#${x.id} ${x.title} [${x.status}]`).join('\n'),
    };
  }
  return { job: found[0] };
}

/** ไม่ได้บอกกำหนดส่งมา ตั้งให้เป็นอีก 4 วันนับจากวันเปิดงาน */
const defaultDue = (ymd) => addDays(ymd, JOB_DEFAULT_DUE_DAYS);

async function doCreateJob(env, cmd) {
  const db = env.DB;
  const j = cmd.job || {};
  if (!j.title) return 'ขาดชื่องานครับ เช่น "เพิ่มงาน ติดตั้งโบว์บ้านคุณสมชาย ส่งมอบศุกร์หน้า"';

  const today = todayBkk();
  const given = isValidYmd(j.due_date);
  const due = given ? j.due_date : defaultDue(today);

  const job = await createJob(db, {
    title: j.title, customer: cmd.customer?.name ?? null, due_date: due, note: j.note ?? null,
  });
  return `เพิ่มงาน #${job.id}: ${job.title}\n`
    + `กำหนดส่ง: ${thaiDate(due, true)}${given ? '' : ` (ตั้งให้อัตโนมัติ ${JOB_DEFAULT_DUE_DAYS} วัน)`}`
    + (await dateWarn(db, due))
    + '\n\nเปลี่ยนกำหนดส่งได้ เช่น "งาน ' + job.id + ' ส่งพุธหน้า"';
}

/** เปิดงานจากเอกสารที่ออกไปแล้ว — ใช้ตอนลูกค้าตกลง/โอนแล้วเท่านั้น ไม่เปิดอัตโนมัติ */
async function doJobFromDoc(env, cmd) {
  const db = env.DB;
  const no = cmd.from_doc_no || cmd.doc_no || cmd.query;
  if (!no) return 'ระบุเลขที่เอกสารด้วยครับ เช่น "เปิดงานจาก QT191069005"';

  const doc = await docByNo(db, no);
  if (!doc) return 'ไม่พบเอกสารเลขที่ ' + no;
  if (doc.status === 'void') return `${doc.doc_no} ถูกยกเลิกไปแล้ว เปิดงานจากใบนี้ไม่ได้`;

  const existing = await jobByDocNo(db, doc.doc_no);
  if (existing) {
    return `${doc.doc_no} เปิดงานไปแล้วเป็นงาน #${existing.id} ${existing.title} [${existing.status}]\n`
      + 'ถ้าต้องการเปิดงานใหม่แยกอีกงาน ใช้ "เพิ่มงาน <ชื่องาน>" แทนครับ';
  }

  const c = JSON.parse(doc.customer);
  const items = JSON.parse(doc.items);
  // ชื่องาน: ใช้ที่ผู้ใช้พิมพ์มา ถ้าไม่ได้พิมพ์ก็ตั้งจากรายการแรกในเอกสาร
  const title = cmd.job?.title
    || (items.length > 1 ? `${items[0].name} และอีก ${items.length - 1} รายการ` : items[0]?.name)
    || `งานจาก ${doc.doc_no}`;

  const today = todayBkk();
  const given = isValidYmd(cmd.job?.due_date);
  const due = given ? cmd.job.due_date : defaultDue(today);

  const job = await createJob(db, {
    title,
    customer: c.name,
    customer_id: doc.customer_id,
    doc_no: doc.doc_no,
    due_date: due,
    note: cmd.job?.note ?? null,
  });

  return `เปิดงาน #${job.id} จาก ${doc.doc_no} แล้ว\n`
    + `${title}\nลูกค้า: ${c.name}\nยอด: ${fmtBaht(doc.total)} บาท\n`
    + `กำหนดส่ง: ${thaiDate(due, true)}${given ? '' : ` (ตั้งให้อัตโนมัติ ${JOB_DEFAULT_DUE_DAYS} วัน)`}`
    + (await dateWarn(db, due));
}

async function doUpdateJob(env, cmd) {
  const db = env.DB;
  const j = cmd.job || {};
  if (!j.ref) return 'ระบุเลขงานหรือชื่องานด้วยครับ เช่น "งาน 3 เสร็จแล้ว"';

  const r = await resolveJob(db, j.ref);
  if (r.error) return r.error;
  const job = r.job;
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
  const exp = await monthExpenses(env.DB, ym);
  if (!s.byType.length && !exp.length) return `${thaiMonth(ym)} ยังไม่มีเอกสารและรายจ่ายครับ`;
  if (!s.byType.length) return expenseOnlySummary(ym, exp);

  // แยกตามบริษัท เพราะคนละนิติบุคคล ยื่น VAT คนละชุด เอายอดมารวมกันไม่ได้
  const bySeller = new Map();
  for (const r of s.byType) {
    if (!bySeller.has(r.seller)) bySeller.set(r.seller, []);
    bySeller.get(r.seller).push(r);
  }

  const blocks = [...bySeller.entries()].map(([key, rows]) => {
    const paid = splitIncome(rows).paid;
    const vat = rows.filter((r) => TYPES[r.type].tax).reduce((a, r) => a + r.vat, 0);
    return [
      `━ ${getSeller(key).label}`,
      // ต่อท้ายทุกบรรทัดว่าใบนั้นนับเป็นรายรับหรือยัง ไม่งั้นเจ้าของบวกเองแล้วได้คนละยอด
      ...rows.map((r) => {
        const role = roleOf(r.type);
        const tag = role === 'paid' ? '' : role === 'due' ? ' (ค้างรับ)' : ' (ยังไม่นับ)';
        return `• ${TYPES[r.type].th} ${r.cnt} ใบ — ${fmtBaht(r.total)} บาท${tag}`;
      }),
      `รับเงินแล้ว ${fmtBaht(paid)} บาท · VAT ขาย ${fmtBaht(vat)} บาท`,
    ].join('\n');
  });

  const open = await openJobs(env.DB);
  const today = todayBkk();
  const late = open.filter((j) => j.due_date && j.due_date < today).length;

  // รายรับคือเงินที่เข้ามาจริงเท่านั้น ใบเสนอราคาไม่นับ (ดู DOC_ROLE ใน config.js)
  const split = splitIncome(s.byType);
  const income = split.paid;
  const spent = exp.reduce((a, r) => a + r.total, 0);

  return [
    `📊 สรุป ${thaiMonth(ym)}`,
    '',
    blocks.join('\n\n'),
    s.voidCount ? `\nยกเลิก ${s.voidCount} ใบ (ไม่นับในยอด)` : null,
    exp.length ? '\n' + expenseBlock(exp) : null,
    '',
    `━ รายรับ ${fmtBaht(income)} − รายจ่าย ${fmtBaht(spent)}`,
    `เหลือ ${fmtBaht(income - spent)} บาท`,
    split.due ? `ค้างรับอีก ${fmtBaht(split.due)} บาท (ใบกำกับภาษี ${split.dueCount} ใบ)` : null,
    split.quote ? `เสนอราคาไป ${fmtBaht(split.quote)} บาท (${split.quoteCount} ใบ รอลูกค้าตอบ)` : null,
    exp.length ? '' : '(ยังไม่ได้บันทึกรายจ่ายเดือนนี้)',
    '',
    `งานค้าง ${open.length} งาน${late ? ` (เลยกำหนด ${late})` : ''}`,
  ].filter((x) => x !== null).join('\n');
}

/**
 * รายจ่ายของเดือน แยกหมวด และบอกยอดต่อบริษัทเฉพาะตอนที่จ่ายจากทั้งสองบริษัท
 * เพราะส่วนใหญ่จ่ายจากบริษัทเดียว ถ้าแยกทุกครั้งข้อความจะยาวเกินจำเป็น
 */
function expenseBlock(rows) {
  const byCat = new Map();
  for (const r of rows) {
    const cur = byCat.get(r.category) ?? { cnt: 0, total: 0 };
    byCat.set(r.category, { cnt: cur.cnt + r.cnt, total: cur.total + r.total });
  }
  const sellers = [...new Set(rows.map((r) => r.seller))];
  const total = rows.reduce((a, r) => a + r.total, 0);

  return [
    '━ รายจ่าย',
    ...EXPENSE_CATEGORIES.filter((c) => byCat.has(c))
      .map((c) => `• ${c} ${byCat.get(c).cnt} รายการ — ${fmtBaht(byCat.get(c).total)} บาท`),
    `รวม ${fmtBaht(total)} บาท`,
    ...(sellers.length > 1
      ? sellers.map((k) => {
        const sum = rows.filter((r) => r.seller === k).reduce((a, r) => a + r.total, 0);
        return `  จ่ายในนาม ${getSeller(k).label} ${fmtBaht(sum)} บาท`;
      })
      : []),
  ].join('\n');
}

/** เดือนที่มีแต่รายจ่าย ยังไม่ได้ออกเอกสารเลย */
function expenseOnlySummary(ym, exp) {
  const spent = exp.reduce((a, r) => a + r.total, 0);
  return [
    `📊 สรุป ${thaiMonth(ym)}`,
    '',
    expenseBlock(exp),
    '',
    `ยังไม่ได้ออกเอกสารเดือนนี้ — ติดลบอยู่ ${fmtBaht(spent)} บาท`,
  ].join('\n');
}

async function doAddHoliday(env, cmd) {
  const h = cmd.holiday || {};
  if (!isValidYmd(h.date)) return 'ระบุวันที่ให้ชัดครับ เช่น "เพิ่มวันหยุด 31 ธันวาคม สิ้นปี"';
  await addHoliday(env.DB, h.date, h.name || 'วันหยุด');
  return `เพิ่มวันหยุด ${thaiDate(h.date, true)} — ${h.name || 'วันหยุด'}`;
}

// ---------- สต๊อก ----------

async function doReceiveStock(env, cmd) {
  const db = env.DB;
  const st = cmd.stock || {};
  if (!st.name) return 'ระบุชื่อโบว์ด้วยครับ เช่น "รับเข้า โบว์ริบบิ้นแดง 3"';
  if (!st.qty || st.qty <= 0) return `รับเข้า ${st.name} กี่ชิ้นครับ เช่น "รับเข้า ${st.name} 3"`;

  // เคยมีรายการนี้แล้วหรือยัง — เช็คก่อนรับเข้า เพราะ receiveStock จะสร้างให้ถ้าไม่มี
  const existed = await findProduct(db, st.name);
  const cost = st.unit_cost ? toSatang(st.unit_cost) : null;
  const { product, after } = await receiveStock(db, {
    name: st.name, qty: st.qty, unit_cost: cost, note: st.note ?? null,
  });

  return `📦 รับเข้า ${product.name} +${st.qty} ${product.unit}\n`
    + `คงเหลือ ${after.qty} ${product.unit}`
    + (cost ? `\nต้นทุน ${fmtBaht(cost)} บาท/${product.unit}` : '')
    + (existed ? '' : '\n\n(ยังไม่มีรายการนี้ ตั้งให้ในสต๊อกแล้ว)');
}

async function doListStock(env, cmd) {
  const db = env.DB;
  const name = cmd.stock?.name || cmd.query;

  if (name) {
    const p = await findProduct(db, name);
    if (!p) {
      return `ไม่มี "${name}" ในสต๊อกครับ\n`
        + `รับเข้าครั้งแรกจะตั้งรายการให้เอง เช่น "รับเข้า ${name} 3"`;
    }
    const s = await stockOf(db, p.id);
    return `📦 ${s.name}\nคงเหลือ ${s.qty} ${s.unit}`
      + (s.cost != null ? `\nต้นทุน ${fmtBaht(s.cost)} บาท/${s.unit}` : '')
      + (s.qty < 0 ? '\n\n⚠️ ยอดติดลบ — ของเข้ายังไม่ได้ลงหรือเปล่าครับ' : '');
  }

  const rows = await listStock(db);
  if (!rows.length) {
    return 'ยังไม่มีรายการในสต๊อกครับ\n"รับเข้า โบว์ริบบิ้นแดง 3" จะตั้งรายการให้เอง';
  }

  const v = await stockValue(db);
  const neg = rows.filter((r) => r.qty < 0);
  return [
    `📦 สต๊อก ${rows.length} รายการ`,
    '',
    ...rows.map((r) => `${r.qty < 0 ? '⚠️' : '•'} ${r.name} — ${r.qty} ${r.unit}`),
    '',
    v?.value ? `มูลค่าตามต้นทุน ${fmtBaht(v.value)} บาท` : null,
    v?.unpriced ? `(ยังไม่ได้ใส่ต้นทุน ${v.unpriced} รายการ จึงไม่ได้นับในมูลค่า)` : null,
    neg.length ? `\n⚠️ ติดลบ ${neg.length} รายการ — รับเข้าย้อนหลังหรือปรับยอดได้ครับ` : null,
  ].filter((x) => x !== null).join('\n');
}

/**
 * ตั้งต้นทุน/ราคาขาย โดยไม่แตะจำนวน — ใช้ตอนลืมใส่ต้นทุนตอนรับเข้า
 * ไม่ต้องยืนยัน เพราะไม่กระทบยอดคงเหลือ และพิมพ์ใหม่ทับได้ทันทีถ้าใส่ผิด
 * ไม่สร้างสินค้าใหม่ให้โดยตั้งใจ พิมพ์ชื่อผิดจะได้ไม่เกิดรายการผีที่ไม่มีของจริง
 */
async function doSetPrice(env, cmd) {
  const db = env.DB;
  const st = cmd.stock || {};
  if (!st.name) return 'ระบุชื่อโบว์ด้วยครับ เช่น "ต้นทุน โบว์แบบที่1 45"';
  if (st.unit_cost == null && st.price == null) {
    return `จะตั้งต้นทุนหรือราคาขายเท่าไรครับ\nเช่น "ต้นทุน ${st.name} 45" หรือ "${st.name} ทุน 45 ขาย 99"`;
  }

  const p = await findProduct(db, st.name);
  if (!p) {
    return `ไม่มี "${st.name}" ในสต๊อกครับ\n`
      + `ตั้งราคาได้เฉพาะของที่มีรายการแล้ว — ถ้าเป็นของใหม่ใช้ "รับเข้า ${st.name} 1" ก่อน`;
  }

  const cost = st.unit_cost != null ? toSatang(st.unit_cost) : null;
  const price = st.price != null ? toSatang(st.price) : null;
  // ส่ง null ไปช่องไหน ช่องนั้นเก็บค่าเดิมไว้ (COALESCE ใน upsertProduct)
  const after = await upsertProduct(db, { name: p.name, cost, price });

  const changed = [
    cost != null ? `ต้นทุน ${p.cost != null ? fmtBaht(p.cost) + ' → ' : ''}${fmtBaht(after.cost)}` : null,
    price != null ? `ราคาขาย ${p.price != null ? fmtBaht(p.price) + ' → ' : ''}${fmtBaht(after.price)}` : null,
  ].filter(Boolean);

  const s = await stockOf(db, p.id);
  const margin = after.cost != null && after.price != null ? after.price - after.cost : null;

  return `🏷 ${after.name}\n` + changed.map((x) => '• ' + x).join('\n')
    + (margin != null ? `\nกำไรต่อ${after.unit} ${fmtBaht(margin)} บาท` : '')
    + `\n\nคงเหลือ ${s.qty} ${after.unit} (ไม่เปลี่ยน)`
    + (after.cost != null && s.qty > 0 ? `\nมูลค่าสต๊อกตัวนี้ ${fmtBaht(s.qty * after.cost)} บาท` : '');
}

/** ปรับยอดต้องยืนยัน เพราะเป็นการทับยอดเดิม และกันกรณี AI อ่านจำนวนไม่ออกแล้วได้ 0 */
async function doCountStock(env, uid, cmd) {
  const db = env.DB;
  const st = cmd.stock || {};
  if (!st.name) return 'ระบุชื่อโบว์ด้วยครับ เช่น "ปรับสต๊อก โบว์แดง = 12"';

  const p = await findProduct(db, st.name);
  if (!p) {
    return `ไม่มี "${st.name}" ในสต๊อกครับ\n`
      + `ถ้าเป็นของใหม่ ใช้ "รับเข้า ${st.name} ${st.qty || 1}" แทน`;
  }
  const cur = await stockOf(db, p.id);
  if (cur.qty === st.qty) return `${p.name} มี ${cur.qty} ${p.unit} ตรงกับที่นับได้อยู่แล้ว ไม่ต้องปรับครับ`;

  await savePending(db, uid, { kind: 'count', product_id: p.id, qty: st.qty, note: st.note ?? null });
  const delta = st.qty - cur.qty;
  return `จะตั้งยอด ${p.name} เป็น ${st.qty} ${p.unit}\n`
    + `ระบบมีอยู่ ${cur.qty} ${p.unit} จะลงส่วนต่าง ${delta > 0 ? '+' : ''}${delta}\n\n`
    + 'ยอดเดิมไม่ได้ถูกลบ ลงเป็นแถว "ปรับยอด" ในสมุดเดินของ\nพิมพ์ "ยืนยัน" เพื่อปรับยอด';
}

/**
 * ตัดสต๊อกตอนส่งของ — อ่านรายการจากบิลของงานนั้น จับคู่ชื่อกับสินค้าในสต๊อก
 * จับคู่ไม่ได้จะบอกว่าตัวไหนไม่ได้ตัด ไม่เดาและไม่ตัดมั่ว
 */
async function doShipJob(env, uid, cmd) {
  const db = env.DB;
  const ref = cmd.job?.ref || cmd.query || cmd.doc_no;
  if (!ref) return 'ระบุเลขงานด้วยครับ เช่น "ส่งของงาน 7"';

  const r = await resolveJob(db, ref);
  if (r.error) return r.error;
  const job = r.job;

  const done = await stockMovesOfJob(db, job.id);
  if (done.length) {
    return `งาน #${job.id} ${job.title} ตัดสต๊อกไปแล้ว ${done.length} รายการ `
      + `(${thaiDate(String(done[0].at).slice(0, 10))})\n\n`
      + 'ส่งของเพิ่มอีกรอบให้ปรับยอดแทน เช่น "ปรับสต๊อก โบว์แดง = 10"';
  }

  if (!job.doc_no) {
    return `งาน #${job.id} ไม่ได้ผูกกับเอกสาร จึงไม่รู้ว่าส่งอะไรไปเท่าไรครับ\n\n`
      + 'ตัดสต๊อกเองได้ด้วย "ปรับสต๊อก <ชื่อโบว์> = <จำนวนที่เหลือ>"';
  }
  const doc = await docByNo(db, job.doc_no);
  if (!doc) return `ไม่พบเอกสาร ${job.doc_no} ที่งาน #${job.id} อ้างอยู่`;

  const items = JSON.parse(doc.items);
  const products = await productsByKeys(db, [...new Set(items.map((i) => productKey(i.name)))]);
  const byKey = new Map(products.map((p) => [p.name_key, p]));

  const lines = [];
  const unmatched = [];
  for (const i of items) {
    const p = byKey.get(productKey(i.name));
    if (p) lines.push({ product_id: p.id, name: p.name, unit: p.unit, qty: Math.max(1, Math.round(i.qty)) });
    else unmatched.push(`${i.name} × ${i.qty}`);
  }

  const notCut = unmatched.length
    ? '\n\nไม่มีในสต๊อก จึงไม่ตัด:\n' + unmatched.map((x) => '• ' + x).join('\n')
    : '';

  if (!lines.length) {
    return `รายการในบิล ${doc.doc_no} ยังไม่มีในสต๊อกเลยครับ\n\n`
      + unmatched.map((x) => '• ' + x).join('\n')
      + `\n\nรับเข้าก่อนค่อยส่งของ เช่น "รับเข้า ${items[0].name} ${Math.round(items[0].qty)}"`;
  }

  // ยอดคงเหลือตอนนี้ เอาไว้เตือนว่าตัดแล้วจะติดลบ
  const withHave = [];
  for (const l of lines) withHave.push({ ...l, have: (await stockOf(db, l.product_id)).qty });
  const neg = withHave.filter((l) => l.have - l.qty < 0);

  if (neg.length && !STOCK_ALLOW_NEGATIVE) {
    return 'สต๊อกไม่พอครับ\n' + neg.map((l) => `• ${l.name} ต้องใช้ ${l.qty} มี ${l.have}`).join('\n');
  }

  await savePending(db, uid, {
    kind: 'ship', job_id: job.id, doc_no: doc.doc_no, lines: withHave, unmatched,
  });

  return `จะตัดสต๊อกของงาน #${job.id} ${job.title}\nตามบิล ${doc.doc_no}\n\n`
    + withHave.map((l) => `• ${l.name} −${l.qty} (${l.have} → ${l.have - l.qty})`).join('\n')
    + notCut
    + (neg.length ? `\n\n⚠️ ${neg.length} รายการจะติดลบ — ของเข้ายังไม่ได้ลงหรือเปล่าครับ` : '')
    + '\n\nพิมพ์ "ยืนยัน" เพื่อตัดสต๊อก';
}

// ---------- รายจ่าย ----------

async function doAddExpense(env, cmd) {
  const db = env.DB;
  const e = cmd.expense || {};
  if (!e.amount || e.amount <= 0) return 'ยอดเท่าไรครับ เช่น "ค่าวัสดุ 450 ซื้อริบบิ้น"';

  // หมวดที่อ่านไม่เข้าข้อไหนเข้า "อื่นๆ" ไม่ทิ้งรายการ แล้วบอกให้รู้ว่าเข้าหมวดไหนไป
  const category = EXPENSE_CATEGORIES.includes(e.category) ? e.category : 'อื่นๆ';
  const spent_date = isValidYmd(e.spent_date) ? e.spent_date : todayBkk();

  let job = null;
  if (cmd.job?.ref) {
    const r = await resolveJob(db, cmd.job.ref);
    if (r.error) return r.error;
    job = r.job;
  }

  const amount = toSatang(e.amount);
  const row = await addExpense(db, {
    spent_date, category, amount,
    note: e.note ?? null,
    job_id: job?.id ?? null,
    seller: cmd.seller ? getSeller(cmd.seller).key : null,
  });

  return `💸 บันทึก${category} ${fmtBaht(amount)} บาท\n`
    + `${thaiDate(spent_date, true)}${e.note ? ' · ' + e.note : ''}\n`
    + (job ? `งาน #${job.id} ${job.title}\n` : '')
    + `ในนาม ${getSeller(row.seller).label} · รายการที่ ${row.id}\n`
    + `(ลงผิดแก้ได้ — "แก้รายจ่าย ${row.id} ค่าส่ง 80" หรือ "ยกเลิกรายจ่าย ${row.id}")`;
}

/**
 * เลขรายการที่จะแก้/ยกเลิก — AI ใส่มาที่ expense.id
 * เผื่อมาทาง query ด้วย เพราะ "ยกเลิกรายจ่าย 12" บางทีถูกอ่านเป็นคำค้น
 */
function expenseRef(cmd) {
  const n = Number(cmd.expense?.id || 0);
  if (n > 0) return Math.round(n);
  const m = String(cmd.query ?? '').match(/[0-9]+/);
  return m ? Number(m[0]) : 0;
}

/** บรรทัดเดียวที่บอกว่ารายการนี้คืออะไร ใช้ทั้งตอนถามยืนยันและตอนตอบผลลัพธ์ */
const expenseLine = (r) => `${r.category} ${fmtBaht(r.amount)} บาท · ${thaiDate(r.spent_date, true)}`
  + (r.note ? ` · ${r.note}` : '')
  + (r.job_id ? ` · งาน #${r.job_id}` : '');

/** ยกเลิกรายจ่ายที่ลงผิด — ไม่ลบแถว เหมือนยกเลิกเอกสาร (doVoidDoc) */
async function doVoidExpense(env, uid, cmd) {
  const db = env.DB;
  const id = expenseRef(cmd);
  if (!id) {
    return 'ระบุเลขรายการที่จะยกเลิกด้วยครับ เช่น "ยกเลิกรายจ่าย 12"\n'
      + '(เลขรายการอยู่ท้ายข้อความตอนบันทึก)';
  }

  const row = await expenseById(db, id);
  if (!row) return `ไม่พบรายจ่ายรายการที่ ${id}`;
  if (row.status === 'void') {
    return `รายการที่ ${id} ถูกยกเลิกไปแล้ว${row.void_reason ? ` (${row.void_reason})` : ''}\n${expenseLine(row)}`
      + (row.replaced_by ? `\nยอดที่ใช้แทนคือรายการที่ ${row.replaced_by}` : '');
  }

  await savePending(db, uid, { kind: 'void_expense', id, reason: cmd.expense?.note ?? cmd.note ?? null });
  return `จะยกเลิกรายจ่ายรายการที่ ${id}\n${expenseLine(row)}\n`
    + `ในนาม ${getSeller(row.seller).label}\n\n`
    + 'ยอดนี้จะหายจากสรุปเดือนนั้น แต่แถวยังอยู่ให้ย้อนดูได้\n'
    + 'พิมพ์ "ยืนยัน" เพื่อยกเลิกรายจ่าย';
}

/**
 * แก้รายจ่าย = ยกเลิกของเดิมแล้วลงใหม่ ไม่ UPDATE ทับ (ดู replaceExpense ใน db.js)
 * ช่องที่ผู้ใช้ไม่ได้พูดถึงใช้ค่าเดิม จะได้พิมพ์สั้นๆ ว่า "แก้รายจ่าย 12 ค่าส่ง 80" ได้
 */
async function doEditExpense(env, uid, cmd) {
  const db = env.DB;
  const id = expenseRef(cmd);
  if (!id) return 'ระบุเลขรายการที่จะแก้ด้วยครับ เช่น "แก้รายจ่าย 12 ค่าส่ง 80"';

  const row = await expenseById(db, id);
  if (!row) return `ไม่พบรายจ่ายรายการที่ ${id}`;
  if (row.status === 'void') {
    // ยกเลิกแล้วแก้ไม่ได้ ไม่งั้นจะมีแถวใหม่งอกจากแถวที่ไม่นับในยอดแล้ว ตามประวัติยาก
    return `รายการที่ ${id} ถูกยกเลิกไปแล้ว แก้ไม่ได้ครับ${row.replaced_by ? `\nแก้รายการที่ ${row.replaced_by} แทน` : ''}\n`
      + 'ถ้ายอดนี้ควรมีอยู่ ให้ลงใหม่เลย เช่น "ค่าส่ง 60 Kerry"';
  }

  const e = cmd.expense || {};
  let job_id = row.job_id;
  if (cmd.job?.ref) {
    const r = await resolveJob(db, cmd.job.ref);
    if (r.error) return r.error;
    job_id = r.job.id;
  }

  const next = {
    spent_date: isValidYmd(e.spent_date) ? e.spent_date : row.spent_date,
    category: EXPENSE_CATEGORIES.includes(e.category) ? e.category : row.category,
    amount: e.amount > 0 ? toSatang(e.amount) : row.amount,
    note: e.note ?? row.note,
    job_id,
    seller: cmd.seller ? getSeller(cmd.seller).key : row.seller,
  };

  // อ่านมาแล้วไม่มีอะไรเปลี่ยน อย่าเพิ่งยกเลิกแถวเดิมทิ้งเปล่าๆ
  const same = next.spent_date === row.spent_date && next.category === row.category
    && next.amount === row.amount && (next.note ?? null) === (row.note ?? null)
    && (next.job_id ?? null) === (row.job_id ?? null) && next.seller === row.seller;
  if (same) {
    return `รายการที่ ${id} ตรงกับที่พิมพ์มาอยู่แล้ว ไม่ต้องแก้ครับ\n${expenseLine(row)}\n\n`
      + `จะแก้อะไรบอกมาได้เลย เช่น "แก้รายจ่าย ${id} ค่าส่ง 80" หรือ "แก้รายจ่าย ${id} ค่าวัสดุ"`;
  }

  await savePending(db, uid, { kind: 'edit_expense', id, next });
  return `จะแก้รายจ่ายรายการที่ ${id}\n`
    + `เดิม: ${expenseLine(row)}\n`
    + `ใหม่: ${expenseLine(next)}\n`
    + (next.seller !== row.seller
      ? `ในนาม ${getSeller(row.seller).label} → ${getSeller(next.seller).label}\n`
      : '')
    + '\nระบบจะยกเลิกรายการเดิมแล้วลงใหม่ให้ (แถวเดิมยังอยู่ให้ย้อนดูได้)\n'
    + 'พิมพ์ "ยืนยัน" เพื่อแก้';
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

  if (p.kind === 'void_expense') {
    const row = await expenseById(db, p.id);
    if (!(await voidExpense(db, p.id, p.reason))) return `รายการที่ ${p.id} ถูกยกเลิกไปก่อนหน้านี้แล้ว`;
    return `🚫 ยกเลิกรายจ่ายรายการที่ ${p.id} แล้ว\n${expenseLine(row)}\n`
      + 'ยอดนี้ไม่นับในสรุปเดือนนั้นแล้ว แต่ยังเห็นในหน้ารายจ่ายว่าเคยลงไว้';
  }

  if (p.kind === 'edit_expense') {
    const { ok, row } = await replaceExpense(db, p.id, p.next, 'แก้ไข');
    if (!ok) {
      return `รายการที่ ${p.id} ถูกยกเลิกไปก่อนหน้านี้แล้ว แก้ไม่ได้\nลงใหม่ได้เลยครับ`;
    }
    return `✏️ แก้รายจ่ายแล้ว — ยกเลิกรายการที่ ${p.id} ลงใหม่เป็นรายการที่ ${row.id}\n`
      + `${expenseLine(row)}\nในนาม ${getSeller(row.seller).label}`;
  }

  if (p.kind === 'need_vat') return 'ยังไม่ได้ตอบเรื่อง VAT ครับ — ' + askVat(TYPES[p.base.type].tax);

  if (p.kind === 'ship') {
    const after = [];
    for (const l of p.lines) {
      const s = await addStockMove(db, {
        product_id: l.product_id, delta: -l.qty, reason: 'ส่งของ',
        job_id: p.job_id, doc_no: p.doc_no,
      });
      after.push({ ...l, left: s.qty });
    }
    await addJobEvent(db, p.job_id, `ส่งของ ตัดสต๊อก ${after.length} รายการ`);
    const neg = after.filter((l) => l.left < 0);
    return `🚚 ตัดสต๊อกงาน #${p.job_id} แล้ว\n\n`
      + after.map((l) => `• ${l.name} −${l.qty} เหลือ ${l.left} ${l.unit}`).join('\n')
      + (neg.length ? `\n\n⚠️ ติดลบ ${neg.length} รายการ — รับเข้าย้อนหลังได้ครับ` : '')
      + `\n\nงานนี้เสร็จแล้วพิมพ์ปิดได้เลย — "งาน ${p.job_id} เสร็จแล้ว"`;
  }

  if (p.kind === 'count') {
    // อ่านยอดใหม่ตอนยืนยัน ไม่ใช้ยอดตอนขอ เพราะอาจมีรายการเข้ามาระหว่างนั้น
    const before = await stockOf(db, p.product_id);
    if (before.qty === p.qty) return `${before.name} มี ${before.qty} ${before.unit} ตรงอยู่แล้ว ไม่ต้องปรับครับ`;
    const s = await addStockMove(db, {
      product_id: p.product_id, delta: p.qty - before.qty, reason: 'ปรับยอด',
      note: p.note ?? `นับได้ ${p.qty} จากที่ระบบมี ${before.qty}`,
    });
    return `📦 ปรับยอด ${s.name} เป็น ${s.qty} ${s.unit} แล้ว\n(จากเดิม ${before.qty})`;
  }

  if (p.kind === 'doc') {
    const row = await issueDocument(db, p.doc);
    const base = env.BASE_URL || '';
    return `✅ ออก${TYPES[row.type].th} เลขที่ ${row.doc_no} แล้ว\n`
      + `${JSON.parse(row.customer).name} · ${fmtBaht(row.total)} บาท\n\n${base}/d/${row.token}`;
  }

  return 'ไม่มีรายการที่รอยืนยัน';
}

// ---------- ทางเข้าหลัก ----------

/**
 * คืนข้อความที่จะตอบ หรือ null ถ้าไม่ต้องตอบ (คนอื่นที่ไม่ได้รับอนุญาต)
 * ctx มีเฉพาะตอนมาจาก webhook จริง — คำสั่งที่ใช้เวลานานกว่า reply token จะหมดอายุ
 * ต้องใช้ ctx.waitUntil ทำงานต่อเบื้องหลังแล้ว push ตามไป
 */
export async function handleText(env, uid, text, ctx = null) {
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
  if (/^(แก้|แก้ไข)\??$/.test(msg)) return EDIT_HELP;

  // คำตอบเรื่อง VAT — อ่านจากข้อความตรงๆ ไม่ต้องเสียเวลาเรียก AI
  // ใช้ได้ทั้งตอนที่ระบบถามอยู่ และตอนขอเปลี่ยน VAT ของร่างที่ประกอบไว้แล้ว
  const vatAnswer = readVatMode(msg);
  if (vatAnswer) {
    const p = await peekPending(db, uid);
    if (p?.kind === 'need_vat' || p?.kind === 'doc') {
      const base = p.kind === 'doc' ? draftToBase(p.doc) : p.base;
      if (TYPES[base.type].tax && vatAnswer === 'none') {
        return `${TYPES[base.type].th}ต้องมี VAT 7% ครับ — ตอบ "รวม vat" หรือ "ไม่รวม vat"`;
      }
      return saveDraftFrom(env, uid, base, vatAnswer, p.kind === 'doc' ? 'เปลี่ยน VAT' : null);
    }
  }

  // ตอบสถานะลูกค้ามุ่งหวัง ("สนใจ 12", "ไม่สนใจ 12 ร้านเล็กไป") — อ่านตรงๆ ไม่ต้องเรียก AI
  const leadAnswer = await doLeadStatus(env, msg);
  if (leadAnswer) return leadAnswer;
  if (/^(มุ่งหวัง|ลูกค้ามุ่งหวัง|ลูกค้าใหม่)$/.test(msg)) return doListLeads(env);
  if (/^(หาลูกค้า|หาลูกค้าเลย|หาเลย)$/.test(msg)) {
    if (!ctx) return 'คำสั่งนี้สั่งได้จากไลน์เท่านั้นครับ';
    ctx.waitUntil(huntAndPush(env, uid));
    return 'กำลังค้นให้ครับ ใช้เวลาประมาณ 1-3 นาที เจอแล้วจะส่งการ์ดมาให้';
  }

  // ขอแก้วันที่ของร่างที่รออยู่ — อ่านจากข้อความตรงๆ ไม่ต้องเรียก AI เหมือนกัน
  if (/^(วันที่|ลงวันที่|แก้วันที่|เปลี่ยนวันที่|ย้อนวันที่|ใช้วันที่)/.test(msg)) {
    const answer = await doSetIssueDate(env, uid, msg);
    if (answer) return answer;
  }

  // แก้ร่างที่รออยู่ทีละช่อง ("แก้ข้อ 2 ราคา 4500", "ลบข้อ 3", "แก้ที่อยู่ ...")
  // อ่านตรงๆ ไม่เรียก AI — ถ้าไม่มีร่างรออยู่หรืออ่านไม่ออกจะคืน null แล้วไหลไปทางปกติ
  const edited = await doEditDraft(env, uid, msg);
  if (edited) return edited;

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
    case 'receive_stock': return doReceiveStock(env, cmd);
    case 'list_stock':    return doListStock(env, cmd);
    case 'count_stock':   return doCountStock(env, uid, cmd);
    case 'set_price':     return doSetPrice(env, cmd);
    case 'ship_job':      return doShipJob(env, uid, cmd);
    case 'add_expense':   return doAddExpense(env, cmd);
    case 'void_expense':  return doVoidExpense(env, uid, cmd);
    case 'edit_expense':  return doEditExpense(env, uid, cmd);
    case 'job_from_doc':  return doJobFromDoc(env, cmd);
    case 'update_job':    return doUpdateJob(env, cmd);
    case 'list_jobs':     return jobListText(await openJobs(db), todayBkk(), `🛠 งานค้าง (${thaiDate(todayBkk(), true)})`);
    case 'search':        return doSearch(env, cmd);
    case 'month_summary': return doMonthSummary(env);
    case 'add_holiday':   return doAddHoliday(env, cmd);
    default:              return HELP;
  }
}

/** แจ้งเตือนเช้า 08:00 — วางแผนวันนี้: เลยกำหนด / ครบวันนี้ / ครบพรุ่งนี้ */
export async function morningDigest(env) {
  const today = todayBkk();
  const rows = await openJobs(env.DB, addDays(today, 1));
  if (!rows.length) return null;
  return '🔔 ' + jobListText(rows, today, `งานที่ต้องดู (${thaiDate(today, true)})`);
}

/**
 * ทวงตอนเย็น 17:00 — งานที่ยังไม่ปิดทั้งหมด ไม่ใช่เฉพาะที่ครบกำหนด
 * เพราะจุดประสงค์คือให้ปิดงานที่ทำเสร็จแล้ววันนี้ และเห็นงานที่กำลังจะถึงกำหนด
 * จะได้ตามทัน ไม่ใช่รอจนเลยกำหนดแล้วค่อยรู้
 */
export async function eveningDigest(env) {
  const today = todayBkk();
  const rows = await openJobs(env.DB);
  if (!rows.length) return null;

  const late = rows.filter((j) => j.due_date && j.due_date < today).length;
  const due = rows.filter((j) => j.due_date === today).length;
  const head = [
    `สรุปงานค้างเย็นนี้ (${thaiDate(today, true)})`,
    late ? `❗ เลยกำหนด ${late} งาน` : null,
    due ? `⏰ ครบกำหนดวันนี้ ${due} งาน` : null,
  ].filter(Boolean).join('\n');

  return '🌆 ' + jobListText(rows, today, head)
    + '\n\nงานไหนเสร็จแล้วพิมพ์ปิดได้เลย เช่น "งาน ' + rows[0].id + ' เสร็จแล้ว"';
}

