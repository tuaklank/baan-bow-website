// เส้นทางจริงของการแก้ร่าง: ข้อความจากไลน์ -> handleText -> ร่างใหม่ในฐานข้อมูล
// ไม่มีการเรียก AI เลยในเทสนี้ ถ้าหลุดไปเรียกจริง parseCommand จะพังเพราะไม่มี API key
// ซึ่งเป็นด่านกันเองว่าคำสั่งแก้ร่างถูกดักก่อนถึง AI จริงๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './d1.js';
import { handleText } from '../src/handlers.js';
import { savePending, peekPending } from '../src/db.js';
import { compute } from '../src/money.js';

const UID = 'U1234567890';

/** ร่างใบเสนอราคาที่รอยืนยันอยู่ — รูปเดียวกับที่ buildDraft() สร้าง */
function draftDoc({ type = 'quotation', seller = 'baanbow', vat_mode = 'none', customer } = {}) {
  const items = [
    { name: 'โบว์ขนาด 2*1.6 เมตร สีแดงล้วน (3 ชั้น)', note: null, qty: 1, unit_price: 7500 },
    { name: 'สายคาด แดงล้วนผ้า 2 ชั้นยาว 26เมตร', note: null, qty: 1, unit_price: 6000 },
    { name: 'ซิลความ (20*50cm, 200฿/จุด)', note: null, qty: 1, unit_price: 200 },
  ];
  const c = compute({ items, discount: 0, vat_mode, wht_rate: 0 });
  return {
    type, seller, issue_date: '2026-10-23', valid_until: '2026-11-07',
    customer: customer ?? {
      name: 'หจก. เช้าเทิร์น มีเดีย',
      address: '29/1 ถ.เจ้าฟ้า ต.ตลาดเหนือ อ.เมือง จ.ภูเก็ต 83000',
      tax_id: '0-8335-47001-16-4', branch: null, contact: null, phone: null,
    },
    lines: c.lines, discount: c.discount, vat_mode,
    subtotal: c.subtotal, base: c.base, vat: c.vat,
    wht_rate: c.wht_rate, wht: c.wht, total: c.total, net_payable: c.net_payable,
    note: null, payment_terms: null, ref_doc_no: null,
  };
}

/** ฐานข้อมูลใหม่ที่มีร่างรอยืนยันอยู่หนึ่งใบ */
async function withDraft(opts) {
  const env = { DB: freshDb(), ALLOWED_USER_IDS: UID };
  await savePending(env.DB, UID, { kind: 'doc', doc: draftDoc(opts) });
  return env;
}

const say = (env, msg) => handleText(env, UID, msg);
const pendingDoc = async (env) => (await peekPending(env.DB, UID)).doc;

test('แก้ราคาข้อเดียว ร่างใหม่คำนวณยอดให้ และเก็บลงฐานข้อมูลจริง', async () => {
  const env = await withDraft();
  const reply = await say(env, 'แก้ข้อ 2 ราคา 4500');
  assert.match(reply, /✏️ แก้ราคาข้อ 2/);
  assert.match(reply, /รวมทั้งสิ้น 12,200\.00 บาท/);
  assert.equal((await pendingDoc(env)).total, 1220000);
});

test('เรียกสินค้าด้วยชื่อแบบที่เจ้าของร้านพิมพ์จริง', async () => {
  // ข้อความนี้เคยหลุดไปหา AI แล้วได้เมนูช่วยเหลือกลับมา เพราะตอนแรกบังคับให้บอกเลขข้อ
  const env = await withDraft();
  const reply = await say(env, 'แก้สายคาด เป็นราคา 5000 บาท');
  assert.match(reply, /✏️ แก้ราคาข้อ 2/);
  assert.match(reply, /รวมทั้งสิ้น 12,700\.00 บาท/);
  assert.equal((await pendingDoc(env)).lines[1].unit_price, 500000);
});

test('ลบรายการด้วยชื่อ และชื่อที่กำกวมจะถูกถามกลับ', async () => {
  const env = await withDraft();
  assert.match(await say(env, 'ลบซิลความ'), /ลบข้อ 3/);
  assert.equal((await pendingDoc(env)).lines.length, 2);
  // เหลือ "โบว์ขนาด..." กับ "สายคาด..." — คำว่า "ล้วน" อยู่ในทั้งสองชื่อ
  const ask = await say(env, 'แก้ล้วน ราคา 100');
  assert.match(ask, /หลายรายการ/);
  assert.equal((await pendingDoc(env)).lines.length, 2);
});

test('ลบรายการที่ลูกค้าไม่เอา โดยไม่ต้องพิมพ์ทั้งใบใหม่', async () => {
  const env = await withDraft();
  const reply = await say(env, 'ลบข้อ 3');
  assert.match(reply, /ลบข้อ 3/);
  assert.match(reply, /รวมทั้งสิ้น 13,500\.00 บาท/);
  const doc = await pendingDoc(env);
  assert.equal(doc.lines.length, 2);
  // ที่อยู่กับเลขภาษีต้องอยู่ครบเหมือนเดิม นี่คือเหตุผลทั้งหมดของฟีเจอร์นี้
  assert.equal(doc.customer.address, '29/1 ถ.เจ้าฟ้า ต.ตลาดเหนือ อ.เมือง จ.ภูเก็ต 83000');
  assert.equal(doc.customer.tax_id, '0-8335-47001-16-4');
});

test('แก้หลายคำสั่งต่อกัน สะสมบนร่างเดิม', async () => {
  const env = await withDraft();
  await say(env, 'ลบข้อ 3');
  await say(env, 'แก้ข้อ 2 ราคา 4500');
  await say(env, 'แก้ข้อ 2 ชื่อ สายคาด แดงล้วนผ้า 1 ชั้น');
  const reply = await say(env, 'เพิ่มข้อ ค่าส่ง 350');
  assert.match(reply, /รวมทั้งสิ้น 12,350\.00 บาท/);
  const doc = await pendingDoc(env);
  assert.deepEqual(doc.lines.map((l) => l.name), [
    'โบว์ขนาด 2*1.6 เมตร สีแดงล้วน (3 ชั้น)',
    'สายคาด แดงล้วนผ้า 1 ชั้น',
    'ค่าส่ง',
  ]);
});

test('แก้วันที่ยังทำงานเหมือนเดิม และใบเสนอราคายืดวันหมดอายุตาม', async () => {
  const env = await withDraft();
  await say(env, 'วันที่ 15/10');
  const doc = await pendingDoc(env);
  assert.equal(doc.issue_date, '2026-10-15');
  assert.equal(doc.valid_until, '2026-10-30');
});

test('เปลี่ยน VAT ของร่างที่ประกอบไว้แล้วได้ ไม่ต้องตั้งต้นใหม่', async () => {
  const env = await withDraft();
  const reply = await say(env, 'ไม่รวม vat');
  assert.match(reply, /ภาษีมูลค่าเพิ่ม 7%/);
  const doc = await pendingDoc(env);
  assert.equal(doc.vat_mode, 'exclusive');
  assert.equal(doc.total, 1465900);   // 13,700 + 7%
});

test('แก้เป็นใบกำกับภาษีทั้งที่ผู้ขายไม่มีเลขภาษี ถูกบล็อก และร่างเดิมไม่ถูกแตะ', async () => {
  const env = await withDraft();                      // ออกในนาม BAANBOW ซึ่งไม่มีเลขภาษี
  const reply = await say(env, 'แก้ประเภท ใบกำกับภาษี');
  assert.match(reply, /ไม่มีเลขประจำตัวผู้เสียภาษี/);
  assert.equal((await pendingDoc(env)).type, 'quotation');
});

test('แก้ผู้ขายเป็นตัวกลางก่อน แล้วค่อยแก้เป็นใบกำกับภาษี จะถามเรื่อง VAT ต่อ', async () => {
  const env = await withDraft();
  await say(env, 'แก้ผู้ขาย ตัวกลาง');
  const reply = await say(env, 'แก้ประเภท ใบกำกับภาษี');
  // ใบภาษีบังคับมี VAT แต่ร่างเดิมเป็น "ไม่มี VAT" จึงต้องถามใหม่ ห้ามเดาให้
  assert.match(reply, /VAT 7%/);
  const p = await peekPending(env.DB, UID);
  assert.equal(p.kind, 'need_vat');
  assert.equal(p.base.type, 'tax_invoice');

  // ตอบ VAT แล้วได้ร่างใบกำกับภาษีที่ข้อมูลลูกค้ายังอยู่ครบ
  const done = await say(env, 'รวม vat');
  assert.match(done, /ใบกำกับภาษี/);
  assert.equal((await pendingDoc(env)).customer.tax_id, '0-8335-47001-16-4');
});

test('ส่วนลดมากกว่ายอดรวม ถูกปฏิเสธ และร่างเดิมยังอยู่', async () => {
  const env = await withDraft();
  const reply = await say(env, 'แก้ส่วนลด 99999');
  assert.match(reply, /แก้ไม่ได้ครับ/);
  assert.match(reply, /ร่างเดิมยังอยู่/);
  assert.equal((await pendingDoc(env)).total, 1370000);
});

test('แก้ช่องลูกค้าแล้วเลขภาษีถูกจัดรูปแบบให้ตรงแม่แบบเอกสาร', async () => {
  const env = await withDraft();
  await say(env, 'แก้เลขภาษี 0435569001413');
  assert.equal((await pendingDoc(env)).customer.tax_id, '0-4355-69001-41-3');
});

test('เลขภาษีที่กรอกมาไม่ครบ 13 หลัก ถูกทักก่อนถึงหน้ากระดาษ', async () => {
  const env = await withDraft();
  const reply = await say(env, 'แก้เลขภาษี 123456');
  assert.match(reply, /13 หลัก/);
});

test('อ้างข้อที่ไม่มี ตอบกลับตรงๆ ไม่ไปรบกวน AI', async () => {
  const env = await withDraft();
  assert.match(await say(env, 'แก้ข้อ 9 ราคา 100'), /มี 3 รายการ/);
});

test('พิมพ์ "แก้" ได้วิธีแก้ ไม่ต้องมีร่างรออยู่ก็ดูได้', async () => {
  const env = { DB: freshDb(), ALLOWED_USER_IDS: UID };
  assert.match(await say(env, 'แก้'), /แก้สายคาด เป็นราคา 5000/);
});

test('ใบร่างบอกวิธีแก้ไว้ในตัว เจ้าของร้านจะได้ไม่ต้องจำ', async () => {
  const env = await withDraft();
  const reply = await say(env, 'ลบข้อ 3');
  assert.match(reply, /แก้โบว์ขนาด เป็นราคา 5000/);
  assert.match(reply, /พิมพ์ "แก้" ดูทั้งหมด/);
});
