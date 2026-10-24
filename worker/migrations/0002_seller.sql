-- เลือกได้ทีละบิลว่าออกเอกสารในนามบริษัทไหน (ดู SELLERS ใน src/config.js)
-- เอกสารที่ออกไปแล้วทั้งหมดเป็นของ 'tuaklang' จึงตั้งเป็นค่าเริ่มต้นให้แถวเดิม
ALTER TABLE documents ADD COLUMN seller TEXT NOT NULL DEFAULT 'tuaklang';

-- เลขรันแยกตามประเภทเอกสาร "ไม่แยกตามบริษัท" โดยตั้งใจ
-- เลขที่เอกสารจึงไม่ซ้ำกันทั้งระบบ ไม่ว่าจะออกในนามไหนก็ตาม
CREATE INDEX idx_documents_seller ON documents (seller, issue_date DESC);
