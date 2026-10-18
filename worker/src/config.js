// ข้อมูลผู้ขาย hardcode ตรงนี้ (ไม่ใช่ secret ขึ้นหัวเอกสารอยู่แล้ว)
export const SELLER = {
  name: 'บริษัท ตัวกลาง จำกัด (สำนักงานใหญ่)',
  tax_id: '0-4355-69001-41-3',
  branch: 'สำนักงานใหญ่',
  address_line1: 'เลขที่ 209 หมู่บ้านนฤมล 2 หมู่ที่ 3 ซอยโนนธาตุ 10 ถนนโนนธาตุ',
  address_line2: 'ตำบลโพธิ์ชัย อำเภอเมืองหนองคาย จังหวัดหนองคาย 43000',
  phone: '086-362-4117',
  bank: 'ธนาคารกสิกรไทย',
  bank_account: '142-199-255-6',
  bank_account_name: 'บ้านโบว์',
  brand_th: 'บ้านโบว์',
  brand_tagline: 'Make every moment special',
  footer: "Baanbow · More than a bow, it's a feeling",
};

// ประเภทเอกสาร — tax: true = บังคับมี VAT 7% แยกบรรทัด
export const TYPES = {
  quotation:           { prefix: 'QT', th: 'ใบเสนอราคา',                 en: 'QUOTATION',           tax: false, sign: ['ผู้เสนอราคา', 'ผู้อนุมัติ / ลูกค้า'] },
  receipt:             { prefix: 'RC', th: 'ใบเสร็จรับเงิน',              en: 'RECEIPT',             tax: false, sign: ['ผู้รับเงิน', 'ผู้จ่ายเงิน'] },
  tax_invoice:         { prefix: 'TI', th: 'ใบกำกับภาษี',                 en: 'TAX INVOICE',         tax: true,  sign: ['ผู้ออกเอกสาร', 'ผู้รับเอกสาร'] },
  receipt_tax_invoice: { prefix: 'RT', th: 'ใบเสร็จรับเงิน / ใบกำกับภาษี', en: 'RECEIPT / TAX INVOICE', tax: true, sign: ['ผู้รับเงิน', 'ผู้จ่ายเงิน'] },
};

// คำนำหน้า -> ชนิด (ใช้ตอนค้นหา/ยกเลิกด้วยเลขที่เอกสาร)
export const PREFIX_TO_TYPE = Object.fromEntries(
  Object.entries(TYPES).map(([type, t]) => [t.prefix, type]),
);

export const VAT_RATE_BP = 700;   // 7% เป็น basis point
export const WHT_ALLOWED_BP = [100, 300];  // หัก ณ ที่จ่าย 1% / 3% เท่านั้น

export const JOB_STATUSES = ['รอดำเนินการ', 'กำลังทำ', 'รอลูกค้า', 'เสร็จ', 'ยกเลิก'];
export const JOB_OPEN_SQL = "status NOT IN ('เสร็จ','ยกเลิก')";

export const PENDING_TTL_MS = 15 * 60 * 1000;   // รายการรอยืนยันหมดอายุ 15 นาที
