// หาลูกค้ามุ่งหวังครั้งละหนึ่งเจ้า — ทำงานเฉพาะตอนสั่ง "หาลูกค้า" ทางไลน์ ไม่มีรอบอัตโนมัติ
// (เคยมีรอบ cron ทุกเช้า ถอดออกแล้วเพราะค้นเว็บรอบละ 7-15 บาท การรันทิ้งไว้ทุกวันไม่คุ้ม)
//
// ทำสองขยัก ไม่ใช่ขยักเดียว:
//   1) ขยักค้น   ให้ Claude ใช้เครื่องมือค้นเว็บ/เปิดหน้าเว็บของ Anthropic แล้วเขียนรายงานออกมาเป็นข้อความ
//   2) ขยักถอด   เอารายงานนั้นมาถอดเป็น JSON ตาม schema ด้วย messages.parse (ไม่มีเครื่องมือ ไม่ต้องค้นซ้ำ)
// แยกสองขยักเพราะผลการค้นมาพร้อมการอ้างอิงแหล่งที่มา ซึ่งใช้ร่วมกับการบังคับรูปแบบ JSON ไม่ได้
// และขยักถอดราคาถูกมาก จึงไม่คุ้มที่จะเสี่ยงให้ขยักค้นตอบผิดรูปแบบแล้วทิ้งผลการค้นทั้งรอบ
import Anthropic from '@anthropic-ai/sdk';
import { LEAD_SCOPE, LEAD_MAX_SEARCHES } from './config.js';
import { todayBkk, fmtBaht } from './thai.js';
import {
  insertLead, knownNames, payingCustomers, droppedReasons, workingLeads, customerKey,
} from './db.js';

// โครงของเจ้าหนึ่งเจ้า — ช่องที่ไม่รู้ใส่ "" แล้วแปลงเป็น null ทีหลัง (หลักเดียวกับ SCHEMA ใน ai.js)
const LEAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      description: 'เจ้าที่หามาได้ เรียงจากน่าคุยที่สุด อย่างมาก 3 เจ้า ไม่เจอเลยให้ส่งอาร์เรย์ว่าง',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'category', 'province', 'phone', 'website', 'facebook', 'line_id',
          'why', 'sources', 'fit', 'reach', 'timing', 'draft'],
        properties: {
          name:     { type: 'string', description: 'ชื่อร้านหรือชื่อนิติบุคคลตามที่ปรากฏในแหล่งข้อมูล' },
          category: { type: 'string', description: 'ทำธุรกิจอะไร สั้นๆ' },
          province: { type: 'string' },
          phone:    { type: 'string', description: 'เบอร์ที่ประกาศไว้สาธารณะ ไม่มีที่มาให้ใส่ ""' },
          website:  { type: 'string' },
          facebook: { type: 'string', description: 'URL เพจสาธารณะ' },
          line_id:  { type: 'string', description: 'ไอดีไลน์ เฉพาะที่เขาเขียนไว้บนเว็บหรือเพจตัวเอง ไม่มีให้ใส่ ""' },
          why: {
            type: 'array',
            description: 'เหตุผลว่าทำไมน่าคุย 2-3 ข้อ อิงข้อเท็จจริงที่อ่านมาได้ ห้ามเขียนคำโฆษณา',
            items: { type: 'string' },
          },
          sources: {
            type: 'array',
            description: 'ที่มาของทุกช่องที่กรอก ช่องไหนไม่มีที่มาห้ามกรอกค่าลงไป',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'url'],
              properties: {
                field: { type: 'string', description: 'ชื่อช่อง เช่น name, phone, facebook' },
                url:   { type: 'string', description: 'URL ของหน้าที่อ่านค่านั้นมา' },
              },
            },
          },
          fit:    { type: 'number', description: 'ตรงกับกลุ่มลูกค้าที่จ่ายเงินจริงแค่ไหน 0-5' },
          reach:  { type: 'number', description: 'ติดต่อได้จริงแค่ไหน มีเบอร์/เพจที่ทักได้ไหม 0-5' },
          timing: { type: 'number', description: 'มีสัญญาณว่าตอนนี้เป็นจังหวะไหม 0-5 ไม่มีสัญญาณให้ 2' },
          draft:  { type: 'string', description: 'ข้อความเปิดการขายที่เจ้าของร้านจะกดส่งเอง 2-3 ประโยค สุภาพ ไม่ใช่โฆษณา' },
        },
      },
    },
  },
};

const str = (v) => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t === '' ? null : t;
};
const score = (v) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));

/** โปรไฟล์ลูกค้าที่จ่ายเงินจริง + สิ่งที่เจ้าของร้านเคยตัดสินไว้ — โจทย์ของรอบนี้ */
export async function buildProfile(db) {
  const [paying, dropped, working] = await Promise.all([
    payingCustomers(db), droppedReasons(db), workingLeads(db),
  ]);

  const lines = [];
  if (paying.length) {
    lines.push('ลูกค้าที่จ่ายเงินจริงของร้าน (เรียงตามยอดรวม):');
    for (const c of paying) {
      lines.push(`- ${c.name} · ${c.bills} ใบ · ${fmtBaht(c.total)} บาท${c.address ? ` · ${c.address}` : ''}`);
    }
  } else {
    lines.push('ยังไม่มีประวัติการขาย ให้ยึดกลุ่มธุรกิจที่ระบุไว้ข้างล่างเป็นหลัก');
  }

  if (working.length) {
    lines.push('', 'เจ้าที่เจ้าของร้านเคยกดว่าน่าคุย (หาเพิ่มแนวนี้):');
    for (const w of working) lines.push(`- ${w.name}${w.category ? ` · ${w.category}` : ''}${w.province ? ` · ${w.province}` : ''}`);
  }

  if (dropped.length) {
    lines.push('', 'เจ้าที่เจ้าของร้านเคยปฏิเสธพร้อมเหตุผล (อย่าหาแบบนี้มาอีก):');
    for (const d of dropped) lines.push(`- ${d.name}${d.category ? ` · ${d.category}` : ''} — ${d.status_note}`);
  }

  return lines.join('\n');
}

function researchPrompt(profile, known) {
  return `ร้านบ้านโบว์ที่จังหวัดหนองคาย ทำโบว์วางหน้ารถยนต์สำหรับวันส่งมอบรถ และโบว์ตกแต่งงานพิธี
ขายแบบธุรกิจถึงธุรกิจเป็นหลัก ลูกค้าสั่งครั้งละหลายชุด

${profile}

งานของคุณ: หาธุรกิจที่ยังไม่เคยเป็นลูกค้าเรา และหน้าตาคล้ายลูกค้าที่จ่ายเงินจริงข้างบน
มาให้ได้มากที่สุด 3 เจ้า โดยค้นจากข้อมูลสาธารณะเท่านั้น

ขอบเขต
- จังหวัด: ${LEAD_SCOPE.provinces.join(' / ')}
- กลุ่มธุรกิจ: ${LEAD_SCOPE.segments.join(' / ')}
- ห้ามเสนอชื่อเหล่านี้ซ้ำ (เป็นลูกค้าอยู่แล้วหรือเคยเสนอไปแล้ว):
${known.length ? known.join(', ') : '(ยังไม่มี)'}

กฎเหล็ก ผิดข้อใดข้อหนึ่งถือว่าใช้ไม่ได้
1. ทุกค่าที่กรอกต้องชี้ได้ว่าอ่านมาจากหน้าไหน ให้เปิดหน้านั้นอ่านจริงเพื่อยืนยัน
   ห้ามเดาเบอร์โทร ห้ามเดาที่อยู่ ห้ามเดาชื่อคน ช่องไหนไม่มีที่มาให้เว้นว่าง
2. เบอร์โทรเอาเฉพาะที่ธุรกิจประกาศไว้สาธารณะ (หน้าเว็บร้าน เพจธุรกิจ ป้ายร้าน)
   ห้ามเอาเบอร์มือถือส่วนตัวของบุคคล
3. ไลน์จะมีก็ต่อเมื่อเขาเขียนไอดีไว้บนเว็บหรือหน้าเพจตัวเอง ไม่มีก็ไม่ต้องมี เป็นเรื่องปกติ
4. อย่าเข้าหรือพยายามเข้าอะไรที่ต้องล็อกอิน
5. ถ้าหาเจ้าที่ข้อมูลครบพอจะติดต่อได้จริงไม่เจอเลย ให้บอกว่าไม่เจอ อย่าแต่งขึ้นมาเพื่อให้มีผลลัพธ์

สำหรับแต่ละเจ้าที่เจอ ให้เขียนรายงานสั้นๆ ประกอบด้วย
- ชื่อ ธุรกิจที่ทำ จังหวัด
- ช่องทางติดต่อที่หาเจอ พร้อม URL ที่มาของทุกช่อง
- เหตุผล 2-3 ข้อว่าทำไมน่าคุย อิงข้อเท็จจริงที่อ่านเจอ เช่น ลงรูปงานส่งมอบรถบ่อย เพิ่งเปิดสาขา
- คะแนน 3 แกน แกนละ 0-5: ตรงกลุ่ม / ติดต่อได้ / จังหวะ
- ข้อความเปิดการขายสั้นๆ ที่เจ้าของร้านจะกดส่งเอง สุภาพ ตรงไปตรงมา ไม่ใช่คำโฆษณา`;
}

/**
 * ขยักค้น — ปล่อยให้ Claude ค้นและเปิดหน้าเว็บเองจนพอใจ
 * รอบของเครื่องมือฝั่งเซิร์ฟเวอร์อาจหยุดกลางคันด้วย pause_turn เมื่อยาวเกินลิมิตหนึ่งรอบ
 * ต้องส่งเทิร์นเดิมกลับไปให้ทำต่อ ไม่งั้นได้รายงานที่ขาดครึ่งโดยไม่มี error ให้เห็น
 */
async function research(client, model, prompt) {
  const messages = [{ role: 'user', content: prompt }];
  let text = '';

  for (let i = 0; i < 4; i++) {
    const res = await client.messages.create({
      model,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search', max_uses: LEAD_MAX_SEARCHES },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: LEAD_MAX_SEARCHES },
      ],
      messages,
    });

    text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (res.stop_reason !== 'pause_turn') return { text, stop: res.stop_reason };
    messages.push({ role: 'assistant', content: res.content });
  }
  return { text, stop: 'pause_turn' };
}

/** ขยักถอด — รายงานข้อความ -> JSON ตาม schema */
async function extract(client, model, report) {
  const res = await client.messages.parse({
    model,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LEAD_SCHEMA } },
    system: 'ถอดข้อมูลจากรายงานให้ตรงตามที่เขียนไว้เท่านั้น ห้ามเติมค่าที่รายงานไม่ได้บอก ช่องที่ไม่มีให้ใส่ "" และตัวเลขที่ไม่มีให้ใส่ 0',
    messages: [{ role: 'user', content: report }],
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output) return [];
  return Array.isArray(res.parsed_output.candidates) ? res.parsed_output.candidates : [];
}

/** แปลงผลที่ถอดมาเป็นแถวที่พร้อมบันทึก — ตัดช่องที่ไม่มีที่มาทิ้งตรงนี้ */
export function toRow(c, found_date) {
  const sources = {};
  for (const s of Array.isArray(c.sources) ? c.sources : []) {
    const field = str(s?.field), url = str(s?.url);
    if (field && url) sources[field] = url;
  }
  // ช่องติดต่อที่ไม่มี URL กำกับ ถือว่าไม่มี — กันเบอร์ที่ AI แต่งขึ้นหลุดลงฐานข้อมูล
  const sourced = (key, value) => (sources[key] ? str(value) : null);

  return {
    found_date,
    name: str(c.name),
    category: str(c.category),
    province: str(c.province),
    phone: sourced('phone', c.phone),
    website: sourced('website', c.website),
    facebook: sourced('facebook', c.facebook),
    line_id: sourced('line_id', c.line_id),
    why: (Array.isArray(c.why) ? c.why : []).map(str).filter(Boolean),
    sources,
    fit: score(c.fit),
    reach: score(c.reach),
    timing: score(c.timing),
    draft: str(c.draft),
  };
}

export const leadScore = (r) => r.fit + r.reach + r.timing;

/**
 * รอบหาลูกค้าหนึ่งรอบ — คืน { lead } ถ้าได้เจ้าใหม่, { skipped } ถ้าไม่ได้ พร้อมเหตุผล
 * ไม่โยน error ออกไป เพราะรอบ cron ล้มเงียบดีกว่าปลุกเจ้าของร้านตอนเช้าด้วยข้อความ error
 */
export async function huntLead(env) {
  const db = env.DB;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.CLAUDE_MODEL || 'claude-sonnet-5-5';
  const found_date = todayBkk();

  const [profile, known] = await Promise.all([buildProfile(db), knownNames(db)]);
  const { text } = await research(client, model, researchPrompt(profile, known));
  if (!text.trim()) return { skipped: 'ค้นแล้วไม่ได้รายงานกลับมา' };

  const candidates = await extract(client, model, text);
  if (!candidates.length) return { skipped: 'รอบนี้ไม่เจอเจ้าที่ข้อมูลครบพอจะติดต่อได้' };

  const seen = new Set(known);
  const rows = candidates
    .map((c) => toRow(c, found_date))
    .filter((r) => r.name && !seen.has(customerKey(r.name)))
    .filter((r) => leadScore(r) >= LEAD_SCOPE.minScore)
    // ต้องมีช่องทางติดต่ออย่างน้อยหนึ่งช่อง ไม่งั้นรู้จักไปก็ทำอะไรไม่ได้
    .filter((r) => r.phone || r.facebook || r.website || r.line_id)
    .sort((a, b) => leadScore(b) - leadScore(a));

  for (const row of rows) {
    const lead = await insertLead(db, row);
    if (lead) return { lead };   // ชนชื่อที่เพิ่งบันทึกไปก็ข้ามไปเจ้าถัดไป
  }
  return { skipped: 'เจ้าที่เจอซ้ำกับที่มีอยู่แล้ว หรือคะแนนไม่ถึงเกณฑ์' };
}
