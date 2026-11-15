// แพตเทิร์นคำสั่งออเดอร์โบว์ที่ตายตัว — อ่านจากข้อความตรงๆ ไม่ผ่าน AI
// ทำไมต้องมี: ให้ AI เดาว่า "ออเดอร์ 24 แดงทอง" คือแก้ช่องไหน บางทีเดาผิดแล้วเจ้าของร้านงง
// พอมีคำนำหน้าช่อง (ผู้สั่ง / ช่องทาง / ราคา ...) ก็ไม่ต้องเดา ผลออกมาเหมือนเดิมทุกครั้ง
// และไม่เสียค่าเรียก AI ด้วย ข้อความที่ไม่เข้าแพตเทิร์นคืน null แล้วไหลไปให้ AI อ่านตามเดิม
import { toSatang } from './money.js';
import { normalizeChannel } from './config.js';
import { readThaiDate } from './thai.js';

export const ORDER_MAX_PER_COMMAND = 200;

/** คู่มือที่บอทส่งให้เมื่อพิมพ์ "วิธีสั่งออเดอร์" — ต้องตรงกับที่โค้ดในไฟล์นี้อ่านได้จริง */
export const ORDER_HELP = `📌 วิธีสั่งออเดอร์โบว์

➕ จดใหม่
• สั่งโบว์ ML แดงทอง 10 ชิ้น
• สั่งโบว์ ML 10 ชิ้น mini 5 ชิ้น

✏️ แก้ไข = ออเดอร์ + เลข + ชื่อช่อง + ค่าใหม่
• ออเดอร์ 3 ผู้สั่ง คุณเอ
• ออเดอร์ 3 ช่องทาง Line
• ออเดอร์ 3 ราคา 2900
• ออเดอร์ 3 แบบ ML
• ออเดอร์ 3 รายละเอียด แดงทอง
• ออเดอร์ 3 วันที่ 12/11
• ออเดอร์ 3 ค่าจ้าง 150
หลายช่องในข้อความเดียว:
• ออเดอร์ 3 ผู้สั่ง คุณเอ ช่องทาง Line ราคา 2900
หลายชิ้นพร้อมกัน: 1-10 หรือ 2 5 8
• ออเดอร์ 1-10 ค่าจ้าง 150
ลบค่าในช่อง ใส่ -
• ออเดอร์ 3 ผู้สั่ง -

✅ ติ๊กจ่าย
• ออเดอร์ 3 จ่ายแล้ว            (ลูกค้าจ่าย)
• ออเดอร์ 3 ยังไม่จ่าย
• ออเดอร์ 3 จ่ายค่าจ้างแล้ว      (จ่ายช่าง)
• ออเดอร์ 3 ยังไม่จ่ายค่าจ้าง

👀 เรียกดู
• ตารางออเดอร์                 (ลิงก์ตาราง A4 เดือนนี้ + ยอดสรุป)
• ตารางออเดอร์ เดือน 10
• ออเดอร์ 3                    (ดูชิ้นเดียว)
• ออเดอร์ ว่าง                  (ยังไม่มีผู้สั่ง)
• ออเดอร์ ยังไม่จ่าย             (มีผู้สั่งแล้ว ลูกค้ายังไม่จ่าย)
• ออเดอร์ ค้างค่าจ้าง            (ยังไม่จ่ายช่าง)
• ออเดอร์ แบบ ML
• ออเดอร์ ผู้สั่ง คุณเอ
• ออเดอร์ ช่องทาง Line
ต่อท้าย "เดือน 10" ได้ทุกคำสั่งเรียกดู

🗑 ลบ
• ลบออเดอร์ 3                  (ต้องพิมพ์ "ยืนยัน")`;

const YES = '(?:จ่ายแล้ว|จ่ายเงินแล้ว|โอนแล้ว|ชำระแล้ว)';
const NO = '(?:ยังไม่จ่าย|ยังไม่ได้จ่าย|ยังไม่โอน)';
const WYES = '(?:จ่ายค่าจ้าง(?:ทำ)?(?:โบว์)?แล้ว)';
const WNO = '(?:ยังไม่(?:ได้)?จ่ายค่าจ้าง(?:ทำ)?(?:โบว์)?)';
const POLITE = /\s*(?:นะครับ|นะคะ|ครับ|ค่ะ|คะ)$/u;
const CLEAR = /^(?:-|–|ว่าง|ไม่มี|ลบ)$/u;

/** "8-12" = ช่วง, "8 9 12" หรือ "8,9,12" = ทีละเลข — คืน {ids} หรือ {error} */
export function readOrderIds(text) {
  const ids = new Set();
  for (const part of String(text).split(/[\s,#]+/).filter(Boolean)) {
    const range = part.match(/^(\d+)[-–](\d+)$/);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      if (b - a >= ORDER_MAX_PER_COMMAND) {
        return { error: `ช่วง ${a}–${b} กว้างเกินไปครับ แบ่งทีละไม่เกิน ${ORDER_MAX_PER_COMMAND} ออเดอร์` };
      }
      for (let i = a; i <= b; i++) ids.add(i);
    } else if (/^\d+$/.test(part)) ids.add(Number(part));
  }
  return { ids: [...ids] };
}

/** เลขออเดอร์แบบย่อ: เลขติดกันสามตัวขึ้นไปรวมเป็นช่วง — "#1–#10 #14" แทนเลขสิบตัวเรียงกัน */
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
  + '(ผู้สั่ง|คนสั่ง|ลูกค้า)(?=\\s|$)'
  + '|(ช่องทาง(?=\\s|$)|ทาง(?=\\s*(?:ไลน์|line|เฟส|fb|facebook|เพจ|หน้าร้าน|shop|ช้อป|ช็อป|ไลฟ์|live)))'
  + '|(ราคา)(?=\\s|\\d|-|$)'
  + '|(แบบ)(?=\\s|\\d|ที่|$)'
  + '|(รายละเอียด)(?=\\s|$)'
  + '|(วันที่)(?=\\s|\\d|$)'
  + '|(ค่าจ้าง(?:ทำ)?(?:โบว์)?(?:ชิ้นละ)?)(?=\\s|\\d|-|$)'
  + ')', 'giu');
const FIELD_ORDER = ['customer', 'channel', 'price', 'style', 'detail', 'order_date', 'wage'];
const FIELD_TH = {
  customer: 'ผู้สั่ง', channel: 'ช่องทาง', price: 'ราคา', style: 'แบบ',
  detail: 'รายละเอียด', order_date: 'วันที่', wage: 'ค่าจ้าง',
};
const FIELD_EG = { price: '2900', wage: '150', order_date: '12/11', channel: 'Line', customer: 'คุณเอ', style: 'ML', detail: 'แดงทอง' };

/**
 * อ่านคำสั่งแก้ไข "ออเดอร์ <เลข> <ชื่อช่อง> <ค่า> [<ชื่อช่อง> <ค่า> ...] [จ่ายแล้ว]"
 * คืน null ถ้าไม่ใช่รูปแบบนี้ (ให้ AI อ่านต่อ), {error} ถ้าใช่แต่ค่าผิด,
 * หรือ {ids, set, paid, wagePaid} — set เก็บค่าที่จะลง DB แล้ว (เงินเป็นสตางค์, null = ลบค่าในช่อง)
 */
export function parseOrderEdit(msg, today) {
  const m = String(msg).trim().replace(POLITE, '')
    .match(/^(?:แก้)?ออเดอร์\s*#?\s*([\d\s,#\-–]+?)\s*([^\d\s,#\-–].*)$/su);
  if (!m) return null;
  let rest = m[2].trim();

  // คำว่าจ่ายแล้วท้ายข้อความ — ติ๊กไปพร้อมกับการแก้ช่องอื่นได้
  let paid = null, wagePaid = null, tail = null;
  const t = rest.match(new RegExp(`(?:^|\\s)(?:ลูกค้า)?(${WYES}|${WNO}|${YES}|${NO})$`, 'u'));
  if (t) {
    tail = t[1];
    rest = rest.slice(0, t.index).trim();
  }

  const marks = [...rest.matchAll(FIELD_RE)];
  if (!marks.length || marks[0].index !== 0) return null;   // ไม่ได้ขึ้นต้นด้วยชื่อช่อง — ไม่ใช่แพตเทิร์นนี้

  const got = readOrderIds(m[1]);
  if (got.error) return got;
  if (!got.ids.length) return null;

  const set = {};
  let lastKey = null;
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    const key = FIELD_ORDER[mk.slice(2).findIndex((g) => g !== undefined)];
    const start = mk.index + mk[0].length;
    const value = rest.slice(start, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
    const eg = `เช่น "ออเดอร์ ${got.ids[0]} ${FIELD_TH[key]} ${FIELD_EG[key]}"`;
    if (!value) return { error: `ยังไม่ได้ใส่${FIELD_TH[key]}ครับ ${eg}` };

    if (key === 'price' || key === 'wage') {
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
      if (CLEAR.test(value)) return { error: `แบบโบว์เว้นว่างไม่ได้ครับ ถ้าไม่ใช้แล้วให้พิมพ์ "ลบออเดอร์ ${got.ids[0]}"` };
      set[key] = value.startsWith('ที่') ? 'แบบ' + value : value;   // "แบบที่ 2" พิมพ์มาเป็น "แบบ" + "ที่ 2"
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
  return { ids: got.ids, set, paid, wagePaid };
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

  if (/^(?:ดู|ขอดู|ขอ)?(?:ตาราง|รายการ|สรุป)?ออเดอร์(?:ทั้งหมด)?$/u.test(s)) return { kind: 'sheet', ym };

  const head = s.match(/^(?:ดู|ขอดู)?ออเดอร์\s*(.+)$/su);
  if (!head) return null;
  const q = head[1].trim();

  if (!mon && /^#?\d+$/.test(q)) return { kind: 'one', id: Number(q.replace('#', '')) };
  if (/^(?:ที่)?(?:ยัง)?ว่าง$|^ยังไม่มี(?:ผู้|คน)สั่ง$/u.test(q)) return { kind: 'list', ym, flag: 'free' };
  if (new RegExp(`^(?:ค้างค่าจ้าง|ค่าจ้างค้าง|${WNO})$`, 'u').test(q)) return { kind: 'list', ym, flag: 'wage_unpaid' };
  if (new RegExp(`^${WYES}$`, 'u').test(q)) return { kind: 'list', ym, flag: 'wage_paid' };
  if (new RegExp(`^(?:ที่)?(?:ลูกค้า)?(?:${NO}|ค้างจ่าย)$`, 'u').test(q)) return { kind: 'list', ym, flag: 'unpaid' };
  if (new RegExp(`^(?:ที่)?(?:ลูกค้า)?${YES}$`, 'u').test(q)) return { kind: 'list', ym, flag: 'paid' };

  const f = q.match(/^(แบบ|ผู้สั่ง|คนสั่ง|ลูกค้า|ช่องทาง)\s*(.+)$/su);
  if (!f) return null;
  const field = f[1] === 'แบบ' ? 'style' : f[1] === 'ช่องทาง' ? 'channel' : 'customer';
  let value = f[2].trim();
  if (field === 'style' && value.startsWith('ที่')) value = 'แบบ' + value;
  if (field === 'channel') value = normalizeChannel(value);
  return { kind: 'list', ym, field, value };
}

/** กรองแถวตามผลของ parseOrderView (kind = list) */
export function filterOrders(rows, view) {
  const has = (v) => v != null && v !== '';
  if (view.flag === 'free') return rows.filter((r) => !has(r.customer));
  if (view.flag === 'unpaid') return rows.filter((r) => has(r.customer) && !r.paid_at);
  if (view.flag === 'paid') return rows.filter((r) => r.paid_at);
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
  }[view.flag] : `${FIELD_TH[view.field]} ${view.value}`;
}
