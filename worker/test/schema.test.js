// กันบั๊กที่เคยทำให้บอทพังทุกข้อความ: schema ที่ API ปฏิเสธตั้งแต่ด่านตรวจ
// ทั้งสองข้อนี้ไม่มีอะไรจับได้เลยตอนรันเทสปกติ เพราะ error เกิดฝั่ง API ตอนเรียกจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA } from '../src/ai.js';

/** เดินทุก node ของ schema คืนรายการ [path, node] */
function walk(node, path = '$', out = []) {
  if (!node || typeof node !== 'object') return out;
  out.push([path, node]);
  for (const [k, v] of Object.entries(node.properties ?? {})) walk(v, `${path}.${k}`, out);
  if (node.items) walk(node.items, `${path}[]`, out);
  return out;
}

const nodes = walk(SCHEMA);

test('ไม่มีช่องไหนใส่ enum คู่กับ type ที่เป็นอาร์เรย์', () => {
  // API: "Enum value 'quotation' does not match declared type '['string','null']'"
  const bad = nodes.filter(([, n]) => Array.isArray(n.type) && n.enum);
  assert.deepEqual(bad.map(([p]) => p), [], 'ช่องที่ผิด: ' + bad.map(([p]) => p).join(', '));
});

test('จำนวนช่องที่เป็น union ไม่เกิน 16 ตามลิมิตของ API', () => {
  // API: "too many parameters with union types ... (limit: 16 parameters with unions)"
  const unions = nodes.filter(([, n]) => Array.isArray(n.type) || n.anyOf || n.oneOf);
  assert.ok(
    unions.length <= 16,
    `มี union ${unions.length} ช่อง (ลิมิต 16): ` + unions.map(([p]) => p).join(', '),
  );
});

test('ทุก object ปิด additionalProperties และประกาศ required ครบทุก property', () => {
  for (const [path, n] of nodes) {
    if (n.type !== 'object') continue;
    assert.equal(n.additionalProperties, false, `${path} ต้องปิด additionalProperties`);
    assert.deepEqual(
      [...(n.required ?? [])].sort(),
      Object.keys(n.properties ?? {}).sort(),
      `${path} required ไม่ตรงกับ properties`,
    );
  }
});

test('intent ครอบคลุมทุกคำสั่งที่ handlers รองรับ', () => {
  assert.deepEqual([...SCHEMA.properties.intent.enum].sort(), [
    'add_expense', 'add_holiday', 'convert_doc', 'count_stock', 'create_doc', 'create_job',
    'help', 'job_from_doc', 'list_jobs', 'list_stock', 'month_summary', 'receive_stock',
    'search', 'ship_job', 'unknown', 'update_job', 'void_doc',
  ].sort());
});
