-- ลูกค้ามุ่งหวัง: เจ้าที่ระบบไปหามาให้วันละหนึ่ง ยังไม่ใช่ลูกค้า
-- แยกจากตาราง customers โดยตั้งใจ — customers คือคนที่เคยออกบิลให้จริงเท่านั้น
-- เอามาปนกันเมื่อไหร่ ยอดลูกค้าและการดึงที่อยู่ตอนออกบิลจะเพี้ยนทันที
--
-- ไม่มีช่องไหนถูกเติมโดยไม่มีที่มา: sources เก็บ URL ของทุกช่องที่กรอก
-- ช่องที่หาที่มาไม่ได้ปล่อยเป็น NULL ดีกว่าใส่เบอร์ที่ไม่มีอยู่จริงลงไป
CREATE TABLE leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  found_date  TEXT NOT NULL,                   -- YYYY-MM-DD เวลาไทย (วันที่ระบบหาเจอ)
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL UNIQUE,            -- ชื่อที่ตัดช่องว่าง/คำนำหน้าออก — กันหาเจ้าเดิมซ้ำ
  category    TEXT,                            -- ทำธุรกิจอะไร (ตามที่อ่านมาได้ ไม่ใช่หมวดตายตัว)
  province    TEXT,
  phone       TEXT,
  website     TEXT,
  facebook    TEXT,
  line_id     TEXT,                            -- ส่วนใหญ่เป็น NULL — ไลน์ไม่มีไดเรกทอรีสาธารณะให้ค้น
  why         TEXT,                            -- JSON [เหตุผลสั้นๆ] ว่าทำไมน่าคุย
  sources     TEXT,                            -- JSON {ชื่อช่อง: URL ที่มา}
  fit         INTEGER NOT NULL DEFAULT 0,      -- ตรงกลุ่มกับลูกค้าที่จ่ายเงินจริง 0-5
  reach       INTEGER NOT NULL DEFAULT 0,      -- ติดต่อได้จริงแค่ไหน 0-5
  timing      INTEGER NOT NULL DEFAULT 0,      -- มีสัญญาณว่าตอนนี้เป็นจังหวะไหม 0-5
  draft       TEXT,                            -- ข้อความเปิดการขายที่ร่างไว้ (คนกดส่งเอง)
  status      TEXT NOT NULL DEFAULT 'new'
              CHECK (status IN ('new','interested','contacted','replied','won','dropped')),
  status_note TEXT,                            -- เหตุผลตอนกดไม่สนใจ = ของที่ป้อนกลับเข้ารอบถัดไป
  customer_id INTEGER REFERENCES customers(id),
  doc_no      TEXT,                            -- ปิดการขายได้แล้วออกเอกสารใบไหน
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_leads_found  ON leads (found_date DESC);
CREATE INDEX idx_leads_status ON leads (status, id DESC);
