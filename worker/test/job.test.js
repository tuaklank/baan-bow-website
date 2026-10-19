// กำหนดส่งเริ่มต้นของงาน และเวลาแจ้งเตือน 2 รอบต่อวัน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOB_DEFAULT_DUE_DAYS, CRON_MORNING, CRON_EVENING, CRON_TEST, CRON_TEST_DATE,
  JOB_STATUSES, JOB_OPEN_SQL,
} from '../src/config.js';
import { addDays, todayBkk, dayOfWeek, isValidYmd } from '../src/thai.js';

test('ไม่ระบุกำหนดส่ง ใช้ 4 วันนับจากวันเปิดงาน', () => {
  assert.equal(JOB_DEFAULT_DUE_DAYS, 4);
  assert.equal(addDays('2026-10-19', JOB_DEFAULT_DUE_DAYS), '2026-10-23');
  assert.equal(addDays('2026-12-30', JOB_DEFAULT_DUE_DAYS), '2027-01-03');   // ข้ามปี
  assert.equal(addDays('2028-02-26', JOB_DEFAULT_DUE_DAYS), '2028-03-01');   // ปีอธิกสุรทิน
});

test('กำหนดส่งเริ่มต้นคำนวณจากวันนี้ตามเวลาไทย', () => {
  const today = todayBkk();
  const due = addDays(today, JOB_DEFAULT_DUE_DAYS);
  assert.ok(due > today);
  const diff = (new Date(due + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000;
  assert.equal(diff, JOB_DEFAULT_DUE_DAYS);
});

test('cron เช้า 08:00 และเย็น 17:00 เวลาไทย แปลงเป็น UTC ถูกต้อง', () => {
  // ไทย = UTC+7 → 08:00 ไทย = 01:00 UTC, 17:00 ไทย = 10:00 UTC
  assert.equal(CRON_MORNING, '0 1 * * *');
  assert.equal(CRON_EVENING, '0 10 * * *');
  const hourUtc = (c) => Number(c.split(' ')[1]);
  assert.equal((hourUtc(CRON_MORNING) + 7) % 24, 8);
  assert.equal((hourUtc(CRON_EVENING) + 7) % 24, 17);
});

test('cron ทุกตัวต้องไม่ซ้ำกัน ไม่งั้นแยกไม่ออกว่ารอบไหน', () => {
  const all = [CRON_MORNING, CRON_EVENING, CRON_TEST];
  assert.equal(new Set(all).size, all.length);
});

test('รอบทดสอบตั้งไว้ 20:00 น. เวลาไทย และผูกกับวันที่เดียว', () => {
  assert.equal(CRON_TEST, '0 13 * * *');
  assert.equal((Number(CRON_TEST.split(' ')[1]) + 7) % 24, 20);
  assert.ok(isValidYmd(CRON_TEST_DATE), 'CRON_TEST_DATE ต้องเป็นวันที่จริง');
});

test('cron ที่ประกาศใน wrangler.toml ตรงกับที่โค้ดใช้เทียบ', async () => {
  const { readFileSync } = await import('node:fs');
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const line = toml.split('\n').find((l) => l.trim().startsWith('crons'));
  for (const c of [CRON_MORNING, CRON_EVENING, CRON_TEST]) {
    assert.ok(line.includes(`"${c}"`), `wrangler.toml ขาด cron "${c}"`);
  }
});

test('สถานะที่ถือว่า "ปิดแล้ว" ตรงกับที่ใช้กรองงานค้าง', () => {
  assert.match(JOB_OPEN_SQL, /'เสร็จ'/);
  assert.match(JOB_OPEN_SQL, /'ยกเลิก'/);
  for (const s of ['เสร็จ', 'ยกเลิก']) assert.ok(JOB_STATUSES.includes(s), s);
});

test('กำหนดส่ง 4 วันจากวันศุกร์ ตกวันอังคาร (ไม่ข้ามเสาร์อาทิตย์ให้)', () => {
  // 2026-10-23 เป็นวันศุกร์ — ระบบนับวันตามปฏิทิน ไม่ข้ามวันหยุดให้
  // แต่จะเตือนตอนตอบกลับถ้ากำหนดส่งตรงเสาร์-อาทิตย์หรือวันหยุด
  assert.equal(dayOfWeek('2026-10-23'), 5);
  assert.equal(addDays('2026-10-23', 4), '2026-10-27');
  assert.equal(dayOfWeek('2026-10-27'), 2);
});
