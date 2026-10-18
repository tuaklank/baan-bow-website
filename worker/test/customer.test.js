// จับคู่ลูกค้าเดิม + รวมข้อมูลเก่ากับใหม่ (ออกบิลซ้ำแล้วไม่ต้องพิมพ์ที่อยู่ใหม่)
import test from 'node:test';
import assert from 'node:assert/strict';
import { customerKey, mergeCustomer } from '../src/db.js';
import { readVatMode } from '../src/text.js';

test('customerKey ตัดคำนำหน้าและช่องว่าง ลูกค้าเดิมจึงเจอ', () => {
  assert.equal(customerKey('คุณสมชาย'), customerKey('สมชาย'));
  assert.equal(customerKey(' คุณ สมชาย '), customerKey('สมชาย'));
  assert.equal(customerKey('นางสาวสมหญิง'), customerKey('สมหญิง'));
  assert.equal(customerKey('บจก. ตัวกลาง'), customerKey('ตัวกลาง'));
});

test('customerKey ไม่รวมลูกค้าคนละคนเข้าด้วยกัน', () => {
  assert.notEqual(customerKey('คุณสมชาย'), customerKey('คุณสมหญิง'));
  assert.notEqual(customerKey('โตโยต้าพัทยา'), customerKey('โตโยต้าชลบุรี'));
});

test('customerKey ไม่สนตัวพิมพ์เล็กใหญ่ของภาษาอังกฤษ', () => {
  assert.equal(customerKey('Toyota Pattaya'), customerKey('toyota  pattaya'));
});

test('mergeCustomer: ข้อมูลที่พิมพ์มาใหม่ชนะของเดิม', () => {
  const saved = { name: 'โตโยต้าพัทยา', address: 'ที่อยู่เก่า', tax_id: '0-1111', branch: 'สาขาที่ 00001', phone: '02-111-1111' };
  const fresh = { name: 'โตโยต้าพัทยา', address: 'ที่อยู่ใหม่', phone: null };
  const m = mergeCustomer(fresh, saved);
  assert.equal(m.address, 'ที่อยู่ใหม่');
  assert.equal(m.phone, '02-111-1111');       // ไม่ได้พิมพ์มาใหม่ ใช้ของเดิม
  assert.equal(m.tax_id, '0-1111');
  assert.equal(m.branch, 'สาขาที่ 00001');
});

test('mergeCustomer: สตริงว่างหรือช่องว่างล้วน ไม่ทับของเดิม', () => {
  const m = mergeCustomer({ name: 'ก', address: '   ', tax_id: '' }, { address: 'ที่อยู่เดิม', tax_id: '0-9999' });
  assert.equal(m.address, 'ที่อยู่เดิม');
  assert.equal(m.tax_id, '0-9999');
});

test('mergeCustomer: ลูกค้าใหม่ที่ยังไม่เคยบันทึก ช่องที่ไม่รู้เป็น null', () => {
  const m = mergeCustomer({ name: 'คุณสมชาย', phone: '081-234-5678' }, null);
  assert.equal(m.name, 'คุณสมชาย');
  assert.equal(m.phone, '081-234-5678');
  assert.equal(m.address, null);
  assert.equal(m.tax_id, null);
});

test('readVatMode: เช็คคำว่า "ไม่" ก่อน ไม่ให้ "ไม่รวม vat" กลายเป็น "รวม vat"', () => {
  assert.equal(readVatMode('ไม่รวม vat'), 'exclusive');
  assert.equal(readVatMode('ไม่รวมvat'), 'exclusive');
  assert.equal(readVatMode('+vat'), 'exclusive');
  assert.equal(readVatMode('บวก vat'), 'exclusive');
  assert.equal(readVatMode('รวม vat'), 'inclusive');
  assert.equal(readVatMode('ราคารวมภาษี'), 'inclusive');
  assert.equal(readVatMode('ไม่มี vat'), 'none');
  assert.equal(readVatMode('ไม่คิด vat'), 'none');
});

test('readVatMode: ไม่พูดถึง VAT ต้องคืน null เพื่อให้ระบบถามกลับ ห้ามเดา', () => {
  assert.equal(readVatMode('ทำใบเสนอราคาคุณสมชาย โบว์ 2 ชุด ชุดละ 2900'), null);
  assert.equal(readVatMode('ยืนยัน'), null);
  assert.equal(readVatMode(''), null);
});
