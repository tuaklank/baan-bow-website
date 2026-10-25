// ตัวแทน D1 บน sqlite ในหน่วยความจำ — ให้เทสเรียกฟังก์ชันใน src/db.js ได้ของจริง
// ไม่ได้เลียนแบบ D1 ทั้งหมด รองรับเท่าที่ db.js ใช้: prepare().bind().run()/first()/all()
// และ prepare().run()/first()/all() แบบไม่ bind
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

const MIG_DIR = new URL('../migrations/', import.meta.url);

/** ค่า null/undefined ส่งเข้า node:sqlite ได้ แต่ boolean ส่งไม่ได้ จึงแปลงเป็น 0/1 ก่อน */
const arg = (v) => (typeof v === 'boolean' ? Number(v) : v ?? null);

function wrap(stmt) {
  const call = (params) => ({
    run() {
      const r = stmt.run(...params);
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } };
    },
    first() {
      return stmt.get(...params) ?? null;
    },
    all() {
      return { success: true, results: stmt.all(...params) };
    },
  });
  // bind() คืน statement ที่ผูกค่าแล้ว เหมือน D1 — เรียก run/first/all ต่อได้
  return { bind: (...params) => call(params.map(arg)), ...call([]) };
}

/** ฐานข้อมูลใหม่ที่รัน migration ครบทุกไฟล์ตามลำดับเลข เหมือนที่ลงบน D1 จริง */
export function freshDb() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(MIG_DIR).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new URL(f, MIG_DIR), 'utf8'));
  }
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    _raw: db,
  };
}
