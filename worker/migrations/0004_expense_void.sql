-- แก้/ยกเลิกรายจ่ายที่ลงผิด — ยังคงหลักเดิมของระบบ: ไม่มีคำสั่งลบ มีแต่ยกเลิก
-- เหมือน documents ที่ status='issued'/'void' แล้วเก็บแถวไว้ให้ย้อนดูได้
-- รายจ่ายลงวันละหลายรายการ (ค่าส่ง) พิมพ์ผิดง่าย เมื่อก่อนลงผิดแล้วค้างในสรุปตลอดไป

-- แถวเดิมทุกแถวเป็น 'recorded' อยู่แล้วจาก DEFAULT (ตอน ALTER ค่าว่างถูกเติมด้วย default)
ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'recorded'
  CHECK (status IN ('recorded','void'));
ALTER TABLE expenses ADD COLUMN void_reason TEXT;
ALTER TABLE expenses ADD COLUMN voided_at   TEXT;

-- "แก้ไข" = ยกเลิกแถวเดิมแล้วลงแถวใหม่ ไม่ UPDATE ทับ ประวัติจะได้ไม่หาย
-- แถวเดิมชี้ไปที่แถวใหม่ด้วยช่องนี้ จะได้ไล่ได้ว่ายอดที่ถูกคือแถวไหน
-- (ADD COLUMN ที่มี REFERENCES ต้อง default NULL ตามข้อจำกัดของ sqlite)
ALTER TABLE expenses ADD COLUMN replaced_by INTEGER REFERENCES expenses(id);

-- ทุก query ที่รวมยอดกรอง status='recorded' จึงเอาไว้เป็นช่องแรกของ index
CREATE INDEX idx_expenses_status ON expenses (status, spent_date DESC);
