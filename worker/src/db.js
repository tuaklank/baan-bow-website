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
       note, payment_terms, ref_doc_no)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    d.type, doc_no, token, d.issue_date, d.valid_until ?? null,
    customer.id, JSON.stringify(d.customer), JSON.stringify(d.lines),
    d.discount, d.vat_mode, d.subtotal, d.base, d.vat, d.wht_rate, d.wht, d.total, d.net_payable,
    d.note ?? null, d.payment_terms ?? null, d.ref_doc_no ?? null,
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

/** สรุปยอดของเดือน (YYYY-MM) แยกตามประเภท — นับเฉพาะเอกสารที่ไม่ถูกยกเลิก */
export async function monthSummary(db, ym) {
  const { results } = await db.prepare(`
    SELECT type, COUNT(*) AS cnt, SUM(total) AS total, SUM(vat) AS vat, SUM(base) AS base
    FROM documents
    WHERE issue_date LIKE ? AND status = 'issued'
    GROUP BY type
  `).bind(ym + '%').all();
  const voided = await db.prepare(
    "SELECT COUNT(*) AS cnt FROM documents WHERE issue_date LIKE ? AND status = 'void'",
  ).bind(ym + '%').first();
  return { month: ym, byType: results, voidCount: voided.cnt };
}

// ---------- งาน ----------
export async function createJob(db, { title, customer, due_date, note, doc_no }) {
  const res = await db.prepare(
    'INSERT INTO jobs (title, customer, due_date, note, doc_no) VALUES (?,?,?,?,?)',
  ).bind(title, customer ?? null, due_date ?? null, note ?? null, doc_no ?? null).run();
  const id = res.meta.last_row_id;
  await db.prepare('INSERT INTO job_events (job_id, text) VALUES (?, ?)').bind(id, 'สร้างงาน').run();
  return db.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first();
}

export const jobById = (db, id) => db.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first();

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
