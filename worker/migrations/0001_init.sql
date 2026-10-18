-- ระบบเอกสาร + ติดตามงาน baanbow.online
-- เงินทุกช่องเก็บเป็น "สตางค์" (INTEGER) ห้ามเก็บเป็นทศนิยม
-- วันที่เก็บเป็น YYYY-MM-DD ค.ศ. ตามเวลาไทย (แปลงเป็น พ.ศ. ตอนแสดงผลเท่านั้น)

-- ลูกค้า: ออกบิลซ้ำแล้วดึงข้อมูลเดิมอัตโนมัติ
CREATE TABLE customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL UNIQUE,   -- ชื่อที่ตัดช่องว่าง/คำนำหน้าออก ใช้จับคู่ลูกค้าเดิม
  address    TEXT,
  tax_id     TEXT,
  branch     TEXT,
  contact    TEXT,
  phone      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- เลขรันเอกสาร: 1 แถวต่อ 1 ประเภท ต่อเนื่องตลอด ไม่รีเซ็ตรายวัน
-- ตั้งเลขเริ่มต้น: UPDATE counters SET n = <เลขก่อนหน้าที่ต้องการ> WHERE key='quotation';
-- เช่นอยากให้ใบแรกเป็น 005 ให้ตั้ง n = 4
CREATE TABLE counters (
  key TEXT PRIMARY KEY,
  n   INTEGER NOT NULL
);
INSERT INTO counters (key, n) VALUES
  ('quotation', 0),
  ('receipt', 0),
  ('tax_invoice', 0),
  ('receipt_tax_invoice', 0);

-- เอกสาร: ห้ามลบ ยกเลิกได้เท่านั้น (status='void') เลขที่ไม่ถูกใช้ซ้ำ
CREATE TABLE documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL CHECK (type IN ('quotation','receipt','tax_invoice','receipt_tax_invoice')),
  doc_no        TEXT NOT NULL UNIQUE,
  token         TEXT NOT NULL UNIQUE,            -- สุ่ม 32 ตัวอักษร ใช้เปิด /d/:token
  issue_date    TEXT NOT NULL,
  valid_until   TEXT,                            -- QT: ยืนราคาถึง
  customer_id   INTEGER REFERENCES customers(id),
  customer      TEXT NOT NULL,                   -- JSON สำเนาข้อมูลลูกค้า ณ วันออก (แก้ทีหลังไม่กระทบเอกสารเก่า)
  items         TEXT NOT NULL,                   -- JSON [{name,note,qty,unit_price,amount}] หน่วยสตางค์
  discount      INTEGER NOT NULL DEFAULT 0,
  vat_mode      TEXT NOT NULL CHECK (vat_mode IN ('none','exclusive','inclusive')),
  subtotal      INTEGER NOT NULL,                -- รวมรายการก่อนส่วนลด
  base          INTEGER NOT NULL,                -- มูลค่าก่อนภาษี (หลังส่วนลด)
  vat           INTEGER NOT NULL DEFAULT 0,
  wht_rate      INTEGER NOT NULL DEFAULT 0,      -- หัก ณ ที่จ่าย เป็น basis point: 0 / 100 (1%) / 300 (3%)
  wht           INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL,                -- รวมทั้งสิ้น (ยังไม่หัก ณ ที่จ่าย)
  net_payable   INTEGER NOT NULL,                -- ยอดชำระสุทธิ = total - wht
  note          TEXT,
  payment_terms TEXT,
  ref_doc_no    TEXT,                            -- เลขที่เอกสารต้นทาง (ตอนออก TI/RT จาก QT)
  status        TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  void_reason   TEXT,
  voided_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_issue   ON documents (issue_date DESC);
CREATE INDEX idx_documents_type    ON documents (type, status);
CREATE INDEX idx_documents_cust    ON documents (customer_id);

-- งาน
CREATE TABLE jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  customer    TEXT,
  customer_id INTEGER REFERENCES customers(id),
  doc_no      TEXT,
  status      TEXT NOT NULL DEFAULT 'รอดำเนินการ'
              CHECK (status IN ('รอดำเนินการ','กำลังทำ','รอลูกค้า','เสร็จ','ยกเลิก')),
  due_date    TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_jobs_open ON jobs (status, due_date);

CREATE TABLE job_events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  text   TEXT NOT NULL,
  at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_job_events_job ON job_events (job_id, id DESC);

-- รายการที่รอพิมพ์ "ยืนยัน" (1 แถวต่อ 1 ผู้ใช้ LINE) — ออกเลขที่จริงตอนยืนยันเท่านั้น
CREATE TABLE pending (
  user_id    TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL        -- epoch ms
);

-- วันหยุด: กรอกเองทุกปีตามประกาศ (เตือนตอนตั้งกำหนดส่งตรงวันหยุด)
CREATE TABLE holidays (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
