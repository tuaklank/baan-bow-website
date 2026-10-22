// โลโก้และท้ายกระดาษ — ใช้ร่วมกันทุกบริษัท เพราะเป็นแบรนด์ร้านเดียวกัน
export const BRAND = {
  brand_th: 'บ้านโบว์',
  brand_tagline: 'Make every moment special',
  footer: "Baanbow · More than a bow, it's a feeling",
};

// ช่องทางรับเงิน — บัญชีเดียวกันทั้งสองบริษัท (QR บนเอกสารเป็นบัญชีนี้)
export const PAYMENT = {
  bank: 'ธนาคารกสิกรไทย',
  bank_account: '142-199-255-6',
  bank_account_name: 'บ้านโบว์',
};

/**
 * ผู้ขาย — เลือกได้ทีละบิลว่าจะออกในนามไหน
 * tax_id เป็น null = ไม่มีเลขประจำตัวผู้เสียภาษี จึงออกใบกำกับภาษี (TI/RT) ไม่ได้
 * ระบบจะปฏิเสธให้เองใน handlers.js ไม่ต้องจำเอง
 */
export const SELLERS = {
  tuaklang: {
    key: 'tuaklang',
    label: 'บริษัท ตัวกลาง จำกัด',
    name: 'บริษัท ตัวกลาง จำกัด (สำนักงานใหญ่)',
    tax_id: '0-4355-69001-41-3',
    branch: 'สำนักงานใหญ่',
    address_line1: 'เลขที่ 209 หมู่บ้านนฤมล 2 หมู่ที่ 3 ซอยโนนธาตุ 10 ถนนโนนธาตุ',
    address_line2: 'ตำบลโพธิ์ชัย อำเภอเมืองหนองคาย จังหวัดหนองคาย 43000',
    phone: '086-362-4117',
    email: null,
  },
  baanbow: {
    key: 'baanbow',
    label: 'BAANBOW',
    name: 'BAANBOW',
    tax_id: null,
    branch: null,
    address_line1: '209 หมู่ที่ 3 ตำบลโพธิ์ชัย',
    address_line2: 'อำเภอเมือง จังหวัดหนองคาย 43000',
    phone: '086-362-4117',
    email: 'Tirachai_love_@hotmail.com',
  },
};

// ไม่ระบุว่าออกในนามไหน ใช้ตัวนี้ (ตัวที่ใช้อยู่เดิม เอกสารเก่าทุกใบเป็นตัวนี้)
export const DEFAULT_SELLER = 'tuaklang';

export const getSeller = (key) => SELLERS[key] ?? SELLERS[DEFAULT_SELLER];

/** ผู้ขายที่ไม่มีเลขประจำตัวผู้เสียภาษี ออกใบกำกับภาษี (TI/RT) ไม่ได้ตามกฎหมาย */
export const sellerCanIssue = (seller, type) => !TYPES[type]?.tax || Boolean(seller?.tax_id);

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

/**
 * เอกสารแต่ละประเภทแปลว่าเงินเข้ามาแล้วหรือยัง — ใช้ตัดสินว่านับเป็นรายรับได้ไหม
 *   paid  ออกตอนรับเงินแล้ว = รายรับจริง
 *   due   ออกบิลไปแล้วแต่ยังไม่รู้ว่าเก็บได้ = ค้างรับ
 *   quote เสนอราคาไป ลูกค้ายังไม่ตอบ = ยังไม่ใช่ยอดขาย
 *
 * ห้ามเอา quote ไปรวมเป็นรายรับเด็ดขาด นอกจากจะไม่ใช่เงินแล้ว
 * ใบเสนอราคาที่ลูกค้าตกลงจะถูกแปลงเป็นใบเสร็จอีกใบ ถ้านับทั้งคู่จะได้ยอดซ้ำสองเท่า
 */
export const DOC_ROLE = {
  quotation:           'quote',
  receipt:             'paid',
  tax_invoice:         'due',
  receipt_tax_invoice: 'paid',
};

export const roleOf = (type) => DOC_ROLE[type] ?? 'quote';
export const INCOME_TYPES = Object.keys(DOC_ROLE).filter((t) => DOC_ROLE[t] === 'paid');

/** SQL สำหรับ "เฉพาะเอกสารที่รับเงินแล้ว" — ที่เดียวที่นิยามว่าอะไรคือรายรับ */
export const INCOME_TYPE_SQL = INCOME_TYPES.map((t) => `'${t}'`).join(',');

/**
 * แยกยอดรายเดือนเป็น 3 กอง จากผลของ monthSummary
 * อยู่ที่นี่เพราะทั้งหน้าเว็บและข้อความในไลน์ต้องใช้ตัวเดียวกัน จะได้ไม่มีวันไม่ตรงกัน
 */
export function splitIncome(byType) {
  const out = { paid: 0, due: 0, quote: 0, quoteCount: 0, dueCount: 0 };
  for (const r of byType || []) {
    const role = roleOf(r.type);
    out[role] += r.total;
    if (role === 'quote') out.quoteCount += r.cnt;
    if (role === 'due') out.dueCount += r.cnt;
  }
  return out;
}

export const VAT_RATE_BP = 700;   // 7% เป็น basis point
export const WHT_ALLOWED_BP = [100, 300];  // หัก ณ ที่จ่าย 1% / 3% เท่านั้น

export const JOB_STATUSES = ['รอดำเนินการ', 'กำลังทำ', 'รอลูกค้า', 'เสร็จ', 'ยกเลิก'];
export const JOB_OPEN_SQL = "status NOT IN ('เสร็จ','ยกเลิก')";

// ไม่ได้บอกกำหนดส่งมา ให้ตั้งเป็นอีก 4 วันนับจากวันที่เปิดงาน
export const JOB_DEFAULT_DUE_DAYS = 4;

// Cloudflare รับ cron เป็น UTC เท่านั้น เวลาไทย = UTC+7
// แก้เวลาแจ้งเตือนที่นี่ แล้วแก้ใน wrangler.toml ให้ตรงกันด้วย
export const CRON_MORNING = '0 1 * * *';    // 08:00 น. เวลาไทย — วางแผนงานวันนี้
export const CRON_LEADS   = '0 2 * * *';    // 09:00 น. เวลาไทย — ลูกค้ามุ่งหวังวันละเจ้า
export const CRON_EVENING = '0 10 * * *';   // 17:00 น. เวลาไทย — ทวงงานที่ยังค้าง

// สต๊อกนับเป็นชิ้น (โบว์สำเร็จรูป) ไม่ทำสต๊อกผ้า/ริบบิ้นเป็นม้วน
// ยอดคงเหลือคิดจากผลรวมของสมุดเดินของ ไม่ได้เก็บเป็นตัวเลขเดียวที่เขียนทับ
export const STOCK_REASONS = ['รับเข้า', 'ส่งของ', 'ปรับยอด', 'เสียหาย'];

// ตัดสต๊อกตอน "ส่งของ" เท่านั้น — ไม่ตัดตอนออกใบเสนอราคาหรือตอนลูกค้าโอน
// เพราะใบเสนอราคาส่งไปหลายใบแต่ตกลงจริงไม่กี่ใบ ถ้าตัดตอนนั้นยอดจะเพี้ยนตลอด
export const STOCK_CUT_ON = 'ส่งของ';

// ยอมให้สต๊อกติดลบ แต่เตือนทุกครั้ง — ร้านส่งของก่อนลงรับเข้าเป็นเรื่องปกติ
// ถ้าบล็อกไว้ เจ้าของจะเลิกบันทึก แล้วระบบจะไม่มีข้อมูลเลย ซึ่งแย่กว่ายอดติดลบ
export const STOCK_ALLOW_NEGATIVE = true;

// หมวดรายจ่าย — ต้องตรงกับ CHECK ของ expenses.category ใน migration 0003
export const EXPENSE_CATEGORIES = ['ค่าวัสดุ', 'ค่าส่ง', 'ค่าแรง', 'อื่นๆ'];

export const PENDING_TTL_MS = 15 * 60 * 1000;   // รายการรอยืนยันหมดอายุ 15 นาที

// ---------- ลูกค้ามุ่งหวัง ----------

/**
 * สถานะของเจ้าที่ระบบหามาให้ — เรียงตามลำดับที่เกิดขึ้นจริง
 * ความสนใจวัดจาก "เขาตอบกลับ" ขึ้นไปเท่านั้น ก่อนหน้านั้นเป็นแค่ความเห็นของเรา
 */
export const LEAD_STATUSES = {
  new:        { th: 'ใหม่',       done: false },
  interested: { th: 'สนใจ',       done: false },
  contacted:  { th: 'ติดต่อแล้ว',  done: false },
  replied:    { th: 'เขาตอบกลับ',  done: false },
  won:        { th: 'ปิดได้',      done: true  },
  dropped:    { th: 'ไม่สนใจ',     done: true  },
};

/** คำที่พิมพ์ในไลน์ -> สถานะ (พิมพ์สั้นๆ ตอนอยู่หน้างาน ไม่ต้องเปิดเว็บ) */
export const LEAD_WORD_TO_STATUS = {
  'สนใจ': 'interested',
  'ไม่สนใจ': 'dropped',
  'ทิ้ง': 'dropped',
  'ติดต่อแล้ว': 'contacted',
  'ทักแล้ว': 'contacted',
  'ตอบกลับ': 'replied',
  'เขาตอบแล้ว': 'replied',
  'ปิดได้': 'won',
  'ปิดการขายได้': 'won',
};

/**
 * ขอบเขตการค้นหา — จุดเดียวที่ปรับว่าจะให้ไปหาใครที่ไหน
 * กลุ่มลูกค้าที่แท้จริงระบบอ่านจากบิลที่ออกจริงเอง (ดู buildProfile ใน leads.js)
 * ตรงนี้เป็นแค่กรอบกว้างๆ กันไม่ให้หลุดไปหาธุรกิจที่ไม่เกี่ยวกับเราเลย
 */
export const LEAD_SCOPE = {
  provinces: ['หนองคาย', 'อุดรธานี', 'บึงกาฬ', 'เลย', 'สกลนคร', 'ขอนแก่น'],
  segments: [
    'ศูนย์ตกแต่งรถยนต์ / ประดับยนต์',
    'ดีลเลอร์และโชว์รูมรถยนต์',
    'ออร์แกไนเซอร์ / รับจัดงานอีเวนต์',
    'ร้านดอกไม้และของขวัญ',
    'คาร์แคร์และศูนย์บริการรถ',
  ],
  // คะแนนรวม 15 ต่ำกว่านี้ไม่ต้องส่งมารบกวน — หาใหม่พรุ่งนี้ดีกว่าส่งของไม่ดี
  minScore: 8,
};

export const LEAD_MAX_SEARCHES = 12;   // เพดานการค้นเว็บต่อรอบ — กันค่าใช้จ่ายบานปลาย
