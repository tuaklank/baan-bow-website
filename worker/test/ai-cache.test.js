// คำขอที่ส่งไปหา Claude ต้องเปิดแคชไว้เสมอ
// กฎการอ่านภาษาไทยชุดนี้ส่งซ้ำทุกข้อความ ถ้าแคชหลุดคือจ่ายเต็มราคาทุกครั้งโดยไม่มีใครรู้
// (ดูของจริงได้จาก log "ai usage ... cache_r=" ด้วย wrangler tail)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest } from '../src/ai.js';

const req = (env = {}) => buildRequest(env, 'ทำใบเสนอราคา คุณสมชาย โบว์แดง 2 ชิ้น ชิ้นละ 500', '2026-10-24');

test('กฎชุดยาวถูกส่งเป็นก้อนที่ติดป้ายแคชไว้', () => {
  const { system } = req();
  assert.ok(Array.isArray(system), 'system ต้องเป็น array ของบล็อก ไม่งั้นติดป้ายแคชไม่ได้');
  assert.equal(system.length, 1);
  assert.equal(system[0].type, 'text');
  assert.deepEqual(system[0].cache_control, { type: 'ephemeral' });
});

test('ก้อนที่แคชยาวพอจะแคชได้จริง (ขั้นต่ำของรุ่นนี้คือ 512 โทเค็น)', () => {
  // นับตัวอักษรแทนโทเค็นแบบหยาบๆ — ภาษาไทยกินมากกว่า 1 ตัวอักษรต่อโทเค็นอยู่แล้ว
  // ถ้าวันหนึ่งมีคนตัด prompt ให้สั้นลงมาก แคชจะเงียบๆ ไม่ติด เทสนี้จะดักไว้ก่อน
  assert.ok(req().system[0].text.length > 3000, 'prompt สั้นเกินกว่าจะแคชได้');
});

test('วันที่ของวันนี้อยู่ใน prompt และเปลี่ยนตามวัน', () => {
  assert.match(req().system[0].text, /2026-10-24/);
  assert.match(buildRequest({}, 'x', '2026-01-01').system[0].text, /2026-01-01/);
});

test('เลือกโมเดลจาก env ได้ ไม่ต้องแก้โค้ด', () => {
  assert.equal(req().model, 'claude-sonnet-5-5');
  assert.equal(req({ CLAUDE_MODEL: 'claude-haiku-5-5' }).model, 'claude-haiku-5-5');
});

test('ยังบังคับผลลัพธ์เป็น JSON ตาม schema และใช้ effort ต่ำ', () => {
  const { output_config } = req();
  assert.equal(output_config.effort, 'low');
  assert.equal(output_config.format.type, 'json_schema');
  assert.ok(output_config.format.schema.properties.items);
});
