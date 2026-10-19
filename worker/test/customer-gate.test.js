// ด่านตรวจข้อมูลลูกค้าก่อนออกเอกสาร
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCustomer } from '../src/handlers.js';

const cust = (o = {}) => ({ name: 'บริษัท ก จำกัด', address: null, tax_id: null, branch: null, contact: null, phone: null, ...o });

test('เลขภาษีไม่ครบ 13 หลัก ถูกบล็อกทุกประเภทเอกสาร', () => {
  for (const type of ['quotation', 'receipt', 'tax_invoice', 'receipt_tax_invoice']) {
    const c = cust({ tax_id: '076355560000044', address: 'ที่อยู่เต็ม' });
    const msg = checkCustomer(c, type);
    assert.match(msg ?? '', /13 หลัก/, type);
    assert.match(msg ?? '', /นับได้ 15 หลัก/, type);
  }
});

test('เลขภาษีถูกต้อง ถูกจัดรูปแบบให้ตรงกับแม่แบบ', () => {
  const c = cust({ tax_id: '0435569001413', address: 'ที่อยู่เต็ม' });
  assert.equal(checkCustomer(c, 'tax_invoice'), null);
  assert.equal(c.tax_id, '0-4355-69001-41-3');
});

test('ใบกำกับภาษีที่ไม่มีที่อยู่ลูกค้า ถูกบล็อก', () => {
  for (const type of ['tax_invoice', 'receipt_tax_invoice']) {
    const msg = checkCustomer(cust({ tax_id: '0435569001413' }), type);
    assert.match(msg ?? '', /ที่อยู่ของลูกค้า/, type);
  }
});

test('ใบเสนอราคา/ใบเสร็จ ไม่มีที่อยู่ก็ออกได้', () => {
  for (const type of ['quotation', 'receipt']) {
    assert.equal(checkCustomer(cust(), type), null, type);
  }
});

test('ไม่มีเลขภาษีเลย ไม่ถือว่าผิด และ tax_id เป็น null', () => {
  const c = cust({ address: 'ที่อยู่เต็ม' });
  assert.equal(checkCustomer(c, 'tax_invoice'), null);
  assert.equal(c.tax_id, null);
});

test('เลขภาษีผิด ถูกตรวจก่อนเรื่องที่อยู่ (บอกทีละเรื่อง ไม่สับสน)', () => {
  const msg = checkCustomer(cust({ tax_id: '123' }), 'tax_invoice');
  assert.match(msg ?? '', /13 หลัก/);
  assert.doesNotMatch(msg ?? '', /ที่อยู่/);
});
