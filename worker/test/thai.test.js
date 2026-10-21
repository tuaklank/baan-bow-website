// วันที่ พ.ศ. และจำนวนเงินเป็นตัวอักษรไทย
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bahtText, bahtTextEn, fmtBaht, ddmmyyBE, thaiDate, thaiDateShort, thaiMonth, thaiSlash,
  todayBkk, monthBkk, addDays, dayOfWeek, isValidYmd,
} from '../src/thai.js';

test('bahtText ตรงกับข้อความในแม่แบบ', () => {
  assert.equal(bahtText(355000), 'สามพันห้าร้อยห้าสิบบาทถ้วน');
});

test('bahtText ลงท้าย "ถ้วน" เมื่อไม่มีสตางค์ และบอกสตางค์เมื่อมี', () => {
  assert.equal(bahtText(100), 'หนึ่งบาทถ้วน');
  assert.equal(bahtText(12550), 'หนึ่งร้อยยี่สิบห้าบาทห้าสิบสตางค์');
  assert.equal(bahtText(2325), 'ยี่สิบสามบาทยี่สิบห้าสตางค์');
});

test('bahtText อ่าน "เอ็ด" และ "ยี่สิบ" ถูกตามหลักภาษาไทย', () => {
  assert.equal(bahtText(1100), 'สิบเอ็ดบาทถ้วน');
  assert.equal(bahtText(2100), 'ยี่สิบเอ็ดบาทถ้วน');
  assert.equal(bahtText(10100), 'หนึ่งร้อยเอ็ดบาทถ้วน');
  assert.equal(bahtText(2000), 'ยี่สิบบาทถ้วน');
});

test('bahtText หลักล้านและศูนย์', () => {
  assert.equal(bahtText(0), 'ศูนย์บาทถ้วน');
  assert.equal(bahtText(100000000), 'หนึ่งล้านบาทถ้วน');
  assert.equal(bahtText(123456789), 'หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์');
  assert.equal(bahtText(1000000000), 'สิบล้านบาทถ้วน');
});

test('bahtText ค่าติดลบนำหน้าด้วย "ลบ"', () => {
  assert.equal(bahtText(-355000), 'ลบสามพันห้าร้อยห้าสิบบาทถ้วน');
});

test('bahtTextEn ตรงกับบรรทัดภาษาอังกฤษในแม่แบบ', () => {
  assert.equal(bahtTextEn(355000), 'Three thousand five hundred fifty baht only');
});

test('bahtTextEn หลักต่างๆ และสตางค์', () => {
  assert.equal(bahtTextEn(0), 'Zero baht only');
  assert.equal(bahtTextEn(1500), 'Fifteen baht only');
  assert.equal(bahtTextEn(2325), 'Twenty three baht and twenty five satang');
  assert.equal(bahtTextEn(1444500), 'Fourteen thousand four hundred forty five baht only');
  assert.equal(bahtTextEn(10000000), 'One hundred thousand baht only');
  assert.equal(bahtTextEn(-355000), 'Minus three thousand five hundred fifty baht only');
});

test('fmtBaht ใส่ตัวคั่นหลักพันและทศนิยม 2 ตำแหน่งเสมอ', () => {
  assert.equal(fmtBaht(355000), '3,550.00');
  assert.equal(fmtBaht(0), '0.00');
  assert.equal(fmtBaht(23224), '232.24');
  assert.equal(fmtBaht(100000000), '1,000,000.00');
});

test('ddmmyyBE แปลงเป็น ddmmyy พ.ศ. 2 หลัก', () => {
  assert.equal(ddmmyyBE('2026-10-18'), '181069');
  assert.equal(ddmmyyBE('2026-10-06'), '061069');   // ตรงกับเลขที่ในแม่แบบ QT061069005
  assert.equal(ddmmyyBE('2027-01-01'), '010170');
});

test('วันที่ไทยแบบเต็ม ย่อ และแบบทับ', () => {
  assert.equal(thaiDate('2026-10-18'), '18 ตุลาคม 2569');
  assert.equal(thaiDate('2026-10-18', true), 'วันอาทิตย์ที่ 18 ตุลาคม 2569');
  assert.equal(thaiDateShort('2026-10-18'), '18 ต.ค. 69');
  assert.equal(thaiSlash('2026-10-06'), '06/10/2569');
  assert.equal(thaiMonth('2026-10'), 'ตุลาคม 2569');
});

test('addDays ข้ามเดือนและข้ามปี', () => {
  assert.equal(addDays('2026-10-06', 15), '2026-10-21');   // ยืนราคา 15 วันนับจากวันที่ออก
  assert.equal(addDays('2026-10-06', 30), '2026-11-05');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('dayOfWeek ถูกต้อง (0 = อาทิตย์)', () => {
  assert.equal(dayOfWeek('2026-10-18'), 0);
  assert.equal(dayOfWeek('2026-10-19'), 1);
  assert.equal(dayOfWeek('2026-10-17'), 6);
});

test('isValidYmd ปฏิเสธวันที่ที่ไม่มีจริง', () => {
  assert.ok(isValidYmd('2026-10-18'));
  assert.ok(!isValidYmd('2026-02-30'));
  assert.ok(!isValidYmd('18/10/2569'));
  assert.ok(!isValidYmd('2569-10-18'));
  assert.ok(!isValidYmd(null));
  // เดือน/วันเกินช่วง ต้องคืน false เฉยๆ ห้าม throw (เคยพังตอนได้ค่านี้มาจาก AI)
  assert.ok(!isValidYmd('2026-13-15'));
  assert.ok(!isValidYmd('2026-00-10'));
  assert.ok(!isValidYmd('2026-10-32'));
});

test('todayBkk ใช้เวลาไทย ไม่ใช่เวลาเครื่อง', () => {
  // 2026-10-18 17:30 UTC = 19 ต.ค. 00:30 ที่ไทย — ต้องได้วันที่ 19
  assert.equal(todayBkk(new Date('2026-10-18T17:30:00Z')), '2026-10-19');
  // 2026-10-18 16:59 UTC = 18 ต.ค. 23:59 ที่ไทย — ยังเป็นวันที่ 18
  assert.equal(todayBkk(new Date('2026-10-18T16:59:00Z')), '2026-10-18');
  assert.equal(monthBkk(new Date('2026-10-31T17:30:00Z')), '2026-11');
});
