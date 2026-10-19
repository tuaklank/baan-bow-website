// รายจ่ายที่ลงผิด: ยกเลิกได้ แก้ได้ แต่ไม่มีการลบแถว (หลักเดิมของระบบ)
// ที่ต้องคุมให้แน่คือ "ยกเลิกแล้วต้องหายจากทุกยอด แต่แถวยังอยู่"
// เพราะยอดรวมมีหลายจุด (สรุปเดือน กราฟย้อนหลัง รายจ่ายของงาน) ตกจุดไหนจุดหนึ่งเลขจะเพี้ยนเงียบๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './d1.js';
import {
  addExpense, expenseById, voidExpense, replaceExpense,
  recentExpenses, monthExpenses, monthlyTrend, jobExpenses, createJob,
} from '../src/db.js';

const exp = (over = {}) => ({
  spent_date: '2026-10-05', category: 'ค่าส่ง', amount: 6000, note: 'Kerry', ...over,
});

const sum = (rows) => rows.reduce((a, r) => a + r.total, 0);

test('แถวใหม่เริ่มที่สถานะปกติ และนับในยอดเดือน', async () => {
  const db = freshDb();
  const row = await addExpense(db, exp());
  assert.equal(row.status, 'recorded');
  assert.equal(row.void_reason, null);
  assert.equal(row.replaced_by, null);
  assert.equal(sum(await monthExpenses(db, '2026-10')), 6000);
});

test('ยกเลิกแล้วหายจากยอดเดือนและจากกราฟย้อนหลัง แต่แถวยังอยู่', async () => {
  const db = freshDb();
  const keep = await addExpense(db, exp({ amount: 45000, category: 'ค่าวัสดุ' }));
  const wrong = await addExpense(db, exp({ amount: 600000 }));   // พิมพ์เกินมา 2 หลัก

  assert.equal(sum(await monthExpenses(db, '2026-10')), 645000);

  assert.equal(await voidExpense(db, wrong.id, 'ลงยอดผิด'), true);

  assert.equal(sum(await monthExpenses(db, '2026-10')), 45000);
  assert.equal(sum((await monthlyTrend(db, '2026-05')).spent), 45000);

  // แถวต้องยังอยู่ให้ย้อนดูได้ — นี่คือเหตุผลที่ไม่ใช้ DELETE
  const row = await expenseById(db, wrong.id);
  assert.equal(row.status, 'void');
  assert.equal(row.void_reason, 'ลงยอดผิด');
  assert.ok(row.voided_at);
  assert.equal(row.amount, 600000, 'ยอดเดิมต้องไม่ถูกแก้');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').first().n, 2);

  // หน้ารายจ่ายต้องยังเห็นทั้งสองแถว (อันที่ยกเลิกแสดงแบบขีดฆ่า)
  const recent = await recentExpenses(db, 50);
  assert.deepEqual(recent.map((r) => r.id).sort(), [keep.id, wrong.id].sort());
  assert.equal(recent.filter((r) => r.status === 'void').length, 1);
});

test('ยกเลิกซ้ำไม่ได้ และไม่แตะ void_reason เดิม', async () => {
  const db = freshDb();
  const row = await addExpense(db, exp());
  assert.equal(await voidExpense(db, row.id, 'ครั้งแรก'), true);
  assert.equal(await voidExpense(db, row.id, 'ครั้งที่สอง'), false);
  assert.equal((await expenseById(db, row.id)).void_reason, 'ครั้งแรก');
});

test('รายจ่ายของงาน ไม่นับรายการที่ยกเลิกแล้ว', async () => {
  const db = freshDb();
  const job = await createJob(db, { title: 'โบว์งานแต่ง', due_date: '2026-10-20' });
  const a = await addExpense(db, exp({ amount: 8000, job_id: job.id }));
  const b = await addExpense(db, exp({ amount: 9900, job_id: job.id }));

  assert.equal((await jobExpenses(db, job.id)).length, 2);
  await voidExpense(db, b.id, 'ลงผิดงาน');

  const rows = await jobExpenses(db, job.id);
  assert.deepEqual(rows.map((r) => r.id), [a.id]);
});

test('แก้ไข = ยกเลิกแถวเดิมแล้วลงแถวใหม่ ยอดเดือนเหลือเฉพาะยอดใหม่', async () => {
  const db = freshDb();
  const old = await addExpense(db, exp({ amount: 6000 }));

  const { ok, row } = await replaceExpense(
    db,
    old.id,
    { ...exp({ amount: 8000, note: 'Kerry (ค่าส่งจริง)' }), seller: old.seller },
    'แก้ไข',
  );
  assert.equal(ok, true);
  assert.notEqual(row.id, old.id, 'ต้องเป็นแถวใหม่ ไม่ใช่ UPDATE ทับ');
  assert.equal(row.amount, 8000);
  assert.equal(row.status, 'recorded');

  const before = await expenseById(db, old.id);
  assert.equal(before.status, 'void');
  assert.equal(before.void_reason, 'แก้ไข');
  assert.equal(before.replaced_by, row.id, 'แถวเดิมต้องชี้ไปที่แถวที่ใช้แทน');
  assert.equal(before.amount, 6000, 'ยอดที่ลงผิดต้องยังอยู่ในประวัติ');

  assert.equal(sum(await monthExpenses(db, '2026-10')), 8000);
  assert.equal((await recentExpenses(db, 50)).length, 2);
});

test('แก้แถวที่ยกเลิกไปแล้วไม่ได้ และไม่มีแถวใหม่โผล่มา', async () => {
  const db = freshDb();
  const old = await addExpense(db, exp());
  await voidExpense(db, old.id, 'ลงผิด');

  const res = await replaceExpense(db, old.id, exp({ amount: 7000 }), 'แก้ไข');
  assert.equal(res.ok, false);
  assert.equal(res.row, null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM expenses').first().n, 1);
  assert.equal(sum(await monthExpenses(db, '2026-10')), 0);
});

test('ยกเลิกเดือนก่อน ไม่กระทบยอดเดือนอื่นในกราฟ', async () => {
  const db = freshDb();
  await addExpense(db, exp({ spent_date: '2026-09-10', amount: 5000 }));
  const sept = await addExpense(db, exp({ spent_date: '2026-09-11', amount: 300000 }));
  await addExpense(db, exp({ spent_date: '2026-10-02', amount: 7000 }));

  await voidExpense(db, sept.id, 'ลงผิดเดือน');

  const { spent } = await monthlyTrend(db, '2026-05');
  const by = new Map(spent.map((r) => [r.ym, r.total]));
  assert.equal(by.get('2026-09'), 5000);
  assert.equal(by.get('2026-10'), 7000);
});

test('สถานะนอกเหนือจาก recorded/void ลงไม่ได้ (CHECK ใน migration 0004)', async () => {
  const db = freshDb();
  const row = await addExpense(db, exp());
  assert.throws(
    () => db.prepare('UPDATE expenses SET status = ? WHERE id = ?').bind('ลบแล้ว', row.id).run(),
    /CHECK|constraint/i,
  );
});
