// ตั้งต้นทุน/ราคาขายย้อนหลัง โดยไม่แตะจำนวนคงเหลือ
// เทสนี้เรียกฟังก์ชันใน src/db.js ของจริง ผ่านตัวแทน D1 บน sqlite (test/d1.js)
// จุดที่ต้องกัน: ตั้งต้นทุนแล้วราคาขายเดิมหาย หรือจำนวนคงเหลือขยับตาม
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './d1.js';
import { upsertProduct, findProduct, receiveStock, stockOf, listStock, stockValue } from '../src/db.js';
import { toSatang } from '../src/money.js';

test('รับเข้าโดยไม่บอกต้นทุน แล้วมาตั้งทีหลังได้ จำนวนไม่ขยับ', async () => {
  const db = freshDb();
  const { product, after } = await receiveStock(db, { name: 'โบว์แบบที่1', qty: 1, unit_cost: null });
  assert.equal(product.cost, null);
  assert.equal(after.qty, 1);

  await upsertProduct(db, { name: 'โบว์แบบที่1', cost: toSatang(45) });

  const s = await stockOf(db, product.id);
  assert.equal(s.cost, 4500);
  assert.equal(s.qty, 1, 'ตั้งต้นทุนแล้วจำนวนคงเหลือต้องเท่าเดิม');
  const moves = await db.prepare('SELECT COUNT(*) AS n FROM stock_moves').first();
  assert.equal(moves.n, 1, 'ตั้งราคาต้องไม่สร้างรายการเดินของเพิ่ม');
});

test('ตั้งต้นทุนอย่างเดียว ราคาขายเดิมไม่หาย', async () => {
  const db = freshDb();
  await upsertProduct(db, { name: 'โบว์แดง', cost: toSatang(45), price: toSatang(99) });
  await upsertProduct(db, { name: 'โบว์แดง', cost: toSatang(50) });     // ส่งมาเฉพาะต้นทุน
  const p = await findProduct(db, 'โบว์แดง');
  assert.equal(p.cost, 5000);
  assert.equal(p.price, 9900, 'ราคาขายเดิมต้องอยู่ครบ');
});

test('ตั้งราคาขายอย่างเดียว ต้นทุนเดิมไม่หาย', async () => {
  const db = freshDb();
  await upsertProduct(db, { name: 'โบว์ทอง', cost: toSatang(62), price: toSatang(149) });
  await upsertProduct(db, { name: 'โบว์ทอง', price: toSatang(159) });
  const p = await findProduct(db, 'โบว์ทอง');
  assert.equal(p.cost, 6200, 'ต้นทุนเดิมต้องอยู่ครบ');
  assert.equal(p.price, 15900);
});

test('ชื่อเว้นวรรคต่างกันถือเป็นตัวเดียว ไม่เกิดรายการซ้ำ', async () => {
  const db = freshDb();
  await receiveStock(db, { name: 'โบว์ริบบิ้นแดง', qty: 3 });
  await upsertProduct(db, { name: 'โบว์ ริบบิ้น แดง', cost: toSatang(45) });
  const rows = await listStock(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].qty, 3);
  assert.equal(rows[0].cost, 4500);
});

test('มูลค่าสต๊อกนับเฉพาะตัวที่รู้ต้นทุนและมีของเหลือ', async () => {
  const db = freshDb();
  await receiveStock(db, { name: 'มีต้นทุน', qty: 4, unit_cost: toSatang(25) });   // 4 × 25 = 100
  await receiveStock(db, { name: 'ไม่มีต้นทุน', qty: 7 });                          // ไม่นับในมูลค่า
  await receiveStock(db, { name: 'ของหมด', qty: 2, unit_cost: toSatang(30) });
  const gone = await findProduct(db, 'ของหมด');
  await db.prepare("INSERT INTO stock_moves (product_id, delta, reason) VALUES (?,?,'ส่งของ')")
    .bind(gone.id, -2).run();

  const v = await stockValue(db);
  assert.equal(v.value, 10000, 'ของหมดแล้วต้องไม่ถูกนับในมูลค่า');
  assert.equal(v.unpriced, 1);
});

test('ตั้งราคาให้ของที่ยังไม่มีในระบบ ต้องหาไม่เจอ (กันพิมพ์ชื่อผิดแล้วเกิดรายการผี)', async () => {
  const db = freshDb();
  await receiveStock(db, { name: 'โบว์แบบที่1', qty: 1 });
  assert.equal(await findProduct(db, 'โบว์แบบที่11'), null);
});
