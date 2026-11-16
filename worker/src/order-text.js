// แพตเทิร์นคำสั่งรายการโบว์ที่ตายตัว — อ่านจากข้อความตรงๆ ไม่ผ่าน AI
// ทำไมต้องมี: ให้ AI เดาว่า "รายการ 24 แดงทอง" คือแก้ช่องไหน บางทีเดาผิดแล้วเจ้าของร้านงง
// พอมีคำนำหน้าช่อง (ผู้สั่ง / ช่องทาง / ราคา ...) ก็ไม่ต้องเดา ผลออกมาเหมือนเดิมทุกครั้ง
// และไม่เสียค่าเรียก AI ด้วย ข้อความที่ไม่เข้าแพตเทิร์นคืน null แล้วไหลไปให้ AI อ่านตามเดิม
import { toSatang } from './money.js';
import { normalizeChannel } from './config.js';
import { readThaiDate } from './thai.js';

export const ORDER_MAX_PER_COMMAND = 200;

/** คู่มือที่บอทส่งให้เมื่อพิมพ์ "วิธีสั่งรายการ" — ต้องตรงกับที่โค้ดในไฟล์นี้อ่านได้จริง */
export const ORDER_HELP = `📌 วิธีสั่งรายการโบว์

➕ จดใหม่
• สั่งโบว์ ML แดงทอง 10 ชิ้น
• สั่งโบว์ ML 10 ชิ้น mini 5 ชิ้น
เลขรายการเติมเลขที่ว่าง (ที่ลบไป) ก่อน แล้วค่อยต่อท้าย
จดลงเลขที่ต้องการเอง (เลขที่ว่าง หรือเลขถัดไป) ต้องบอกแบบโบว์:
• รายการ 6 แบบ ML รายละเอียด แดงทอง ราคา 3000

✏️ แก้ไข = รายการ + เลข + ชื่อช่อง + ค่าใหม่
• รายการ 3 ผู้สั่ง คุณเอ
• รายการ 3 ช่องทาง Line
• รายการ 3 ราคา 2900
• รายการ 3 แบบ ML
• รายการ 3 รายละเอียด แดงทอง
• รายการ 3 วันที่ 12/11
• รายการ 3 ค่าจ้าง 150
• รายการ 3 มัดจำ 1000           (คงเหลือคิดให้เอง = ราคา - มัดจำ)
หลายช่องในข้อความเดียว (หรือพิมพ์บรรทัดละช่องแบบ "แบบ: ML" ก็ได้):
• รายการ 3 ผู้สั่ง คุณเอ ช่องทาง Line ราคา 2900
หลายชิ้นพร้อมกัน: 1-10 หรือ 2 5 8
• รายการ 1-10 ค่าจ้าง 150
ลบค่าในช่อง ใส่ -
• รายการ 3 ผู้สั่ง -
เลขหลังคำว่า "รายการ" คือเลขรายการเสมอ ไม่ใช่จำนวนชิ้น
พิมพ์ "ออเดอร์" แทน "รายการ" ก็ได้ ผลเหมือนกัน

✅ ติ๊กจ่าย
• รายการ 3 จ่ายแล้ว            (ลูกค้าจ่าย)
• รายการ 3 ยังไม่จ่าย
• รายการ 3 จ่ายค่าจ้างแล้ว      (จ่ายช่าง)
• รายการ 3 ยังไม่จ่ายค่าจ้าง
• รายการ 3 ส่งแล้ว              (ส่งของให้ลูกค้าแล้ว)
• รายการ 3 ยังไม่ส่ง

👀 เรียกดู
• ตารางรายการ                 (ลิงก์ตาราง A4 เดือนนี้ + ยอดสรุป)
• ตารางรายการ เดือน 10
• รายการ 3                    (ดูชิ้นเดียว)
• รายการ ว่าง                  (ยังไม่มีผู้สั่ง)
• รายการ ยังไม่จ่าย             (มีผู้สั่งแล้ว ลูกค้ายังไม่จ่าย)
• รายการ ค้างค่าจ้าง            (ยังไม่จ่ายช่าง)
• รายการ มัดจำ                 (มัดจำแล้ว ยังจ่ายไม่ครบ)
• รายการ ยังไม่ส่ง              (มีผู้สั่งแล้ว ยังไม่ส่ง)
• รายการ แบบ ML
• รายการ ผู้สั่ง คุณเอ
• รายการ ช่องทาง Line
ต่อท้าย "เดือน 10" ได้ทุกคำสั่งเรียกดู

🗑 ลบ (ต้องพิมพ์ "ยืนยัน")
• ลบรายการ 3
• ลบรายการ 9-23
• ลบรายการ 2 5 8

↩️ ย้อนกลับ
• ย้อนกลับ                     (ย้อนคำสั่งรายการล่าสุด ทั้งจด แก้ และลบ พิมพ์ซ้ำ = ย้อนอีกขั้น)
• เดินหน้า                     (ย้อนเกินไป เดินกลับมาทีละขั้น)`;

const YES = '(?:จ่ายแล้ว|จ่ายเงินแล้ว|โอนแล้ว|ชำระแล้ว)';
const NO = '(?:ยังไม่จ่าย|ยังไม่ได้จ่าย|ยังไม่โอน)';
const WYES = '(?:จ่ายค่าจ้าง(?:ทำ)?(?:โบว์)?แล้ว)';
const WNO = '(?:ยังไม่(?:ได้)?จ่ายค่าจ้าง(?:ทำ)?(?:โบว์)?)';
const POLITE = /\s*(?:นะครับ|นะคะ|ครับ|ค่ะ|คะ)$/u;
const CLEAR = /^(?:-|–|ว่าง|ไม่มี|ลบ)$/u;
// ส่งของให้ลูกค้าแล้ว / ยังไม่ส่ง
export const SYES = '(?:จัดส่งแล้ว|ส่งของแล้ว|ส่งแล้ว)';
export const SNO = '(?:ยังไม่ได้ส่ง|ยังไม่ส่ง)';

/** "8-12" = ช่วง, "8 9 12" หรือ "8,9,12" = ทีละเลข — คืน {ids} หรือ {error} */
export function readOrderIds(text) {
  const ids = new Set();
  for (const part of String(text).split(/[\s,#]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)[-–](\d+)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      if (b - a >= ORDER_MAX_PER_COMMAND) {
        return { error: `ช่วง ${a}–${b} กว้างเกินไปครับ แบ่งทีละไม่เกิน ${ORDER_MAX_PER_COMMAND} รายการ` };
      }
      for (let i = a; i <= b; i++) ids.add(i);
    } else if (/^\d+$/.test(part)) ids.add(Number(part));
  }
  return { ids: [...ids] };
}

/** เลขรายการแบบย่อ: เลขติดกันสามตัวขึ้นไปรวมเป็นช่วง — "#1–#10 #14" แทนเลขสิบตัวเรียงกัน */
export function orderIdList(ids) {
  const sorted = [...ids].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) out.push(`#${sorted[i]}–#${sorted[j]}`);
    else for (let k = i; k <= j; k++) out.push('#' + sorted[k]);
    i = j + 1;
  }
  return out.join(' ');
}

// ชื่อช่องที่ใช้นำหน้าค่า — ต้องขึ้นต้นข้อความหรือตามหลังเว้นวรรค ไม่งั้นคำว่า "ราคา" ในรายละเอียดจะถูกตัด
// "ทาง" นับเป็นชื่อช่องเฉพาะเมื่อตามด้วยช่องทางที่รู้จัก (ทางไลน์) กันไปตัดคำอื่นที่ขึ้นต้นด้วย "ทาง"
// "แบบ" ตามด้วย "ที่" ได้ เพราะชื่อแบบมักเป็น "แบบที่ 2"
const FIELD_RE = new RegExp(
  '(^|\\s)(?:'
  + '((?:ชื่อ)?(?:ผู้สั่ง|คนสั่ง|ลูกค้า))(?=\\s|$)'
  + '|(ช่องทาง(?=\\s|$)|ทาง(?=\\s*(?:ไลน์|line|เฟส|fb|facebook|เพจ|หน้าร้าน|shop|ช้อป|ช็อป|ไลฟ์|live)))'
  + '|(ราคา)(?=\\s|\\d|-|$)'
  + '|(แบบ(?:โบว์)?)(?=\\s|\\d|ที่|$|(?<=โบว์)แบบ)'
  + '|(รายละเอียด(?:โบว์)?)(?=\\s|$)'
  + '|(วันที่)(?=\\s|\\d|$)'
  + '|(ค่าจ้าง(?:ทำ)?(?:โบว์)?(?:ชิ้นละ)?)(?=\\s|\\d|-|$)'
  + '|(มัดจำ|ค่ามัดจำ)(?=\\s|\\d|-|$)'
  + ')', 'giu');
// ชื่อช่องที่ตามด้วย : หรือ = (รูปแบบการ์ด) — ตัดเครื่องหมายออกให้เหลือ "ชื่อช่อง ค่า" แบบเดียวกับที่พิมพ์เอง
// หลังเครื่องหมาย : กินเฉพาะเว้นวรรค ไม่กินขึ้นบรรทัดใหม่ — เคยกิน แล้วบรรทัดถัดไป "ผู้สั่ง: ว่าง"
// ไม่ถูกมองเป็นชื่อช่อง เลยไปต่อท้ายเป็นค่าของช่องทาง (ช่องทาง = "ผู้สั่ง: ว่าง")
const CARD_COLON = /(^|\s)((?:ชื่อ)?(?:ผู้สั่ง|คนสั่ง|ลูกค้า)|ช่องทาง|ราคา|แบบ(?:โบว์)?|รายละเอียด(?:โบว์)?|วันที่|ค่าจ้าง(?:ทำ)?(?:โบว์)?|ค่ามัดจำ|มัดจำ)[^\S\n]*[:：=][^\S\n]*/gu;
const FIELD_ORDER = ['customer', 'channel', 'price', 'style', 'detail', 'order_date', 'wage', 'deposit'];
const FIELD_TH = {
  customer: 'ผู้สั่ง', channel: 'ช่องทาง', price: 'ราคา', style: 'แบบ',
  detail: 'รายละเอียด', order_date: 'วันที่', wage: 'ค่าจ้าง', deposit: 'มัดจำ',
};
const FIELD_EG = { price: '2900', wage: '150', deposit: '1000', order_date: '12/11', channel: 'Line', customer: 'คุณเอ', style: 'ML', detail: 'แดงทอง' };

/** "ที่ 2" / "แบบที่2" -> "แบบที่ 2" — ให้ชื่อแบบสะกดเหมือนกันทุกแถว ไม่งั้นสรุปตามแบบจะแตกเป็นสองบรรทัด */
export function styleName(value) {
  const v = String(value).trim();
  // "ที่2(สีน้ำเงิน)" / "แบบที่2 (น้ำเงิน)" -> "แบบที่ 2 (สีน้ำเงิน)" — ส่วนต่อท้ายเก็บตามที่พิมพ์
  // เคยรับแค่ "ที่ 2" เปล่าๆ พอมีวงเล็บต่อท้ายคำว่า "แบบ" เลยหายไป เหลือ "ที่2(สีน้ำเงิน)"
  const n = v.match(/^(?:แบบ)?\s*ที่\s*(\d+)\s*(.*)$/su);
  if (!n) return v;
  return `แบบที่ ${n[1]}${n[2] ? ' ' + n[2].trim() : ''}`;
}

/** "ลบรายการ 9-23" / "ยกเลิกรายการ 9 10 เหตุผล" -> {ids, reason} หรือ {error}; ไม่ใช่คำสั่งลบคืน null */
export function parseOrderVoid(msg) {
  const m = String(msg).trim().replace(POLITE, '')
    .match(/^(?:ลบ|ยกเลิก)\s*(?:รายการ|ออเดอร์)(?:ที่)?\s*#?\s*(\d[\d\s,#\-–]*?)(?:\s+([^\d\s,#\-–].*))?$/su);
  if (!m) return null;
  const got = readOrderIds(m[1]);
  if (got.error) return got;
  if (!got.ids.length) return null;
  return { ids: got.ids, reason: m[2]?.trim() || null };
}

/**
 * อ่านคำสั่งแก้ไข "รายการ <เลข> <ชื่อช่อง> <ค่า> [<ชื่อช่อง> <ค่า> ...] [จ่ายแล้ว]"
 * คืน null ถ้าไม่ใช่รูปแบบนี้ (ให้ AI อ่านต่อ), {error} ถ้าใช่แต่ค่าผิด,
 * หรือ {ids, set, paid, wagePaid} — set เก็บค่าที่จะลง DB แล้ว (เงินเป็นสตางค์, null = ลบค่าในช่อง)
 */
export function parseOrderEdit(msg, today) {
  const m = String(msg).trim().replace(POLITE, '')
    .match(/^((?:(?:สั่งโบว์|สั่งใหม่|เพิ่ม|จด|กู้คืน|กู้|คืน|แก้ไข|แก้|เปลี่ยน)\s*)*)(?:รายการ|ออเดอร์)(?:ที่)?\s*#?\s*([\d\s,#\-–]+?)\s*([^\d\s,#\-–].*)$/su);
  if (!m) return null;
  // "สั่งใหม่ รายการ 7 ..." = เอาเลข 7 ที่ลบไปแล้วกลับมาใช้ ไม่ใช่จดเพิ่ม 7 ชิ้น
  // (เคยถูกอ่านเป็นจำนวนชิ้นแล้วได้แถวใหม่มาเป็นสิบ) — เลขหลังคำว่ารายการคือเลขรายการเสมอ
  const revive = /สั่งใหม่|กู้|คืน/.test(m[1] ?? '');
  let rest = m[3].trim();

  // รับรูปแบบการ์ดที่บอทตอบกลับมา — เจ้าของร้านคัดลอกการ์ดแล้วแก้ค่าส่งกลับ บรรทัดละช่อง มี : คั่น
  //   แบบ: แบบที่ 1 / รายละเอียด: ... / จ่ายแล้ว: (ว่าง) / ค่าจ้างทำ: 250
  // "จ่ายแล้ว:" ที่เว้นว่างหรือเป็น - คือยังไม่ติ๊ก ไม่ใช่สั่งเอาติ๊กออก
  let cardPaid = null, cardWagePaid = null, shipped = null, isCard = false;
  const shipTail = new RegExp(`(^|\\s)(${SNO}|${SYES})$`, 'u');
  const takeShipTail = (text) => text.replace(shipTail, (_, sp, v) => { shipped = !/ยังไม่/.test(v); return sp; }).trim();
  rest = rest
    .replace(/\(\s*คงเหลือ[^)]*\)/gu, '')   // "มัดจำ: 1,000.00 บาท (คงเหลือ 2,000.00)" — คงเหลือคิดเอง ไม่ต้องอ่าน
    .replace(/(^|\s)ส่งแล้ว\s*[:：]\s*(✓|✔|ใช่|แล้ว|-|–|ยัง|ไม่)?(?=\s|$)/gu, (_, sp, v) => {
      if (v && /✓|✔|ใช่|แล้ว/.test(v)) shipped = true;
      return sp;
    })
    .replace(/\(\s*จ่ายแล้ว\s*[✓✔]?\s*\)/gu, () => { cardWagePaid = true; return ''; })
    .replace(/(^|\s)จ่ายแล้ว\s*[:：]\s*(✓|✔|ใช่|แล้ว|-|–|ยัง|ไม่)?(?=\s|$)/gu, (_, sp, v) => {
      if (v && /✓|✔|ใช่|แล้ว/.test(v)) cardPaid = true;
      return sp;
    })
    .replace(CARD_COLON, (_, sp, key) => { isCard = true; return `${sp}${key} `; })
    .trim();
  rest = takeShipTail(rest);

  // คำว่าจ่ายแล้วท้ายข้อความ — ติ๊กไปพร้อมกับการแก้ช่องอื่นได้
  let paid = null, wagePaid = null, tail = null;
  const t = rest.match(new RegExp(`(?:^|\\s)(?:ลูกค้า)?(${WYES}|${WNO}|${YES}|${NO})$`, 'u'));
  if (t) {
    tail = t[1];
    rest = rest.slice(0, t.index).trim();
  }
  rest = takeShipTail(rest);   // "... ส่งแล้ว จ่ายแล้ว" — ส่งแล้วอยู่ก่อนคำว่าจ่ายแล้วก็ได้

  const marks = [...rest.matchAll(FIELD_RE)];
  // ไม่ได้ขึ้นต้นด้วยชื่อช่อง — ไม่ใช่แพตเทิร์นนี้ ยกเว้นข้อความที่มีแต่คำติ๊ก ("รายการ 6 ส่งแล้ว จ่ายแล้ว")
  if (!marks.length ? (rest !== '' || (tail == null && shipped == null)) : marks[0].index !== 0) return null;

  const got = readOrderIds(m[2]);
  if (got.error) return got;
  if (!got.ids.length) return null;

  const set = {};
  let lastKey = null;
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    const key = FIELD_ORDER[mk.slice(2).findIndex((g) => g !== undefined)];
    const start = mk.index + mk[0].length;
    const value = rest.slice(start, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
    const eg = `เช่น "รายการ ${got.ids[0]} ${FIELD_TH[key]} ${FIELD_EG[key]}"`;
    // "แบบโบว์ แบบที่ 2" — ชื่อช่องตามด้วยค่าที่ขึ้นต้นด้วยคำเดียวกัน ให้ข้ามตัวแรกไป
    if (!value && i + 1 < marks.length
      && FIELD_ORDER[marks[i + 1].slice(2).findIndex((g) => g !== undefined)] === key) continue;
    // การ์ดที่คัดลอกมาแล้วเว้นบางช่องไว้ ("ช่องทาง:" ไม่มีค่า) = ไม่แตะช่องนั้น ไม่ใช่พิมพ์ไม่ครบ
    if (!value && isCard) continue;
    if (!value) return { error: `ยังไม่ได้ใส่${FIELD_TH[key]}ครับ ${eg}` };

    if (key === 'price' || key === 'wage' || key === 'deposit') {
      if (CLEAR.test(value)) set[key] = null;
      else {
        const n = value.match(/^([\d,]+(?:\.\d+)?)\s*(?:บาท|บ\.?)?$/u);
        if (!n) return { error: `${FIELD_TH[key]}ต้องเป็นตัวเลขครับ ${eg}` };
        set[key] = toSatang(Number(n[1].replace(/,/g, '')));
      }
    } else if (key === 'order_date') {
      const d = readThaiDate(value, today);
      if (!d) return { error: `อ่านวันที่ไม่ออกครับ ${eg}` };
      set[key] = d;
    } else if (key === 'style') {
      if (CLEAR.test(value)) return { error: `แบบโบว์เว้นว่างไม่ได้ครับ ถ้าไม่ใช้แล้วให้พิมพ์ "ลบรายการ ${got.ids[0]}"` };
      set[key] = styleName(value);
    } else if (key === 'channel') {
      set[key] = CLEAR.test(value) ? null : normalizeChannel(value);
    } else {
      set[key] = CLEAR.test(value) ? null : value;
    }
    lastKey = key;
  }

  if (tail) {
    const yes = !/ยังไม่/.test(tail);
    // "ค่าจ้าง 150 จ่ายแล้ว" = จ่ายค่าจ้าง; อย่างอื่น "จ่ายแล้ว" เฉยๆ = ลูกค้าจ่าย
    if (/ค่าจ้าง/.test(tail) || lastKey === 'wage') wagePaid = yes;
    else paid = yes;
  }
  return { ids: got.ids, set, paid: paid ?? cardPaid, wagePaid: wagePaid ?? cardWagePaid, shipped, revive };
}

/** "เดือน 10" / "เดือน 10/69" / "เดือนนี้" / "เดือนที่แล้ว" -> YYYY-MM; เดือนที่ยังมาไม่ถึงนับเป็นของปีก่อน */
function readMonth(text, today) {
  const [y, mo] = today.split('-').map(Number);
  const ym = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}`;
  if (/^เดือนนี้$/.test(text)) return ym(y, mo);
  if (/^เดือน(?:ที่แล้ว|ก่อน)$/.test(text)) return mo === 1 ? ym(y - 1, 12) : ym(y, mo - 1);
  const m = text.match(/^เดือน\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?$/);
  if (!m) return null;
  const mm = Number(m[1]);
  if (mm < 1 || mm > 12) return null;
  let yy = m[2] ? Number(m[2]) : (mm > mo ? y - 1 : y);
  if (m[2]) yy = yy < 100 ? yy + 2500 - 543 : yy > 2400 ? yy - 543 : yy;
  return ym(yy, mm);
}

/**
 * อ่านคำสั่งเรียกดู — คืน null ถ้าไม่ใช่, หรือ
 *   {kind:'sheet', ym}                    ลิงก์ตาราง A4 + ยอดสรุป
 *   {kind:'one', id}                      ดูชิ้นเดียว
 *   {kind:'list', ym, flag|field, value}  รายชิ้นที่ตรงเงื่อนไข
 */
export function parseOrderView(msg, today) {
  let s = String(msg).trim().replace(POLITE, '').trim();
  let ym = null;
  const mon = s.match(/\s*(เดือน(?:นี้|ที่แล้ว|ก่อน|\s*\d{1,2}(?:\s*\/\s*\d{2,4})?))$/u);
  if (mon) {
    ym = readMonth(mon[1], today);
    if (!ym) return null;
    s = s.slice(0, mon.index).trim();
  }
  ym ??= today.slice(0, 7);

  if (/^(?:ดู|ขอดู|ขอ)?(?:ตาราง|สรุป)?(?:รายการ|ออเดอร์)(?:โบว์)?(?:ทั้งหมด)?$/u.test(s)) return { kind: 'sheet', ym };

  const head = s.match(/^(?:ดู|ขอดู)?(?:รายการ|ออเดอร์)\s*(.+)$/su);
  if (!head) return null;
  const q = head[1].trim();

  if (!mon && /^#?\d+$/.test(q)) return { kind: 'one', id: Number(q.replace('#', '')) };
  if (/^(?:ที่)?(?:ยัง)?ว่าง$|^ยังไม่มี(?:ผู้|คน)สั่ง$/u.test(q)) return { kind: 'list', ym, flag: 'free' };
  if (new RegExp(`^(?:ค้างค่าจ้าง|ค่าจ้างค้าง|${WNO})$`, 'u').test(q)) return { kind: 'list', ym, flag: 'wage_unpaid' };
  if (new RegExp(`^${WYES}$`, 'u').test(q)) return { kind: 'list', ym, flag: 'wage_paid' };
  if (new RegExp(`^(?:ที่)?(?:${SNO}|ค้างส่ง)$`, 'u').test(q)) return { kind: 'list', ym, flag: 'unshipped' };
  if (new RegExp(`^(?:ที่)?${SYES}$`, 'u').test(q)) return { kind: 'list', ym, flag: 'shipped' };
  if (/^(?:ที่)?(?:มี)?(?:ค่า)?มัดจำ$/u.test(q)) return { kind: 'list', ym, flag: 'deposit' };
  if (new RegExp(`^(?:ที่)?(?:ลูกค้า)?(?:${NO}|ค้างจ่าย)$`, 'u').test(q)) return { kind: 'list', ym, flag: 'unpaid' };
  if (new RegExp(`^(?:ที่)?(?:ลูกค้า)?${YES}$`, 'u').test(q)) return { kind: 'list', ym, flag: 'paid' };

  const f = q.match(/^(แบบ|ผู้สั่ง|คนสั่ง|ลูกค้า|ช่องทาง)\s*(.+)$/su);
  if (!f) return null;
  const field = f[1] === 'แบบ' ? 'style' : f[1] === 'ช่องทาง' ? 'channel' : 'customer';
  let value = f[2].trim();
  if (field === 'style') value = styleName(value);
  if (field === 'channel') value = normalizeChannel(value);
  return { kind: 'list', ym, field, value };
}

/** กรองแถวตามผลของ parseOrderView (kind = list) */
export function filterOrders(rows, view) {
  const has = (v) => v != null && v !== '';
  if (view.flag === 'free') return rows.filter((r) => !has(r.customer));
  if (view.flag === 'unpaid') return rows.filter((r) => has(r.customer) && !r.paid_at);
  if (view.flag === 'paid') return rows.filter((r) => r.paid_at);
  if (view.flag === 'unshipped') return rows.filter((r) => has(r.customer) && !r.shipped_at);
  if (view.flag === 'shipped') return rows.filter((r) => r.shipped_at);
  if (view.flag === 'deposit') return rows.filter((r) => r.deposit != null && !r.paid_at);
  if (view.flag === 'wage_unpaid') return rows.filter((r) => !r.wage_paid_at);
  if (view.flag === 'wage_paid') return rows.filter((r) => r.wage_paid_at);
  const want = String(view.value).toLowerCase();
  return rows.filter((r) => String(r[view.field] ?? '').toLowerCase().includes(want));
}

/** หัวข้อของรายการที่กรองแล้ว */
export function orderViewTitle(view) {
  return view.flag ? {
    free: 'ยังไม่มีผู้สั่ง', unpaid: 'ลูกค้ายังไม่จ่าย', paid: 'ลูกค้าจ่ายแล้ว',
    wage_unpaid: 'ยังไม่จ่ายค่าจ้าง', wage_paid: 'จ่ายค่าจ้างแล้ว',
    unshipped: 'มีผู้สั่งแล้ว ยังไม่ส่ง', shipped: 'ส่งแล้ว', deposit: 'มัดจำแล้ว ยังจ่ายไม่ครบ',
  }[view.flag] : `${FIELD_TH[view.field]} ${view.value}`;
}
