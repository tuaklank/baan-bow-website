// ตรวจลายเซ็น x-line-signature — ด่านเดียวที่กันคนอื่นยิง /webhook เข้ามา
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature } from '../src/line.js';

const SECRET = 'test-channel-secret';
const BODY = JSON.stringify({ events: [{ type: 'message', message: { type: 'text', text: 'งานค้าง' } }] });

const bytes = (s) => new TextEncoder().encode(s);
const sign = (secret, body) => createHmac('sha256', secret).update(body).digest('base64');

test('ลายเซ็นถูกต้อง ผ่าน', async () => {
  assert.equal(await verifySignature(SECRET, bytes(BODY), sign(SECRET, BODY)), true);
});

test('body ถูกแก้แม้ตัวเดียว ไม่ผ่าน', async () => {
  const sig = sign(SECRET, BODY);
  assert.equal(await verifySignature(SECRET, bytes(BODY.replace('งานค้าง', 'งานค้างX')), sig), false);
});

test('เซ็นด้วย secret อื่น ไม่ผ่าน', async () => {
  assert.equal(await verifySignature(SECRET, bytes(BODY), sign('secret-ของคนอื่น', BODY)), false);
});

test('ไม่มีลายเซ็น หรือไม่มี secret ไม่ผ่าน', async () => {
  assert.equal(await verifySignature(SECRET, bytes(BODY), null), false);
  assert.equal(await verifySignature(SECRET, bytes(BODY), ''), false);
  assert.equal(await verifySignature('', bytes(BODY), sign(SECRET, BODY)), false);
  assert.equal(await verifySignature(undefined, bytes(BODY), sign(SECRET, BODY)), false);
});

test('ลายเซ็นที่ไม่ใช่ base64 หรือความยาวผิด ไม่ผ่าน (ไม่ throw)', async () => {
  assert.equal(await verifySignature(SECRET, bytes(BODY), 'ไม่ใช่ base64 เลย!!'), false);
  assert.equal(await verifySignature(SECRET, bytes(BODY), 'c2hvcnQ='), false);   // สั้นกว่า 32 ไบต์
  assert.equal(await verifySignature(SECRET, bytes(BODY), sign(SECRET, BODY) + 'AAAA'), false);
});

test('รับ body เป็น ArrayBuffer ได้ (ชนิดที่ request.arrayBuffer() คืนมา)', async () => {
  const buf = bytes(BODY).buffer;
  assert.equal(await verifySignature(SECRET, buf, sign(SECRET, BODY)), true);
});

test('body ว่าง ก็ยังตรวจได้', async () => {
  assert.equal(await verifySignature(SECRET, bytes(''), sign(SECRET, '')), true);
  assert.equal(await verifySignature(SECRET, bytes(''), sign(SECRET, 'x')), false);
});
