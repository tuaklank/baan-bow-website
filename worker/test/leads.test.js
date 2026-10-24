// ลูกค้ามุ่งหวัง — ด่านที่ต้องแน่นที่สุดคือ "ไม่มีที่มา ไม่บันทึก"
// เบอร์โทรที่ AI แต่งขึ้นมาแล้วหลุดลงฐานข้อมูล คือความเสียหายจริงของฟีเจอร์นี้:
// โทรไปไม่ติด เสียเวลา และเชื่อข้อมูลในระบบไม่ได้อีกเลย
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './d1.js';
import { toRow, leadScore } from '../src/leads.js';
import {
  insertLead, leadById, setLeadStatus, recentLeads, monthLeads,
  knownNames, upsertCustomer, droppedReasons, workingLeads,
} from '../src/db.js';

const candidate = (over = {}) => ({
  name: 'หจก. ออโต้ดีไซน์ หนองคาย',
  category: 'ศูนย์ตกแต่งรถยนต์',
  province: 'หนองคาย',
  phone: '042-413-111',
  website: 'https://autodesign.example',
  facebook: 'https://facebook.com/autodesign.nk',
  line_id: '',
  why: ['ลงรูปงานส่งมอบรถทุกสัปดาห์', 'อยู่หนองคาย ส่งเองได้'],
  sources: [
    { field: 'name', url: 'https://autodesign.example/about' },
    { field: 'phone', url: 'https://autodesign.example/contact' },
    { field: 'website', url: 'https://autodesign.example' },
    { field: 'facebook', url: 'https://facebook.com/autodesign.nk' },
  ],
  fit: 5, reach: 4, timing: 3,
  draft: 'สวัสดีครับ ทางบ้านโบว์ทำโบว์วางหน้ารถครับ',
  ...over,
});

test('ช่องที่ไม่มี URL ที่มา ถูกตัดทิ้ง ไม่บันทึกลงฐานข้อมูล', () => {
  const row = toRow(candidate({ sources: [{ field: 'name', url: 'https://autodesign.example/about' }] }), '2026-10-22');
  assert.equal(row.name, 'หจก. ออโต้ดีไซน์ หนองคาย');
  // ทุกช่องติดต่อถูกส่งมาครบ แต่ไม่มีที่มา จึงต้องไม่มีสักช่อง
  assert.equal(row.phone, null, 'เบอร์ที่ไม่มีที่มาต้องไม่ถูกเก็บ');
  assert.equal(row.website, null);
  assert.equal(row.facebook, null);
  assert.equal(row.line_id, null);
});

test('ช่องที่มี URL ที่มา เก็บไว้พร้อมลิงก์', () => {
  const row = toRow(candidate(), '2026-10-22');
  assert.equal(row.phone, '042-413-111');
  assert.equal(row.facebook, 'https://facebook.com/autodesign.nk');
  assert.equal(row.sources.phone, 'https://autodesign.example/contact');
  assert.equal(row.line_id, null, 'ไลน์ไม่ได้มาก็คือไม่มี ไม่ใช่ค่าว่างที่ดูเหมือนมี');
});

test('ที่มาที่ส่งมาแหว่ง (ไม่มี url หรือไม่มีชื่อช่อง) ไม่นับว่ามีที่มา', () => {
  const row = toRow(candidate({
    sources: [{ field: 'phone', url: '' }, { field: '', url: 'https://x.example' }],
  }), '2026-10-22');
  assert.equal(row.phone, null);
  assert.deepEqual(row.sources, {});
});

test('คะแนนถูกบีบให้อยู่ในช่วง 0-5 เสมอ', () => {
  const row = toRow(candidate({ fit: 9, reach: -3, timing: 3.6 }), '2026-10-22');
  assert.equal(row.fit, 5);
  assert.equal(row.reach, 0);
  assert.equal(row.timing, 4);
  assert.equal(leadScore(row), 9);
});

test('บันทึกแล้วอ่านกลับได้ครบ พร้อมสถานะเริ่มต้น', async () => {
  const db = freshDb();
  const row = await insertLead(db, toRow(candidate(), '2026-10-22'));
  assert.equal(row.status, 'new');
  assert.equal(row.name_key, 'ออโต้ดีไซน์หนองคาย');
  assert.deepEqual(JSON.parse(row.why).length, 2);
  assert.equal(JSON.parse(row.sources).phone, 'https://autodesign.example/contact');
});

test('เจ้าเดิมที่บันทึกไปแล้ว ไม่ถูกบันทึกซ้ำและไม่ถูกเขียนทับ', async () => {
  const db = freshDb();
  const first = await insertLead(db, toRow(candidate(), '2026-10-22'));
  await setLeadStatus(db, first.id, 'contacted', null);

  // รอบถัดไปเจอเจ้าเดิม ชื่อสะกดต่างกันนิดหน่อย
  const again = await insertLead(db, toRow(candidate({ name: 'หจก.ออโต้ดีไซน์ หนองคาย' }), '2026-11-02'));
  assert.equal(again, null, 'ซ้ำแล้วต้องคืน null ให้ไปหาเจ้าถัดไป');

  const kept = await leadById(db, first.id);
  assert.equal(kept.status, 'contacted', 'สถานะที่กดไว้ต้องไม่ถูกทับ');
  assert.equal((await recentLeads(db)).length, 1);
});

test('ลูกค้าที่เป็นลูกค้าอยู่แล้ว ถูกนับเป็นชื่อที่ห้ามเสนอซ้ำ', async () => {
  const db = freshDb();
  await upsertCustomer(db, { name: 'บริษัท โตโยต้า พัทยา จำกัด' });
  await insertLead(db, toRow(candidate(), '2026-10-22'));

  const known = await knownNames(db);
  assert.ok(known.includes('บริษัทโตโยต้าพัทยาจำกัด'), 'ลูกค้าเดิมต้องอยู่ในรายชื่อห้ามซ้ำ');
  assert.ok(known.includes('ออโต้ดีไซน์หนองคาย'), 'เจ้าที่เคยเสนอไปแล้วก็ต้องอยู่ด้วย');
});

test('เหตุผลตอนกดไม่สนใจถูกเก็บไว้ป้อนกลับเข้ารอบถัดไป', async () => {
  const db = freshDb();
  const row = await insertLead(db, toRow(candidate(), '2026-10-22'));
  await setLeadStatus(db, row.id, 'dropped', 'ร้านเล็กเกินไป สั่งทีละชิ้น');

  const reasons = await droppedReasons(db);
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0].status_note, 'ร้านเล็กเกินไป สั่งทีละชิ้น');
  assert.equal((await workingLeads(db)).length, 0);
});

test('เจ้าที่ไปได้สวยถูกแยกออกมาเป็นตัวอย่างให้รอบถัดไป', async () => {
  const db = freshDb();
  const a = await insertLead(db, toRow(candidate(), '2026-10-22'));
  const b = await insertLead(db, toRow(candidate({ name: 'บจก. อีเว้นท์ไลน์' }), '2026-10-22'));
  await setLeadStatus(db, a.id, 'interested', null);
  await setLeadStatus(db, b.id, 'dropped', 'ไกลเกินไป');

  const working = await workingLeads(db);
  assert.equal(working.length, 1);
  assert.equal(working[0].name, 'หจก. ออโต้ดีไซน์ หนองคาย');
});

test('สรุปเดือนนับแยกตามสถานะ และไม่ปนเดือนอื่น', async () => {
  const db = freshDb();
  const a = await insertLead(db, toRow(candidate(), '2026-10-22'));
  await insertLead(db, toRow(candidate({ name: 'ร้าน ก' }), '2026-10-23'));
  await insertLead(db, toRow(candidate({ name: 'ร้าน ข' }), '2026-11-01'));
  await setLeadStatus(db, a.id, 'won', null);

  const oct = await monthLeads(db, '2026-10');
  assert.equal(oct.reduce((s, r) => s + r.cnt, 0), 2);
  assert.equal(oct.find((r) => r.status === 'won').cnt, 1);
  assert.equal((await monthLeads(db, '2026-11')).reduce((s, r) => s + r.cnt, 0), 1);
});

test('สถานะที่ไม่รู้จักถูกปฏิเสธโดยฐานข้อมูล ไม่ใช่เงียบๆ ผ่านไป', async () => {
  const db = freshDb();
  const row = await insertLead(db, toRow(candidate(), '2026-10-22'));
  await assert.rejects(() => setLeadStatus(db, row.id, 'กำลังคิดอยู่', null));
});
