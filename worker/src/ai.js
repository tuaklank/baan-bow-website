// แปลงข้อความไทยที่พิมพ์ใน LINE เป็นคำสั่ง JSON
// AI มีหน้าที่ "อ่านให้เข้าใจ" เท่านั้น ห้ามคิดเลข ตัวเลขทั้งหมดคำนวณใน money.js
import Anthropic from '@anthropic-ai/sdk';
import { todayBkk, thaiDate } from './thai.js';

// โครงผลลัพธ์แบบ strict — ทุกช่องต้องมี ถ้าไม่รู้ให้เป็น null (ห้ามเดา)
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent', 'doc_type', 'customer', 'items', 'discount', 'vat_mode', 'wht_percent',
    'payment_terms', 'note', 'from_doc_no', 'doc_no', 'query', 'job', 'holiday',
  ],
  properties: {
    intent: {
      type: 'string',
      enum: [
        'create_doc', 'convert_doc', 'void_doc',
        'create_job', 'update_job', 'list_jobs',
        'search', 'month_summary', 'add_holiday',
        'help', 'unknown',
      ],
    },
    doc_type: {
      type: ['string', 'null'],
      enum: ['quotation', 'receipt', 'tax_invoice', 'receipt_tax_invoice', null],
    },
    customer: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'address', 'tax_id', 'branch', 'contact', 'phone'],
      properties: {
        name:    { type: ['string', 'null'] },
        address: { type: ['string', 'null'] },
        tax_id:  { type: ['string', 'null'] },
        branch:  { type: ['string', 'null'] },
        contact: { type: ['string', 'null'] },
        phone:   { type: ['string', 'null'] },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'note', 'qty', 'unit_price'],
        properties: {
          name:       { type: 'string' },
          note:       { type: ['string', 'null'] },
          qty:        { type: 'number' },
          unit_price: { type: 'number' },
        },
      },
    },
    discount:      { type: ['number', 'null'] },
    vat_mode:      { type: ['string', 'null'], enum: ['none', 'exclusive', 'inclusive', null] },
    wht_percent:   { type: ['number', 'null'], enum: [1, 3, null] },
    payment_terms: { type: ['string', 'null'] },
    note:          { type: ['string', 'null'] },
    from_doc_no:   { type: ['string', 'null'] },
    doc_no:        { type: ['string', 'null'] },
    query:         { type: ['string', 'null'] },
    job: {
      type: 'object',
      additionalProperties: false,
      required: ['ref', 'title', 'due_date', 'status', 'note'],
      properties: {
        ref:      { type: ['string', 'null'] },
        title:    { type: ['string', 'null'] },
        due_date: { type: ['string', 'null'] },
        status:   { type: ['string', 'null'], enum: ['รอดำเนินการ', 'กำลังทำ', 'รอลูกค้า', 'เสร็จ', 'ยกเลิก', null] },
        note:     { type: ['string', 'null'] },
      },
    },
    holiday: {
      type: 'object',
      additionalProperties: false,
      required: ['date', 'name'],
      properties: {
        date: { type: ['string', 'null'] },
        name: { type: ['string', 'null'] },
      },
    },
  },
};

const EMPTY = {
  intent: 'unknown', doc_type: null,
  customer: { name: null, address: null, tax_id: null, branch: null, contact: null, phone: null },
  items: [], discount: null, vat_mode: null, wht_percent: null,
  payment_terms: null, note: null, from_doc_no: null, doc_no: null, query: null,
  job: { ref: null, title: null, due_date: null, status: null, note: null },
  holiday: { date: null, name: null },
};

function systemPrompt(today) {
  return `คุณคือตัวแปลงข้อความของเจ้าของร้านเป็นคำสั่ง JSON สำหรับระบบเอกสารและติดตามงาน
วันนี้คือ ${today} (${thaiDate(today, true)}) เขตเวลา Asia/Bangkok
ใช้วันนี้เป็นฐานแปลงคำพูดเป็นวันที่ YYYY-MM-DD แบบ ค.ศ. เช่น "พรุ่งนี้" "ศุกร์หน้า" "สิ้นเดือน"
ถ้าผู้ใช้พูดปี พ.ศ. ให้ลบ 543 เป็น ค.ศ. ก่อน

กฎเหล็ก
- ห้ามคำนวณยอดรวม ภาษี หรือส่วนลด ดึงเฉพาะตัวเลขที่ผู้ใช้พิมพ์มาตรงๆ
- ห้ามเดาข้อมูลที่ผู้ใช้ไม่ได้พูด ช่องไหนไม่รู้ให้เป็น null
- unit_price และ discount เป็นหน่วย "บาท" ตามที่ผู้ใช้พิมพ์ (ไม่ใช่สตางค์)
- qty ไม่ระบุให้เป็น 1

การเลือก intent
- ทำใบเสนอราคา/ใบเสร็จ/ใบกำกับภาษีใบใหม่ = create_doc (ใส่ doc_type)
- ออกเอกสารใหม่จากเลขที่เอกสารเดิม เช่น "ออกใบกำกับภาษีจาก QT181069001" = convert_doc (doc_type ปลายทาง + from_doc_no)
- ยกเลิกเอกสาร เช่น "ยกเลิก RC181069003" = void_doc (ใส่ doc_no, เหตุผลใส่ note)
- เพิ่มงาน/สร้างงาน = create_job (job.title, job.due_date)
- อัปเดตงาน/งานเสร็จแล้ว/เลื่อนกำหนด = update_job (job.ref = เลขงานเช่น "3" หรือคำค้น + job.status)
- งานค้าง/งานวันนี้/งานทั้งหมด = list_jobs
- หา/ค้นหา ตามด้วยเลขที่เอกสารหรือชื่อลูกค้า = search (ใส่ query)
- สรุปเดือนนี้/ยอดเดือนนี้ = month_summary
- เพิ่มวันหยุด = add_holiday (holiday.date + holiday.name)
- ขอดูคำสั่ง/ช่วยด้วย = help
- อ่านไม่ออกหรือไม่เข้าข้อไหน = unknown

VAT (สำคัญ ห้ามเดา)
- "รวม vat" "ราคารวมภาษีแล้ว" "vat in" = inclusive
- "ไม่รวม vat" "+vat" "บวก vat" "แยก vat" = exclusive
- "ไม่มี vat" "ไม่คิด vat" = none
- ผู้ใช้ไม่พูดถึง VAT เลย = null (ระบบจะถามกลับเอง ห้ามใส่ค่าให้)

หัก ณ ที่จ่าย
- พูดถึงหัก ณ ที่จ่าย 1% = wht_percent 1, 3% = 3, ไม่พูดถึง = null

ชื่อลูกค้า: ตัดคำสั่งออกให้เหลือแต่ชื่อ เช่น "ทำใบเสนอราคาคุณสมชาย" -> name = "คุณสมชาย"
สาขา: "สาขาที่ 00004 (บ่อวิน)" หรือ "สำนักงานใหญ่" ใส่ลง customer.branch`;
}

/** คืน object ตาม SCHEMA เสมอ ถ้า AI ล่มหรือตอบไม่ได้จะคืน intent unknown */
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
      return { ...EMPTY };
    }
    if (!res.parsed_output) {
      console.error('Claude returned no parsed_output', res.stop_reason);
      return { ...EMPTY };
    }
    return { ...EMPTY, ...res.parsed_output };
  } catch (e) {
    console.error('parseCommand', e);
    return { ...EMPTY };
  }
}
