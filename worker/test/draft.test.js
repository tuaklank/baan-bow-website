// แก้ร่างเอกสารทีละช่องโดยไม่เรียก AI
// เคสที่เอามาเทสต์ส่วนใหญ่มาจากงานจริงที่เคยต้องพิมพ์ใหม่ทั้งก้อน 5 รอบเพื่อใบเดียว
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readDraftEdit, draftToBase, readMoney, readSeller, readDocType, isEditError, isNotAnEdit, looksLikeEdit, EDIT_HELP,
} from '../src/draft.js';
import { compute } from '../src/money.js';

/** ร่างตัวอย่าง — รูปเดียวกับที่ buildDraft() เก็บลง pending (ยอดเป็นสตางค์) */
const draft = () => ({
  type: 'quotation',
  seller: 'baanbow',
  issue_date: '2026-10-23',
  customer: {
    name: 'หจก. เช้าเทิร์น มีเดีย',
    address: '29/1 ถ.เจ้าฟ้า ต.ตลาดเหนือ อ.เมือง จ.ภูเก็ต 83000',
    tax_id: '0-8335-47001-16-4',
    branch: null, contact: null, phone: null,
  },
  lines: [
    { name: 'โบว์ขนาด 2*1.6 เมตร สีแดงล้วน (3 ชั้น)', note: null, qty: 1, unit_price: 750000, amount: 750000 },
    { name: 'สายคาด แดงล้วนผ้า 2 ชั้นยาว 26เมตร', note: null, qty: 1, unit_price: 600000, amount: 600000 },
    { name: 'ซิลความ (20*50cm, 200฿/จุด)', note: null, qty: 1, unit_price: 20000, amount: 20000 },
  ],
  discount: 0, vat_mode: 'none', wht_rate: 0,
  note: null, payment_terms: null, ref_doc_no: null,
});

/** แก้ร่างหนึ่งคำสั่งแล้วคืนข้อมูลตั้งต้นที่แก้แล้ว (เหมือนที่ doEditDraft ทำ) */
function edit(msg, doc = draft()) {
  const e = readDraftEdit(msg);
  assert.ok(e, 'อ่านคำสั่งไม่ออก: ' + msg);
  const base = draftToBase(doc);
  const headline = e.apply(base);
  return { base, headline };
}

/** คำสั่งที่ควรถูกปฏิเสธ — คืนข้อความที่ผู้ใช้จะเห็น */
function rejects(msg, doc = draft()) {
  const e = readDraftEdit(msg);
  assert.ok(e, 'อ่านคำสั่งไม่ออก: ' + msg);
  try {
    e.apply(draftToBase(doc));
  } catch (err) {
    assert.ok(isEditError(err), 'ควร throw EditError ไม่ใช่ ' + err);
    return err.message;
  }
  assert.fail('ควรถูกปฏิเสธ: ' + msg);
}

test('ยอดสตางค์แปลงกลับเป็นบาทได้ตรง ไม่มีเศษหาย', () => {
  const base = draftToBase(draft());
  assert.deepEqual(base.items.map((i) => i.unit_price), [7500, 6000, 200]);
  assert.equal(base.discount, 0);
  // ประกอบกลับแล้วต้องได้ยอดเดิมเป๊ะ ไม่งั้นแก้ช่องเดียวแล้วยอดอื่นเพี้ยน
  const c = compute({ ...base, vat_mode: 'none' });
  assert.equal(c.total, 1370000);
});

test('แก้ราคารายการ แล้วยอดรวมคำนวณใหม่ให้เอง', () => {
  const { base, headline } = edit('แก้ข้อ 2 ราคา 4500');
  assert.equal(base.items[1].unit_price, 4500);
  assert.match(headline, /4,500/);
  assert.equal(compute({ ...base, vat_mode: 'none' }).total, 1220000);
});

test('ราคามีจุลภาคหรือคำว่าบาทต่อท้ายก็อ่านได้', () => {
  assert.equal(edit('แก้ข้อ 1 ราคา 7,250.50').base.items[0].unit_price, 7250.5);
  assert.equal(edit('แก้ข้อ 1 ราคา 7250 บาท').base.items[0].unit_price, 7250);
});

test('แก้จำนวน ชื่อ และหมายเหตุของรายการ', () => {
  assert.equal(edit('แก้ข้อ 1 จำนวน 3').base.items[0].qty, 3);
  assert.equal(edit('แก้ข้อ 2 ชื่อ สายคาด แดงล้วนผ้า 1 ชั้น').base.items[1].name, 'สายคาด แดงล้วนผ้า 1 ชั้น');
  assert.equal(edit('แก้ข้อ 3 หมายเหตุ ติดบนล่าง').base.items[2].note, 'ติดบนล่าง');
  assert.equal(edit('แก้ข้อ 3 หมายเหตุ').base.items[2].note, null);   // ว่าง = ล้างทิ้ง
});

test('ลบรายการ และเพิ่มรายการใหม่', () => {
  const after = edit('ลบข้อ 3').base;
  assert.equal(after.items.length, 2);
  assert.equal(compute({ ...after, vat_mode: 'none' }).total, 1350000);

  const added = edit('เพิ่มข้อ ค่าส่ง 350').base;
  assert.equal(added.items.length, 4);
  assert.deepEqual(
    { name: added.items[3].name, qty: added.items[3].qty, unit_price: added.items[3].unit_price },
    { name: 'ค่าส่ง', qty: 1, unit_price: 350 },
  );

  const many = edit('เพิ่มข้อ เพิ่มข้อความ 2 x 450').base;
  assert.equal(many.items[3].qty, 2);
  assert.equal(many.items[3].unit_price, 450);
});

test('เรียกรายการด้วยชื่อได้ ไม่ต้องนับเลขข้อในหัว', () => {
  // ข้อความจริงที่เจ้าของร้านพิมพ์มาแล้วเคยหลุดไปหา AI เพราะไม่ได้บอกเลขข้อ
  const { base, headline } = edit('แก้สายคาด เป็นราคา 5000 บาท');
  assert.equal(base.items[1].unit_price, 5000);
  assert.match(headline, /แก้ราคาข้อ 2/);

  assert.equal(edit('แก้สายคาด ราคา 4500').base.items[1].unit_price, 4500);
  assert.equal(edit('แก้สายคาด เป็น 4500').base.items[1].unit_price, 4500);
  assert.equal(edit('แก้สายคาด 4500').base.items[1].unit_price, 4500);
  assert.equal(edit('แก้สายคาด จำนวน 3').base.items[1].qty, 3);
  assert.equal(edit('แก้ซิลความ หมายเหตุ ติดบนล่าง').base.items[2].note, 'ติดบนล่าง');
  assert.equal(edit('ลบซิลความ').base.items.length, 2);
});

test('อ้างลำดับได้ทุกแบบที่คนพิมพ์จริง — มี "ที่" มีตัวหนังสือ ไม่เว้นวรรค', () => {
  // "แก้ รายการที่1 เป็นราคา 7900 บาท" คือข้อความจริงที่เคยอ่านไม่ออกเพราะลืมคำว่า "ที่"
  assert.equal(edit('แก้ รายการที่1 เป็นราคา 7900 บาท').base.items[0].unit_price, 7900);
  assert.equal(edit('แก้รายการที่ 2 ราคา 4500').base.items[1].unit_price, 4500);
  assert.equal(edit('แก้ข้อที่2 เป็น 4500').base.items[1].unit_price, 4500);
  assert.equal(edit('แก้บรรทัดที่หนึ่ง จำนวน 3').base.items[0].qty, 3);
  assert.equal(edit('ลบข้อสอง').base.items.length, 2);
  assert.equal(edit('ลบรายการที่3').base.items.length, 2);
});

test('พิมพ์ชื่อช่องติดกับค่า หรือติดกับ "เป็น" ก็อ่านออก', () => {
  // เวลารีบ เจ้าของร้านไม่เว้นวรรค — ของจริงเคยส่งมาแบบนี้แล้วหลุดไปหา AI
  assert.equal(edit('แก้เลขภาษี0-8335-47001-26-4').base.customer.tax_id, '0-8335-47001-26-4');
  assert.equal(edit('แก้ เลขภาษี เป็น0-8335-47001-26-4').base.customer.tax_id, '0-8335-47001-26-4');
  assert.equal(edit('แก้ส่วนลด500').base.discount, 500);
  assert.equal(edit('แก้ที่อยู่151 ม.1 ถ.วัดประดู่').base.customer.address, '151 ม.1 ถ.วัดประดู่');
  assert.equal(edit('แก้ ข้อ2 เป็นราคา 4500 บาท').base.items[1].unit_price, 4500);
});

test('บอกราคาเดิมมาด้วย ("จาก 6000 เป็น 5000") ก็ยังอ่านออก', () => {
  assert.equal(edit('แก้สายคาดจาก6000 เป็น 5000บาท').base.items[1].unit_price, 5000);
  assert.equal(edit('แก้สายคาด จาก 6,000 เป็น 5000').base.items[1].unit_price, 5000);
});

test('ตั้งใจแก้ร่างแน่ๆ แต่อ่านไม่ออก ต้องไม่ถูกส่งไปหา AI', () => {
  assert.equal(looksLikeEdit('แก้สายคาดกับโบว์ ลดอย่างละร้อย'), true);
  assert.equal(looksLikeEdit('ลบอันที่สอง'), true);
  // คำสั่งแก้รายจ่ายมีทางของตัวเอง ต้องปล่อยให้ AI อ่านเหมือนเดิม
  assert.equal(looksLikeEdit('แก้รายจ่าย 12 ค่าส่ง 80'), false);
  assert.equal(looksLikeEdit('ทำใบเสนอราคา คุณสมชาย'), false);
  assert.equal(looksLikeEdit('ยืนยัน'), false);
});

test('ไม่บอกชื่อช่องแต่ให้ตัวเลขมา ถือว่าเป็นราคา', () => {
  assert.equal(edit('แก้ข้อ 2 เป็น 5000').base.items[1].unit_price, 5000);
  assert.equal(edit('แก้ข้อ 2 5,000 บาท').base.items[1].unit_price, 5000);
});

test('ชื่อที่ตรงหลายรายการ ไม่เดาให้ ถามว่าข้อไหน', () => {
  const two = draft();
  two.lines[0].name = 'โบว์แดง เล็ก';
  two.lines[1].name = 'โบว์แดง ใหญ่';
  const msg = rejects('แก้โบว์แดง ราคา 100', two);
  assert.match(msg, /หลายรายการ/);
  assert.match(msg, /ข้อ 1 โบว์แดง เล็ก/);
  assert.match(msg, /ข้อ 2 โบว์แดง ใหญ่/);
});

test('ชื่อที่ไม่มีในร่าง = ไม่ใช่คำสั่งแก้ร่าง ปล่อยไปทางอื่น', () => {
  // สำคัญมาก ไม่งั้น "แก้รายจ่าย 12 ค่าส่ง 80" จะถูกกินไปตอนมีร่างค้างอยู่
  for (const m of ['แก้รายจ่าย 12 ค่าส่ง 80', 'แก้ของที่ไม่มี ราคา 100', 'ลบรายจ่าย 12']) {
    const e = readDraftEdit(m);
    if (!e) continue;                                  // ไม่ตรงรูปคำสั่งเลยก็จบ
    assert.throws(() => e.apply(draftToBase(draft())), isNotAnEdit, m);
  }
});

test('ลบรายการสุดท้ายไม่ได้ เอกสารต้องมีอย่างน้อย 1 รายการ', () => {
  const one = draft();
  one.lines = [one.lines[0]];
  assert.match(rejects('ลบข้อ 1', one), /อย่างน้อย 1 รายการ/);
});

test('อ้างข้อที่ไม่มี ตอบว่ามีกี่ข้อ ไม่ใช่พังเงียบ', () => {
  assert.match(rejects('แก้ข้อ 9 ราคา 100'), /มี 3 รายการ/);
  assert.match(rejects('ลบข้อ 0'), /มี 3 รายการ/);
});

test('จำนวนหรือราคาที่ใช้ไม่ได้ ถูกปฏิเสธพร้อมตัวอย่าง', () => {
  assert.match(rejects('แก้ข้อ 1 จำนวน 0'), /มากกว่า 0/);
  assert.match(rejects('แก้ข้อ 1 ราคา เยอะๆ'), /อ่านราคาไม่ออก/);
  assert.match(rejects('แก้ข้อ 1 ชื่อ '), /ว่างไม่ได้/);
});

test('แก้ช่องของลูกค้าได้ครบทุกช่อง และล้างค่าได้', () => {
  assert.equal(edit('แก้ชื่อลูกค้า บริษัท นีโอเทค พลายวู้ด จำกัด').base.customer.name, 'บริษัท นีโอเทค พลายวู้ด จำกัด');
  assert.equal(edit('แก้ที่อยู่ 151 ม.1 ถ.วัดประดู่ อ.เมือง จ.สุราษฎร์ธานี 84000').base.customer.address,
    '151 ม.1 ถ.วัดประดู่ อ.เมือง จ.สุราษฎร์ธานี 84000');
  assert.equal(edit('แก้เลขภาษี 0833547001164').base.customer.tax_id, '0833547001164');
  assert.equal(edit('แก้สาขา สำนักงานใหญ่').base.customer.branch, 'สำนักงานใหญ่');
  assert.equal(edit('แก้ผู้ติดต่อ คุณเอ').base.customer.contact, 'คุณเอ');
  assert.equal(edit('แก้เบอร์ 076-224707').base.customer.phone, '076-224707');
  assert.equal(edit('แก้สาขา').base.customer.branch, null);
});

test('แก้ช่องของตัวเอกสาร — ส่วนลด หัก ณ ที่จ่าย ประเภท ผู้ขาย หมายเหตุ', () => {
  assert.equal(edit('แก้ส่วนลด 500').base.discount, 500);
  assert.equal(edit('แก้ส่วนลด').base.discount, 0);
  assert.equal(edit('แก้หัก ณ ที่จ่าย 3').base.wht_rate, 300);
  assert.equal(edit('แก้หักณที่จ่าย 1').base.wht_rate, 100);
  assert.equal(edit('แก้หัก ณ ที่จ่าย 0').base.wht_rate, 0);
  assert.equal(edit('แก้ประเภท ใบเสร็จ').base.type, 'receipt');
  assert.equal(edit('แก้ผู้ขาย ตัวกลาง').base.seller, 'tuaklang');
  assert.equal(edit('แก้หมายเหตุ ส่งหน้างาน').base.note, 'ส่งหน้างาน');
  assert.equal(edit('แก้เงื่อนไขชำระ โอน 50% ก่อนผลิต').base.payment_terms, 'โอน 50% ก่อนผลิต');
});

test('หัก ณ ที่จ่ายรับแค่ 1% กับ 3% ตามที่กฎหมายใช้จริง', () => {
  assert.match(rejects('แก้หัก ณ ที่จ่าย 5'), /1% หรือ 3%/);
});

test('ประเภทหรือผู้ขายที่ไม่รู้จัก ตอบว่ามีอะไรให้เลือก', () => {
  assert.match(rejects('แก้ประเภท ใบส่งของ'), /ใบเสนอราคา/);
  assert.match(rejects('แก้ผู้ขาย ร้านอื่น'), /BAANBOW/);
});

test('แก้ไม่ทับร่างเดิม — ข้อมูลต้นทางไม่ถูกแตะ', () => {
  const doc = draft();
  edit('แก้ข้อ 1 ราคา 1', doc);
  assert.equal(doc.lines[0].unit_price, 750000);
  edit('แก้ที่อยู่ เปลี่ยนแล้ว', doc);
  assert.equal(doc.customer.address, '29/1 ถ.เจ้าฟ้า ต.ตลาดเหนือ อ.เมือง จ.ภูเก็ต 83000');
});

test('ข้อความที่ไม่ใช่คำสั่งแก้ร่าง คืน null เพื่อให้ไหลไปทางอื่น', () => {
  for (const m of [
    'ยืนยัน',
    'สต๊อก',
    'ทำใบเสนอราคา คุณสมชาย โบว์แดง 2 ชิ้น ชิ้นละ 500',
    'แก้วันที่ 15/10',                 // มีทางของตัวเองอยู่แล้ว (doSetIssueDate)
    'เพิ่มงาน ติดตั้งโบว์',             // อย่าไปชนกับคำสั่งเพิ่มงาน
    'เพิ่มวันหยุด 31 ธันวาคม สิ้นปี',
  ]) {
    assert.equal(readDraftEdit(m), null, m);
  }
});

test('"เพิ่มข้อความ ..." เป็นชื่อสินค้า ไม่ใช่คำสั่งเพิ่มข้อ', () => {
  // ของจริงเคยมีรายการชื่อ "เพิ่มข้อความ 2× 450 บาท" อยู่ในบิล ห้ามอ่านเป็นคำสั่ง
  assert.equal(readDraftEdit('เพิ่มข้อความ 2× 450 บาท'), null);
});

test('พิมพ์ "แก้" เฉยๆ ได้วิธีแก้ทั้งหมด', () => {
  assert.equal(rejects('แก้'), EDIT_HELP);
  assert.match(EDIT_HELP, /แก้สายคาด เป็นราคา 5000/);
});

test('ตัวอ่านย่อย — เงิน ผู้ขาย ประเภทเอกสาร', () => {
  assert.equal(readMoney('1,250.75'), 1250.75);
  assert.equal(readMoney(''), null);
  assert.equal(readMoney('abc'), null);

  assert.equal(readSeller('บ้านโบว์'), 'baanbow');
  assert.equal(readSeller('บริษัท ตัวกลาง จำกัด'), 'tuaklang');
  assert.equal(readSeller('อะไรก็ไม่รู้'), null);

  assert.equal(readDocType('ใบเสนอราคา'), 'quotation');
  assert.equal(readDocType('ใบเสร็จ'), 'receipt');
  assert.equal(readDocType('ใบกำกับภาษี'), 'tax_invoice');
  // ชื่อยาวที่มีทั้งสองคำ ต้องได้ใบรวม ไม่ใช่ใบเสร็จเฉยๆ
  assert.equal(readDocType('ใบเสร็จรับเงิน/ใบกำกับภาษี'), 'receipt_tax_invoice');
});
