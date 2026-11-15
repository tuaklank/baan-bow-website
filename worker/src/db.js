// ตัวช่วยคุย D1 — รวม query ทั้งหมดไว้ที่นี่ ที่อื่นไม่ต้องเขียน SQL
import { JOB_OPEN_SQL, PENDING_TTL_MS, INCOME_TYPE_SQL } from './config.js';
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

export async function expenseById(db, id) {
  return db.prepare('SELECT * FROM expenses WHERE id = ?').bind(id).first();
}

/**
 * รายการล่าสุด — คืนทั้งที่ยกเลิกแล้วด้วยโดยตั้งใจ หน้า /admin ต้องยังเห็นว่าเคยลงอะไรไว้
 * ฝั่งที่รวมยอด (monthExpenses / monthlyTrend / jobExpenses) กรอง 'void' ออกให้แล้ว
 * ที่นี่เป็นรายการ ไม่ใช่ยอด ใครเอาไปรวมเองต้องเช็ค status เอง
 */
export async function recentExpenses(db, limit = 50) {
  const { results } = await db.prepare(
    'SELECT * FROM expenses ORDER BY spent_date DESC, id DESC LIMIT ?',
  ).bind(limit).all();
  return results;
}

/** ยกเลิกรายจ่าย — ไม่ลบแถว เหมือน voidDocument; คืน false ถ้ายกเลิกไปแล้ว */
export async function voidExpense(db, id, reason, replacedBy = null) {
  const res = await db.prepare(`
    UPDATE expenses
    SET status = 'void', void_reason = ?, voided_at = datetime('now'), replaced_by = ?
    WHERE id = ? AND status = 'recorded'
  `).bind(reason ?? null, replacedBy, id).run();
  return res.meta.changes > 0;
}

/**
 * "แก้ไข" รายจ่าย = ยกเลิกแถวเดิมแล้วลงแถวใหม่ ไม่ UPDATE ทับ ประวัติจะได้ไม่หาย
 * ยกเลิกก่อนลงใหม่ ถ้าแถวเดิมถูกยกเลิกไปแล้วจะได้ไม่มีแถวใหม่โผล่มาซ้ำ
 */
export async function replaceExpense(db, id, next, reason) {
  if (!(await voidExpense(db, id, reason ?? 'แก้ไข'))) return { ok: false, row: null };
  const row = await addExpense(db, next);
  await db.prepare('UPDATE expenses SET replaced_by = ? WHERE id = ?').bind(row.id, id).run();
  return { ok: true, row };
}

/**
 * รายจ่ายของเดือน (YYYY-MM) แยกหมวดและแยกบริษัท — คู่กับ monthSummary ที่เป็นฝั่งรายรับ
 * ไม่นับรายการที่ยกเลิกแล้ว เหมือนที่ฝั่งรายรับไม่นับเอกสาร status='void'
 */
export async function monthExpenses(db, ym) {
  const { results } = await db.prepare(`
    SELECT seller, category, COUNT(*) AS cnt, SUM(amount) AS total
    FROM expenses WHERE spent_date LIKE ? AND status = 'recorded'
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
  // นับเฉพาะเอกสารที่รับเงินแล้ว ใบเสนอราคาไม่ใช่รายรับ (ดู DOC_ROLE ใน config.js)
  const income = await db.prepare(`
    SELECT substr(issue_date, 1, 7) AS ym, SUM(total) AS total
    FROM documents
    WHERE status = 'issued' AND type IN (${INCOME_TYPE_SQL}) AND issue_date >= ?
    GROUP BY ym
  `).bind(from + '-01').all();

  const spent = await db.prepare(`
    SELECT substr(spent_date, 1, 7) AS ym, SUM(amount) AS total
    FROM expenses WHERE spent_date >= ? AND status = 'recorded'
    GROUP BY ym
  `).bind(from + '-01').all();

  return { income: income.results, spent: spent.results };
}

export async function jobExpenses(db, jobId) {
  const { results } = await db.prepare(
    "SELECT * FROM expenses WHERE job_id = ? AND status = 'recorded' ORDER BY id DESC",
  ).bind(jobId).all();
  return results;
}

// ---------- ออเดอร์โบว์ ----------
const ORDER_FIELDS = ['order_date', 'style', 'channel', 'detail', 'customer', 'price', 'paid_at', 'wage', 'wage_paid_at'];

export async function addOrder(db, o) {
  const res = await db.prepare(`
    INSERT INTO bow_orders (order_date, style, channel, detail, customer, price, wage)
    VALUES (?,?,?,?,?,?,?)
  `).bind(o.order_date, o.style, o.channel ?? null, o.detail ?? null, o.customer ?? null, o.price ?? null, o.wage ?? null).run();
  return orderById(db, res.meta.last_row_id);
}

/**
 * จดโบว์แบบเดียวกันทีละหลายชิ้น — ชิ้นละแถว เลขเรียงติดกัน คืนเลขแรกและเลขสุดท้าย
 * ใช้คำสั่งเดียวต่อหนึ่งแบบ ไม่วนจดทีละแถว เพราะสั่งมาทีเป็นสิบๆ ชิ้น
 * ถ้าวนทีละแถวจะชนเพดานจำนวนคำสั่งฐานข้อมูลต่อหนึ่งข้อความของ Cloudflare
 */
export async function addOrders(db, o, qty) {
  const res = await db.prepare(`
    INSERT INTO bow_orders (order_date, style, channel, detail, customer, price, wage)
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
    SELECT ?,?,?,?,?,?,? FROM n
  `).bind(qty, o.order_date, o.style, o.channel ?? null, o.detail ?? null, o.customer ?? null, o.price ?? null, o.wage ?? null).run();
  const last = res.meta.last_row_id;
  return { first: last - qty + 1, last };
}

export const orderById = (db, id) =>
  db.prepare('SELECT * FROM bow_orders WHERE id = ?').bind(id).first();

/**
 * แก้ออเดอร์ทับแถวเดิม — ต่างจากรายจ่ายที่ยกเลิกแล้วลงใหม่ เพราะเลขออเดอร์ต้องคงเดิม
 * เจ้าของร้านอ้าง "ออเดอร์ 24" ซ้ำหลายรอบเพื่อเติมทีละช่อง ถ้าเลขเปลี่ยนทุกครั้งจะตามไม่ได้
 * ประวัติว่าเคยเป็นอะไรมาก่อนเก็บใน bow_order_events แทน
 * changes ใส่เฉพาะช่องที่จะแก้ ช่องที่ไม่ใส่คงค่าเดิม; คืน null ถ้าไม่มีแถวหรือถูกยกเลิกแล้ว
 */
export async function updateOrder(db, id, changes, eventText) {
  const keys = ORDER_FIELDS.filter((k) => changes[k] !== undefined);
  if (!keys.length) return orderById(db, id);
  const res = await db.prepare(`
    UPDATE bow_orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now')
    WHERE id = ? AND status = 'recorded'
  `).bind(...keys.map((k) => changes[k]), id).run();
  if (!res.meta.changes) return null;
  await db.prepare('INSERT INTO bow_order_events (order_id, text) VALUES (?, ?)')
    .bind(id, eventText || 'แก้ไข').run();
  return orderById(db, id);
}

/** ลบออเดอร์ = ยกเลิก ไม่ลบแถว เหมือนทุกตารางในระบบ; คืน false ถ้ายกเลิกไปแล้ว */
export async function voidOrder(db, id, reason) {
  const res = await db.prepare(`
    UPDATE bow_orders SET status = 'void', void_reason = ?, voided_at = datetime('now'),
                          updated_at = datetime('now')
    WHERE id = ? AND status = 'recorded'
  `).bind(reason ?? null, id).run();
  if (res.meta.changes > 0) {
    await db.prepare('INSERT INTO bow_order_events (order_id, text) VALUES (?, ?)')
      .bind(id, 'ยกเลิก' + (reason ? ` — ${reason}` : '')).run();
  }
  return res.meta.changes > 0;
}

export async function orderEvents(db, id) {
  const { results } = await db.prepare(
    'SELECT * FROM bow_order_events WHERE order_id = ? ORDER BY id',
  ).bind(id).all();
  return results;
}

/** ออเดอร์ของเดือน (YYYY-MM) เรียงตามวันที่แล้วตามเลข — ที่ยกเลิกแล้วไม่รวม */
export async function monthOrders(db, ym) {
  const { results } = await db.prepare(`
    SELECT * FROM bow_orders WHERE status = 'recorded' AND order_date LIKE ?
    ORDER BY order_date, id
  `).bind(ym + '-%').all();
  return results;
}

/** รายการล่าสุดสำหรับหน้า /admin — รวมที่ยกเลิกแล้วด้วย ให้เห็นว่าเคยจดอะไรไว้ (เหมือน recentExpenses) */
export async function recentOrders(db, limit = 50) {
  const { results } = await db.prepare(
    'SELECT * FROM bow_orders ORDER BY order_date DESC, id DESC LIMIT ?',
  ).bind(limit).all();
  return results;
}

/**
 * token ของหน้าตารางออเดอร์เดือนนั้น — มีอยู่แล้วใช้ตัวเดิม ไม่มีสร้างใหม่
 * ลิงก์ของเดือนเดียวกันจึงเหมือนเดิมทุกครั้ง เปิดค้างไว้แล้วกดรีเฟรชก็เห็นออเดอร์ล่าสุด
 */
export async function orderSheetToken(db, ym) {
  await db.prepare('INSERT OR IGNORE INTO order_sheets (ym, token) VALUES (?, ?)')
    .bind(ym, newToken()).run();
  return (await db.prepare('SELECT token FROM order_sheets WHERE ym = ?').bind(ym).first()).token;
}

export const orderSheetByToken = (db, token) =>
  db.prepare('SELECT * FROM order_sheets WHERE token = ?').bind(token).first();

/** ตัดสต๊อกของงานนี้ไปแล้วหรือยัง — กันกดส่งของซ้ำแล้วสต๊อกหายสองเท่า */
export async function stockMovesOfJob(db, jobId) {
  const { results } = await db.prepare(
    "SELECT * FROM stock_moves WHERE job_id = ? AND reason = 'ส่งของ' ORDER BY id",
  ).bind(jobId).all();
  return results;
}

// ---------- ลูกค้ามุ่งหวัง ----------

/**
 * บันทึกเจ้าที่หามาได้ — ชนชื่อเดิมคือไม่บันทึก ไม่เขียนทับ
 * เพราะแถวเดิมมีสถานะที่เรากดไว้แล้ว ทับเมื่อไหร่ประวัติการตามงานหายทันที
 * คืน null ถ้าซ้ำ ให้ฝั่งที่เรียกไปหาเจ้าใหม่ต่อ
 */
export async function insertLead(db, l) {
  const key = customerKey(l.name);
  const res = await db.prepare(`
    INSERT OR IGNORE INTO leads
      (found_date, name, name_key, category, province, phone, website, facebook, line_id,
       why, sources, fit, reach, timing, draft)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    l.found_date, l.name, key, l.category ?? null, l.province ?? null,
    l.phone ?? null, l.website ?? null, l.facebook ?? null, l.line_id ?? null,
    JSON.stringify(l.why ?? []), JSON.stringify(l.sources ?? {}),
    l.fit ?? 0, l.reach ?? 0, l.timing ?? 0, l.draft ?? null,
  ).run();
  if (!res.meta.changes) return null;
  return leadById(db, res.meta.last_row_id);
}

export const leadById = (db, id) => db.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();

/** เคยเจอเจ้านี้แล้วหรือยัง — นับทั้งที่เป็นลูกค้าอยู่แล้วและที่เคยเสนอไป */
export async function knownNames(db) {
  const a = await db.prepare('SELECT name_key FROM customers').all();
  const b = await db.prepare('SELECT name_key FROM leads').all();
  return [...a.results, ...b.results].map((r) => r.name_key);
}

export async function setLeadStatus(db, id, status, note) {
  const res = await db.prepare(`
    UPDATE leads SET status = ?, status_note = COALESCE(?, status_note), updated_at = datetime('now')
    WHERE id = ?
  `).bind(status, note ?? null, id).run();
  return res.meta.changes > 0 ? leadById(db, id) : null;
}

export async function recentLeads(db, { status = null, limit = 50 } = {}) {
  const sql = `SELECT * FROM leads ${status ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT ?`;
  const stmt = status ? db.prepare(sql).bind(status, limit) : db.prepare(sql).bind(limit);
  const { results } = await stmt.all();
  return results;
}

/** สรุปของเดือน (YYYY-MM) แยกตามสถานะ — คู่กับ monthSummary ฝั่งเอกสาร */
export async function monthLeads(db, ym) {
  const { results } = await db.prepare(
    'SELECT status, COUNT(*) AS cnt FROM leads WHERE found_date LIKE ? GROUP BY status',
  ).bind(ym + '%').all();
  return results;
}

/**
 * ลูกค้าที่จ่ายเงินจริง แยกตามจังหวัด พร้อมยอดรวม — ใช้เป็นโจทย์ให้ AI ไปหาเจ้าที่หน้าตาคล้ายกัน
 * นับเฉพาะเอกสารที่เป็นรายรับจริง (ดู INCOME_TYPE_SQL) ใบเสนอราคาไม่นับ เพราะยังไม่ได้เงิน
 */
export async function payingCustomers(db, limit = 15) {
  const { results } = await db.prepare(`
    SELECT json_extract(d.customer, '$.name') AS name,
           json_extract(d.customer, '$.address') AS address,
           COUNT(*) AS bills, SUM(d.total) AS total
    FROM documents d
    WHERE d.status = 'issued' AND d.type IN (${INCOME_TYPE_SQL})
    GROUP BY name
    ORDER BY total DESC
    LIMIT ?
  `).bind(limit).all();
  return results;
}

/** รายการที่เคยกดไม่สนใจพร้อมเหตุผล — ป้อนกลับเข้ารอบถัดไป ไม่ให้หาแบบเดิมซ้ำ */
export async function droppedReasons(db, limit = 15) {
  const { results } = await db.prepare(`
    SELECT name, category, status_note FROM leads
    WHERE status = 'dropped' AND status_note IS NOT NULL
    ORDER BY id DESC LIMIT ?
  `).bind(limit).all();
  return results;
}

/** เจ้าที่ไปได้สวย (สนใจขึ้นไป) — บอก AI ว่าแบบไหนที่เจ้าของร้านเลือกจริง */
export async function workingLeads(db, limit = 15) {
  const { results } = await db.prepare(`
    SELECT name, category, province, why FROM leads
    WHERE status IN ('interested','contacted','replied','won')
    ORDER BY id DESC LIMIT ?
  `).bind(limit).all();
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

// ---------- ออเดอร์โบว์: แก้ทีละหลายชิ้น ----------
// "ออเดอร์ 1-30 ค่าจ้าง 150" แตะสามสิบแถวในข้อความเดียว ถ้าวนอ่าน-แก้-จดประวัติทีละแถว
// จะชนเพดานจำนวนคำสั่งฐานข้อมูลต่อหนึ่งข้อความของ Cloudflare จึงรวมเป็นไม่กี่คำสั่ง
const ORDER_STATE = [...ORDER_FIELDS, 'status', 'void_reason', 'voided_at'];   // ทุกช่องที่คำสั่งหนึ่งเปลี่ยนได้
const ORDER_CHUNK = 40;   // D1 รับตัวแปรได้ 100 ตัวต่อคำสั่ง — ประวัติใช้ 2 ตัวต่อแถว
const chunksOf = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** อ่านหลายออเดอร์ในคำสั่งเดียว (รวมที่ยกเลิกแล้ว ให้ผู้เรียกแยกเอง) */
export async function ordersByIds(db, ids) {
  const out = [];
  for (const part of chunksOf(ids, 90)) {
    const { results } = await db.prepare(
      `SELECT * FROM bow_orders WHERE id IN (${part.map(() => '?').join(',')})`,
    ).bind(...part).all();
    out.push(...results);
  }
  return out;
}

/**
 * แก้หลายออเดอร์พร้อมกัน — items = [{id, changes, text}] โดย text คือบรรทัดประวัติของแถวนั้น
 * แถวที่แก้เหมือนกันรวมเป็น UPDATE เดียว (ปกติทั้งชุดแก้เหมือนกันหมด จึงเหลือคำสั่งเดียว)
 * แก้เฉพาะแถวที่ยังไม่ถูกยกเลิก เหมือน updateOrder
 */
export async function updateOrdersBulk(db, items, { anyStatus = false } = {}) {
  // anyStatus = เขียนสถานะได้ด้วย (ลบ / กู้คืน / ย้อนกลับ) — ปกติแก้ได้เฉพาะช่องข้อมูลของแถวที่ยังไม่ถูกลบ
  const fields = anyStatus ? ORDER_STATE : ORDER_FIELDS;
  const groups = new Map();
  for (const it of items) {
    const keys = fields.filter((k) => it.changes[k] !== undefined);
    if (!keys.length) continue;
    const sig = JSON.stringify(keys.map((k) => [k, it.changes[k]]));
    if (!groups.has(sig)) groups.set(sig, { keys, changes: it.changes, rows: [] });
    groups.get(sig).rows.push(it);
  }
  for (const g of groups.values()) {
    for (const part of chunksOf(g.rows, ORDER_CHUNK)) {
      await db.prepare(`
        UPDATE bow_orders SET ${g.keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now')
        WHERE ${anyStatus ? '' : "status = 'recorded' AND "}id IN (${part.map(() => '?').join(',')})
      `).bind(...g.keys.map((k) => g.changes[k]), ...part.map((r) => r.id)).run();
      await db.prepare(
        `INSERT INTO bow_order_events (order_id, text) VALUES ${part.map(() => '(?, ?)').join(', ')}`,
      ).bind(...part.flatMap((r) => [r.id, r.text || 'แก้ไข'])).run();
    }
  }
}

// ---------- ออเดอร์โบว์: ย้อนกลับ / เดินหน้า ----------
// เก็บคำสั่งออเดอร์ของผู้ใช้เรียงกันเป็นแถว (ดู migration 0007) ย้อนได้ทีละคำสั่งจากล่าสุดถอยไป
// และเดินหน้ากลับมาได้ถ้าย้อนเกิน — เหมือน Undo/Redo ในโปรแกรมทั่วไป
// payload = { created: [เลขที่จดขึ้นมาใหม่], before: [แถวเดิมก่อนถูกแก้/ลบ], after: [แถวตอนถูกย้อน] }
export const ORDER_UNDO_DEPTH = 20;   // เก็บย้อนหลังได้เท่านี้คำสั่งต่อคน เก่ากว่านั้นทิ้ง

/** จดคำสั่งออเดอร์ที่เพิ่งทำ — ทางเดินหน้าเดิม (ที่เคยย้อนไว้) ใช้ไม่ได้แล้ว จึงทิ้ง */
export async function saveOrderUndo(db, uid, label, payload) {
  await db.prepare("DELETE FROM order_undo WHERE user_id = ? AND state = 'undone'").bind(uid).run();
  await db.prepare('INSERT INTO order_undo (user_id, label, payload) VALUES (?, ?, ?)')
    .bind(uid, label, JSON.stringify(payload)).run();
  await db.prepare(`
    DELETE FROM order_undo WHERE user_id = ? AND id NOT IN (
      SELECT id FROM order_undo WHERE user_id = ? ORDER BY id DESC LIMIT ?
    )
  `).bind(uid, uid, ORDER_UNDO_DEPTH).run();
}

/**
 * คำสั่งถัดไปที่จะย้อน (dir = 'undo': ตัวล่าสุดที่ยังมีผล) หรือจะเดินหน้า (dir = 'redo': ตัวเก่าสุดที่ถูกย้อน)
 * คืน { id, label, created, before, after } หรือ null ถ้าไม่มีแล้ว
 */
export async function nextOrderUndo(db, uid, dir) {
  const row = await db.prepare(dir === 'undo'
    ? "SELECT id, label, payload FROM order_undo WHERE user_id = ? AND state = 'done' ORDER BY id DESC LIMIT 1"
    : "SELECT id, label, payload FROM order_undo WHERE user_id = ? AND state = 'undone' ORDER BY id ASC LIMIT 1",
  ).bind(uid).first();
  return row ? { id: row.id, label: row.label, ...JSON.parse(row.payload) } : null;
}

/** เปลี่ยนสถานะคำสั่งหลังย้อน/เดินหน้า — payload ใส่มาเมื่อต้องจำสภาพ after เพิ่ม */
export async function markOrderUndo(db, id, state, payload = null) {
  if (payload) {
    await db.prepare('UPDATE order_undo SET state = ?, payload = ? WHERE id = ?').bind(state, JSON.stringify(payload), id).run();
  } else {
    await db.prepare('UPDATE order_undo SET state = ? WHERE id = ?').bind(state, id).run();
  }
}

/** เหลือให้ย้อน (done) และให้เดินหน้า (undone) อีกกี่คำสั่ง */
export async function orderUndoCounts(db, uid) {
  const { results } = await db.prepare(
    'SELECT state, COUNT(*) AS n FROM order_undo WHERE user_id = ? GROUP BY state',
  ).bind(uid).all();
  const of = (s) => results.find((r) => r.state === s)?.n ?? 0;
  return { undo: of('done'), redo: of('undone') };
}
