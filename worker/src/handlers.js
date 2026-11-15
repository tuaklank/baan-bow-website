// คำสั่งทั้งหมดที่รับจาก LINE — ฟังก์ชันนี้คืน "ข้อความที่จะตอบ" (null = ไม่ตอบ)
import {
  TYPES, SELLERS, JOB_STATUSES, JOB_DEFAULT_DUE_DAYS, WHT_ALLOWED_BP,
  STOCK_ALLOW_NEGATIVE, EXPENSE_CATEGORIES, getSeller, sellerCanIssue,
  splitIncome, roleOf, LEAD_STATUSES, LEAD_WORD_TO_STATUS, normalizeChannel,
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
  addOrder, addOrders, orderById, updateOrder, voidOrder, monthOrders, orderSheetToken,
  ordersByIds, updateOrdersBulk, voidOrderRows, maxOrderId, addOrderAt, saveOrderUndo, nextOrderUndo, markOrderUndo, orderUndoCounts,
} from './db.js';
import { readVatMode, parseTaxId } from './text.js';
import { readDraftEdit, draftToBase, isEditError, isNotAnEdit, looksLikeEdit, EDIT_HELP } from './draft.js';
import { huntLead } from './leads.js';
import { push } from './line.js';
import { summarizeOrders } from './order-sheet.js';
import {
  ORDER_HELP, ORDER_MAX_PER_COMMAND, readOrderIds, orderIdList,
  parseOrderEdit, parseOrderView, parseOrderVoid, filterOrders, orderViewTitle,
} from './order-text.js';
import {
  todayBkk, monthBkk, addDays, dayOfWeek, isValidYmd, readThaiDate,
  thaiDate, thaiDateNum, dayMonth, thaiMonth, fmtBaht,
} from './thai.js';

const QT_VALID_DAYS = 15;   // ใบเสนอราคายืนราคา 15 วันนับจากวันที่ออก

export const HELP = `คำสั่งที่ใช้ได้

📄 ออกเอกสาร
• ทำใบเสนอราคา คุณสมชาย 081-234-5678 ติดตั้งโบว์ 4 ชุด ชุดละ 2900 ส่วนลด 500 ไม่รวม vat
• ออกใบกำกับภาษีจาก QT181069001
• ยกเลิก RC181069003
• ...ลงวันที่ 15/10      (ไม่บอกวันที่ = ลงวันนี้ บอกมาก็ลงวันนั้น ย้อนหลังได้)

✏️ แก้ร่างก่อนยืนยัน (ไม่ต้องพิมพ์ใหม่ทั้งก้อน)
• แก้สายคาด เป็นราคา 5000   (เรียกด้วยชื่อสินค้า หรือ "แก้ข้อ 2 ราคา 5000" ก็ได้)
• แก้สายคาด จำนวน 3   /   ลบซิลความ   /   เพิ่มข้อ ค่าส่ง 350
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

📌 รายการโบว์ (สมุดจดว่าใครสั่งอะไร)
• สั่งโบว์ ML แดงทอง 10 ชิ้น mini 5 ชิ้น      (สั่งมาไว้ก่อน ชิ้นละแถว เติมเลขที่ว่างก่อน)
• รายการ 6 แบบ ML รายละเอียด แดงทอง ราคา 3000   (จดลงเลขที่ว่าง หรือเลขถัดไป)
• สั่งโบว์แบบที่ 2 คุณเอ ทางไลน์ ราคา 2900   (มีลูกค้าแล้วก็จดครบได้เลย)
• รายการ 24 ผู้สั่ง คุณเอ ช่องทาง Line ราคา 2900   (แก้ = รายการ + เลข + ชื่อช่อง + ค่าใหม่)
• รายการ 24 จ่ายแล้ว   /   รายการ 8-12 จ่ายแล้ว              (ลูกค้าจ่าย)
• รายการ 1-10 ค่าจ้าง 150   /   รายการ 1-10 จ่ายค่าจ้างแล้ว    (ค่าจ้างทำโบว์)
• ลบรายการ 24   /   ลบรายการ 9-23   (ยกเลิก ไม่ลบ ประวัติยังอยู่)
• ย้อนกลับ   /   เดินหน้า          (ย้อนคำสั่งรายการทีละคำสั่ง ย้อนเกินก็เดินหน้ากลับมาได้)
• ตารางรายการ                   (ลิงก์ตาราง A4 ของเดือนนี้ เปิดดูหรือบันทึก PDF ได้)
• วิธีสั่งรายการ                  (รูปแบบคำสั่งแก้ไขและเรียกดูทั้งหมด)

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
    `แก้ได้ทุกช่องโดยไม่ต้องพิมพ์ใหม่ เช่น "แก้${d.lines[0].name.split(' ')[0]} เป็นราคา 5000" / "ลบข้อ 1" / "วันที่ 15/10" — พิมพ์ "แก้" ดูทั้งหมด`,
  ];
  return parts.filter((x) => x !== null).join('\n');
}

/** ยาวที่สุดที่ยังจบในบรรทัดเดียวบนมือถือ เกินนี้ไลน์จะตัดขึ้นบรรทัดใหม่เอง */
const JOB_LINE_MAX = 42;
const JOB_STATUS_DEFAULT = 'รอดำเนินการ';

/** ตัดชื่องานให้จบในบรรทัดเดียว ตัดตรงช่องว่างถ้าพอมี จะได้ไม่ขาดกลางคำ */
function clipTitle(text, max) {
  const t = String(text ?? '').trim();
  if (t.length <= max) return t;
  if (max < 4) return t.slice(0, Math.max(1, max));
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut.trimEnd()) + '…';
}

/**
 * รายการงานค้าง งานละหนึ่งบรรทัด ด่วนก่อนตามลำดับที่ openJobs เรียงมาให้แล้ว
 * ไม่พิมพ์สถานะ "รอดำเนินการ" เพราะงานค้างเกือบทั้งหมดอยู่สถานะนั้น บอกไปก็กินที่เปล่า
 * วันที่ใช้แบบ 23/10 เพราะปีเดาได้จากบริบท และวันที่เลย/ครบวันนี้แทนด้วยอีโมจิแทนคำ
 */
export function jobListText(rows, today, heading) {
  if (!rows.length) return 'ไม่มีงานค้าง 🎉';
  const body = rows.map((r) => {
    const due = !r.due_date ? 'ไม่มีกำหนด'
      : r.due_date < today ? `❗${dayMonth(r.due_date)}`
      : r.due_date === today ? '⏰วันนี้'
      : dayMonth(r.due_date);
    const head = `📌 #${r.id} `;
    const tail = `${r.status && r.status !== JOB_STATUS_DEFAULT ? ` ·${r.status}` : ''} ${due}`;
    return head + clipTitle(r.title, JOB_LINE_MAX - head.length - tail.length) + tail;
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
 * มีร่างรออยู่ และข้อความนี้ดูยังไงก็ตั้งใจจะแก้ร่าง แต่เราแกะไม่ออก
 * ตอบวิธีแก้กลับไปเลย ไม่ส่งต่อให้ AI — ที่ผ่านมามันตอบเมนูช่วยเหลือกลับมา
 * ซึ่งเสียทั้งเงินและเวลาของเจ้าของร้านโดยไม่ได้อะไรเลย
 *
 * log ข้อความดิบไว้ด้วย (ดูด้วย wrangler tail) เพราะรูปประโยคที่คนพิมพ์จริง
 * มีมากกว่าที่เดาไว้เสมอ เห็นของจริงแล้วค่อยเติมเข้าไปทีละแบบ
 */
function missedEdit(msg) {
  if (!looksLikeEdit(msg)) return null;
  console.log('edit miss ' + JSON.stringify(msg));
  return `ยังอ่านคำสั่งนี้ไม่ออกครับ — ร่างเดิมยังอยู่ ไม่ได้ถูกแก้\n\n${EDIT_HELP}`;
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
  if (!edit) return missedEdit(msg);

  // คัดลอกก่อนแก้ ถ้าแก้ไม่สำเร็จกลางทางร่างเดิมในฐานข้อมูลจะไม่ถูกแตะเลย
  const base = p.kind === 'doc' ? draftToBase(p.doc) : JSON.parse(JSON.stringify(p.base));
  let headline;
  try {
    headline = edit.apply(base);
  } catch (e) {
    // อ้างชื่อรายการที่ไม่มีในร่าง = ไม่ใช่คำสั่งแก้ร่าง ปล่อยไปทางปกติ (เช่น "แก้รายจ่าย 12 ...")
    if (isNotAnEdit(e)) return missedEdit(msg);
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

// ---------- รายการโบว์ ----------

/** ลิงก์หน้าตารางรายการของเดือนนั้น — หน้าเดียวกับที่เปิดดูหรือบันทึกเป็น PDF */
const orderSheetUrl = async (env, ym) => `${env.BASE_URL || ''}/d/${await orderSheetToken(env.DB, ym)}`;

const orderPrice = (o) => (o.price != null ? fmtBaht(o.price) + ' บาท' : '-');

/** รายการหนึ่งใบแบบอ่านทีละช่อง ใช้ตอนตอบหลังจด/แก้/ถามยืนยันลบ */
const orderCard = (o) => [
  `แบบ: ${o.style}`,
  `รายละเอียด: ${o.detail ?? '-'}`,
  `ช่องทาง: ${o.channel ?? '-'}`,
  `ผู้สั่ง: ${o.customer ?? '-'}`,
  `ราคา: ${orderPrice(o)}`,
  `จ่ายแล้ว: ${o.paid_at ? '✓' : '-'}`,
  `ค่าจ้างทำ: ${o.wage != null ? fmtBaht(o.wage) + ' บาท' : '-'}${o.wage_paid_at ? ' (จ่ายแล้ว ✓)' : ''}`,
].join('\n');

/** "paid" / "จ่ายแล้ว" / "โอนแล้ว" -> true, "unpaid" / "ยังไม่จ่าย" -> false, ไม่พูดถึง -> null */
function readPaid(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/unpaid|ยังไม่|ไม่ได้จ่าย|ค้าง/.test(t)) return false;
  if (/paid|จ่าย|โอน|ชำระ/.test(t)) return true;
  return null;
}

/**
 * เลขรายการที่จะแก้/ลบ — AI ใส่มาที่ order.id
 * เผื่อมาทาง job.ref หรือ query ด้วย เพราะ "รายการ 24 ..." บางทีถูกอ่านเป็นเลขงานหรือคำค้น
 */
function orderRef(cmd) {
  const n = Number(cmd.order?.id || 0);
  if (n > 0) return Math.round(n);
  const m = String(cmd.job?.ref ?? cmd.query ?? '').match(/[0-9]+/);
  return m ? Number(m[0]) : 0;
}

export async function doAddOrder(env, cmd, uid = null) {
  const db = env.DB;
  const o = cmd.order || {};
  const order_date = isValidYmd(o.order_date) ? o.order_date : todayBkk();
  const sharedPrice = o.price > 0 ? toSatang(o.price) : null;

  // สั่งหลายแบบในข้อความเดียวมาทาง items (แบบละบรรทัด) สั่งแบบเดียวมาทาง order.style
  const lines = (cmd.items?.length
    ? cmd.items.map((i) => ({
      style: i.name, detail: i.note ?? o.detail ?? null, qty: Math.round(i.qty) || 1,
      price: i.unit_price > 0 ? toSatang(i.unit_price) : sharedPrice,
    }))
    : o.style ? [{ style: o.style, detail: o.detail ?? null, qty: o.qty > 0 ? o.qty : 1, price: sharedPrice }] : []
  ).filter((l) => l.style && l.qty > 0);

  // แบบโบว์เป็นช่องเดียวที่บังคับ ช่องอื่นเว้นไว้เติมทีหลังได้ — สั่งของมาไว้ก่อนยังไม่มีลูกค้าก็จดได้เลย
  if (!lines.length) return 'โบว์แบบไหนครับ เช่น "สั่งโบว์ ML แดงทอง 10 ชิ้น" หรือ "สั่งโบว์แบบที่ 2 คุณเอ ทางไลน์ ราคา 2900"';

  const pieces = lines.reduce((a, l) => a + l.qty, 0);
  if (pieces > ORDER_MAX_PER_COMMAND) {
    return `รวม ${pieces} ชิ้น เกินที่จดได้ต่อครั้ง (${ORDER_MAX_PER_COMMAND} ชิ้น) — พิมพ์เลขเกินหรือเปล่าครับ\nถ้าตั้งใจ ให้แบ่งจดเป็นหลายข้อความ`;
  }

  const shared = {
    order_date,
    wage: o.wage > 0 ? toSatang(o.wage) : null,
    channel: normalizeChannel(o.channel),
    // ชื่อคนสั่งบางทีถูกอ่านไปลงช่องลูกค้าของเอกสาร ให้หยิบมาใช้ได้
    customer: o.customer ?? cmd.customer?.name ?? null,
  };

  // เลขที่ถูกลบไปแล้วเอากลับมาใช้ก่อน เรียงจากเลขน้อย แล้วค่อยออกเลขใหม่ต่อท้าย
  // เจ้าของร้านมองเลขเป็นลำดับ 1 2 3 ในสมุด ลบข้อ 6 แล้วจดใหม่ต้องได้ข้อ 6 ไม่ใช่กระโดดไป 24
  // แถวเดิมที่ถูกลบไม่หายไปไหน — ประวัติของมันอยู่ใน bow_order_events และย้อนกลับได้
  const pool = await voidOrderRows(db, pieces);
  const before = [], created = [], all = [], done = [];
  for (const l of lines) {
    const fresh = { ...BLANK_ORDER, ...shared, style: l.style, detail: l.detail, price: l.price };
    const reuse = pool.splice(0, l.qty);
    const ids = reuse.map((r) => r.id);
    if (reuse.length) {
      await updateOrdersBulk(db, reuse.map((r) => ({
        id: r.id, changes: { ...fresh, status: 'recorded', void_reason: null, voided_at: null },
        text: `จดใหม่ทับเลขที่ลบไว้ — ของเดิม: ${r.style}${r.customer ? ' · ' + r.customer : ''}`,
      })), { anyStatus: true });
      before.push(...reuse);
    }
    if (l.qty > reuse.length) {
      const { first, last } = await addOrders(db, fresh, l.qty - reuse.length);
      for (let i = first; i <= last; i++) { ids.push(i); created.push(i); }
    }
    all.push(...ids);
    done.push(`${orderIdList(ids)} ${l.style}${l.detail ? ' ' + l.detail : ''} ×${l.qty}`
      + (l.price != null ? ` · ${fmtBaht(l.price)}` : ''));
  }
  await rememberOrderUndo(db, uid, `จดรายการ ${orderIdList(all)}${pieces > 1 ? ` (${pieces} ชิ้น)` : ''}`, { created, before });

  if (pieces > 1) {
    const firstId = Math.min(...all);
    return `📌 จดรายการ ${pieces} ชิ้น · ${thaiDateNum(order_date)}\n${done.join('\n')}\n\n`
      + (shared.customer ? '' : `ช่องทางกับผู้สั่งว่างไว้ก่อน มีคนสั่งแล้วเติมได้ เช่น "รายการ ${firstId} ผู้สั่ง คุณเอ ช่องทาง Line"\n`)
      + `ลูกค้าจ่ายแล้วพิมพ์ "รายการ ${firstId} จ่ายแล้ว"\n`
      + (shared.wage != null
        ? `ค่าจ้างทำชิ้นละ ${fmtBaht(shared.wage)} — จ่ายช่างแล้วพิมพ์ "รายการ ${firstId} จ่ายค่าจ้างแล้ว"\n`
        : `ใส่ค่าจ้างทำได้ เช่น "รายการ ${firstId} ค่าจ้าง 150"\n`)
      + (uid ? 'จดผิด พิมพ์ "ย้อนกลับ" ได้เลย\n' : '')
      + `ตาราง: ${await orderSheetUrl(env, order_date.slice(0, 7))}`;
  }

  const row = await orderById(db, all[0]);
  const missing = [
    row.channel ? null : 'ช่องทาง', row.detail ? null : 'รายละเอียด',
    row.customer ? null : 'ผู้สั่ง', row.price != null ? null : 'ราคา',
  ].filter(Boolean);

  return `📌 จดรายการ #${row.id} · ${thaiDateNum(row.order_date)}\n${orderCard(row)}\n\n`
    + (missing.length
      ? `ยังไม่มี: ${missing.join(', ')} — เติมได้ เช่น "รายการ ${row.id} รายละเอียด แดงทอง"\n`
      : `แก้ได้ เช่น "รายการ ${row.id} ราคา 3200"\n`)
    + `ตาราง: ${await orderSheetUrl(env, row.order_date.slice(0, 7))}`;
}

/** ช่องข้อมูลของแถวเปล่า — จดทับเลขที่ลบไว้ต้องล้างของเดิมทุกช่อง ไม่ให้ชื่อลูกค้าเก่าหรือติ๊กจ่ายเก่าค้างมา */
const BLANK_ORDER = {
  channel: null, detail: null, customer: null, price: null, paid_at: null, wage: null, wage_paid_at: null,
};

const ORDER_LABEL = {
  style: 'แบบ', channel: 'ช่องทาง', detail: 'รายละเอียด', customer: 'ผู้สั่ง', price: 'ราคา', order_date: 'วันที่',
  paid_at: 'จ่ายแล้ว', wage: 'ค่าจ้างทำ', wage_paid_at: 'จ่ายค่าจ้างแล้ว',
};
const orderShow = (k, v) => (v == null ? '-'
  : k === 'price' || k === 'wage' ? fmtBaht(v)
    : k === 'order_date' ? thaiDateNum(v)
      : k === 'paid_at' || k === 'wage_paid_at' ? '✓' : v);

/**
 * คำสั่งที่ทำกับหลายรายการพร้อมกัน อ่านจากข้อความตรงๆ ไม่ผ่าน AI
 * เพราะพิมพ์บ่อยที่สุด รูปแบบตายตัว และ AI อ่านได้ทีละรายการเดียว
 *   รายการ 8 9 12 จ่ายแล้ว            ลูกค้าจ่ายค่าโบว์
 *   รายการ 1-10 ค่าจ้าง 150           ใส่ค่าจ้างทำชิ้นละ 150 (ต่อท้าย "จ่ายแล้ว" ได้)
 *   รายการ 1-10 จ่ายค่าจ้างแล้ว       จ่ายค่าจ้างให้ช่างแล้ว
 * "จ่ายแล้ว" เฉยๆ = ลูกค้าจ่าย; เรื่องค่าจ้างต้องมีคำว่า "ค่าจ้าง" เสมอ กันสองช่องปนกัน
 * คืน null ถ้าข้อความไม่ใช่รูปนี้ ให้ไหลไปทางปกติ
 */
export async function doMarkPaid(env, msg, uid = null) {
  const m = String(msg).match(/^(?:รายการ|ออเดอร์)\s*#?\s*([\d\s,#\-–]+?)\s*([^\d\s,#\-–].*?)(?:\s*(?:ครับ|ค่ะ|คะ))?$/u);
  if (!m) return null;
  // "ลูกค้าจ่ายแล้ว" = "จ่ายแล้ว" — พิมพ์ให้ชัดว่าใครจ่ายก็ได้
  const rest = m[2].trim().replace(/^ลูกค้า(?=จ่าย|โอน|ชำระ|ยังไม่)/u, '');

  const yes = '(?:จ่ายแล้ว|จ่ายเงินแล้ว|โอนแล้ว|ชำระแล้ว)';
  const no = '(?:ยังไม่จ่าย|ยังไม่ได้จ่าย|ยังไม่โอน)';
  let field, paid, wage = null;
  let w;
  if ((w = rest.match(new RegExp(`^ค่าจ้าง(?:ทำ)?(?:โบว์)?(?:ชิ้นละ)?\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:บาท|บ\\.?)?\\s*(${yes}|${no})?$`, 'u')))) {
    field = 'wage_paid_at';
    wage = toSatang(Number(w[1].replace(/,/g, '')));
    paid = w[2] ? readPaid(w[2]) : null;
  } else if (new RegExp(`^(?:จ่ายค่าจ้าง(?:ทำ)?(?:โบว์)?แล้ว|ค่าจ้าง(?:ทำ)?(?:โบว์)?\\s*${yes})$`, 'u').test(rest)) {
    [field, paid] = ['wage_paid_at', true];
  } else if (new RegExp(`^(?:ยังไม่(?:ได้)?จ่ายค่าจ้าง(?:ทำ)?(?:โบว์)?|ค่าจ้าง(?:ทำ)?(?:โบว์)?\\s*${no})$`, 'u').test(rest)) {
    [field, paid] = ['wage_paid_at', false];
  } else if (new RegExp(`^(?:${yes}|${no})$`, 'u').test(rest)) {
    [field, paid] = ['paid_at', readPaid(rest)];
  } else return null;
  const what = field === 'paid_at' ? 'จ่ายแล้ว' : 'จ่ายค่าจ้างแล้ว';

  const got = readOrderIds(m[1]);
  if (got.error) return got.error;
  if (!got.ids.length) return null;

  const today = todayBkk();
  const res = await applyOrderChanges(env.DB, uid, got.ids, (row) => {
    const want = {};
    if (wage != null) want.wage = wage;
    if (paid != null && Boolean(row[field]) !== paid) want[field] = paid ? today : null;
    return want;
  });

  const did = [
    wage != null ? `ใส่ค่าจ้างทำชิ้นละ ${fmtBaht(wage)}` : null,
    paid === true ? `ติ๊ก${what}` : paid === false ? `เอาติ๊ก${what}ออก` : null,
  ].filter(Boolean).join(' + ');
  return orderEditReply(res, `${paid === false ? '↩️' : '✅'} ${did} ${res.done.length} รายการ: ${orderIdList(res.done)}`);
}

/**
 * ลงการแก้กับหลายรายการ — wantOf(row) คืนค่าที่อยากให้เป็น แล้วที่นี่เทียบกับของเดิมเอง
 * แยกผลเป็น done (แก้แล้ว) / same (เป็นแบบนั้นอยู่แล้ว) / bad (ไม่พบหรือถูกลบ)
 * อ่านและเขียนรวมเป็นไม่กี่คำสั่งฐานข้อมูล ไม่วนทีละแถว (ดู updateOrdersBulk)
 */
async function applyOrderChanges(db, uid, ids, wantOf, { create = null } = {}) {
  const rows = new Map((await ordersByIds(db, ids)).map((r) => [r.id, r]));
  const done = [], same = [], bad = [], filled = [], needStyle = [], gap = [], items = [], before = [], created = [];
  let nextNew = create ? (await maxOrderId(db)) + 1 : 0;
  for (const id of [...ids].sort((a, b) => a - b)) {
    const row = rows.get(id);
    const isVoid = row?.status === 'void';

    // เลขที่ว่างอยู่ (ถูกลบไปแล้ว หรือเป็นเลขถัดไปที่ยังไม่เคยมี) — จดเป็นรายการใหม่ลงเลขนั้นเลย
    // เจ้าของร้านมองเลขเป็นลำดับในสมุด "รายการ 6 ..." คือเขียนลงบรรทัดที่ 6 ไม่ว่าบรรทัดนั้นจะเคยถูกลบหรือไม่
    if (!row || isVoid) {
      if (!create) { bad.push(id); continue; }
      const want = wantOf({ paid_at: null, wage_paid_at: null });
      if (!want.style) { needStyle.push(id); continue; }
      const fresh = { ...BLANK_ORDER, order_date: create.today, ...want };
      if (isVoid) {
        // ล้างของเดิมทุกช่อง ไม่ให้ข้อมูลของแถวที่ลบไปแล้วค้างมาปนกับของใหม่
        items.push({
          id, changes: { ...fresh, status: 'recorded', void_reason: null, voided_at: null },
          text: `จดใหม่ทับเลขที่ลบไว้ — ของเดิม: ${row.style}${row.customer ? ' · ' + row.customer : ''}`,
        });
        before.push(row);
      } else {
        // เลขใหม่ต้องต่อจากเลขสุดท้ายพอดี — พิมพ์ 60 แทน 6 จะได้ไม่เกิดช่องว่างกลางสมุด
        if (id !== nextNew) { gap.push(id); continue; }
        await addOrderAt(db, id, fresh);
        nextNew++;
        created.push(id);
      }
      filled.push(id);
      done.push(id);
      continue;
    }

    const want = wantOf(row);
    const changes = {};
    const notes = [];
    for (const k of Object.keys(want)) {
      if (want[k] === undefined || want[k] === row[k]) continue;
      changes[k] = want[k];
      notes.push(`${ORDER_LABEL[k]}: ${orderShow(k, row[k])} → ${orderShow(k, want[k])}`);
    }
    if (!notes.length) { same.push(id); continue; }
    items.push({ id, changes, text: notes.join(' | ') });
    before.push(row);
    done.push(id);
  }
  await updateOrdersBulk(db, items, { anyStatus: Boolean(create) });
  if (done.length) {
    await rememberOrderUndo(db, uid, `${filled.length ? 'จดรายการ' : 'แก้รายการ'} ${orderIdList(done)}`, { before, created });
  }
  return { done, same, bad, filled, needStyle, gap, nextNew };
}

/** จำสภาพก่อนคำสั่งนี้ไว้ให้ "ย้อนกลับ" — ไม่รู้ว่าใครสั่ง (เรียกจากเทสต์หรือทางอื่น) ก็ไม่จำ */
async function rememberOrderUndo(db, uid, label, payload) {
  if (uid) await saveOrderUndo(db, uid, label, payload);
}

/**
 * คำตอบหลังแก้ — สั้นๆ บรรทัดเดียวต่อเรื่อง ไม่แนบการ์ดทั้งใบและไม่แนบลิงก์ตาราง
 * เจ้าของร้านแก้ติดกันหลายข้อความ ได้ลิงก์เดิมกลับมาทุกครั้งมันรกแชต อยากดูตารางค่อยพิมพ์ "ตารางรายการ"
 */
const orderEditReply = (res, doneLine) => [
  res.done.length ? doneLine : null,
  res.same.length ? `เป็นแบบนั้นอยู่แล้ว: ${orderIdList(res.same)}` : null,
  res.bad.length ? `ไม่พบหรือถูกลบแล้ว: ${orderIdList(res.bad)}` : null,
].filter((x) => x !== null).join('\n');

/**
 * แก้รายการด้วยแพตเทิร์นตายตัว "รายการ 3 ผู้สั่ง คุณเอ ช่องทาง Line ราคา 2900"
 * อ่านตรงๆ ไม่เรียก AI (ดู order-text.js) — คืน null ถ้าไม่ใช่แพตเทิร์นนี้
 */
export async function doOrderFields(env, msg, uid = null) {
  const today = todayBkk();
  const cmd = parseOrderEdit(msg, today);
  if (!cmd) return null;
  if (cmd.error) return cmd.error;

  const res = await applyOrderChanges(env.DB, uid, cmd.ids, (row) => {
    const want = { ...cmd.set };
    if (cmd.paid != null && Boolean(row.paid_at) !== cmd.paid) want.paid_at = cmd.paid ? today : null;
    if (cmd.wagePaid != null && Boolean(row.wage_paid_at) !== cmd.wagePaid) want.wage_paid_at = cmd.wagePaid ? today : null;
    return want;
  }, { create: { today } });

  const what = [
    ...Object.keys(cmd.set).map((k) => `${ORDER_LABEL[k]} ${orderShow(k, cmd.set[k])}`),
    cmd.paid === true ? 'จ่ายแล้ว ✓' : cmd.paid === false ? 'เอาติ๊กจ่ายแล้วออก' : null,
    cmd.wagePaid === true ? 'จ่ายค่าจ้างแล้ว ✓' : cmd.wagePaid === false ? 'เอาติ๊กจ่ายค่าจ้างออก' : null,
  ].filter(Boolean).join(' · ');
  const n = res.done.length;
  // จดลงเลขที่ว่างกับแก้ของที่มีอยู่ ปนกันในคำสั่งเดียวได้ — บอกแยกให้เห็นว่าเลขไหนเป็นของใหม่
  const edited = res.done.filter((id) => !res.filled.includes(id));
  const head = [
    res.filled.length ? `📌 จดรายการ ${orderIdList(res.filled)} แล้ว` : null,
    edited.length ? `✅ แก้รายการ ${orderIdList(edited)} แล้ว` : null,
  ].filter(Boolean).join(' · ');
  const eg = res.needStyle[0] ?? res.gap[0];
  return [
    n ? `${head}${n > 1 ? ` (${n} ชิ้น)` : ''}\n${what}` : null,
    res.same.length ? `เป็นแบบนั้นอยู่แล้ว: ${orderIdList(res.same)}` : null,
    res.needStyle.length
      ? `รายการ ${orderIdList(res.needStyle)} ยังว่างอยู่ — จดใหม่ต้องบอกแบบโบว์ด้วย\nเช่น "รายการ ${eg} แบบ ML ราคา 3000"` : null,
    res.gap.length
      ? `ยังไม่มีรายการ ${orderIdList(res.gap)} — เลขถัดไปคือ ${res.nextNew}\nจดต่อท้ายพิมพ์ "รายการ ${res.nextNew} แบบ ML ราคา 3000"` : null,
  ].filter((x) => x !== null).join('\n');
}

/**
 * แก้/เติมรายการ — แก้ทับแถวเดิมทันทีไม่ต้องยืนยัน เพราะแก้กลับได้ด้วยคำสั่งเดียวกัน
 * และของเดิมถูกเก็บไว้ในประวัติ (bow_order_events) ทุกครั้ง
 * ช่องที่ผู้ใช้ไม่ได้พูดถึงคงค่าเดิม
 */
export async function doEditOrder(env, cmd, uid = null) {
  const db = env.DB;
  const id = orderRef(cmd);
  if (!id) return 'ระบุเลขรายการด้วยครับ เช่น "รายการ 24 ราคา 3200"';

  const row = await orderById(db, id);
  if (!row) return `ไม่พบรายการ #${id}`;
  if (row.status === 'void') {
    return `รายการ #${id} ถูกยกเลิกไปแล้ว แก้ไม่ได้ครับ\nถ้ายังต้องใช้ ให้จดใหม่ เช่น "สั่งโบว์ ${row.style} ..."`;
  }

  const o = cmd.order || {};
  const want = {
    style: o.style ?? undefined,
    channel: normalizeChannel(o.channel) ?? undefined,
    detail: o.detail ?? undefined,
    customer: o.customer ?? undefined,
    price: o.price > 0 ? toSatang(o.price) : undefined,
    order_date: isValidYmd(o.order_date) ? o.order_date : undefined,
    wage: o.wage > 0 ? toSatang(o.wage) : undefined,
  };
  // จ่ายแล้วเก็บเป็นวันที่ที่แจ้ง ติ๊กซ้ำไม่เลื่อนวัน ส่วน "ยังไม่จ่าย" คือเอาติ๊กออก
  // ลูกค้าจ่ายค่าโบว์ (paid) กับร้านจ่ายค่าจ้างช่าง (wage_paid) เป็นสองช่องแยกกัน
  const paid = readPaid(o.paid);
  if (paid === true && !row.paid_at) want.paid_at = todayBkk();
  if (paid === false && row.paid_at) want.paid_at = null;
  const wagePaid = readPaid(o.wage_paid);
  if (wagePaid === true && !row.wage_paid_at) want.wage_paid_at = todayBkk();
  if (wagePaid === false && row.wage_paid_at) want.wage_paid_at = null;

  const changes = {};
  const diff = [];
  for (const k of Object.keys(want)) {
    if (want[k] === undefined || want[k] === row[k]) continue;
    changes[k] = want[k];
    diff.push(`${ORDER_LABEL[k]}: ${orderShow(k, row[k])} → ${orderShow(k, want[k])}`);
  }
  if (!diff.length) {
    return `รายการ #${id} ตรงกับที่พิมพ์มาอยู่แล้ว ไม่มีอะไรเปลี่ยนครับ\n`
      + 'ดูรูปแบบคำสั่งแก้ไข พิมพ์ "วิธีสั่งรายการ"';
  }

  const updated = await updateOrder(db, id, changes, diff.join(' | '));
  if (!updated) return `รายการ #${id} ถูกยกเลิกไปก่อนหน้านี้แล้ว แก้ไม่ได้ครับ`;
  await rememberOrderUndo(db, uid, `แก้รายการ #${id}`, { before: [row] });

  // ตอบเฉพาะช่องที่เปลี่ยน ไม่แนบการ์ดหรือลิงก์ — อยากดูทั้งใบพิมพ์ "รายการ N"
  return `✏️ แก้รายการ #${id} แล้ว\n${diff.join('\n')}`;
}

/** ลบรายการ = ยกเลิก ไม่ลบแถว และต้องยืนยันก่อน เพราะยกเลิกแล้วแก้กลับไม่ได้ */
export async function doVoidOrder(env, uid, cmd) {
  const db = env.DB;
  const id = orderRef(cmd);
  if (!id) return 'ระบุเลขรายการที่จะลบด้วยครับ เช่น "ลบรายการ 24"';

  const row = await orderById(db, id);
  if (!row) return `ไม่พบรายการ #${id}`;
  if (row.status === 'void') {
    return `รายการ #${id} ถูกยกเลิกไปแล้ว${row.void_reason ? ` (${row.void_reason})` : ''}`;
  }

  await savePending(db, uid, { kind: 'void_orders', ids: [id], reason: cmd.note ?? null });
  return `จะลบรายการ #${id} · ${thaiDateNum(row.order_date)}\n${orderCard(row)}\n\n`
    + 'รายการนี้จะหายจากตารางและยอดรวม แต่แถวยังเก็บไว้ให้ย้อนดูได้ในหน้าหลังบ้าน\n'
    + 'พิมพ์ "ยืนยัน" เพื่อลบ';
}

/**
 * ขอดูรายการ — ตอบสั้นๆ พร้อมลิงก์หน้าตาราง ไม่พิมพ์รายการเป็นข้อความยาว
 * เพราะห้าช่องต่อหนึ่งรายการอ่านในแชตไม่รู้เรื่อง ต้องเห็นเป็นตารางเหมือนในสมุด
 */
async function doListOrders(env, cmd) {
  const db = env.DB;
  const asked = cmd?.order?.order_date;
  const ym = isValidYmd(asked) ? asked.slice(0, 7) : monthBkk();
  const rows = await monthOrders(db, ym);
  if (!rows.length) {
    return `${thaiMonth(ym)} ยังไม่มีรายการครับ\nจดได้เลย เช่น "สั่งโบว์แบบที่ 2 คุณเอ ทางไลน์ ราคา 2900"`;
  }
  const s = summarizeOrders(rows);
  return `📋 รายการ ${thaiMonth(ym)}\n`
    + `${s.count} รายการ · มีผู้สั่งแล้ว ${s.count - s.free} · ยังว่าง ${s.free}`
    + (s.noPrice ? `\n(ยังไม่ใส่ราคา ${s.noPrice} รายการ)` : '')
    + `\n\n💰 ราคาขายรวม ${fmtBaht(s.price)}`
    + `\nลูกค้าจ่ายแล้ว ${fmtBaht(s.pricePaid)} (${s.paidCount} ชิ้น) · ยังไม่จ่าย ${fmtBaht(s.price - s.pricePaid)}`
    + `\n\n🧵 ค่าจ้างทำรวม ${fmtBaht(s.wage)}`
    + `\nจ่ายแล้ว ${fmtBaht(s.wagePaid)} (${s.wagePaidCount} ชิ้น) · ค้างจ่าย ${fmtBaht(s.wage - s.wagePaid)}`
    + `\n\nเปิดตาราง (พิมพ์หรือบันทึก PDF ได้จากในหน้า):\n${await orderSheetUrl(env, ym)}`;
}

const ORDER_LIST_MAX = 30;   // เกินนี้อ่านในแชตไม่ไหว ให้ไปดูในตาราง

/** รายการหนึ่งชิ้นในหนึ่งบรรทัด ใช้ตอนเรียกดูเป็นรายชิ้น */
const orderLine = (o, withWage) => `#${o.id} ${o.style}${o.detail ? ' ' + o.detail : ''}`
  + ` · ${o.customer ?? 'ว่าง'}${o.channel ? ' ' + o.channel : ''}`
  + ` · ${o.price != null ? fmtBaht(o.price) : '-'}${o.paid_at ? ' ✓' : ''}`
  + (withWage ? ` · จ้าง ${o.wage != null ? fmtBaht(o.wage) : '-'}${o.wage_paid_at ? ' ✓' : ''}` : '');

/**
 * เรียกดูรายการด้วยแพตเทิร์นตายตัว (ดู parseOrderView) — คืน null ถ้าไม่ใช่คำสั่งเรียกดู
 *   ตารางรายการ [เดือน 10]   ยอดสรุป + ลิงก์ตาราง A4
 *   รายการ 3                 ชิ้นเดียวทุกช่อง
 *   รายการ ว่าง / ยังไม่จ่าย / ค้างค่าจ้าง / แบบ ML / ผู้สั่ง คุณเอ / ช่องทาง Line
 */
export async function doViewOrders(env, msg) {
  const view = parseOrderView(msg, todayBkk());
  if (!view) return null;
  const db = env.DB;

  if (view.kind === 'sheet') return doListOrders(env, { order: { order_date: view.ym + '-01' } });

  if (view.kind === 'one') {
    const row = await orderById(db, view.id);
    if (!row) return `ไม่พบรายการ #${view.id}`;
    return `📌 รายการ #${row.id} · ${thaiDateNum(row.order_date)}`
      + (row.status === 'void' ? ' · ถูกลบแล้ว' : '') + `\n${orderCard(row)}`;
  }

  const title = `${orderViewTitle(view)} · ${thaiMonth(view.ym)}`;
  const rows = filterOrders(await monthOrders(db, view.ym), view);
  if (!rows.length) return `📋 ${title}\nไม่มีรายการครับ`;

  const withWage = String(view.flag ?? '').startsWith('wage');
  const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const more = rows.length - ORDER_LIST_MAX;
  return `📋 ${title} — ${rows.length} ชิ้น\n`
    + rows.slice(0, ORDER_LIST_MAX).map((r) => orderLine(r, withWage)).join('\n')
    + (more > 0 ? `\n…อีก ${more} ชิ้น ดูครบในตาราง พิมพ์ "ตารางรายการ"` : '')
    + `\n\nรวมราคา ${fmtBaht(sum('price'))}` + (withWage ? ` · ค่าจ้าง ${fmtBaht(sum('wage'))}` : '');
}

/**
 * ลบทีละหลายรายการ "ลบรายการ 9-23" / "ลบรายการ 2 5 8" — อ่านตรงๆ ไม่เรียก AI
 * ยังต้องยืนยันก่อนเหมือนลบทีละใบ คืน null ถ้าไม่ใช่คำสั่งลบ
 */
export async function doVoidOrders(env, uid, msg) {
  const cmd = parseOrderVoid(msg);
  if (!cmd) return null;
  if (cmd.error) return cmd.error;
  const db = env.DB;

  const rows = await ordersByIds(db, cmd.ids);
  const live = rows.filter((r) => r.status === 'recorded').sort((a, b) => a.id - b.id);
  const liveIds = new Set(live.map((r) => r.id));
  const skip = cmd.ids.filter((id) => !liveIds.has(id));
  if (!live.length) return `ไม่พบรายการที่ลบได้ครับ (${orderIdList(cmd.ids)} ไม่มีหรือถูกลบไปแล้ว)`;

  await savePending(db, uid, { kind: 'void_orders', ids: live.map((r) => r.id), reason: cmd.reason });

  // สรุปตามแบบ ให้เห็นว่ากำลังจะลบอะไรโดยไม่ต้องไล่อ่านทีละชิ้น
  const byStyle = new Map();
  for (const r of live) byStyle.set(r.style, [...(byStyle.get(r.style) ?? []), r.id]);
  const named = live.filter((r) => r.customer).length;
  return `จะลบ ${live.length} รายการ: ${orderIdList(live.map((r) => r.id))}\n`
    + [...byStyle].map(([style, ids]) => `• ${style} ×${ids.length} (${orderIdList(ids)})`).join('\n')
    + (named ? `\n⚠️ มีผู้สั่งแล้ว ${named} ชิ้น` : '')
    + (skip.length ? `\nข้าม ${orderIdList(skip)} (ไม่มีหรือถูกลบไปแล้ว)` : '')
    + '\n\nพิมพ์ "ยืนยัน" เพื่อลบ';
}

/**
 * ย้อนกลับคำสั่งรายการทีละคำสั่ง จากล่าสุดถอยไป — จดผิดก็ลบแถวที่จดมา, แก้ผิดก็คืนค่าเดิม, ลบผิดก็เอากลับมา
 * พิมพ์ซ้ำ = ถอยอีกหนึ่งคำสั่ง (เก็บไว้ ORDER_UNDO_DEPTH คำสั่ง) ถอยเกินพิมพ์ "เดินหน้า" กลับมาได้
 * ไม่ต้องยืนยัน เพราะคำสั่งนี้คือทางแก้ของการสั่งผิดอยู่แล้ว และย้อนเกินก็เดินหน้าคืนได้
 * แถวที่จดผิดถูก "ยกเลิก" ไม่ถูกลบจริง (หลักเดียวกับทั้งระบบ) เลขรายการจึงไม่ถูกนำกลับมาออกใหม่
 */
export async function doUndoOrder(env, uid) {
  const db = env.DB;
  const u = await nextOrderUndo(db, uid, 'undo');
  if (!u) {
    const { redo } = await orderUndoCounts(db, uid);
    return 'ไม่มีคำสั่งรายการให้ย้อนกลับแล้วครับ'
      + (redo ? `\nย้อนเกินไป พิมพ์ "เดินหน้า" ได้อีก ${redo} ครั้ง` : '');
  }

  // จำสภาพตอนนี้ของทุกแถวที่คำสั่งนั้นแตะไว้ก่อน — "เดินหน้า" จะคืนสภาพนี้
  const ids = [...(u.created ?? []), ...(u.before ?? []).map((r) => r.id)];
  const after = await ordersByIds(db, ids);

  const voided_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await updateOrdersBulk(db, [
    ...(u.created ?? []).map((id) => ({
      id, changes: { status: 'void', void_reason: 'ย้อนกลับ', voided_at }, text: 'ย้อนกลับ — ยกเลิกแถวที่จดมา',
    })),
    // คืนทั้งแถวตามที่เป็นก่อนคำสั่งนั้น รวมสถานะด้วย (ลบผิดก็กลับมา กู้ผิดก็กลับไปถูกลบ)
    ...(u.before ?? []).map((row) => ({ id: row.id, changes: row, text: 'ย้อนกลับ — คืนค่าเดิม' })),
  ], { anyStatus: true });
  await markOrderUndo(db, u.id, 'undone', { created: u.created, before: u.before, after });

  const next = await nextOrderUndo(db, uid, 'undo');
  return `↩️ ย้อนกลับแล้ว: ${u.label}`
    + (next ? `\nพิมพ์ "ย้อนกลับ" อีกครั้ง = ย้อน: ${next.label}` : '\nย้อนต่อไม่ได้แล้ว (ถึงคำสั่งแรกที่จำไว้)')
    + '\nย้อนเกิน พิมพ์ "เดินหน้า"';
}

/** เดินหน้า = ทำคำสั่งที่เพิ่งย้อนไปกลับมาเหมือนเดิม ทีละคำสั่ง เรียงจากตัวที่ถูกย้อนหลังสุดกลับไป */
export async function doRedoOrder(env, uid) {
  const db = env.DB;
  const u = await nextOrderUndo(db, uid, 'redo');
  if (!u) return 'ไม่มีอะไรให้เดินหน้าครับ\nเดินหน้าได้เฉพาะหลังพิมพ์ "ย้อนกลับ" และยังไม่ได้สั่งคำสั่งรายการใหม่';

  await updateOrdersBulk(db, (u.after ?? []).map((row) => ({ id: row.id, changes: row, text: 'เดินหน้า — ทำคำสั่งที่ย้อนไปอีกครั้ง' })),
    { anyStatus: true });
  await markOrderUndo(db, u.id, 'done');

  const { redo } = await orderUndoCounts(db, uid);
  return `↪️ เดินหน้าแล้ว: ${u.label}`
    + (redo ? `\nเดินหน้าได้อีก ${redo} ครั้ง` : '\nกลับมาถึงจุดล่าสุดแล้ว');
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

  if (p.kind === 'void_orders') {
    // อ่านใหม่ตอนยืนยัน — ระหว่างรออาจมีบางเลขถูกลบไปแล้ว
    const live = (await ordersByIds(db, p.ids)).filter((r) => r.status === 'recorded');
    if (!live.length) return 'รายการที่จะลบถูกยกเลิกไปก่อนหน้านี้แล้ว';
    const voided_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await updateOrdersBulk(db, live.map((r) => ({
      id: r.id, changes: { status: 'void', void_reason: p.reason ?? null, voided_at },
      text: 'ยกเลิก' + (p.reason ? ` — ${p.reason}` : ''),
    })), { anyStatus: true });
    const ids = live.map((r) => r.id);
    await rememberOrderUndo(db, uid, `ลบรายการ ${orderIdList(ids)}`, { before: live });
    const one = live.length === 1 ? ` (${live[0].style}${live[0].customer ? ' · ' + live[0].customer : ''})` : ` (${live.length} ชิ้น)`;
    return `🚫 ลบรายการ ${orderIdList(ids)} แล้ว${one}\n`
      + 'ไม่นับในตารางและยอดรวมแล้ว · ลบผิดพิมพ์ "ย้อนกลับ"';
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
  if (/^(แก้ไข|แก้|เปลี่ยน|ปรับ)\??$/.test(msg)) return EDIT_HELP;

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

  // รายการโบว์ — แพตเทิร์นตายตัวทั้งหมดอ่านตรงๆ ไม่เรียก AI (ดู order-text.js)
  // เรียงจากเรียกดู -> ติ๊กจ่าย -> แก้ช่อง; ที่ไม่เข้าแพตเทิร์นไหลไปให้ AI อ่านตามเดิม
  if (/^(วิธีสั่ง(?:รายการ|ออเดอร์|โบว์)|วิธีแก้(?:รายการ|ออเดอร์)|คู่มือ(?:รายการ|ออเดอร์)|คำสั่ง(?:รายการ|ออเดอร์)|ช่วย(?:รายการ|ออเดอร์)|(?:รายการ|ออเดอร์)\s*\?)$/.test(msg)) return ORDER_HELP;
  if (/^(ย้อนกลับ|ย้อน|undo|back)(\s*(ครับ|ค่ะ|คะ))?$/i.test(msg)) return doUndoOrder(env, uid);
  if (/^(เดินหน้า|ไปข้างหน้า|ทำซ้ำ|redo|forward)(\s*(ครับ|ค่ะ|คะ))?$/i.test(msg)) return doRedoOrder(env, uid);
  if (/รายการ|ออเดอร์/.test(msg)) {
    // ร่างเอกสารที่รอยืนยันก็เรียกบรรทัดของมันว่า "รายการที่ 2" — มีร่างค้างอยู่ให้ร่างได้อ่านก่อน
    if ((await peekPending(db, uid))?.kind === 'doc') {
      const draftEdit = await doEditDraft(env, uid, msg);
      if (draftEdit) return draftEdit;
    }
    const orderAnswer = (await doViewOrders(env, msg)) ?? (await doVoidOrders(env, uid, msg))
      ?? (await doMarkPaid(env, msg, uid)) ?? (await doOrderFields(env, msg, uid));
    if (orderAnswer) return orderAnswer;
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
    case 'add_order':     return doAddOrder(env, cmd, uid);
    case 'edit_order':    return doEditOrder(env, cmd, uid);
    case 'void_order':    return doVoidOrder(env, uid, cmd);
    case 'list_orders':   return doListOrders(env, cmd);
    case 'job_from_doc':  return doJobFromDoc(env, cmd);
    case 'update_job':    return doUpdateJob(env, cmd);
    case 'list_jobs':     return jobListText(await openJobs(db), todayBkk(), `งานค้าง ${thaiDateNum(todayBkk())}`);
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
  return jobListText(rows, today, `งานที่ต้องดู ${thaiDateNum(today)}`);
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

  // ไม่สรุปจำนวนงานเลยกำหนด/ครบวันนี้ไว้หัวข้ออีก เพราะทุกบรรทัดติด ❗/⏰ อยู่แล้ว เห็นเองได้
  return jobListText(rows, today, `สรุปงาน ${thaiDateNum(today)}`)
    + `\n\nเสร็จแล้วพิมพ์ "งาน ${rows[0].id} เสร็จแล้ว"`;
}

