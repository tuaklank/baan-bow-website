// รายรับต้องเป็นเงินที่เข้ามาจริงเท่านั้น
// บั๊กที่เคยเกิดจริง: นับใบเสนอราคาเป็นรายรับ ทำให้ยอดเดือน ต.ค. 69 ขึ้น 23,770.50
// ทั้งที่รับเงินจริงแค่ 3,150 — และงานที่เสนอราคาแล้วออกใบเสร็จตามถูกนับสองรอบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './d1.js';
import { DOC_ROLE, INCOME_TYPES, TYPES, splitIncome, roleOf } from '../src/config.js';
import { monthSummary, monthlyTrend } from '../src/db.js';

const doc = (db, { type, no, date, total, vat = 0, seller = 'tuaklang', status = 'issued' }) =>
  db.prepare(`
    INSERT INTO documents (type, doc_no, token, issue_date, customer, items, vat_mode,
      subtotal, base, vat, total, net_payable, seller, status)
    VALUES (?,?,?,?,'{"name":"ลูกค้า"}','[]','none',?,?,?,?,?,?,?)
  `).bind(type, no, 'tok' + no, date, total, total - vat, vat, total, total, seller, status).run();

test('ทุกประเภทเอกสารต้องบอกได้ว่านับเป็นรายรับหรือยัง', () => {
  for (const t of Object.keys(TYPES)) {
    assert.ok(['paid', 'due', 'quote'].includes(roleOf(t)), `${t} ไม่มี role`);
    assert.ok(DOC_ROLE[t], `${t} ไม่ได้ประกาศใน DOC_ROLE`);
  }
});

test('ใบเสนอราคาไม่ใช่รายรับ ใบเสร็จเท่านั้นที่ใช่', () => {
  assert.deepEqual(INCOME_TYPES.sort(), ['receipt', 'receipt_tax_invoice'].sort());
  assert.equal(roleOf('quotation'), 'quote');
  assert.equal(roleOf('tax_invoice'), 'due', 'ใบกำกับภาษีออกแล้วยังไม่รู้ว่าเก็บเงินได้');
});

test('splitIncome แยก 3 กองตามที่ขึ้นหน้าจอ', () => {
  const split = splitIncome([
    { type: 'quotation', cnt: 7, total: 2062050 },
    { type: 'receipt_tax_invoice', cnt: 1, total: 315000 },
    { type: 'tax_invoice', cnt: 2, total: 100000 },
  ]);
  assert.equal(split.paid, 315000);
  assert.equal(split.due, 100000);
  assert.equal(split.quote, 2062050);
  assert.equal(split.quoteCount, 7);
  assert.equal(split.dueCount, 2);
});

test('ยอดจริงที่เคยผิด: 7 ใบเสนอราคา + ใบเสร็จ 1 ใบ = รายรับ 3,150 ไม่ใช่ 23,770.50', async () => {
  const db = freshDb();
  const quotes = [315000, 337050, 150000, 150000, 710000, 250000, 150000];
  quotes.forEach((t, i) => doc(db, { type: 'quotation', no: `QT19106900${i + 1}`, date: '2026-10-19', total: t }));
  doc(db, { type: 'receipt_tax_invoice', no: 'RT191069001', date: '2026-10-19', total: 315000, vat: 20607 });

  const s = await monthSummary(db, '2026-10');
  const split = splitIncome(s.byType);

  assert.equal(split.paid, 315000, 'รายรับต้องเป็น 3,150.00 บาท');
  assert.equal(split.quote, 2062050);
  // ยอดรวมดิบที่เคยเอาไปโชว์ผิด เก็บไว้เทียบให้เห็นว่าต่างกันแค่ไหน
  assert.equal(s.byType.reduce((a, r) => a + r.total, 0), 2377050);
});

test('ใบเสนอราคาที่แปลงเป็นใบเสร็จแล้ว ต้องไม่ถูกนับซ้ำ', async () => {
  const db = freshDb();
  doc(db, { type: 'quotation', no: 'QT001', date: '2026-10-05', total: 315000 });
  doc(db, { type: 'receipt', no: 'RC001', date: '2026-10-07', total: 315000 });   // งานเดียวกัน

  const split = splitIncome((await monthSummary(db, '2026-10')).byType);
  assert.equal(split.paid, 315000, 'นับครั้งเดียว ไม่ใช่ 6,300');
});

test('กราฟย้อนหลังนับเฉพาะเงินที่เข้าแล้วเหมือนกัน', async () => {
  const db = freshDb();
  doc(db, { type: 'quotation', no: 'QT09', date: '2026-09-10', total: 500000 });
  doc(db, { type: 'receipt', no: 'RC09', date: '2026-09-20', total: 120000 });
  doc(db, { type: 'quotation', no: 'QT10', date: '2026-10-02', total: 800000 });

  const { income } = await monthlyTrend(db, '2026-09');
  const by = Object.fromEntries(income.map((r) => [r.ym, r.total]));
  assert.equal(by['2026-09'], 120000);
  assert.equal(by['2026-10'], undefined, 'เดือนที่มีแต่ใบเสนอราคาต้องไม่มีรายรับ');
});

test('เอกสารที่ยกเลิกแล้วไม่เข้ายอดทั้งสองทาง', async () => {
  const db = freshDb();
  doc(db, { type: 'receipt', no: 'RC100', date: '2026-10-08', total: 400000, status: 'void' });
  doc(db, { type: 'receipt', no: 'RC101', date: '2026-10-09', total: 250000 });

  const s = await monthSummary(db, '2026-10');
  assert.equal(splitIncome(s.byType).paid, 250000);
  assert.equal(s.voidCount, 1);
  const { income } = await monthlyTrend(db, '2026-10');
  assert.equal(income[0].total, 250000);
});
