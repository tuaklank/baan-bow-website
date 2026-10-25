// เลขประจำตัวผู้เสียภาษีไทยต้องมี 13 หลัก
// เคยปล่อยเลข 15 หลักขึ้นใบกำกับภาษีจริงมาแล้ว เทสชุดนี้กันไม่ให้เกิดอีก
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaxId } from '../src/text.js';

test('13 หลักผ่าน และจัดรูปแบบตามที่แม่แบบใช้', () => {
  const r = parseTaxId('0435569001413');
  assert.equal(r.ok, true);
  assert.equal(r.empty, false);
  assert.equal(r.formatted, '0-4355-69001-41-3');
});

test('รับได้ทุกแบบที่คนพิมพ์มา แล้วได้ผลเหมือนกัน', () => {
  const want = '0-4355-69001-41-3';
  assert.equal(parseTaxId('0-4355-69001-41-3').formatted, want);
  assert.equal(parseTaxId('0 4355 69001 41 3').formatted, want);
  assert.equal(parseTaxId('  0435569001413  ').formatted, want);
  assert.equal(parseTaxId('0435-5690-0141-3').formatted, want);
});

test('เลขที่เคยหลุดขึ้นเอกสารจริง (15 หลัก) ต้องถูกปฏิเสธ', () => {
  const r = parseTaxId('076355560000044');
  assert.equal(r.ok, false);
  assert.equal(r.digits.length, 15);
  assert.equal(r.formatted, null);
});

test('จำนวนหลักอื่นที่ไม่ใช่ 13 ถูกปฏิเสธทั้งหมด', () => {
  for (const v of ['1', '123456789012', '12345678901234', '0000000000000000']) {
    assert.equal(parseTaxId(v).ok, false, v);
  }
});

test('ไม่กรอกมา ไม่ถือว่าผิด แต่ไม่มีค่าให้ใช้', () => {
  for (const v of [null, undefined, '', '   ', '-']) {
    const r = parseTaxId(v);
    assert.equal(r.ok, true, String(v));
    assert.equal(r.empty, true, String(v));
    assert.equal(r.formatted, null, String(v));
  }
});

test('ตัวอักษรปนมา นับเฉพาะตัวเลข', () => {
  assert.equal(parseTaxId('เลขภาษี 0435569001413').formatted, '0-4355-69001-41-3');
  assert.equal(parseTaxId('abc').ok, true);        // ไม่มีตัวเลขเลย = ถือว่าไม่ได้กรอก
  assert.equal(parseTaxId('abc').empty, true);
});

test('จัดรูปแบบแล้วถอดกลับได้เลขเดิม ไม่มีหลักหายหรือเกิน', () => {
  const src = '1234567890123';
  const r = parseTaxId(src);
  assert.equal(r.formatted.replace(/\D/g, ''), src);
  assert.equal(r.formatted.split('-').map((p) => p.length).join(','), '1,4,5,2,1');
});
