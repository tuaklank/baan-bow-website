// แก้ร่างเอกสารที่รอยืนยันอยู่ ทีละช่อง โดยไม่เรียก AI
//
// เดิมร่างแก้ได้แค่วันที่ อย่างอื่นผิดต้อง "ยกเลิก" แล้วพิมพ์ใหม่ทั้งก้อน
// ซึ่งแปลว่าเรียก AI อ่านที่อยู่กับเลขภาษีซ้ำทุกครั้งที่ลูกค้าต่อราคา
// (ของจริงเคยพิมพ์ใหม่ 5 รอบเพื่อใบเดียว แล้วเผาเลขที่เอกสารทิ้งไป 1 ใบ)
//
// ไฟล์นี้มีแต่การอ่านข้อความกับแก้ข้อมูล ไม่แตะฐานข้อมูล จะได้เทสต์ได้ตรงๆ
import { TYPES, SELLERS, WHT_ALLOWED_BP } from './config.js';

/** ข้อความสั้นๆ ที่ตอบกลับเมื่อผู้ใช้พิมพ์ "แก้" เฉยๆ หรือพิมพ์คำสั่งที่อ่านไม่ออก */
export const EDIT_HELP = `แก้ร่างที่รออยู่ได้ทุกช่อง (ไม่ต้องพิมพ์ใหม่ทั้งก้อน)

รายการสินค้า — เรียกด้วยชื่อหรือเลขข้อก็ได้
• แก้สายคาด เป็นราคา 5000     (หรือ  แก้ข้อ 2 ราคา 5000)
• แก้สายคาด จำนวน 3
• แก้สายคาด ชื่อ สายคาด แดงล้วนผ้า 1 ชั้น
• แก้สายคาด หมายเหตุ ยาว 26 เมตร
• ลบซิลความ                  (หรือ  ลบข้อ 4)
• เพิ่มข้อ ค่าส่ง 350          (หรือ  เพิ่มข้อ โบว์แดง 2 x 450)

ชื่อพิมพ์แค่บางส่วนก็ได้ ถ้าไปตรงหลายรายการระบบจะถามว่าข้อไหน

ลูกค้า
• แก้ชื่อลูกค้า หจก. เช้าเทิร์น มีเดีย
• แก้ที่อยู่ 29/1 ถ.เจ้าฟ้า ต.ตลาดเหนือ อ.เมือง จ.ภูเก็ต 83000
• แก้เลขภาษี 0833547001164
• แก้สาขา สำนักงานใหญ่
• แก้ผู้ติดต่อ คุณเอ   /   แก้เบอร์ 076-224707

ทั้งใบ
• แก้ส่วนลด 500
• ไม่มี vat / ไม่รวม vat / รวม vat
• แก้หัก ณ ที่จ่าย 3        (หรือ  แก้หัก ณ ที่จ่าย 0)
• แก้ประเภท ใบเสร็จ
• แก้ผู้ขาย บ้านโบว์        (หรือ  แก้ผู้ขาย ตัวกลาง)
• แก้หมายเหตุ ...           /   แก้เงื่อนไขชำระ ...
• วันที่ 15/10

ช่องที่ปล่อยว่างได้ พิมพ์คำสั่งโดยไม่ใส่ค่าต่อท้าย = ล้างช่องนั้น`;

/**
 * ข้อความที่ "ตั้งใจจะแก้ร่างแน่ๆ" แต่เราอ่านไม่ออก
 * ตอบวิธีแก้กลับไปดีกว่าปล่อยให้ไปถาม AI แล้วได้เมนูช่วยเหลือ ซึ่งเสียเงินและไม่ช่วยอะไร
 * ยกเว้นคำสั่งแก้รายจ่าย ซึ่งมีทางของตัวเองและต้องให้ AI อ่าน
 */
export const looksLikeEdit = (text) => {
  const s = String(text ?? '').trim();
  return /^(แก้ไข|แก้|เปลี่ยน|ลบ|ตัด|เอาออก)/.test(s) && !/รายจ่าย/.test(s);
};

/** "4,500" / "4500.50" / "350 บาท" -> จำนวนบาทเป็น number, null ถ้าอ่านไม่ออก */
export function readMoney(raw) {
  const s = String(raw ?? '').replace(/บาท|[,\s฿]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** ชื่อบริษัทที่พิมพ์มา -> key ของผู้ขาย, null ถ้าไม่รู้จัก */
export function readSeller(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/\s|บริษัท|จำกัด|บ\.|ในนาม/g, '');
  if (!s) return null;
  if (/ตัวกลาง|tuaklang/.test(s)) return 'tuaklang';
  if (/บ้านโบว์|baanbow|บ้านbow/.test(s)) return 'baanbow';
  return null;
}

/** ชื่อประเภทเอกสารที่พิมพ์มา -> key ของ TYPES, null ถ้าไม่รู้จัก */
export function readDocType(raw) {
  const s = String(raw ?? '').replace(/\s/g, '');
  if (!s) return null;
  // เรียงจากเฉพาะเจาะจงที่สุดก่อน — "ใบเสร็จรับเงิน/ใบกำกับภาษี" มีคำว่า "ใบเสร็จ" อยู่ด้วย
  if (/ใบเสร็จ.*ใบกำกับ|ใบกำกับ.*ใบเสร็จ|^rt$/i.test(s)) return 'receipt_tax_invoice';
  if (/ใบเสนอราคา|^qt$/i.test(s)) return 'quotation';
  if (/ใบกำกับภาษี|^ti$/i.test(s)) return 'tax_invoice';
  if (/ใบเสร็จ|^rc$/i.test(s)) return 'receipt';
  return null;
}

/**
 * แปลงร่างที่คำนวณแล้วกลับเป็น "ข้อมูลตั้งต้น" ที่ buildDraft รับได้
 * ยอดในร่างเป็นสตางค์ ส่วนตั้งต้นเป็นบาท — หารร้อยกลับได้ตรงเสมอเพราะสตางค์เป็นจำนวนเต็ม
 */
export function draftToBase(doc) {
  return {
    type: doc.type,
    seller: doc.seller,
    customer: { ...doc.customer },
    items: doc.lines.map((l) => ({
      name: l.name,
      note: l.note ?? null,
      qty: l.qty,
      unit_price: l.unit_price / 100,
    })),
    discount: doc.discount / 100,
    wht_rate: doc.wht_rate || 0,
    note: doc.note ?? null,
    payment_terms: doc.payment_terms ?? null,
    ref_doc_no: doc.ref_doc_no ?? null,
    issue_date: doc.issue_date,
  };
}

/** ใช้ throw บอกเหตุผลที่แก้ไม่ได้ ให้ชั้นบนจับไปตอบผู้ใช้ตรงๆ */
class EditError extends Error {}
const fail = (msg) => { throw new EditError(msg); };
export const isEditError = (e) => e instanceof EditError;

/**
 * อ้างชื่อรายการที่ไม่มีในร่าง = ข้อความนี้คงไม่ใช่คำสั่งแก้ร่าง ("แก้รายจ่าย 12 ค่าส่ง 80")
 * ชั้นบนจะปล่อยให้ไหลไปทางปกติต่อ ไม่ใช่ตอบว่าแก้ไม่ได้
 */
class NotAnEdit extends Error {}
export const isNotAnEdit = (e) => e instanceof NotAnEdit;

/** หยิบรายการลำดับที่ n (เริ่มนับ 1) — เกินช่วงให้บอกว่ามีกี่ข้อ */
function itemAt(base, n) {
  const i = Number(n) - 1;
  if (!Number.isInteger(i) || i < 0 || i >= base.items.length) {
    fail(`ร่างนี้มี ${base.items.length} รายการ ไม่มีข้อ ${n} ครับ`);
  }
  return base.items[i];
}

const squash = (s) => String(s ?? '').toLowerCase().replace(/\s/g, '');

/**
 * หารายการจากชื่อที่พิมพ์มาบางส่วน ("สายคาด" -> "สายคาด แดงล้วนผ้า 2 ชั้นยาว 26เมตร")
 * เจ้าของร้านเรียกของด้วยชื่อ ไม่ได้นับเลขข้อในหัว จึงต้องรับแบบนี้ด้วย
 * เจอหลายรายการ = ไม่เดา ให้ระบุเลขข้อแทน
 */
function itemByName(base, fragment) {
  const q = squash(fragment);
  if (!q) throw new NotAnEdit();
  const hits = base.items
    .map((it, i) => ({ it, no: i + 1 }))
    .filter(({ it }) => squash(it.name).includes(q));
  if (hits.length === 0) throw new NotAnEdit();
  if (hits.length > 1) {
    const list = hits.map(({ it, no }) => `  ข้อ ${no} ${it.name}`).join('\n');
    fail(`มีหลายรายการที่มีคำว่า "${fragment}" ครับ ระบุเลขข้อแทน\n${list}`);
  }
  return hits[0];
}

/**
 * อ่านส่วนที่บอกว่าจะแก้อะไรเป็นอะไร จากข้อความที่ตามหลังชื่อรายการ
 * รับคำเชื่อม "เป็น" ได้ทุกตำแหน่ง และไม่บอกชื่อช่องมาแต่ให้ตัวเลขล้วน = ราคา
 *   "เป็นราคา 5000 บาท"  "ราคา เป็น 5000"  "จำนวน 3"  "5000"
 */
function readItemChange(rest) {
  const s = String(rest ?? '').trim().replace(/^เป็น ?/, '');
  const m = s.match(/^(ราคา(?:ต่อหน่วย)?|จำนวน|ชื่อ|หมายเหตุ) ?(.*)$/);
  if (m) {
    const field = m[1].startsWith('ราคา') ? 'ราคา' : m[1];
    return { field, raw: m[2].replace(/^เป็น ?/, '').trim() };
  }
  if (readMoney(s) !== null) return { field: 'ราคา', raw: s };
  return null;
}

/** ตัดรายการออกจากร่าง — ใช้ร่วมกันทั้งแบบอ้างเลขข้อและแบบอ้างชื่อ */
function removeItem(base, it, no) {
  if (base.items.length === 1) fail('เอกสารต้องมีอย่างน้อย 1 รายการ ลบข้อสุดท้ายไม่ได้ครับ');
  base.items.splice(no - 1, 1);
  return `ลบข้อ ${no} (${it.name}) แล้ว`;
}

/** แก้ช่องหนึ่งของรายการหนึ่ง — ใช้ร่วมกันทั้งแบบอ้างเลขข้อและแบบอ้างชื่อ */
function applyItemChange(it, no, field, raw) {
  if (field === 'ราคา') {
    const v = readMoney(raw);
    if (v === null) fail(`อ่านราคาไม่ออกครับ — พิมพ์แบบ "แก้ข้อ ${no} ราคา 4500"`);
    it.unit_price = v;
    return `แก้ราคาข้อ ${no} (${it.name}) เป็น ${v.toLocaleString('en-US')}`;
  }
  if (field === 'จำนวน') {
    const v = readMoney(raw);
    if (v === null || v <= 0) fail(`จำนวนต้องมากกว่า 0 ครับ — พิมพ์แบบ "แก้ข้อ ${no} จำนวน 3"`);
    it.qty = v;
    return `แก้จำนวนข้อ ${no} (${it.name}) เป็น ${v}`;
  }
  if (field === 'ชื่อ') {
    const v = raw.trim();
    if (!v) fail('ชื่อรายการว่างไม่ได้ครับ');
    it.name = v;
    return `แก้ชื่อข้อ ${no} เป็น "${v}"`;
  }
  it.note = raw.trim() || null;   // หมายเหตุ — ว่างได้ = ล้างทิ้ง
  return it.note ? `แก้หมายเหตุข้อ ${no} เป็น "${it.note}"` : `ล้างหมายเหตุข้อ ${no}`;
}

// ---------- ช่องข้อความของลูกค้า ----------
// คำที่ผู้ใช้พิมพ์ -> ช่องใน customer (ล้างค่าได้ด้วยการไม่ใส่ค่าต่อท้าย)
const CUSTOMER_FIELDS = [
  [['ชื่อลูกค้า', 'ลูกค้า', 'ชื่อ'], 'name', 'ชื่อลูกค้า'],
  [['ที่อยู่ลูกค้า', 'ที่อยู่'], 'address', 'ที่อยู่'],
  [['เลขประจำตัวผู้เสียภาษี', 'เลขผู้เสียภาษี', 'เลขภาษี', 'taxid'], 'tax_id', 'เลขภาษี'],
  [['สาขา'], 'branch', 'สาขา'],
  [['ผู้ติดต่อ', 'คนติดต่อ'], 'contact', 'ผู้ติดต่อ'],
  [['เบอร์โทร', 'เบอร์', 'โทรศัพท์', 'โทร'], 'phone', 'เบอร์โทร'],
];

// ---------- ช่องข้อความของตัวเอกสาร ----------
const DOC_TEXT_FIELDS = [
  [['หมายเหตุ', 'โน้ต'], 'note', 'หมายเหตุ'],
  [['เงื่อนไขการชำระ', 'เงื่อนไขชำระ', 'การชำระเงิน', 'เงื่อนไข'], 'payment_terms', 'เงื่อนไขชำระ'],
];

// ช่องที่เหลือซึ่งมีวิธีอ่านค่าเฉพาะตัว (ไม่ได้เก็บข้อความดิบ)
const DISCOUNT = ['ส่วนลด'];
const WHT = ['หักณที่จ่าย'];
const DOC_TYPE = ['ประเภทเอกสาร', 'ประเภท'];
const SELLER = ['ผู้ขาย', 'ในนาม', 'หัวบิล'];

/**
 * ชื่อช่องทุกคำ เรียงยาวไปสั้น — ใช้แกะตอนผู้ใช้พิมพ์ชื่อช่องติดกับค่า
 * ("แก้เลขภาษี0-8335-47001-16-4") ซึ่งเกิดขึ้นจริงบ่อยเวลารีบ
 * ยาวก่อนเสมอ ไม่งั้น "เลขภาษี" จะถูก "ชื่อ" แย่งไปไม่ได้ แต่ "ประเภทเอกสาร" จะโดน "ประเภท" แย่ง
 */
const ALL_FIELD_WORDS = [...CUSTOMER_FIELDS, ...DOC_TEXT_FIELDS]
  .flatMap(([words]) => words)
  .concat(DISCOUNT, WHT, DOC_TYPE, SELLER)
  .sort((a, b) => b.length - a.length);

const CMD = String.raw`(?:แก้ไข|แก้|เปลี่ยน|ตั้ง)`;
const ITEM = String.raw`(?:ข้อ|รายการ|บรรทัด)`;

/**
 * อ่านคำสั่งแก้ร่างหนึ่งคำสั่ง
 * คืน null ถ้าข้อความนี้ไม่ใช่คำสั่งแก้ร่างเลย (ให้ไหลไปทางอื่นต่อ)
 * คืน { apply } ถ้าใช่ — apply(base) แก้ base ในที่แล้วคืนข้อความบอกว่าแก้อะไร
 *     (apply อาจ throw EditError ถ้าค่าที่ให้มาใช้ไม่ได้)
 */
export function readDraftEdit(text) {
  const msg = String(text ?? '').trim().replace(/\s+/g, ' ')
    // "แก้สายคาดจาก 6000 เป็น 5000" — ราคาเดิมเป็นแค่คำอธิบาย ค่าใหม่อยู่หลัง "เป็น"
    .replace(/ ?จาก ?[\d,]+(?:\.\d+)? ?(?:บาท|฿)? ?(?=เป็น)/, ' ');

  // "แก้" เฉยๆ = ขอดูวิธีแก้
  if (new RegExp(`^${CMD}\\??$`).test(msg)) {
    return { apply: () => fail(EDIT_HELP) };
  }

  // ---------- รายการสินค้า: อ้างด้วยเลขข้อ ----------
  let m = msg.match(new RegExp(`^${CMD} ?${ITEM} ?(\\d+) (.+)$`));
  if (m) {
    const [, n, rest] = m;
    const change = readItemChange(rest);
    if (change) {
      return { apply: (base) => applyItemChange(itemAt(base, n), n, change.field, change.raw) };
    }
  }

  m = msg.match(new RegExp(`^(?:ลบ|ตัด|เอาออก) ?${ITEM} ?(\\d+)$`));
  if (m) {
    const n = m[1];
    return { apply: (base) => removeItem(base, itemAt(base, n), Number(n)) };
  }

  // เพิ่มข้อ <ชื่อ> [<จำนวน> x] <ราคา>   — ไม่บอกจำนวน = 1 ชิ้น
  m = msg.match(new RegExp(`^เพิ่ม ?${ITEM} (.+?)(?: (\\d+(?:\\.\\d+)?) ?[x×*])? ([\\d,]+(?:\\.\\d+)?) ?(?:บาท|฿)?$`));
  if (m) {
    const [, name, qty, price] = m;
    return {
      apply(base) {
        const v = readMoney(price);
        if (v === null) fail('อ่านราคาไม่ออกครับ — พิมพ์แบบ "เพิ่มข้อ ค่าส่ง 350"');
        const q = qty ? Number(qty) : 1;
        if (!(q > 0)) fail('จำนวนต้องมากกว่า 0 ครับ');
        base.items.push({ name: name.trim(), note: null, qty: q, unit_price: v });
        return `เพิ่มข้อ ${base.items.length} "${name.trim()}" ${q} × ${v.toLocaleString('en-US')}`;
      },
    };
  }

  // ---------- ช่องอื่นๆ ----------
  // "หัก ณ ที่จ่าย" เป็นชื่อช่องเดียวที่มีช่องว่างอยู่ข้างใน รวบให้ติดกันก่อน
  // ไม่งั้นตัวแยกชื่อช่องจะตัดได้แค่ "หัก" แล้วเหลือ "ณ ที่จ่าย 3" เป็นค่า
  const flat = msg
    .replace(/หัก ?ณ ?ที่ ?จ่าย/g, 'หักณที่จ่าย')
    // ชื่อช่องติดกับค่า ("แก้เลขภาษี0-8335-...") — แทรกช่องว่างคืนให้ก่อนแกะ
    .replace(new RegExp(`^(${CMD}) ?(${ALL_FIELD_WORDS.join('|')}) ?`, 'i'), '$1 $2 ');
  m = flat.match(new RegExp(`^${CMD} ?(.+?)(?: (.*))?$`));
  // "เป็น" เป็นคำเชื่อม ไม่ใช่ส่วนหนึ่งของค่า ("แก้เลขภาษี เป็น0-8335-...")
  const named = m && readFieldEdit(m[1].replace(/\s/g, ''), (m[2] ?? '').trim().replace(/^เป็น ?/, ''));
  if (named) return named;

  // ---------- รายการสินค้า: อ้างด้วยชื่อ ("แก้สายคาด เป็นราคา 5000 บาท") ----------
  // ต้องอยู่ท้ายสุด ให้ชื่อช่องที่รู้จักจับก่อนเสมอ
  // ไม่งั้น "แก้ที่อยู่ ... 84000" จะกลายเป็นการหาสินค้าชื่อ "ที่อยู่ ..." แล้วตั้งราคา 84000
  m = msg.match(new RegExp(
    // ต้องมีช่องว่างคั่นชื่อกับค่าเสมอ ไม่งั้น "แก้วันที่ 15/10" จะถูกหั่นเป็น
    // ชื่อ "วันที่ 15/1" กับราคา "0" ซึ่งเป็นการตัดกลางตัวเลขที่ไม่มีใครตั้งใจ
    `^${CMD} ?(.+?) (เป็น ?.+|ราคา.*|จำนวน.*|ชื่อ .+|หมายเหตุ.*|[\\d,]+(?:\\.\\d+)? ?(?:บาท|฿)?)$`,
  ));
  if (m) {
    const [, name, rest] = m;
    const change = readItemChange(rest);
    if (change) {
      return {
        apply(base) {
          const { it, no } = itemByName(base, name);
          return applyItemChange(it, no, change.field, change.raw);
        },
      };
    }
  }

  m = msg.match(/^(?:ลบ|ตัด|เอาออก) ?(.+)$/);
  if (m) {
    const name = m[1];
    return {
      apply(base) {
        const { it, no } = itemByName(base, name);
        return removeItem(base, it, no);
      },
    };
  }

  return null;   // ไม่ใช่คำสั่งแก้ร่าง ปล่อยไปทางอื่น
}

/** ช่องที่เรียกด้วยชื่อช่องตรงๆ ("แก้ที่อยู่ ...", "แก้ส่วนลด 500") */
function readFieldEdit(key, raw) {
  for (const [words, field, label] of CUSTOMER_FIELDS) {
    if (!words.includes(key)) continue;
    return {
      apply(base) {
        base.customer[field] = raw || null;
        // เลขภาษีจะถูกตรวจ 13 หลักตอนประกอบร่างใหม่ ไม่ต้องตรวจซ้ำที่นี่
        return raw ? `แก้${label}เป็น "${raw}"` : `ล้าง${label}แล้ว`;
      },
    };
  }

  for (const [words, field, label] of DOC_TEXT_FIELDS) {
    if (!words.includes(key)) continue;
    return {
      apply(base) {
        base[field] = raw || null;
        return raw ? `แก้${label}เป็น "${raw}"` : `ล้าง${label}แล้ว`;
      },
    };
  }

  if (DISCOUNT.includes(key)) {
    return {
      apply(base) {
        const v = raw === '' ? 0 : readMoney(raw);
        if (v === null) fail('อ่านส่วนลดไม่ออกครับ — พิมพ์แบบ "แก้ส่วนลด 500"');
        base.discount = v;
        return v ? `แก้ส่วนลดเป็น ${v.toLocaleString('en-US')}` : 'เอาส่วนลดออกแล้ว';
      },
    };
  }

  if (WHT.includes(key)) {
    return {
      apply(base) {
        const n = readMoney(raw);
        if (n === null) fail('พิมพ์แบบ "แก้หัก ณ ที่จ่าย 3" หรือ "แก้หัก ณ ที่จ่าย 0" ครับ');
        const bp = Math.round(n * 100);
        if (bp !== 0 && !WHT_ALLOWED_BP.includes(bp)) fail('หัก ณ ที่จ่าย รับเฉพาะ 1% หรือ 3% ครับ');
        base.wht_rate = bp;
        return bp ? `แก้หัก ณ ที่จ่ายเป็น ${n}%` : 'เอาหัก ณ ที่จ่ายออกแล้ว';
      },
    };
  }

  if (DOC_TYPE.includes(key)) {
    return {
      apply(base) {
        const t = readDocType(raw);
        if (!t) {
          fail('ระบุประเภทเป็น ใบเสนอราคา / ใบเสร็จ / ใบกำกับภาษี / ใบเสร็จรับเงินใบกำกับภาษี ครับ');
        }
        base.type = t;
        return `แก้ประเภทเป็น${TYPES[t].th}`;
      },
    };
  }

  if (SELLER.includes(key)) {
    return {
      apply(base) {
        const s = readSeller(raw);
        if (!s) {
          const names = Object.values(SELLERS).map((x) => x.label).join(' / ');
          fail(`ออกในนามไหนครับ — ${names}`);
        }
        base.seller = s;
        return `ออกในนาม ${SELLERS[s].label}`;
      },
    };
  }

  return null;   // ไม่ใช่ชื่อช่องที่รู้จัก
}
