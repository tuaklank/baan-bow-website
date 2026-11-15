// สมุดจดออเดอร์โบว์: จด แก้ ลบ และดูเป็นตาราง — ทุกอย่างสั่งทางไลน์
// ที่ต้องคุมให้แน่คือ (1) แก้แล้วเลขออเดอร์ต้องคงเดิมและของเดิมยังย้อนดูได้
// (2) ลบแล้วหายจากตารางและยอดรวม แต่แถวยังอยู่ (3) หน้าตารางเดาลิงก์ไม่ได้
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './d1.js';
import {
  addOrder, orderById, updateOrder, voidOrder, orderEvents,
  monthOrders, recentOrders, orderSheetToken, orderSheetByToken,
} from '../src/db.js';
import { normalizeChannel } from '../src/config.js';
import { handleText, doAddOrder, doEditOrder, doVoidOrder, doMarkPaid, doOrderFields, doViewOrders } from '../src/handlers.js';
import { renderOrderSheet, summarizeOrders } from '../src/order-sheet.js';
import { renderAdmin } from '../src/admin.js';
import { todayBkk, monthBkk } from '../src/thai.js';

const order = (over = {}) => ({
  order_date: '2026-11-15', style: 'แบบที่ 2', channel: 'Line', detail: null,
  customer: 'คุณเอ', price: 290000, ...over,
});

// ---------- ฐานข้อมูล ----------

test('จดออเดอร์ได้แม้รู้แค่แบบโบว์ ช่องอื่นเว้นว่างไว้เติมทีหลัง', async () => {
  const db = freshDb();
  const row = await addOrder(db, { order_date: '2026-11-15', style: 'ML' });
  assert.equal(row.style, 'ML');
  assert.equal(row.channel, null);
  assert.equal(row.detail, null);
  assert.equal(row.customer, null);
  assert.equal(row.price, null, 'ยังไม่รู้ราคาต้องเป็นค่าว่าง ไม่ใช่ 0 — 0 บาทคือของแถม');
  assert.equal(row.status, 'recorded');
});

test('แก้ทีละช่องได้ เลขออเดอร์คงเดิม ช่องที่ไม่ได้แก้ไม่ถูกแตะ', async () => {
  const db = freshDb();
  const row = await addOrder(db, order());

  const a = await updateOrder(db, row.id, { detail: 'แดง/ทอง' }, 'รายละเอียด: - → แดง/ทอง');
  assert.equal(a.id, row.id);
  assert.equal(a.detail, 'แดง/ทอง');
  assert.equal(a.price, 290000);
  assert.equal(a.customer, 'คุณเอ');

  const b = await updateOrder(db, row.id, { price: 320000, channel: 'FB' }, 'ราคา/ช่องทาง');
  assert.equal(b.price, 320000);
  assert.equal(b.channel, 'FB');
  assert.equal(b.detail, 'แดง/ทอง', 'ช่องที่แก้รอบก่อนต้องยังอยู่');

  // ของเดิมย้อนดูได้จากประวัติ — นี่คือสิ่งที่แลกมากับการแก้ทับแถวเดิม
  assert.deepEqual((await orderEvents(db, row.id)).map((e) => e.text), [
    'รายละเอียด: - → แดง/ทอง', 'ราคา/ช่องทาง',
  ]);
});

test('ลบแล้วหายจากตารางเดือนและยอดรวม แต่แถวยังอยู่', async () => {
  const db = freshDb();
  const keep = await addOrder(db, order());
  const gone = await addOrder(db, order({ style: 'mini', price: 47500 }));

  assert.equal(await voidOrder(db, gone.id, 'ลูกค้าเปลี่ยนใจ'), true);
  assert.equal(await voidOrder(db, gone.id, 'ซ้ำ'), false, 'ลบซ้ำไม่ได้');

  assert.deepEqual((await monthOrders(db, '2026-11')).map((r) => r.id), [keep.id]);

  const row = await orderById(db, gone.id);
  assert.equal(row.status, 'void');
  assert.equal(row.void_reason, 'ลูกค้าเปลี่ยนใจ');
  assert.equal(row.price, 47500, 'ราคาเดิมต้องไม่ถูกแก้');
  assert.equal((await recentOrders(db)).length, 2, 'หน้าหลังบ้านยังต้องเห็นทั้งสองแถว');

  // ลบไปแล้วแก้ไม่ได้ ไม่งั้นแถวที่ไม่นับในยอดจะเปลี่ยนไปเงียบๆ
  assert.equal(await updateOrder(db, gone.id, { price: 1 }, 'x'), null);
});

test('ตารางเดือนเรียงตามวันที่ และไม่ปนเดือนอื่น', async () => {
  const db = freshDb();
  await addOrder(db, order({ order_date: '2026-11-20', style: 'C' }));
  await addOrder(db, order({ order_date: '2026-11-03', style: 'A' }));
  await addOrder(db, order({ order_date: '2026-10-31', style: 'เดือนก่อน' }));
  await addOrder(db, order({ order_date: '2026-11-03', style: 'B' }));
  assert.deepEqual((await monthOrders(db, '2026-11')).map((r) => r.style), ['A', 'B', 'C']);
});

test('ลิงก์ตารางของเดือนเดียวกันเหมือนเดิมทุกครั้ง คนละเดือนคนละลิงก์ และเดาไม่ได้', async () => {
  const db = freshDb();
  const nov = await orderSheetToken(db, '2026-11');
  assert.match(nov, /^[0-9a-f]{32}$/);
  assert.equal(await orderSheetToken(db, '2026-11'), nov);
  assert.notEqual(await orderSheetToken(db, '2026-12'), nov);
  assert.equal((await orderSheetByToken(db, nov)).ym, '2026-11');
  assert.equal(await orderSheetByToken(db, '0'.repeat(32)), null);
});

// ---------- ช่องทาง ----------

test('ช่องทางที่พิมพ์ได้หลายแบบ ลงตารางเป็นชื่อเดียวกัน', () => {
  for (const w of ['ไลน์', 'ทางไลน์', 'LINE', 'line']) assert.equal(normalizeChannel(w), 'Line', w);
  for (const w of ['เฟส', 'FB', 'facebook', 'ทางเฟสบุ๊ค']) assert.equal(normalizeChannel(w), 'FB', w);
  for (const w of ['shop', 'Shopee', 'ช้อปปี้']) assert.equal(normalizeChannel(w), 'Shop', w);
  for (const w of ['ไลฟ์', 'Live', 'ไลฟ์สด']) assert.equal(normalizeChannel(w), 'Live', w);
  assert.equal(normalizeChannel('TikTok'), 'TikTok', 'ช่องทางที่ไม่รู้จักเก็บตามที่พิมพ์ ไม่ทิ้ง');
  assert.equal(normalizeChannel(''), null);
  assert.equal(normalizeChannel(null), null);
});

// ---------- หน้าตาราง ----------

const row = (over = {}) => ({
  order_date: '2026-11-15', style: 'ML', channel: null, detail: null, customer: null,
  price: null, paid_at: null, wage: null, wage_paid_at: null, ...over,
});

test('หน้าตาราง: ลำดับช่องตามที่ขอ — ช่องทางติดผู้สั่ง แล้วราคา/จ่ายแล้ว แล้วค่าจ้าง/จ่ายแล้ว', () => {
  const rows = [
    row({ id: 24, style: 'แบบที่ 2', channel: 'Line', detail: 'แดง/ทอง', customer: 'คุณเอ', price: 290000, paid_at: '2026-11-15' }),
    row({ id: 25, style: '<script>x</script>' }),
  ];
  const page = renderOrderSheet({ ym: '2026-11', rows, today: '2026-11-15' });

  const main = page.slice(page.indexOf('<table class="orders">'), page.indexOf('</thead>'));
  const heads = [...main.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, [
    'เลขที่', 'วันที่', 'แบบโบว์', 'รายละเอียด', 'ช่องทาง', 'ผู้สั่ง', 'ราคา', 'จ่ายแล้ว', 'ค่าจ้างทำ', 'จ่ายแล้ว',
  ]);

  assert.ok(page.includes('พฤศจิกายน 2569'));
  assert.ok(page.includes('2,900.00'));
  assert.ok(page.includes('<b>2 ชิ้น</b>'));
  assert.ok(page.includes('<b>1 ชิ้น</b>'), 'ต้องบอกว่ามีกี่ชิ้นที่ยังไม่มีผู้สั่ง');
  assert.ok(page.includes('1 / 2'), 'ต้องบอกว่าจ่ายแล้วกี่ชิ้นจากทั้งหมด');
  assert.ok(!page.includes('<script>x'), 'ชื่อแบบโบว์ที่พิมพ์มาต้องถูก escape');
  assert.ok(page.includes('บันทึก PDF'));
});

test('ช่องติ๊กว่างไว้เป็นกรอบเปล่า ติ๊กถูกเฉพาะที่แจ้งว่าจ่าย ลูกค้าจ่ายกับจ่ายค่าจ้างแยกกัน', () => {
  const rows = [
    row({ id: 1 }),
    row({ id: 2, channel: 'FB', customer: 'คุณซี', price: 390000, paid_at: '2026-11-16', wage: 15000 }),
    row({ id: 3, price: 390000, wage: 15000, wage_paid_at: '2026-11-16' }),
  ];
  const page = renderOrderSheet({ ym: '2026-11', rows, today: '2026-11-16' });
  const [r1, r2, r3] = page.match(/<tr><td class="c">\d+<\/td>.*<\/tr>/g);
  const ticks = (r) => [...r.matchAll(/<span class="tick( on)?">/g)].map((m) => Boolean(m[1]));

  assert.deepEqual(ticks(r1), [false, false], 'สั่งมาใหม่ = กรอบเปล่าทั้งสองช่อง');
  assert.deepEqual(ticks(r2), [true, false], 'ลูกค้าจ่ายแล้ว แต่ยังไม่ได้จ่ายค่าจ้าง');
  assert.deepEqual(ticks(r3), [false, true], 'จ่ายค่าจ้างแล้ว แต่ลูกค้ายังไม่จ่าย');
  // โบว์ที่สั่งมาไว้ก่อน ช่องทาง/ผู้สั่ง/รายละเอียด/ราคา/ค่าจ้าง ต้องว่างจริงๆ รอเติม ไม่ใส่ขีด
  assert.ok(r1.includes('<td></td><td></td><td></td><td class="r"></td>'));
  assert.ok(r1.includes('<td class="r out"></td>'));
  assert.ok(r2.includes('<td class="r out">150.00</td>'));
});

test('สรุปยอด: ราคาขาย ค่าจ้าง ส่วนที่จ่ายแล้ว/ยังไม่จ่าย และแยกตามแบบโบว์', () => {
  const rows = [
    row({ id: 1, style: 'ML', customer: 'คุณเอ', price: 390000, paid_at: '2026-11-15', wage: 15000, wage_paid_at: '2026-11-15' }),
    row({ id: 2, style: 'ML', customer: 'คุณบี', price: 390000, wage: 15000 }),
    row({ id: 3, style: 'ML', price: 390000, wage: 15000 }),
    row({ id: 4, style: 'mini', customer: 'คุณซี', price: 47500, paid_at: '2026-11-15', wage: 5000 }),
    row({ id: 5, style: 'mini' }),   // ยังไม่ใส่ทั้งราคาและค่าจ้าง
  ];
  const s = summarizeOrders(rows);

  assert.equal(s.count, 5);
  assert.equal(s.free, 2);
  assert.equal(s.price, 390000 * 3 + 47500);
  assert.equal(s.pricePaid, 390000 + 47500);
  assert.equal(s.paidCount, 2);
  assert.equal(s.wage, 15000 * 3 + 5000);
  assert.equal(s.wagePaid, 15000);
  assert.equal(s.wagePaidCount, 1);
  assert.equal(s.noPrice, 1);
  assert.equal(s.noWage, 1);
  assert.deepEqual(s.byStyle, [
    { style: 'ML', count: 3, taken: 2, paid: 1, price: 1170000, wage: 45000 },
    { style: 'mini', count: 2, taken: 1, paid: 1, price: 47500, wage: 5000 },
  ]);

  // ตัวเลขชุดเดียวกันต้องขึ้นบนหน้าตาราง
  const page = renderOrderSheet({ ym: '2026-11', rows, today: '2026-11-15' });
  for (const n of ['12,175.00', '4,375.00', '7,800.00', '500.00', '150.00', '350.00', '11,675.00']) {
    assert.ok(page.includes(n), `ไม่พบยอด ${n} ในสรุป`);
  }
  assert.ok(page.includes('สรุปตามแบบโบว์'));
  assert.ok(page.includes('ยังไม่ใส่ราคา 1 ชิ้น · ยังไม่ใส่ค่าจ้าง 1 ชิ้น'));
});

test('หน้าหลังบ้านมีแท็บออเดอร์ และโชว์ที่ลบแล้วแบบขีดฆ่า', () => {
  const orders = [
    { id: 2, order_date: '2026-11-15', style: 'mini', channel: 'Shop', detail: null, customer: null, price: 47500, status: 'void' },
    { id: 1, order_date: '2026-11-15', style: 'ML', channel: 'FB', detail: 'แดง', customer: 'คุณซี', price: 390000, status: 'recorded' },
  ];
  const page = renderAdmin({
    tab: 'orders', today: '2026-11-15', jobs: [], docs: [], orders, monthOrd: [orders[1]],
  });
  assert.ok(page.includes('href="/admin?tab=orders"'));
  assert.ok(page.includes('3,900.00'));
  assert.ok(page.includes('<tr class="void">'));
});

// ---------- คำสั่งทางไลน์ (ทางที่ไม่ต้องเรียก AI) ----------

const env = (db) => ({ DB: db, ALLOWED_USER_IDS: 'U1', BASE_URL: 'https://example.test' });

test('พิมพ์ "ออเดอร์" ได้ลิงก์ตารางของเดือนนี้ ไม่ใช่รายการยาวในแชต', async () => {
  const db = freshDb();
  const today = todayBkk();
  await addOrder(db, order({ order_date: today }));
  await addOrder(db, order({ order_date: today, style: 'mini', price: null }));

  const answer = await handleText(env(db), 'U1', 'ออเดอร์');
  const token = await orderSheetToken(db, monthBkk());
  assert.ok(answer.includes(`https://example.test/d/${token}`));
  assert.ok(answer.includes('2 รายการ'));
  assert.ok(answer.includes('ราคาขายรวม 2,900.00'));
  assert.ok(answer.includes('ค่าจ้างทำรวม 0.00'));
  assert.ok(answer.includes('ยังไม่ใส่ราคา 1 รายการ'));
  assert.ok(answer.split('\n').length <= 14, 'คำตอบมีแค่ยอดสรุป รายการทีละชิ้นอยู่ในหน้าตาราง');
  assert.ok(!answer.includes('คุณเอ'), 'ไม่พิมพ์รายการทีละออเดอร์ลงแชต');
});

test('เดือนที่ยังไม่มีออเดอร์ บอกวิธีจด ไม่ส่งลิงก์ตารางเปล่า', async () => {
  const answer = await handleText(env(freshDb()), 'U1', 'ออเดอร์');
  assert.ok(answer.includes('ยังไม่มีออเดอร์'));
  assert.ok(!answer.includes('/d/'));
});

// ---------- คำสั่งทางไลน์ (หลังจาก AI อ่านข้อความเป็นคำสั่งแล้ว) ----------
// cmd ข้างล่างคือรูปที่ ai.js คืนมาหลัง normalize — ช่องที่ผู้ใช้ไม่ได้พูดถึงเป็น null หรือ 0

const cmdOrder = (o = {}) => ({
  order: { id: 0, style: null, channel: null, detail: null, customer: null, price: 0, order_date: null, ...o },
  customer: { name: null }, job: { ref: null }, query: null, note: null,
});

test('จดจากประโยคตัวอย่าง: แบบที่ 2 คุณเอ ทางไลน์ 2,900 — ได้ครบช่อง และบอกช่องที่ยังขาด', async () => {
  const db = freshDb();
  const answer = await doAddOrder(env(db), cmdOrder({
    style: 'แบบที่ 2', channel: 'ทางไลน์', customer: 'คุณเอ', price: 2900,
  }));
  const row = await orderById(db, 1);
  assert.equal(row.style, 'แบบที่ 2');
  assert.equal(row.channel, 'Line');
  assert.equal(row.customer, 'คุณเอ');
  assert.equal(row.price, 290000, 'ราคาเก็บเป็นสตางค์');
  assert.equal(row.order_date, todayBkk(), 'ไม่บอกวัน = วันนี้');

  assert.ok(answer.includes('#1'));
  assert.ok(answer.includes('2,900.00 บาท'));
  assert.ok(answer.includes('ยังไม่มี: รายละเอียด'), 'ต้องบอกว่ายังขาดช่องไหน จะได้เติมต่อ');
  assert.ok(answer.includes('https://example.test/d/'), 'ต้องมีลิงก์ตารางให้เปิดดู');
});

test('ไม่บอกแบบโบว์ ไม่จด และถามกลับ', async () => {
  const db = freshDb();
  const answer = await doAddOrder(env(db), cmdOrder({ customer: 'คุณเอ', price: 2900 }));
  assert.ok(answer.includes('โบว์แบบไหน'));
  assert.equal((await recentOrders(db)).length, 0);
});

test('เติมและแก้ทีละช่องผ่านคำสั่ง ตอบกลับบอกว่าอะไรเปลี่ยนจากอะไรเป็นอะไร', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'แบบที่ 2', channel: 'line', customer: 'คุณเอ', price: 2900 }));

  const a = await doEditOrder(env(db), cmdOrder({ id: 1, detail: 'สีแดงทอง' }));
  assert.ok(a.includes('รายละเอียด: - → สีแดงทอง'));

  const b = await doEditOrder(env(db), cmdOrder({ id: 1, price: 3200, channel: 'เฟส', customer: 'คุณบี', style: 'ML' }));
  assert.ok(b.includes('ราคา: 2,900.00 → 3,200.00'));
  assert.ok(b.includes('ช่องทาง: Line → FB'));
  assert.ok(b.includes('ผู้สั่ง: คุณเอ → คุณบี'));
  assert.ok(b.includes('แบบ: แบบที่ 2 → ML'));

  const row = await orderById(db, 1);
  assert.deepEqual(
    [row.style, row.channel, row.detail, row.customer, row.price],
    ['ML', 'FB', 'สีแดงทอง', 'คุณบี', 320000],
  );
  assert.equal((await orderEvents(db, 1)).length, 2);
});

test('แก้เป็นค่าเดิม ไม่นับเป็นการแก้ และไม่ทิ้งประวัติปลอม', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', price: 3900 }));
  const answer = await doEditOrder(env(db), cmdOrder({ id: 1, price: 3900 }));
  assert.ok(answer.includes('ไม่มีอะไรเปลี่ยน'));
  assert.equal((await orderEvents(db, 1)).length, 0);
});

test('แก้ออเดอร์ที่ไม่มี หรือไม่บอกเลข — บอกให้รู้ ไม่เงียบ', async () => {
  const db = freshDb();
  assert.ok((await doEditOrder(env(db), cmdOrder({ id: 99, price: 100 }))).includes('ไม่พบออเดอร์ #99'));
  assert.ok((await doEditOrder(env(db), cmdOrder({ price: 100 }))).includes('ระบุเลขออเดอร์'));
});

test('ลบต้องยืนยันก่อน — ขอลบเฉยๆ ออเดอร์ยังอยู่ พิมพ์ยืนยันแล้วจึงหาย', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', customer: 'คุณซี', price: 3900 }));

  const ask = await doVoidOrder(env(db), 'U1', { ...cmdOrder({ id: 1 }), note: 'ลูกค้าเปลี่ยนใจ' });
  assert.ok(ask.includes('พิมพ์ "ยืนยัน"'));
  assert.equal((await orderById(db, 1)).status, 'recorded');

  const done = await handleText(env(db), 'U1', 'ยืนยัน');
  assert.ok(done.includes('ลบออเดอร์ #1 แล้ว'));
  const row = await orderById(db, 1);
  assert.equal(row.status, 'void');
  assert.equal(row.void_reason, 'ลูกค้าเปลี่ยนใจ');

  // ลบแล้วแก้ต่อไม่ได้ และลบซ้ำก็บอกว่าลบไปแล้ว
  assert.ok((await doEditOrder(env(db), cmdOrder({ id: 1, price: 1 }))).includes('ถูกยกเลิกไปแล้ว'));
  assert.ok((await doVoidOrder(env(db), 'U1', cmdOrder({ id: 1 }))).includes('ถูกยกเลิกไปแล้ว'));
});

// ---------- สั่งโบว์มาไว้ก่อนทีละหลายชิ้น ยังไม่มีลูกค้า ----------

test('สั่งแบบเดียว 10 ชิ้น ได้ 10 แถวเลขเรียงกัน ช่องทางกับผู้สั่งว่างทุกแถว', async () => {
  const db = freshDb();
  const answer = await doAddOrder(env(db), cmdOrder({ style: 'ML', detail: 'แดงทอง', qty: 10, price: 3900 }));

  const rows = await monthOrders(db, monthBkk());
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const r of rows) {
    assert.deepEqual([r.style, r.detail, r.channel, r.customer, r.price, r.paid_at],
      ['ML', 'แดงทอง', null, null, 390000, null]);
  }
  assert.ok(answer.includes('10 ชิ้น'));
  assert.ok(answer.includes('#1–#10 ML แดงทอง ×10'));
  assert.ok(answer.includes('ช่องทางกับผู้สั่งว่างไว้ก่อน'));
});

test('สั่งหลายแบบในข้อความเดียว แต่ละแบบได้ช่วงเลขของตัวเอง', async () => {
  const db = freshDb();
  const cmd = {
    ...cmdOrder(),
    items: [
      { name: 'ML', note: 'แดงทอง', qty: 10, unit_price: 3900 },
      { name: 'mini', note: null, qty: 5, unit_price: 0 },
      { name: 'ดอกไม้', note: 'ทองล้วน', qty: 1, unit_price: 4400 },
    ],
  };
  const answer = await doAddOrder(env(db), cmd);

  const rows = await monthOrders(db, monthBkk());
  assert.equal(rows.length, 16);
  assert.equal(rows.filter((r) => r.style === 'ML').length, 10);
  assert.equal(rows.filter((r) => r.style === 'mini').length, 5);
  assert.equal(rows.find((r) => r.style === 'mini').price, null, 'ไม่บอกราคา = ว่าง ไม่ใช่ 0');
  assert.equal(rows[15].style, 'ดอกไม้');
  assert.ok(answer.includes('#1–#10 ML แดงทอง ×10'));
  assert.ok(answer.includes('#11–#15 mini ×5'));
  assert.ok(answer.includes('#16 ดอกไม้ ทองล้วน ×1'));
});

test('พิมพ์จำนวนเกิน 200 ชิ้น ไม่จดและถามกลับ — กันพิมพ์เลขเกิน', async () => {
  const db = freshDb();
  const answer = await doAddOrder(env(db), cmdOrder({ style: 'ML', qty: 1000 }));
  assert.ok(answer.includes('เกินที่จดได้ต่อครั้ง'));
  assert.equal((await recentOrders(db)).length, 0);
});

test('มีลูกค้ามาสั่งทีหลัง เติมช่องทางกับผู้สั่งลงชิ้นที่สั่งมาไว้ได้', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', qty: 3 }));
  const answer = await doEditOrder(env(db), cmdOrder({ id: 2, customer: 'คุณเอ', channel: 'ทางไลน์' }));
  assert.ok(answer.includes('ผู้สั่ง: - → คุณเอ'));
  assert.ok(answer.includes('ช่องทาง: - → Line'));

  const rows = await monthOrders(db, monthBkk());
  assert.deepEqual(rows.map((r) => r.customer), [null, 'คุณเอ', null], 'ชิ้นอื่นต้องยังว่างอยู่');
});

// ---------- จ่ายแล้ว ----------

test('จดใหม่ช่องจ่ายแล้วว่างเสมอ แจ้งว่าจ่ายเมื่อไหร่จึงติ๊ก และเอาติ๊กออกได้', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', customer: 'คุณเอ', price: 3900 }));
  assert.equal((await orderById(db, 1)).paid_at, null);

  const a = await doEditOrder(env(db), cmdOrder({ id: 1, paid: 'paid' }));
  assert.ok(a.includes('จ่ายแล้ว: - → ✓'));
  assert.equal((await orderById(db, 1)).paid_at, todayBkk());

  // แจ้งซ้ำ ไม่นับเป็นการแก้
  assert.ok((await doEditOrder(env(db), cmdOrder({ id: 1, paid: 'paid' }))).includes('ไม่มีอะไรเปลี่ยน'));

  const b = await doEditOrder(env(db), cmdOrder({ id: 1, paid: 'unpaid' }));
  assert.ok(b.includes('จ่ายแล้ว: ✓ → -'));
  assert.equal((await orderById(db, 1)).paid_at, null);
});

test('ติ๊กจ่ายแล้วทีละหลายออเดอร์ด้วยข้อความเดียว ทั้งแบบไล่เลขและแบบช่วง', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', qty: 6 }));

  const a = await handleText(env(db), 'U1', 'ออเดอร์ 1 3 จ่ายแล้ว');
  assert.ok(a.includes('ติ๊กจ่ายแล้ว 2 ออเดอร์: #1 #3'));

  const b = await handleText(env(db), 'U1', 'ออเดอร์ 3-5 โอนแล้ว');
  assert.ok(b.includes('ติ๊กจ่ายแล้ว 2 ออเดอร์: #4 #5'));
  assert.ok(b.includes('เป็นแบบนั้นอยู่แล้ว: #3'));

  const paid = (await monthOrders(db, monthBkk())).filter((r) => r.paid_at).map((r) => r.id);
  assert.deepEqual(paid, [1, 3, 4, 5]);

  const c = await handleText(env(db), 'U1', 'ออเดอร์ 1 ยังไม่จ่าย');
  assert.ok(c.includes('เอาติ๊กจ่ายแล้วออก 1 ออเดอร์: #1'));
  assert.equal((await orderById(db, 1)).paid_at, null);

  const d = await handleText(env(db), 'U1', 'ออเดอร์ 99 จ่ายแล้ว');
  assert.ok(d.includes('ไม่พบหรือถูกลบแล้ว: #99'));
});

test('ข้อความออเดอร์ที่ไม่ใช่เรื่องจ่ายเงิน ไม่ถูกทางลัดจ่ายแล้วดักไว้', async () => {
  const db = freshDb();
  assert.equal(await doMarkPaid(env(db), 'ออเดอร์ 24 สีแดงทอง'), null);
  assert.equal(await doMarkPaid(env(db), 'ออเดอร์ 24 ราคา 3200'), null);
  assert.equal(await doMarkPaid(env(db), 'ออเดอร์ จ่ายแล้ว'), null);
});

// ---------- ค่าจ้างทำโบว์ ----------

test('ใส่ค่าจ้างทำให้หลายชิ้นพร้อมกัน แล้วติ๊กจ่ายค่าจ้างทีหลัง — ไม่แตะช่องลูกค้าจ่าย', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', qty: 4, price: 3900 }));

  const a = await handleText(env(db), 'U1', 'ออเดอร์ 1-3 ค่าจ้าง 150');
  assert.ok(a.includes('ใส่ค่าจ้างทำชิ้นละ 150.00 3 ออเดอร์: #1–#3'));
  let rows = await monthOrders(db, monthBkk());
  assert.deepEqual(rows.map((r) => r.wage), [15000, 15000, 15000, null]);
  assert.ok(rows.every((r) => r.wage_paid_at == null), 'ใส่ราคาค่าจ้างเฉยๆ ยังไม่ถือว่าจ่าย');

  const b = await handleText(env(db), 'U1', 'ออเดอร์ 1 2 จ่ายค่าจ้างแล้ว');
  assert.ok(b.includes('ติ๊กจ่ายค่าจ้างแล้ว 2 ออเดอร์: #1 #2'));
  rows = await monthOrders(db, monthBkk());
  assert.deepEqual(rows.map((r) => Boolean(r.wage_paid_at)), [true, true, false, false]);
  assert.ok(rows.every((r) => r.paid_at == null), 'จ่ายค่าจ้างต้องไม่ไปติ๊กช่องลูกค้าจ่าย');

  const c = await handleText(env(db), 'U1', 'ออเดอร์ 1 ยังไม่จ่ายค่าจ้าง');
  assert.ok(c.includes('เอาติ๊กจ่ายค่าจ้างแล้วออก 1 ออเดอร์: #1'));
  assert.equal((await orderById(db, 1)).wage_paid_at, null);
  assert.equal((await orderById(db, 1)).wage, 15000, 'เอาติ๊กออก ราคาค่าจ้างต้องยังอยู่');
});

test('ใส่ค่าจ้างพร้อมบอกว่าจ่ายแล้วในข้อความเดียว', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'mini', qty: 2 }));
  const a = await handleText(env(db), 'U1', 'ออเดอร์ 1-2 ค่าจ้างชิ้นละ 50 บาท จ่ายแล้ว');
  assert.ok(a.includes('ใส่ค่าจ้างทำชิ้นละ 50.00 + ติ๊กจ่ายค่าจ้างแล้ว 2 ออเดอร์'));
  const rows = await monthOrders(db, monthBkk());
  assert.deepEqual(rows.map((r) => [r.wage, Boolean(r.wage_paid_at), r.paid_at]), [[5000, true, null], [5000, true, null]]);
});

test('"จ่ายแล้ว" เฉยๆ คือลูกค้าจ่าย ไม่ใช่จ่ายค่าจ้าง', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', price: 3900, wage: 150 }));
  await handleText(env(db), 'U1', 'ออเดอร์ 1 จ่ายแล้ว');
  const r = await orderById(db, 1);
  assert.equal(r.paid_at, todayBkk());
  assert.equal(r.wage_paid_at, null);
  assert.equal(r.wage, 15000, 'ค่าจ้างที่บอกมาตอนสั่งต้องถูกเก็บ');
});

test('แก้ค่าจ้างและติ๊กจ่ายค่าจ้างผ่านคำสั่งที่ AI อ่านมา', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML' }));
  const a = await doEditOrder(env(db), cmdOrder({ id: 1, wage: 200, wage_paid: 'paid' }));
  assert.ok(a.includes('ค่าจ้างทำ: - → 200.00'));
  assert.ok(a.includes('จ่ายค่าจ้างแล้ว: - → ✓'));
  const r = await orderById(db, 1);
  assert.deepEqual([r.wage, r.wage_paid_at, r.paid_at], [20000, todayBkk(), null]);
});

// ---------- แพตเทิร์นตายตัว: แก้ทีละช่องและเรียกดู (ไม่ผ่าน AI) ----------

test('แก้ด้วยชื่อช่องนำหน้า: หลายช่องในข้อความเดียว ตอบสั้นไม่แนบลิงก์', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', qty: 3 }));

  const a = await handleText(env(db), 'U1', 'ออเดอร์ 2 ผู้สั่ง คุณเอ ช่องทาง ไลน์ ราคา 2,900 บาท');
  assert.ok(a.startsWith('✅ แก้ออเดอร์ #2 แล้ว'));
  assert.ok(a.includes('ผู้สั่ง คุณเอ · ช่องทาง Line · ราคา 2,900.00'));
  assert.ok(!a.includes('/d/'), 'แก้แล้วไม่ต้องส่งลิงก์ตารางกลับมาทุกครั้ง');
  assert.ok(a.split('\n').length <= 2, 'คำตอบต้องสั้น');

  const r = await orderById(db, 2);
  assert.deepEqual([r.customer, r.channel, r.price, r.style], ['คุณเอ', 'Line', 290000, 'ML']);
  assert.equal((await orderById(db, 1)).customer, null, 'ชิ้นอื่นต้องไม่ถูกแตะ');
});

test('แก้ทีละช่อง: แบบ รายละเอียด วันที่ ค่าจ้าง และลบค่าด้วย -', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', customer: 'คุณเอ' }));
  const e = env(db);

  await handleText(e, 'U1', 'ออเดอร์ 1 แบบที่ 2');
  await handleText(e, 'U1', 'ออเดอร์ 1 รายละเอียด แดงทอง ราคาพิเศษ');
  await handleText(e, 'U1', 'ออเดอร์ 1 วันที่ 12/11/69');
  await handleText(e, 'U1', 'ออเดอร์ 1 ค่าจ้าง 150');
  let r = await orderById(db, 1);
  assert.equal(r.style, 'แบบที่ 2');
  assert.equal(r.detail, 'แดงทอง ราคาพิเศษ', 'คำว่าราคาที่ติดอยู่ในรายละเอียดต้องไม่ถูกอ่านเป็นช่องราคา');
  assert.equal(r.order_date, '2026-11-12');
  assert.equal(r.wage, 15000);

  const c = await handleText(e, 'U1', 'ออเดอร์ 1 ผู้สั่ง -');
  assert.ok(c.includes('ผู้สั่ง -'));
  r = await orderById(db, 1);
  assert.equal(r.customer, null);
  assert.ok((await orderEvents(db, 1)).some((ev) => ev.text.includes('ผู้สั่ง: คุณเอ → -')), 'ของเดิมต้องย้อนดูได้');
});

test('แก้หลายชิ้นพร้อมกัน พร้อมติ๊กจ่ายท้ายข้อความ', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML', qty: 5 }));
  const a = await handleText(env(db), 'U1', 'ออเดอร์ 1-4 ผู้สั่ง คุณบี ราคา 1500 จ่ายแล้ว');
  assert.ok(a.includes('แก้ออเดอร์ #1–#4 แล้ว (4 ชิ้น)'));
  assert.ok(a.includes('จ่ายแล้ว ✓'));
  const rows = await monthOrders(db, monthBkk());
  assert.deepEqual(rows.map((r) => [r.customer, r.price, Boolean(r.paid_at)]),
    [...Array(4).fill(['คุณบี', 150000, true]), [null, null, false]]);
  assert.ok(rows.every((r) => r.wage_paid_at == null), 'จ่ายแล้วหลังราคาคือลูกค้าจ่าย ไม่ใช่ค่าจ้าง');
});

test('ค่าผิดรูปแบบ: บอกตัวอย่างที่ถูก ไม่แก้อะไร และไม่ส่งต่อให้ AI เดา', async () => {
  const db = freshDb();
  await doAddOrder(env(db), cmdOrder({ style: 'ML' }));
  const a = await handleText(env(db), 'U1', 'ออเดอร์ 1 ราคา แพงมาก');
  assert.ok(a.includes('ราคาต้องเป็นตัวเลข') && a.includes('ออเดอร์ 1 ราคา 2900'));
  assert.equal((await orderById(db, 1)).price, null);
});

test('เรียกดู: ชิ้นเดียว รายชิ้นตามเงื่อนไข และตาราง A4', async () => {
  const db = freshDb();
  const e = env(db);
  await doAddOrder(e, cmdOrder({ style: 'ML', qty: 3 }));
  await doAddOrder(e, cmdOrder({ style: 'mini', qty: 2 }));
  await handleText(e, 'U1', 'ออเดอร์ 1 ผู้สั่ง คุณเอ ช่องทาง Line ราคา 2900 จ่ายแล้ว');
  await handleText(e, 'U1', 'ออเดอร์ 2 ผู้สั่ง คุณบี ราคา 2900');

  const one = await handleText(e, 'U1', 'ออเดอร์ 1');
  assert.ok(one.includes('ออเดอร์ #1') && one.includes('ผู้สั่ง: คุณเอ'));

  const free = await handleText(e, 'U1', 'ออเดอร์ ว่าง');
  assert.ok(free.includes('ยังไม่มีผู้สั่ง') && free.includes('3 ชิ้น'));
  assert.ok(free.includes('#3 ML') && free.includes('#5 mini') && !free.includes('#1 ML'));

  const unpaid = await handleText(e, 'U1', 'ออเดอร์ ยังไม่จ่าย');
  assert.ok(unpaid.includes('#2 ML') && !unpaid.includes('#1 ML') && !unpaid.includes('#3 ML'),
    'ยังไม่จ่าย = มีผู้สั่งแล้วแต่ยังไม่จ่าย ชิ้นที่ยังว่างไม่นับ');

  const style = await handleText(e, 'U1', 'ออเดอร์ แบบ mini');
  assert.ok(style.includes('2 ชิ้น') && style.includes('#4 mini') && !style.includes('ML'));

  const who = await handleText(e, 'U1', 'ออเดอร์ ผู้สั่ง คุณเอ');
  assert.ok(who.includes('1 ชิ้น') && who.includes('#1 ML'));

  assert.ok((await handleText(e, 'U1', 'ออเดอร์ ช่องทาง ไลน์')).includes('#1 ML'));

  for (const cmd of ['ตารางออเดอร์', 'ออเดอร์']) {
    assert.ok((await handleText(e, 'U1', cmd)).includes('/d/'), cmd + ' ต้องส่งลิงก์ตาราง A4');
  }
  assert.ok(!free.includes('/d/') && !one.includes('/d/'), 'เรียกดูรายชิ้นไม่ต้องแนบลิงก์');
});

test('คู่มือคำสั่งออเดอร์เรียกได้จากไลน์ และตัวอย่างในคู่มือใช้ได้จริง', async () => {
  const db = freshDb();
  const e = env(db);
  const help = await handleText(e, 'U1', 'วิธีสั่งออเดอร์');
  assert.ok(help.includes('ออเดอร์ 3 ผู้สั่ง คุณเอ') && help.includes('ตารางออเดอร์'));

  await doAddOrder(e, cmdOrder({ style: 'ML', qty: 10 }));
  // ทุกบรรทัดตัวอย่างที่ขึ้นต้นด้วย "ออเดอร์" หรือ "ตารางออเดอร์" ต้องเข้าทางลัด ไม่หลุดไปถึง AI
  const lines = help.split('\n').filter((l) => /^• (ออเดอร์|ตารางออเดอร์)/.test(l))
    .map((l) => l.slice(2).replace(/\s{2,}\(.*$/, '').trim());
  assert.ok(lines.length >= 20);
  for (const l of lines) {
    const out = (await doViewOrders(e, l)) ?? (await doMarkPaid(e, l)) ?? (await doOrderFields(e, l));
    assert.ok(out, 'ตัวอย่างในคู่มืออ่านไม่ออก: ' + l);
  }
});
