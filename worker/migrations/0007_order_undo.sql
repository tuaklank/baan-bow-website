-- ย้อนกลับ / เดินหน้า คำสั่งออเดอร์โบว์
-- เจ้าของร้านพิมพ์ผิดแล้วได้แถวใหม่มาเป็นสิบ (เลขออเดอร์ถูกอ่านเป็นจำนวนชิ้น)
-- จึงต้องมีทางถอยที่พิมพ์คำเดียวจบ: "ย้อนกลับ" และถ้าถอยเกินก็ "เดินหน้า" กลับมาได้
--
-- หนึ่งแถว = คำสั่งออเดอร์หนึ่งครั้ง (จด / แก้ / ลบ) ของผู้ใช้คนนั้น เรียงตาม id
--   state = 'done'   คำสั่งที่มีผลอยู่ — "ย้อนกลับ" หยิบตัวล่าสุด
--   state = 'undone' คำสั่งที่ถูกย้อนไปแล้ว — "เดินหน้า" หยิบตัวเก่าสุด
-- สั่งคำสั่งออเดอร์ใหม่เมื่อไหร่ แถว 'undone' ของคนนั้นถูกทิ้ง (เดินหน้าไปทางเดิมไม่ได้แล้ว)
--
-- payload เป็น JSON:
--   created: [เลขที่คำสั่งนั้นจดขึ้นมาใหม่]
--   before:  [แถวเดิมทั้งแถวก่อนถูกแก้/ลบ]
--   after:   [แถวทั้งแถวตอนที่ถูกย้อน — ใส่ตอนย้อนกลับ ไว้ให้เดินหน้าคืนได้]
CREATE TABLE order_undo (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  state      TEXT NOT NULL DEFAULT 'done' CHECK (state IN ('done','undone')),
  label      TEXT NOT NULL,                         -- บอกเจ้าของร้านว่าย้อนอะไรไป เช่น "จดออเดอร์ #9–#14 (6 ชิ้น)"
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_order_undo ON order_undo (user_id, state, id);
