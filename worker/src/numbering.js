// เลขที่เอกสาร = prefix + ddmmyy(พ.ศ. 2 หลัก) + เลขรัน 3 หลัก
// เลขรันต่อเนื่องตลอด แยกตามประเภท ไม่รีเซ็ตรายวัน (ddmmyy เป็นแค่วันที่ออก)
import { TYPES } from './config.js';
import { ddmmyyBE } from './thai.js';

/** ประกอบเลขที่ — ฟังก์ชันบริสุทธิ์ เทสต์ได้ตรง */
export function formatDocNo(type, ymd, n) {
  const t = TYPES[type];
  if (!t) throw new Error('ประเภทเอกสารไม่ถูกต้อง: ' + type);
  if (!Number.isInteger(n) || n < 1) throw new Error('เลขรันต้องเป็นจำนวนเต็มตั้งแต่ 1');
  // เกิน 999 แล้วให้ยาวขึ้นเอง ไม่ตัดหลักทิ้ง เลขจึงไม่ซ้ำกันตลอดอายุระบบ
  return t.prefix + ddmmyyBE(ymd) + String(n).padStart(3, '0');
}

/** แกะเลขที่กลับเป็นส่วนๆ (ใช้ตอนค้นหา) — คืน null ถ้าไม่ใช่รูปแบบเลขที่เอกสาร */
export function parseDocNo(docNo) {
  const m = String(docNo || '').trim().toUpperCase().match(/^(QT|RC|TI|RT)(\d{6})(\d{3,})$/);
  if (!m) return null;
  const type = Object.keys(TYPES).find((k) => TYPES[k].prefix === m[1]);
  return { type, prefix: m[1], ddmmyy: m[2], n: Number(m[3]), doc_no: m[0] };
}

/**
 * ออกเลขรันถัดไปแบบ atomic — คำสั่งเดียว D1 รับประกันว่าไม่มีใครได้เลขเดียวกัน
 * เรียกเฉพาะตอนผู้ใช้พิมพ์ "ยืนยัน" เท่านั้น
 */
export async function nextRunningNo(db, type) {
  if (!TYPES[type]) throw new Error('ประเภทเอกสารไม่ถูกต้อง: ' + type);
  const row = await db
    .prepare('INSERT INTO counters (key, n) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(type)
    .first();
  return row.n;
}

/** token สุ่ม 32 ตัวอักษร (hex) สำหรับลิงก์ /d/:token */
export function newToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
