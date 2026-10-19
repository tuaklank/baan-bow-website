// สต๊อก + รายจ่าย — รันบน sqlite ในหน่วยความจำด้วย migration ชุดเดียวกับ D1
// ที่ต้องกันไว้: ยอดคงเหลือต้องมาจากผลรวมสมุดเดินของ ไม่ใช่ตัวเลขที่เขียนทับ
// และค่าที่ประกาศใน config.js ต้องตรงกับ CHECK ใน migration ไม่งั้นบันทึกจริงจะพังตอนรัน
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { STOCK_REASONS, STOCK_CUT_ON, EXPENSE_CATEGORIES } from '../src/config.js';
import { productKey } from '../src/db.js';
import { toSatang } from '../src/money.js';

const sqlOf = (f) => readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8');
const MIGRATIONS = readdirSync(new URL('../migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).sort();
const STOCK_SQL = sqlOf('0003_stock_expenses.sql');

function fresh() {
  const db = new DatabaseSync(':memory:');
  for (const f of MIGRATIONS) db.exec(sqlOf(f));
  return db;
}

const addProduct = (db, name, cost = null) => {
  db.prepare('INSERT INTO products (name, name_key, cost) VALUES (?,?,?)').run(name, productKey(name), cost);
  return db.prepare('SELECT id FROM products WHERE name_key = ?').get(productKey(name)).id;
};
const move = (db, id, delta, reason) =>
  db.prepare('INSERT INTO stock_moves (product_id, delta, reason) VALUES (?,?,?)').run(id, delta, reason);
const balance = (db, id) =>
  db.prepare('SELECT COALESCE(SUM(delta),0) AS qty FROM stock_moves WHERE product_id = ?').get(id).qty;

// ---------- ค่าใน config ต้องตรงกับ migration ----------

test('STOCK_REASONS ตรงกับ CHECK ของ stock_moves.reason', () => {
  for (const r of STOCK_REASONS) {
    assert.ok(STOCK_SQL.includes(`'${r}'`), `migration ไม่รับ reason '${r}'`);
  }
  // ใช้ reason ที่ migration ไม่รับ ต้องถูกปฏิเสธ ไม่ใช่บันทึกผ่าน
  const db = fresh();
  const id = addProduct(db, 'โบว์แดง');
  assert.throws(() => move(db, id, 1, 'คืนของ'), /CHECK|constraint/i);
});

test('EXPENSE_CATEGORIES ตรงกับ CHECK ของ expenses.category ทั้ง 4 หมวด', () => {
  assert.deepEqual(EXPENSE_CATEGORIES, ['ค่าวัสดุ', 'ค่าส่ง', 'ค่าแรง', 'อื่นๆ']);
  const db = fresh();
  const ins = db.prepare('INSERT INTO expenses (spent_date, category, amount) VALUES (?,?,?)');
  for (const c of EXPENSE_CATEGORIES) ins.run('2026-10-19', c, 10000);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, EXPENSE_CATEGORIES.length);
  assert.throws(() => ins.run('2026-10-19', 'ค่าการตลาด', 10000), /CHECK|constraint/i);
});

test('ตัดสต๊อกตอนส่งของ — จุดที่ตัดต้องเป็น reason ที่มีจริง', () => {
  assert.equal(STOCK_CUT_ON, 'ส่งของ');
  assert.ok(STOCK_REASONS.includes(STOCK_CUT_ON));
});

// ---------- ยอดคงเหลือ ----------

test('ยอดคงเหลือคือผลรวมของ delta ทุกแถว ไม่ใช่ค่าที่เก็บไว้', () => {
  const db = fresh();
  const id = addProduct(db, 'โบว์ริบบิ้นแดง');
  assert.equal(balance(db, id), 0);     // ยังไม่มีแถวเลย ต้องได้ 0 ไม่ใช่ null
  move(db, id, 3, 'รับเข้า');
  move(db, id, 10, 'รับเข้า');
  move(db, id, -1, 'ส่งของ');
  move(db, id, -2, 'เสียหาย');
  assert.equal(balance(db, id), 10);
  // ลงผิดแล้วแก้ด้วยแถวใหม่ ประวัติเดิมยังอยู่ครบ
  move(db, id, 2, 'ปรับยอด');
  assert.equal(balance(db, id), 12);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stock_moves WHERE product_id = ?').get(id).n, 5);
});

test('ส่งของก่อนลงรับเข้า ยอดติดลบได้ ไม่ถูกบล็อก', () => {
  // ร้านส่งของก่อนลงรับเข้าเป็นเรื่องปกติ ถ้าบล็อกไว้เจ้าของจะเลิกบันทึก
  const db = fresh();
  const id = addProduct(db, 'โบว์ทอง');
  move(db, id, -2, 'ส่งของ');
  assert.equal(balance(db, id), -2);
  move(db, id, 5, 'รับเข้า');    // รับเข้าย้อนหลังแล้วยอดกลับมาถูก
  assert.equal(balance(db, id), 3);
});

test('delta = 0 ลงไม่ได้ เพราะไม่ใช่การเดินของ', () => {
  const db = fresh();
  const id = addProduct(db, 'โบว์ขาว');
  assert.throws(() => move(db, id, 0, 'ปรับยอด'), /CHECK|constraint/i);
});

test('ชื่อซ้ำกันคนละแบบ ถือเป็นสินค้าตัวเดียว (name_key ไม่ซ้ำ)', () => {
  assert.equal(productKey(' โบว์ ริบบิ้น แดง '), productKey('โบว์ริบบิ้นแดง'));
  assert.equal(productKey('Bow RED'), productKey('bowred'));
  const db = fresh();
  addProduct(db, 'โบว์ริบบิ้นแดง');
  assert.throws(() => addProduct(db, 'โบว์ ริบบิ้น แดง'), /UNIQUE|constraint/i);
});

test('ตัดสต๊อกของงานเดิมซ้ำ หาเจอได้จาก job_id กันตัดสองเท่า', () => {
  const db = fresh();
  const id = addProduct(db, 'โบว์แดง');
  db.prepare("INSERT INTO jobs (title) VALUES ('ติดตั้งโบว์')").run();
  const jobId = db.prepare('SELECT id FROM jobs').get().id;
  db.prepare("INSERT INTO stock_moves (product_id, delta, reason, job_id) VALUES (?,?,'ส่งของ',?)")
    .run(id, -2, jobId);
  const done = db.prepare("SELECT * FROM stock_moves WHERE job_id = ? AND reason = 'ส่งของ'").all(jobId);
  assert.equal(done.length, 1);
});

// ---------- รายจ่าย ----------

test('รายจ่ายเก็บเป็นสตางค์ ไม่เก็บทศนิยม', () => {
  const db = fresh();
  db.prepare('INSERT INTO expenses (spent_date, category, amount, note) VALUES (?,?,?,?)')
    .run('2026-10-19', 'ค่าวัสดุ', toSatang(450.5), 'ซื้อริบบิ้น');
  const row = db.prepare('SELECT * FROM expenses').get();
  assert.equal(row.amount, 45050);
  assert.equal(Number.isInteger(row.amount), true);
});

test('ยอดรายจ่าย 0 หรือติดลบ ลงไม่ได้', () => {
  const db = fresh();
  const ins = db.prepare('INSERT INTO expenses (spent_date, category, amount) VALUES (?,?,?)');
  assert.throws(() => ins.run('2026-10-19', 'ค่าส่ง', 0), /CHECK|constraint/i);
  assert.throws(() => ins.run('2026-10-19', 'ค่าส่ง', -100), /CHECK|constraint/i);
});

test('รายจ่ายไม่ระบุบริษัท เข้าตัวกลางเหมือนเอกสาร', () => {
  const db = fresh();
  db.prepare('INSERT INTO expenses (spent_date, category, amount) VALUES (?,?,?)')
    .run('2026-10-19', 'ค่าแรง', 30000);
  assert.equal(db.prepare('SELECT seller FROM expenses').get().seller, 'tuaklang');
});

test('สรุปเดือนแยกหมวดและแยกบริษัท ไม่เอามารวมกัน', () => {
  const db = fresh();
  const ins = db.prepare('INSERT INTO expenses (spent_date, category, amount, seller) VALUES (?,?,?,?)');
  ins.run('2026-10-01', 'ค่าวัสดุ', 45000, 'tuaklang');
  ins.run('2026-10-19', 'ค่าวัสดุ', 15000, 'tuaklang');
  ins.run('2026-10-19', 'ค่าส่ง', 6000, 'baanbow');
  ins.run('2026-09-30', 'ค่าส่ง', 9900, 'tuaklang');   // เดือนก่อน ต้องไม่ถูกนับ

  const rows = db.prepare(`
    SELECT seller, category, COUNT(*) AS cnt, SUM(amount) AS total
    FROM expenses WHERE spent_date LIKE ? GROUP BY seller, category
  `).all('2026-10%');

  assert.equal(rows.length, 2);
  const tk = rows.find((r) => r.seller === 'tuaklang' && r.category === 'ค่าวัสดุ');
  assert.equal(tk.cnt, 2);
  assert.equal(tk.total, 60000);
  assert.equal(rows.reduce((a, r) => a + r.total, 0), 66000);
});
