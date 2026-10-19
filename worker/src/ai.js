// แปลงข้อความไทยที่พิมพ์ใน LINE เป็นคำสั่ง JSON
// AI มีหน้าที่ "อ่านให้เข้าใจ" เท่านั้น ห้ามคิดเลข ตัวเลขทั้งหมดคำนวณใน money.js
import Anthropic from '@anthropic-ai/sdk';
import { todayBkk, thaiDate } from './thai.js';

// โครงผลลัพธ์ — ทุกช่องเป็นชนิดเดียว ห้ามใช้ type คู่ (["string","null"]) หรือ anyOf
// เพราะ API จำกัดช่องที่เป็น union ไว้ 16 ช่อง และ schema ของเรามีช่องว่างได้ 23 ช่อง
// จึงใช้ "" แทนค่าที่ไม่รู้ และ 0 แทนตัวเลขที่ไม่ระบุ แล้วแปลงกลับเป็น null ใน normalize()
// (ห้ามใส่ enum คู่กับ type ที่เป็นคู่ด้วย API ปฏิเสธทั้งก้อน — เคยพังมาแล้ว)
export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent', 'doc_type', 'seller', 'customer', 'items', 'discount', 'vat_mode', 'wht_percent',
    'payment_terms', 'note', 'from_doc_no', 'doc_no', 'query', 'job', 'holiday',
    'stock', 'expense',
  ],
  properties: {
    intent: {
      type: 'string',
      enum: [
        'create_doc', 'convert_doc', 'void_doc',
        'create_job', 'job_from_doc', 'update_job', 'list_jobs',
        'receive_stock', 'ship_job', 'count_stock', 'list_stock',
        'add_expense',
        'search', 'month_summary', 'add_holiday',
        'help', 'unknown',
      ],
    },
    doc_type: {
      type: 'string',
      description: 'quotation | receipt | tax_invoice | receipt_tax_invoice หรือ "" ถ้าไม่ระบุ',
    },
    seller: {
      type: 'string',
      description: 'ออกเอกสารในนามบริษัทไหน: tuaklang | baanbow หรือ "" ถ้าผู้ใช้ไม่ระบุ',
    },
    customer: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'address', 'tax_id', 'branch', 'contact', 'phone'],
      properties: {
        name:    { type: 'string', description: 'ชื่อลูกค้า ตัดคำสั่งออกให้เหลือแต่ชื่อ' },
        address: { type: 'string' },
        tax_id:  { type: 'string', description: 'เลขประจำตัวผู้เสียภาษี 13 หลัก' },
        branch:  { type: 'string', description: 'เช่น สำนักงานใหญ่ หรือ สาขาที่ 00004 (บ่อวิน)' },
        contact: { type: 'string' },
        phone:   { type: 'string' },
      },
    },
    items: {
      type: 'array',
      description: 'รายการสินค้า/บริการ ตามที่ผู้ใช้พิมพ์ ห้ามรวมยอดหรือใส่บรรทัดยอดรวมเป็นรายการ',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'note', 'qty', 'unit_price'],
        properties: {
          name:       { type: 'string' },
          note:       { type: 'string', description: 'คำอธิบายบรรทัดรอง ไม่มีให้ใส่ ""' },
          qty:        { type: 'number', description: 'ไม่ระบุให้ใส่ 1' },
          unit_price: { type: 'number', description: 'ราคาต่อหน่วยเป็นบาท ตามที่ผู้ใช้พิมพ์' },
        },
      },
    },
    discount:      { type: 'number', description: 'ส่วนลดเป็นบาท ไม่มีให้ใส่ 0' },
    vat_mode:      { type: 'string', description: 'none | exclusive | inclusive หรือ "" ถ้าผู้ใช้ไม่พูดถึง VAT' },
    wht_percent:   { type: 'number', description: 'หัก ณ ที่จ่าย 1 หรือ 3 ไม่มีให้ใส่ 0' },
    payment_terms: { type: 'string' },
    note:          { type: 'string' },
    from_doc_no:   { type: 'string', description: 'เลขที่เอกสารต้นทาง ตอนออกเอกสารต่อจากใบเดิม' },
    doc_no:        { type: 'string', description: 'เลขที่เอกสารที่จะยกเลิก' },
    query:         { type: 'string', description: 'คำค้น ตอน intent เป็น search' },
    job: {
      type: 'object',
      additionalProperties: false,
      required: ['ref', 'title', 'due_date', 'status', 'note'],
      properties: {
        ref:      { type: 'string', description: 'เลขงานหรือคำค้น' },
        title:    { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD ค.ศ. หรือ "" ถ้าไม่ระบุ' },
        status:   { type: 'string', description: 'รอดำเนินการ | กำลังทำ | รอลูกค้า | เสร็จ | ยกเลิก หรือ ""' },
        note:     { type: 'string' },
      },
    },
    holiday: {
      type: 'object',
      additionalProperties: false,
      required: ['date', 'name'],
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD ค.ศ.' },
        name: { type: 'string' },
      },
    },
    stock: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'qty', 'unit_cost', 'note'],
      properties: {
        name:      { type: 'string', description: 'ชื่อโบว์ ตัดคำสั่งออกให้เหลือแต่ชื่อสินค้า' },
        qty:       { type: 'number', description: 'จำนวนชิ้น เป็นจำนวนเต็มบวก ไม่ระบุให้ใส่ 0' },
        unit_cost: { type: 'number', description: 'ต้นทุนต่อชิ้นเป็นบาท ไม่บอกให้ใส่ 0' },
        note:      { type: 'string' },
      },
    },
    expense: {
      type: 'object',
      additionalProperties: false,
      required: ['category', 'amount', 'spent_date', 'note'],
      properties: {
        category:   { type: 'string', description: 'ค่าวัสดุ | ค่าส่ง | ค่าแรง | อื่นๆ' },
        amount:     { type: 'number', description: 'ยอดเป็นบาท ตามที่ผู้ใช้พิมพ์' },
        spent_date: { type: 'string', description: 'YYYY-MM-DD ค.ศ. ไม่บอกวันให้ใส่ "" (ระบบใช้วันนี้)' },
        note:       { type: 'string', description: 'จ่ายค่าอะไร ร้านไหน' },
      },
    },
  },
};

export const EMPTY = {
  intent: 'unknown', doc_type: null, seller: null,
  customer: { name: null, address: null, tax_id: null, branch: null, contact: null, phone: null },
  items: [], discount: 0, vat_mode: null, wht_percent: null,
  payment_terms: null, note: null, from_doc_no: null, doc_no: null, query: null,
  job: { ref: null, title: null, due_date: null, status: null, note: null },
  holiday: { date: null, name: null },
  stock: { name: null, qty: 0, unit_cost: null, note: null },
  expense: { category: null, amount: 0, spent_date: null, note: null },
  failed: null,
};

/** "" และช่องว่างล้วน -> null เพื่อให้โค้ดส่วนอื่นเช็ค null ได้เหมือนเดิม */
const str = (v) => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function normalize(raw) {
  const c = raw.customer ?? {};
  const j = raw.job ?? {};
  const h = raw.holiday ?? {};
  const st = raw.stock ?? {};
  const ex = raw.expense ?? {};
  return {
    intent: raw.intent || 'unknown',
    doc_type: str(raw.doc_type),
    seller: str(raw.seller),
    customer: {
      name: str(c.name), address: str(c.address), tax_id: str(c.tax_id),
      branch: str(c.branch), contact: str(c.contact), phone: str(c.phone),
    },
    items: (Array.isArray(raw.items) ? raw.items : [])
      .filter((i) => str(i?.name))
      .map((i) => ({
        name: str(i.name),
        note: str(i.note),
        qty: num(i.qty) > 0 ? num(i.qty) : 1,
        unit_price: num(i.unit_price),
      })),
    discount: num(raw.discount),
    vat_mode: str(raw.vat_mode),
    wht_percent: num(raw.wht_percent) || null,
    payment_terms: str(raw.payment_terms),
    note: str(raw.note),
    from_doc_no: str(raw.from_doc_no),
    doc_no: str(raw.doc_no),
    query: str(raw.query),
    job: {
      ref: str(j.ref), title: str(j.title), due_date: str(j.due_date),
      status: str(j.status), note: str(j.note),
    },
    holiday: { date: str(h.date), name: str(h.name) },
    stock: {
      name: str(st.name),
      qty: Math.round(num(st.qty)),
      unit_cost: num(st.unit_cost) > 0 ? num(st.unit_cost) : null,
      note: str(st.note),
    },
    expense: {
      category: str(ex.category),
      amount: num(ex.amount),
      spent_date: str(ex.spent_date),
      note: str(ex.note),
    },
    failed: null,
  };
}

function systemPrompt(today) {
  return `คุณคือตัวแปลงข้อความของเจ้าของร้านเป็นคำสั่ง JSON สำหรับระบบเอกสารและติดตามงาน
วันนี้คือ ${today} (${thaiDate(today, true)}) เขตเวลา Asia/Bangkok
ใช้วันนี้เป็นฐานแปลงคำพูดเป็นวันที่ YYYY-MM-DD แบบ ค.ศ. เช่น "พรุ่งนี้" "ศุกร์หน้า" "สิ้นเดือน"
ถ้าผู้ใช้พูดปี พ.ศ. ให้ลบ 543 เป็น ค.ศ. ก่อน

กฎเหล็ก
- ห้ามคำนวณยอดรวม ภาษี หรือส่วนลด ดึงเฉพาะตัวเลขที่ผู้ใช้พิมพ์มาตรงๆ
- ถ้าผู้ใช้พิมพ์ยอดรวมมาให้ด้วย ห้ามใส่เป็นรายการหนึ่งบรรทัด ระบบจะรวมเอง
- ห้ามเดาข้อมูลที่ผู้ใช้ไม่ได้พูด ช่องข้อความที่ไม่รู้ให้ใส่ "" ช่องตัวเลขที่ไม่ระบุให้ใส่ 0
- unit_price และ discount เป็นหน่วย "บาท" ตามที่ผู้ใช้พิมพ์ (ไม่ใช่สตางค์)
- qty ไม่ระบุให้ใส่ 1

การเลือก intent
- ทำใบเสนอราคา/ใบเสร็จ/ใบกำกับภาษีใบใหม่ = create_doc (ใส่ doc_type)
- ออกเอกสารใหม่จากเลขที่เอกสารเดิม เช่น "ออกใบกำกับภาษีจาก QT181069001" = convert_doc (doc_type ปลายทาง + from_doc_no)
- ยกเลิกเอกสาร เช่น "ยกเลิก RC181069003" = void_doc (ใส่ doc_no, เหตุผลใส่ note)
- เพิ่มงาน/สร้างงาน = create_job (job.title, job.due_date)
- เปิดงานจากเอกสารที่ออกไปแล้ว เช่น "เปิดงานจาก QT191069005" "ลูกค้าโอนแล้ว QT191069005" = job_from_doc
  (ใส่ from_doc_no เป็นเลขที่เอกสาร ถ้าผู้ใช้พิมพ์ชื่องานต่อท้ายมาด้วยให้ใส่ job.title)
- อัปเดตงาน/งานเสร็จแล้ว/เลื่อนกำหนด = update_job (job.ref + job.status)
- งานค้าง/งานวันนี้/งานทั้งหมด = list_jobs
- หา/ค้นหา/มีบิลอะไรบ้าง ตามด้วยเลขที่เอกสารหรือชื่อลูกค้า = search (ใส่ query)
- สรุปเดือนนี้/ยอดเดือนนี้/รายรับรายจ่าย/กำไร = month_summary
- รับของเข้าสต๊อก เช่น "รับเข้า โบว์ริบบิ้นแดง 3" "เพิ่มสต๊อก โบว์ทองคำ 10 ชิ้น ต้นทุน 45" = receive_stock
  (stock.name = ชื่อโบว์, stock.qty = จำนวนชิ้น, stock.unit_cost = ต้นทุนต่อชิ้นถ้าบอกมา)
- ส่งของแล้ว/ตัดสต๊อกของงาน เช่น "ส่งของงาน 7" "ส่งของ JOB 7 แล้ว" = ship_job (job.ref = เลขงาน)
- นับสต๊อกแล้วตั้งยอดใหม่ เช่น "ปรับสต๊อก โบว์แดง = 12" "นับได้ โบว์แดง 12" = count_stock
  (stock.name + stock.qty = จำนวนที่นับได้จริง ไม่ใช่ส่วนต่าง)
- ดูสต๊อก เช่น "สต๊อก" "สต๊อกเหลือเท่าไร" = list_stock (ถามตัวใดตัวหนึ่งให้ใส่ stock.name)
- บันทึกรายจ่าย เช่น "ค่าวัสดุ 450 ซื้อริบบิ้น" "ค่าส่ง 60 Kerry" "ค่าแรง 300 พี่หน่อย" = add_expense
  (expense.category ต้องเป็น 1 ใน 4 หมวด: ค่าวัสดุ ค่าส่ง ค่าแรง อื่นๆ
   ค่าเช่า ค่าน้ำค่าไฟ ค่าธรรมเนียม จัดเป็น "อื่นๆ"
   ถ้าบอกว่าเป็นรายจ่ายของงานไหนให้ใส่ job.ref ด้วย)
- เพิ่มวันหยุด = add_holiday (holiday.date + holiday.name)
- ขอดูคำสั่ง/ช่วยด้วย = help
- อ่านไม่ออกหรือไม่เข้าข้อไหน = unknown

ผู้ใช้มักส่งข้อความยาวหลายบรรทัด มีที่อยู่ เลขผู้เสียภาษี และรายการราคาปนกัน
ให้แยกออกมาให้ครบ อย่าตอบ unknown เพียงเพราะข้อความยาวหรือมีอีโมจิปน

ที่อยู่ลูกค้า (customer.address) — สำคัญมาก เคยพลาดมาแล้ว
- คัดลอกที่อยู่มาให้ครบทุกท่อน ตั้งแต่บ้านเลขที่ ไปจนถึงรหัสไปรษณีย์ รวมเป็นบรรทัดเดียว
- ห้ามตัดท่อนหน้าทิ้ง เลขที่บ้าน หมู่ ซอย ถนน ตำบล/แขวง ต้องอยู่ครบ
  เช่น "128 หมู่ 3 ตำบลบ้านหม้อ อำเภอเมืองเพชรบุรี จังหวัดเพชรบุรี 76000"
  ห้ามเหลือแค่ "อำเภอเมืองเพชรบุรี จังหวัดเพชรบุรี 76000"
- ห้ามสรุป ห้ามย่อ ห้ามเรียบเรียงใหม่ ให้ยกมาตามที่ผู้ใช้พิมพ์
- ถ้าที่อยู่กับชื่อบริษัทอยู่คนละบรรทัด ให้เอาเฉพาะส่วนที่อยู่ ไม่ต้องเอาชื่อบริษัทมาปน
- ไม่มีที่อยู่ในข้อความเลยจึงใส่ "" ห้ามแต่งขึ้นเอง

เลขประจำตัวผู้เสียภาษี (customer.tax_id) ต้องมี 13 หลัก
- คัดมาตามที่ผู้ใช้พิมพ์ ไม่ต้องเติมหรือตัดหลักเอง
- ถ้าผู้ใช้พิมพ์มาไม่ครบ 13 หลัก ก็ใส่ตามนั้น ระบบจะตรวจและถามกลับเอง

ออกในนามบริษัทไหน (ช่อง seller)
- พูดถึง "ตัวกลาง" "บ.ตัวกลาง" "บริษัทตัวกลาง" "ในนามบริษัท" = tuaklang
- พูดถึง "บ้านโบว์" "baanbow" "ในนามร้าน" = baanbow
- ไม่ระบุ = "" (ระบบจะใช้ค่าเริ่มต้นเอง)

VAT (สำคัญ ห้ามเดา)
- "รวม vat" "ราคารวมภาษีแล้ว" "vat in" = inclusive
- "ไม่รวม vat" "+vat" "บวก vat" "แยก vat" = exclusive
- "ไม่มี vat" "ไม่คิด vat" = none
- ผู้ใช้ไม่พูดถึง VAT เลย = "" (ระบบจะถามกลับเอง ห้ามใส่ค่าให้)

หัก ณ ที่จ่าย
- พูดถึงหัก ณ ที่จ่าย 1% = wht_percent 1, 3% = 3, ไม่พูดถึง = 0`;
}

/** คืน object ตาม EMPTY เสมอ; ถ้าเรียก AI ไม่สำเร็จจะมี failed เป็นข้อความ error */
export async function parseCommand(env, text) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const today = todayBkk();

  try {
    const res = await client.messages.parse({
      model: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 2000,
      // งานนี้แค่อ่านข้อความสั้นๆ ใช้ effort ต่ำเพื่อให้ตอบ LINE ได้ทัน
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: systemPrompt(today),
      messages: [{ role: 'user', content: text }],
    });

    if (res.stop_reason === 'refusal') {
      console.error('Claude refused', res.stop_details);
      return { ...EMPTY, failed: 'ระบบปฏิเสธคำขอนี้' };
    }
    if (!res.parsed_output) {
      console.error('Claude returned no parsed_output', res.stop_reason);
      return { ...EMPTY, failed: 'อ่านผลลัพธ์ไม่ได้ (' + res.stop_reason + ')' };
    }
    return normalize(res.parsed_output);
  } catch (e) {
    // แยกให้ชัดว่า "เรียก AI ไม่สำเร็จ" ไม่ใช่ "อ่านข้อความไม่เข้าใจ"
    // ถ้าตอบ help กลับไปเฉยๆ ระบบพังแล้วจะดูเหมือนบอทโง่ หาสาเหตุไม่เจอ
    console.error('parseCommand', e);
    return { ...EMPTY, failed: String(e?.message || e).slice(0, 300) };
  }
}
