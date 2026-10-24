// วันที่หน้าเอกสาร: ไม่บอก = วันนี้, บอกมาแล้วต้องอ่านให้ออกทุกแบบที่คนพิมพ์จริง
// สำคัญเพราะวันที่นี้ไปอยู่ในเลขที่เอกสารด้วย (ddmmyy พ.ศ.) ออกไปแล้วแก้ไม่ได้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readThaiDate, todayBkk, addDays } from '../src/thai.js';
import { formatDocNo } from '../src/numbering.js';

const T = '2026-10-20';   // วันจันทร์ที่ 20 ตุลาคม 2569

test('วันที่แบบ วัน/เดือน ใช้ปีปัจจุบัน', () => {
  assert.equal(readThaiDate('วันที่ 15/10', T), '2026-10-15');
  assert.equal(readThaiDate('ลงวันที่ 1/9', T), '2026-09-01');
});

test('ปี พ.ศ. ทั้ง 2 และ 4 หลัก แปลงเป็น ค.ศ. ให้เอง', () => {
  assert.equal(readThaiDate('วันที่ 15/10/69', T), '2026-10-15');
  assert.equal(readThaiDate('วันที่ 15/10/2569', T), '2026-10-15');
  assert.equal(readThaiDate('วันที่ 15-10-2569', T), '2026-10-15');
  // พิมพ์ ค.ศ. มาตรงๆ ก็ต้องได้วันเดียวกัน ไม่ลบ 543 ซ้ำ
  assert.equal(readThaiDate('วันที่ 15/10/2026', T), '2026-10-15');
  assert.equal(readThaiDate('วันที่ 2026-10-15', T), '2026-10-15');
});

test('ชื่อเดือนไทย ทั้งตัวเต็มและตัวย่อ', () => {
  assert.equal(readThaiDate('วันที่ 15 ต.ค.', T), '2026-10-15');
  assert.equal(readThaiDate('วันที่ 15 ตุลาคม 2569', T), '2026-10-15');
  assert.equal(readThaiDate('ย้อนวันที่ 28 ก.ย. 69', T), '2026-09-28');
  assert.equal(readThaiDate('วันที่ 3 ม.ค. 2570', T), '2027-01-03');
  assert.equal(readThaiDate('วันที่ 9 พ.ย.', T), '2026-11-09');
  assert.equal(readThaiDate('วันที่ 9 พ.ค.', T), '2026-05-09');
});

test('คำพูดแทนวันที่', () => {
  assert.equal(readThaiDate('วันที่ วันนี้', T), T);
  assert.equal(readThaiDate('วันที่ เมื่อวาน', T), '2026-10-19');
  assert.equal(readThaiDate('วันที่ เมื่อวานซืน', T), '2026-10-18');
  assert.equal(readThaiDate('วันที่ พรุ่งนี้', T), '2026-10-21');
});

test('ไม่บอกปี แล้วได้วันล่วงหน้าไกล = ปีก่อน (พิมพ์ต้นปีถึงบิลสิ้นปีที่แล้ว)', () => {
  assert.equal(readThaiDate('วันที่ 28/12', '2027-01-04'), '2026-12-28');
  assert.equal(readThaiDate('วันที่ 28 ธ.ค.', '2027-01-04'), '2026-12-28');
  // ล่วงหน้าไม่เกิน 60 วัน ยังถือว่าเป็นปีนี้ ลงวันที่ล่วงหน้าได้ตามปกติ
  assert.equal(readThaiDate('วันที่ 1/11', T), '2026-11-01');
});

test('อ่านไม่ออกหรือวันที่ไม่มีจริง คืน null — ห้ามเดาเป็นวันนี้', () => {
  assert.equal(readThaiDate('วันที่', T), null);
  assert.equal(readThaiDate('วันที่ เอาแบบเดิม', T), null);
  assert.equal(readThaiDate('วันที่ 31/02', T), null);
  assert.equal(readThaiDate('วันที่ 15/13', T), null);
  assert.equal(readThaiDate('', T), null);
  assert.equal(readThaiDate(null, T), null);
});

test('ค่าเริ่มต้นคือวันนี้ตามเวลาไทย', () => {
  assert.equal(readThaiDate('วันที่ วันนี้'), todayBkk());
  assert.equal(readThaiDate('วันที่ เมื่อวาน'), addDays(todayBkk(), -1));
});

test('วันที่ย้อนหลังทำให้เลขที่เอกสารเป็นวันนั้น ไม่ใช่วันนี้', () => {
  const back = readThaiDate('วันที่ 15/10/69', T);
  assert.equal(formatDocNo('receipt', back, 7), 'RC151069007');
  assert.notEqual(formatDocNo('receipt', back, 7), formatDocNo('receipt', T, 7));
});
