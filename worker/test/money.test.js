// คำนวณยอด — ทุกค่าเป็นสตางค์ ตัวเลขอ้างอิงจากแม่แบบที่อนุมัติแล้ว
import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, toSatang } from '../src/money.js';

const TEMPLATE_ITEMS = [
  { name: 'โบว์วางหน้ารถยนต์ แบบ 2 แดง/ทอง', unit_price: 2900 },
  { name: 'เพิ่มข้อความสกรีน', unit_price: 450 },
  { name: 'ค่าจัดส่ง', unit_price: 200 },
];

test('toSatang รับทั้งตัวเลข สตริง และตัวคั่นหลักพัน', () => {
  assert.equal(toSatang(2900), 290000);
  assert.equal(toSatang('2,900'), 290000);
  assert.equal(toSatang('3500.50'), 350050);
  assert.equal(toSatang(0), 0);
  assert.throws(() => toSatang('สามพัน'), /จำนวนเงินไม่ถูกต้อง/);
  assert.throws(() => toSatang(Infinity), /จำนวนเงินไม่ถูกต้อง/);
});

test('ปัดเศษจากทศนิยมบาทไม่หาย (0.1 + 0.2)', () => {
  const r = compute({ items: [{ name: 'a', unit_price: 0.1 }, { name: 'b', unit_price: 0.2 }], vat_mode: 'none' });
  assert.equal(r.subtotal, 30);
  assert.equal(r.total, 30);
});

test('inclusive ตรงกับตัวเลขในแม่แบบ: 3,550.00 / 3,317.76 / 232.24', () => {
  const r = compute({ items: TEMPLATE_ITEMS, vat_mode: 'inclusive' });
  assert.equal(r.subtotal, 355000);
  assert.equal(r.base, 331776);
  assert.equal(r.vat, 23224);
  assert.equal(r.total, 355000);
  // ยอดรวมต้องไม่ขยับจากราคาที่ลูกค้าเห็น และ base + vat ต้องเท่ากับ total พอดี
  assert.equal(r.base + r.vat, r.total);
});

test('exclusive บวก VAT 7% เพิ่มจากราคาที่แจ้ง', () => {
  const r = compute({ items: TEMPLATE_ITEMS, vat_mode: 'exclusive' });
  assert.equal(r.base, 355000);
  assert.equal(r.vat, 24850);
  assert.equal(r.total, 379850);
});

test('none ไม่มีภาษีเลย', () => {
  const r = compute({ items: TEMPLATE_ITEMS, vat_mode: 'none' });
  assert.equal(r.vat, 0);
  assert.equal(r.base, 355000);
  assert.equal(r.total, 355000);
});

test('ส่วนลดหักก่อนคิดภาษี', () => {
  const r = compute({ items: [{ name: 'โบว์', unit_price: 3500, qty: 4 }], discount: 500, vat_mode: 'exclusive' });
  assert.equal(r.subtotal, 1400000);
  assert.equal(r.discount, 50000);
  assert.equal(r.base, 1350000);
  assert.equal(r.vat, 94500);
  assert.equal(r.total, 1444500);
});

test('ส่วนลดเกินยอดรวมหรือติดลบ ถูกปฏิเสธ', () => {
  assert.throws(() => compute({ items: TEMPLATE_ITEMS, discount: 99999, vat_mode: 'none' }), /ส่วนลดมากกว่ายอดรวม/);
  assert.throws(() => compute({ items: TEMPLATE_ITEMS, discount: -100, vat_mode: 'none' }), /ส่วนลดติดลบ/);
});

test('จำนวนคูณราคาต่อหน่วยถูกต้อง', () => {
  const r = compute({ items: [{ name: 'โบว์', unit_price: 2900, qty: 3 }], vat_mode: 'none' });
  assert.equal(r.lines[0].amount, 870000);
  assert.equal(r.total, 870000);
});

test('หัก ณ ที่จ่าย คิดจากมูลค่าก่อนภาษี ไม่ใช่ยอดรวม', () => {
  const r = compute({ items: TEMPLATE_ITEMS, vat_mode: 'exclusive', wht_rate: 300 });
  assert.equal(r.base, 355000);
  assert.equal(r.wht, 10650);              // 3% ของ 3,550.00 ไม่ใช่ของ 3,798.50
  assert.equal(r.net_payable, r.total - r.wht);
  assert.equal(r.net_payable, 369200);
});

test('หัก ณ ที่จ่าย 1% และ 0% (ไม่มี)', () => {
  assert.equal(compute({ items: TEMPLATE_ITEMS, vat_mode: 'none', wht_rate: 100 }).wht, 3550);
  const none = compute({ items: TEMPLATE_ITEMS, vat_mode: 'none' });
  assert.equal(none.wht, 0);
  assert.equal(none.net_payable, none.total);
});

test('หัก ณ ที่จ่าย อัตราอื่นถูกปฏิเสธ', () => {
  assert.throws(() => compute({ items: TEMPLATE_ITEMS, vat_mode: 'none', wht_rate: 500 }), /1% หรือ 3%/);
});

test('ไม่ระบุ vat_mode ต้อง throw ไม่ใช่เดาให้', () => {
  assert.throws(() => compute({ items: TEMPLATE_ITEMS }), /ต้องระบุ vat_mode/);
  assert.throws(() => compute({ items: TEMPLATE_ITEMS, vat_mode: null }), /ต้องระบุ vat_mode/);
});

test('ไม่มีรายการ ต้อง throw', () => {
  assert.throws(() => compute({ items: [], vat_mode: 'none' }), /ไม่มีรายการ/);
});

test('จำนวนเป็น 0 หรือติดลบ ถูกปฏิเสธ', () => {
  assert.throws(() => compute({ items: [{ name: 'a', unit_price: 100, qty: 0 }], vat_mode: 'none' }), /จำนวนไม่ถูกต้อง/);
});
