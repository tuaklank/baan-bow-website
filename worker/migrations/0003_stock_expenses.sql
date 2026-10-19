-- สต๊อกโบว์สำเร็จรูป + รายจ่าย
-- เงินทุกช่องเป็น "สตางค์" (INTEGER) เหมือนทุกตารางในระบบนี้
-- รายรับไม่มีตารางของตัวเอง โดยตั้งใจ — ดึงจาก documents ที่ status='issued' ตรงๆ
-- ไม่งั้นยอดขายจะมี 2 แหล่งที่ไม่ตรงกัน แล้วไม่รู้ว่าจะเชื่ออันไหน

-- สินค้า: นับเป็นชิ้น (โบว์สำเร็จรูป) ไม่ทำสต๊อกผ้า/ริบบิ้นเป็นม้วน
CREATE TABLE products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL UNIQUE,   -- ชื่อที่ตัดช่องว่าง/ตัวพิมพ์ออก ใช้จับคู่ของเดิม (เหมือน customers.name_key)
  unit       TEXT NOT NULL DEFAULT 'ชิ้น',
  cost       INTEGER,                -- ต้นทุนต่อชิ้นล่าสุด (ไว้ประเมินมูลค่าสต๊อก)
  price      INTEGER,                -- ราคาขายต่อชิ้น ไว้เติมให้ตอนออกบิล
  note       TEXT,
  active     INTEGER NOT NULL DEFAULT 1,   -- เลิกขายแล้วตั้ง 0 ไม่ต้องลบ ประวัติจะได้ไม่ขาด
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- สมุดเดินของ: ยอดคงเหลือ = SUM(delta) ไม่เก็บเป็นตัวเลขเดียวที่เขียนทับ
-- เพราะถ้าเก็บยอดไว้เฉยๆ วันที่ของหายจะไม่รู้ว่าหายตอนไหน
-- ห้ามลบแถว ลงผิดให้ลงแถวใหม่แก้ด้วย reason='ปรับยอด' (เหมือนเอกสารที่ยกเลิกแต่ไม่ลบ)
CREATE TABLE stock_moves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  delta      INTEGER NOT NULL CHECK (delta <> 0),   -- + รับเข้า / - ตัดออก
  reason     TEXT NOT NULL CHECK (reason IN ('รับเข้า','ส่งของ','ปรับยอด','เสียหาย')),
  unit_cost  INTEGER,                               -- ต้นทุนต่อชิ้นตอนรับเข้า (เก็บไว้กับแถว ราคาขึ้นทีหลังไม่กระทบของเก่า)
  job_id     INTEGER REFERENCES jobs(id),           -- ตัดออกเพราะส่งของงานไหน
  doc_no     TEXT,                                  -- อ้างเอกสารได้ถ้ามี
  note       TEXT,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stock_moves_product ON stock_moves (product_id, id DESC);
CREATE INDEX idx_stock_moves_job     ON stock_moves (job_id);
CREATE INDEX idx_stock_moves_at      ON stock_moves (at DESC);

-- รายจ่าย 4 หมวด ผูกงานได้ถ้าเป็นค่าใช้จ่ายของงานนั้นโดยตรง
-- หมวดเก็บเป็นข้อความไทยตรงๆ เหมือน jobs.status เพราะเอาขึ้นจอได้เลยไม่ต้องแปลง
CREATE TABLE expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  spent_date TEXT NOT NULL,                         -- YYYY-MM-DD เวลาไทย
  category   TEXT NOT NULL CHECK (category IN ('ค่าวัสดุ','ค่าส่ง','ค่าแรง','อื่นๆ')),
  amount     INTEGER NOT NULL CHECK (amount > 0),   -- สตางค์
  note       TEXT,
  job_id     INTEGER REFERENCES jobs(id),
  seller     TEXT NOT NULL DEFAULT 'tuaklang',      -- จ่ายในนามบริษัทไหน (ดู SELLERS ใน src/config.js)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expenses_date   ON expenses (spent_date DESC);
CREATE INDEX idx_expenses_cat    ON expenses (category, spent_date DESC);
CREATE INDEX idx_expenses_job    ON expenses (job_id);
CREATE INDEX idx_expenses_seller ON expenses (seller, spent_date DESC);
