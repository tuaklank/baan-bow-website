-- สมุดจดออเดอร์โบว์ — แทนสมุดเล่มที่จดด้วยมือ
-- แยกจาก jobs โดยตั้งใจ: jobs คือ "งานที่ต้องทำให้เสร็จ" มีกำหนดส่งและสถานะ
-- ส่วนตารางนี้คือ "ใครสั่งอะไร ทางไหน ราคาเท่าไร" ไว้ย้อนดูและรวมยอด
-- ราคาในนี้ไม่นับเป็นรายรับ — รายรับยังมาจาก documents ที่ออกแล้วเท่านั้น (ดู 0003)
--
-- หนึ่งแถว = โบว์หนึ่งชิ้น เจ้าของร้านสั่งโบว์มาไว้ก่อนทีละหลายสิบชิ้นหลายแบบ
-- ตอนนั้นยังไม่มีลูกค้า ช่องทางกับผู้สั่งจึงว่างไว้ แล้วค่อยมาเติมทีละชิ้นเมื่อมีคนสั่ง
-- จึงเก็บเป็นชิ้นละแถว ไม่เก็บเป็นแถวเดียวที่มีจำนวน ไม่งั้นเติมชื่อลูกค้าทีละชิ้นไม่ได้

CREATE TABLE bow_orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_date  TEXT NOT NULL,                        -- YYYY-MM-DD เวลาไทย
  style       TEXT NOT NULL,                        -- แบบของโบว์ เก็บตามที่พิมพ์ ไม่ล็อกรายชื่อ
  channel     TEXT,                                 -- ช่องทางที่ลูกค้าสั่ง (ดู ORDER_CHANNELS ใน src/config.js)
  detail      TEXT,                                 -- รายละเอียด เช่น สี ขนาด
  customer    TEXT,                                 -- ใครเป็นคนสั่ง
  price       INTEGER CHECK (price IS NULL OR price >= 0),   -- สตางค์; ยังไม่รู้ราคาเว้นว่างได้ เติมทีหลัง
  paid_at     TEXT,                                 -- วันที่แจ้งว่าจ่ายแล้ว (YYYY-MM-DD); ว่าง = ยังไม่จ่าย ช่องติ๊กในตารางว่างไว้
  wage        INTEGER CHECK (wage IS NULL OR wage >= 0),     -- ค่าจ้างทำโบว์ชิ้นนี้ (สตางค์); เติมทีหลังได้
  wage_paid_at TEXT,                                -- วันที่จ่ายค่าจ้างแล้ว; ว่าง = ยังไม่จ่าย
  status      TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','void')),
  void_reason TEXT,
  voided_at   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- ทุก query ที่รวมยอดกรอง status='recorded' จึงเอาไว้เป็นช่องแรกของ index (เหมือน expenses)
CREATE INDEX idx_bow_orders_month ON bow_orders (status, order_date DESC);

-- ประวัติการแก้ — ออเดอร์แก้ทับแถวเดิมได้ (เลขออเดอร์ต้องคงเดิม จะได้อ้างเลขเดิมได้ตลอด)
-- จึงต้องมีตารางนี้เก็บว่าเคยเป็นอะไรมาก่อน เหมือน job_events
CREATE TABLE bow_order_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES bow_orders(id),
  text     TEXT NOT NULL,
  at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bow_order_events ON bow_order_events (order_id, id);

-- ลิงก์หน้าตารางออเดอร์ของแต่ละเดือน — เดือนละ token เดียว ใช้ซ้ำได้ตลอด
-- หน้านี้อยู่ใต้ /d/ ซึ่งไม่มี login กั้น และมีชื่อลูกค้ากับราคา จึงต้องเดา URL ไม่ได้
CREATE TABLE order_sheets (
  ym         TEXT PRIMARY KEY,                      -- YYYY-MM
  token      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
