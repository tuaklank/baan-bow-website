// ใบที่รับเงินมาแล้ว ห้ามมีช่องทางโอนเงินบนกระดาษ
// ใบเสร็จที่ยังพิมพ์เลขบัญชีไว้ ทำให้ลูกค้าเข้าใจว่ายังต้องโอนอีกรอบ
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDoc } from '../src/render.js';
import { PAYMENT, TYPES } from '../src/config.js';

const row = (type) => ({
  type,
  doc_no: TYPES[type].prefix + '211069001',
  token: 'a'.repeat(32),
  issue_date: '2026-10-21',
  valid_until: type === 'quotation' ? '2026-11-20' : null,
  customer: JSON.stringify({
    name: 'บริษัท ก จำกัด', address: 'ที่อยู่เต็ม', tax_id: '0-4355-69001-41-3',
    branch: 'สำนักงานใหญ่', contact: null, phone: null,
  }),
  items: JSON.stringify([{ name: 'โบว์วางหน้ารถยนต์', note: null, qty: 1, unit_price: 290000, amount: 290000 }]),
  discount: 0, vat_mode: 'exclusive',
  subtotal: 290000, base: 290000, vat: 20300, wht_rate: 0, wht: 0,
  total: 310300, net_payable: 310300,
  note: null, payment_terms: null, ref_doc_no: null,
  seller: 'tuaklang', status: 'issued',
});

const BANK_MARKS = [PAYMENT.bank, PAYMENT.bank_account, 'ช่องทางชำระเงิน', 'โอนเงิน'];

test('ใบเสร็จและใบกำกับภาษี ไม่มีข้อมูลรับโอนเลย', () => {
  for (const type of ['receipt', 'receipt_tax_invoice', 'tax_invoice']) {
    const html = renderDoc(row(type));
    for (const mark of BANK_MARKS) {
      assert.ok(!html.includes(mark), `${type} ยังมี "${mark}" อยู่บนเอกสาร`);
    }
    // QR บัญชีก็ต้องหายไปด้วย ไม่ใช่แค่ตัวหนังสือ
    assert.ok(!html.includes('alt="KBank"'), `${type} ยังมี QR บัญชีอยู่`);
    // ส่วนอื่นของใบต้องอยู่ครบ ไม่ได้ตัดทั้งบล็อกล่างไปด้วย
    assert.ok(html.includes('รวมทั้งสิ้น'), type);
    assert.ok(html.includes('สามพันหนึ่งร้อยสามบาทถ้วน'), type);
  }
});

test('ใบเสนอราคาเป็นใบเดียวที่ยังตามเงิน — ต้องมีเลขบัญชีและ QR', () => {
  const html = renderDoc(row('quotation'));
  assert.ok(html.includes(PAYMENT.bank_account), 'ไม่มีเลขบัญชี');
  assert.ok(html.includes('ช่องทางชำระเงิน'), 'ไม่มีหัวข้อช่องทางชำระเงิน');
  assert.ok(html.includes('alt="KBank"'), 'ไม่มี QR');
});
