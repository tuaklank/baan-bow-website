// ผู้ขาย 2 บริษัท เลือกได้ทีละบิล
import test from 'node:test';
import assert from 'node:assert/strict';
import { SELLERS, DEFAULT_SELLER, getSeller, sellerCanIssue, TYPES } from '../src/config.js';

test('มีผู้ขาย 2 บริษัท และค่าเริ่มต้นเป็นตัวที่ใช้อยู่เดิม', () => {
  assert.deepEqual(Object.keys(SELLERS).sort(), ['baanbow', 'tuaklang']);
  assert.equal(DEFAULT_SELLER, 'tuaklang');
  assert.equal(getSeller(DEFAULT_SELLER).tax_id, '0-4355-69001-41-3');
});

test('key ของแต่ละรายการตรงกับชื่อช่อง กันพิมพ์ผิดแล้วหากันไม่เจอ', () => {
  for (const [key, s] of Object.entries(SELLERS)) assert.equal(s.key, key);
});

test('ทุกบริษัทมีข้อมูลที่ต้องขึ้นหัวเอกสารครบ', () => {
  for (const s of Object.values(SELLERS)) {
    for (const f of ['label', 'name', 'address_line1', 'address_line2', 'phone']) {
      assert.ok(s[f] && String(s[f]).trim() !== '', `${s.key} ขาด ${f}`);
    }
  }
});

test('getSeller คืนค่าเริ่มต้นเมื่อไม่ระบุหรือระบุผิด', () => {
  assert.equal(getSeller(null).key, DEFAULT_SELLER);
  assert.equal(getSeller(undefined).key, DEFAULT_SELLER);
  assert.equal(getSeller('').key, DEFAULT_SELLER);
  assert.equal(getSeller('ไม่มีบริษัทนี้').key, DEFAULT_SELLER);
  assert.equal(getSeller('baanbow').key, 'baanbow');
});

test('ข้อมูล BAANBOW ตรงกับหัวกระดาษที่ให้มา', () => {
  const s = SELLERS.baanbow;
  assert.equal(s.name, 'BAANBOW');
  assert.equal(s.address_line1, '209 หมู่ที่ 3 ตำบลโพธิ์ชัย');
  assert.equal(s.address_line2, 'อำเภอเมือง จังหวัดหนองคาย 43000');
  assert.equal(s.email, 'Tirachai_love_@hotmail.com');
  assert.equal(s.phone, '086-362-4117');
});

test('ผู้ขายที่ไม่มีเลขภาษี ออกใบกำกับภาษีไม่ได้ แต่ออกใบเสนอราคา/ใบเสร็จได้', () => {
  const baanbow = SELLERS.baanbow;
  assert.equal(baanbow.tax_id, null);
  assert.equal(sellerCanIssue(baanbow, 'tax_invoice'), false);
  assert.equal(sellerCanIssue(baanbow, 'receipt_tax_invoice'), false);
  assert.equal(sellerCanIssue(baanbow, 'quotation'), true);
  assert.equal(sellerCanIssue(baanbow, 'receipt'), true);
});

test('ผู้ขายที่มีเลขภาษี ออกได้ทุกประเภท', () => {
  for (const type of Object.keys(TYPES)) {
    assert.equal(sellerCanIssue(SELLERS.tuaklang, type), true, type);
  }
});

test('ไม่มีผู้ขาย (undefined) ก็ต้องไม่หลุดออกเอกสารภาษี', () => {
  assert.equal(sellerCanIssue(undefined, 'tax_invoice'), false);
  assert.equal(sellerCanIssue({}, 'receipt_tax_invoice'), false);
});
