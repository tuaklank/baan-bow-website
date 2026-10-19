// ตัวช่วยคุย D1 — รวม query ทั้งหมดไว้ที่นี่ ที่อื่นไม่ต้องเขียน SQL
import { JOB_OPEN_SQL, PENDING_TTL_MS } from './config.js';
import { formatDocNo, nextRunningNo, newToken } from './numbering.js';

// ---------- ลูกค้า ----------
/** ตัดช่องว่าง คำนำหน้า และตัวพิมพ์ใหญ่เล็ก เพื่อจับคู่ลูกค้าเดิมให้เจอ */
export function customerKey(name) {
  return String(name || '')
    .trim()
    .replace(/^(คุณ|นาย|นางสาว|นาง|น\.ส\.|บจก\.|หจก\.)\s*/u, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export const findCustomer = (db, name) =>
  db.prepare('SELECT * FROM customers WHERE name_key = ?').bind(customerKey(name)).first();

/**
 * บันทึกลูกค้า: ช่องที่ส่งมาใหม่เขียนทับของเดิม ช่องที่เป็น null เก็บของเดิมไว้
 * ออกบิลครั้งถัดไปพิมพ์แค่ชื่อ ที่อยู่/เลขภาษี/สาขา จะถูกดึงมาเอง
 */
export async function upsertCustomer(db, c) {
  const key = customerKey(c.name);
  await db.prepare(`
    INSERT INTO customers (name, name_key, address, tax_id, branch, contact, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name_key) DO UPDATE SET
      name       = excluded.name,
      address    = COALESCE(excluded.address, customers.address),
      tax_id     = COALESCE(excluded.tax_id,  customers.tax_id),
      branch     = COALESCE(excluded.branch,  customers.branch),
      contact    = COALESCE(excluded.contact, customers.contact),
      phone      = COALESCE(excluded.phone,   customers.phone),
      updated_at = datetime('now')
  `).bind(c.name, key, c.address ?? null, c.tax_id ?? null, c.branch ?? null, c.contact ?? null, c.phone ?? null).run();
  return db.prepare('SELECT * FROM customers WHERE name_key = ?').bind(key).first();
}

/** รวมข้อมูลลูกค้าที่พิมพ์มาใหม่กับที่เคยบันทึกไว้ — ที่พิมพ์มาใหม่ชนะ */
export function mergeCustomer(fresh, saved) {
  const pick = (a, b) => {
    const s = a == null ? '' : String(a).trim();
    return s !== '' ? s : (b ?? null);
  };
  return {
    name:    pick(fresh?.name, saved?.name),
    address: pick(fresh?.address, saved?.address),
    tax_id:  pick(fresh?.tax_id, saved?.tax_id),
    branch:  pick(fresh?.branch, saved?.branch),
    contact: pick(fresh?.contact, saved?.contact),
    phone:   pick(fresh?.phone, saved?.phone),
  };
}

// ---------- เอกสาร ----------
/** ออกเอกสารจริง: ออกเลขที่แบบ atomic แล้วเขียนลงตาราง (เรียกตอน "ยืนยัน" เท่านั้น) */
export async function issueDocument(db, d) {
  const customer = await upsertCustomer(db, d.customer);
  const n = await nextRunningNo(db, d.type);
  const doc_no = formatDocNo(d.type, d.issue_date, n);
  const token = newToken();

  await db.prepare(`
    INSERT INTO documents
      (type, doc_no, token, issue_date, valid_until, customer_id, customer, items,
       discount, vat_mode, subtotal, base, vat, wht_rate, wht, total, net_payable,
       note, payment_terms, ref_doc_no, seller)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    d.type, doc_no, token, d.issue_date, d.valid_until ?? null,
    customer.id, JSON.stringify(d.customer), JSON.stringify(d.lines),
    d.discount, d.vat_mode, d.subtotal, d.base, d.vat, d.wht_rate, d.wht, d.total, d.net_payable,
    d.note ?? null, d.payment_terms ?? null, d.ref_doc_no ?? null, d.seller,
  ).run();

  return db.prepare('SELECT * FROM documents WHERE doc_no = ?').bind(doc_no).first();
}

export const docByToken = (db, token) =>
  db.prepare('SELECT * FROM documents WHERE token = ?').bind(token).first();

export const docByNo = (db, docNo) =>
  db.prepare('SELECT * FROM documents WHERE doc_no = ?').bind(String(docNo).trim().toUpperCase()).first();

/** ยกเลิก: ไม่ลบแถว ไม่ปล่อยเลขที่คืน เลขเดิมใช้ซ้ำไม่ได้ตลอดไป */
export async function voidDocument(db, docNo, reason) {
  const res = await db.prepare(`
    UPDATE documents SET status = 'void', void_reason = ?, voided_at = datetime('now')
    WHERE doc_no = ? AND status = 'issued'
  `).bind(reason ?? null, String(docNo).trim().toUpperCase()).run();
  return res.meta.changes > 0;
}

/** ค้นหาด้วยเลขที่เอกสารหรือชื่อลูกค้า */
export async function searchDocs(db, q, limit = 20) {
  const term = String(q).trim();
  const { results } = await db.prepare(`
    SELECT * FROM documents
    WHERE doc_no LIKE ? OR json_extract(customer, '$.name') LIKE ?
    ORDER BY id DESC LIMIT ?
  `).bind('%' + term.toUpperCase() + '%', '%' + term + '%', limit).all();
  return results;
}

export async function recentDocs(db, limit = 50) {
  const { results } = await db.prepare('SELECT * FROM documents ORDER BY id DESC LIMIT ?').bind(limit).all();
  return results;
}

/**
 * สรุปยอดของเดือน (YYYY-MM) แยกตามบริษัทผู้ขายและประเภท — นับเฉพาะเอกสารที่ไม่ถูกยกเลิก
 * ต้องแยกตามบริษัท เพราะสองบริษัทเป็นคนละนิติบุคคล ยื่น VAT คนละชุด เอามารวมกันไม่ได้
 */
export async function monthSummary(db, ym) {
  const { results } = await db.prepare(`
    SELECT seller, type, COUNT(*) AS cnt, SUM(total) AS total, SUM(vat) AS vat, SUM(base) AS base
    FROM documents
    WHERE issue_date LIKE ? AND status = 'issued'
    GROUP BY seller, type
  `).bind(ym + '%').all();
  const voided = await db.prepare(
    "SELECT COUNT(*) AS cnt FROM documents WHERE issue_date LIKE ? AND status = 'void'",
  ).bind(ym + '%').first();
  return { month: ym, byType: results, voidCount: voided.cnt };
}

// ---------- งาน ----------
export async function createJob(db, { title, customer, customer_id, due_date, note, doc_no }) {
  const res = await db.prepare(
    'INSERT INTO jobs (title, customer, customer_id, due_date, note, doc_no) VALUES (?,?,?,?,?,?)',
  ).bind(title, customer ?? null, customer_id ?? null, due_date ?? null, note ?? null, doc_no ?? null).run();
  const id = res.meta.last_row_id;
  await db.prepare('INSERT INTO job_events (job_id, text) VALUES (?, ?)').bind(id, 'สร้างงาน').run();
  return db.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first();
}

export const jobById = (db, id) => db.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first();

/** งานที่เปิดจากเอกสารใบนี้ไปแล้ว — กันเปิดซ้ำจากใบเดิม */
export const jobByDocNo = (db, docNo) =>
  db.prepare('SELECT * FROM jobs WHERE doc_no = ? ORDER BY id DESC').bind(docNo).first();

export async function findJobs(db, q) {
  const like = '%' + String(q).trim() + '%';
  const { results } = await db.prepare(
    `SELECT * FROM jobs WHERE ${JOB_OPEN_SQL} AND (title LIKE ? OR customer LIKE ?) ORDER BY id DESC`,
  ).bind(like, like).all();
  return results;
}

export async function updateJob(db, id, { status, due_date, note }) {
  await db.prepare(`
    UPDATE jobs SET status = COALESCE(?, status), due_date = COALESCE(?, due_date),
                    note = COALESCE(?, note), updated_at = datetime('now')
    WHERE id = ?
  `).bind(status ?? null, due_date ?? null, note ?? null, id).run();
  return jobById(db, id);
}

export const addJobEvent = (db, id, text) =>
  db.prepare('INSERT INTO job_events (job_id, text) VALUES (?, ?)').bind(id, text).run();

/** งานที่ยังไม่ปิด; ใส่ upTo เพื่อเอาเฉพาะที่กำหนดส่งถึงวันนั้น (ใช้ตอนแจ้งเตือนเช้า) */
export async function openJobs(db, upTo = null) {
  const sql = `SELECT * FROM jobs WHERE ${JOB_OPEN_SQL}
    ${upTo ? 'AND due_date IS NOT NULL AND due_date <= ?' : ''}
    ORDER BY due_date IS NULL, due_date, id`;
  const stmt = upTo ? db.prepare(sql).bind(upTo) : db.prepare(sql);
  const { results } = await stmt.all();
  return results;
}

// ---------- รายการรอยืนยัน ----------
export const savePending = (db, userId, payload) =>
  db.prepare('INSERT OR REPLACE INTO pending (user_id, payload, created_at) VALUES (?,?,?)')
    .bind(userId, JSON.stringify(payload), Date.now()).run();

/** อ่านแล้วลบทิ้งทันที กันกดยืนยันซ้ำสองครั้งแล้วได้เอกสารสองใบ */
export async function takePending(db, userId) {
  const row = await db.prepare('SELECT * FROM pending WHERE user_id = ?').bind(userId).first();
  await db.prepare('DELETE FROM pending WHERE user_id = ?').bind(userId).run();
  if (!row || Date.now() - row.created_at > PENDING_TTL_MS) return null;
  return JSON.parse(row.payload);
}

export async function peekPending(db, userId) {
  const row = await db.prepare('SELECT * FROM pending WHERE user_id = ?').bind(userId).first();
  if (!row || Date.now() - row.created_at > PENDING_TTL_MS) return null;
  return JSON.parse(row.payload);
}

export const clearPending = (db, userId) =>
  db.prepare('DELETE FROM pending WHERE user_id = ?').bind(userId).run();

// ---------- วันหยุด ----------
export const addHoliday = (db, date, name) =>
  db.prepare('INSERT OR REPLACE INTO holidays (date, name) VALUES (?, ?)').bind(date, name).run();

export const holidayOn = (db, date) =>
  db.prepare('SELECT name FROM holidays WHERE date = ?').bind(date).first();

// ---------- สต๊อก ----------
/** ตัดช่องว่างและตัวพิมพ์ใหญ่เล็ก เพื่อจับคู่สินค้าเดิมให้เจอ (ไม่ตัดคำนำหน้าเหมือนชื่อคน) */
export function productKey(name) {
  return String(name || '').trim().replace(/\s+/g, '').toLowerCase();
}

export const findProduct = (db, name) =>
  db.prepare('SELECT * FROM products WHERE name_key = ?').bind(productKey(name)).first();

/** บันทึกสินค้า: ช่องที่ส่งมาใหม่เขียนทับ ช่องที่เป็น null เก็บของเดิมไว้ (เหมือน upsertCustomer) */
export async function upsertProduct(db, p) {
  const key = productKey(p.name);
  await db.prepare(`
    INSERT INTO products (name, name_key, unit, cost, price, note)
    VALUES (?, ?, COALESCE(?, 'ชิ้น'), ?, ?, ?)
    ON CONFLICT(name_key) DO UPDATE SET
      name       = excluded.name,
      unit       = COALESCE(excluded.unit,  products.unit),
      cost       = COALESCE(excluded.cost,  products.cost),
      price      = COALESCE(excluded.price, products.price),
      note       = COALESCE(excluded.note,  products.note),
      active     = 1,
      updated_at = datetime('now')
  `).bind(p.name, key, p.unit ?? null, p.cost ?? null, p.price ?? null, p.note ?? null).run();
  return db.prepare('SELECT * FROM products WHERE name_key = ?').bind(key).first();
}

/**
 * ยอดคงเหลือทุกตัว — คิดจาก SUM(delta) ในสมุดเดินของ ไม่ได้อ่านจากช่องที่เก็บยอดไว้
 * ช้ากว่าเล็กน้อยแต่ยอดไม่เคยเพี้ยน และย้อนดูได้ว่าของหายตอนไหน
 */
export async function listStock(db, { withZero = true } = {}) {
  const { results } = await db.prepare(`
    SELECT p.*, COALESCE(SUM(m.delta), 0) AS qty
    FROM products p LEFT JOIN stock_moves m ON m.product_id = p.id
    GROUP BY p.id
    ${withZero ? '' : 'HAVING qty <> 0'}
    ORDER BY p.active DESC, qty <= 0, p.name
  `).all();
  return results;
}

export const stockOf = (db, productId) =>
  db.prepare(`
    SELECT p.*, COALESCE(SUM(m.delta), 0) AS qty
    FROM products p LEFT JOIN stock_moves m ON m.product_id = p.id
    WHERE p.id = ? GROUP BY p.id
  `).bind(productId).first();

export async function addStockMove(db, m) {
  await db.prepare(`
    INSERT INTO stock_moves (product_id, delta, reason, unit_cost, job_id, doc_no, note)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    m.product_id, m.delta, m.reason,
    m.unit_cost ?? null, m.job_id ?? null, m.doc_no ?? null, m.note ?? null,
  ).run();
  return stockOf(db, m.product_id);
}

/** รับของเข้า: ไม่มีสินค้าตัวนี้ในระบบก็สร้างให้เลย ไม่ต้องตั้งรายการไว้ก่อน */
export async function receiveStock(db, { name, qty, unit_cost, note }) {
  const p = await upsertProduct(db, { name, cost: unit_cost ?? null });
  return { product: p, after: await addStockMove(db, {
    product_id: p.id, delta: Math.abs(qty), reason: 'รับเข้า', unit_cost: unit_cost ?? null, note,
  }) };
}

export async function stockMovesOf(db, productId, limit = 20) {
  const { results } = await db.prepare(
    'SELECT * FROM stock_moves WHERE product_id = ? ORDER BY id DESC LIMIT ?',
  ).bind(productId, limit).all();
  return results;
}

/** มูลค่าสต๊อกรวม — เฉพาะตัวที่รู้ต้นทุน ตัวที่ยังไม่เคยใส่ต้นทุนนับเป็นจำนวนชิ้นอย่างเดียว */
export async function stockValue(db) {
  return db.prepare(`
    SELECT
      SUM(CASE WHEN p.cost IS NOT NULL THEN q.qty * p.cost ELSE 0 END) AS value,
      SUM(CASE WHEN p.cost IS NULL AND q.qty > 0 THEN 1 ELSE 0 END)   AS unpriced
    FROM products p
    JOIN (SELECT product_id, SUM(delta) AS qty FROM stock_moves GROUP BY product_id) q
      ON q.product_id = p.id
    WHERE q.qty > 0
  `).first();
}

// ---------- รายจ่าย ----------
export async function addExpense(db, e) {
  const res = await db.prepare(`
    INSERT INTO expenses (spent_date, category, amount, note, job_id, seller)
    VALUES (?,?,?,?,?, COALESCE(?, 'tuaklang'))
  `).bind(e.spent_date, e.category, e.amount, e.note ?? null, e.job_id ?? null, e.seller ?? null).run();
  return db.prepare('SELECT * FROM expenses WHERE id = ?').bind(res.meta.last_row_id).first();
}

export async function recentExpenses(db, limit = 50) {
  const { results } = await db.prepare(
    'SELECT * FROM expenses ORDER BY spent_date DESC, id DESC LIMIT ?',
  ).bind(limit).all();
  return results;
}

/** รายจ่ายของเดือน (YYYY-MM) แยกหมวดและแยกบริษัท — คู่กับ monthSummary ที่เป็นฝั่งรายรับ */
export async function monthExpenses(db, ym) {
  const { results } = await db.prepare(`
    SELECT seller, category, COUNT(*) AS cnt, SUM(amount) AS total
    FROM expenses WHERE spent_date LIKE ?
    GROUP BY seller, category
  `).bind(ym + '%').all();
  return results;
}

/**
 * รายรับ (เอกสารที่ออก) กับรายจ่าย รวมรายเดือน ตั้งแต่เดือน from เป็นต้นมา
 * แยกเป็น 2 query เพราะคนละตารางคนละช่องวันที่ แล้วค่อยมาต่อกันในโค้ด
 * ง่ายกว่า UNION และอ่านออกว่าเลขไหนมาจากไหน
 */
export async function monthlyTrend(db, from) {
  const income = await db.prepare(`
    SELECT substr(issue_date, 1, 7) AS ym, SUM(total) AS total
    FROM documents WHERE status = 'issued' AND issue_date >= ?
    GROUP BY ym
  `).bind(from + '-01').all();

  const spent = await db.prepare(`
    SELECT substr(spent_date, 1, 7) AS ym, SUM(amount) AS total
    FROM expenses WHERE spent_date >= ?
    GROUP BY ym
  `).bind(from + '-01').all();

  return { income: income.results, spent: spent.results };
}

export async function jobExpenses(db, jobId) {
  const { results } = await db.prepare(
    'SELECT * FROM expenses WHERE job_id = ? ORDER BY id DESC',
  ).bind(jobId).all();
  return results;
}

/** ตัดสต๊อกของงานนี้ไปแล้วหรือยัง — กันกดส่งของซ้ำแล้วสต๊อกหายสองเท่า */
export async function stockMovesOfJob(db, jobId) {
  const { results } = await db.prepare(
    "SELECT * FROM stock_moves WHERE job_id = ? AND reason = 'ส่งของ' ORDER BY id",
  ).bind(jobId).all();
  return results;
}

/** จับคู่ชื่อรายการในเอกสารกับสินค้าในสต๊อก — คืนเฉพาะตัวที่เจอ */
export async function productsByKeys(db, keys) {
  if (!keys.length) return [];
  const qs = keys.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT * FROM products WHERE name_key IN (${qs})`,
  ).bind(...keys).all();
  return results;
}
