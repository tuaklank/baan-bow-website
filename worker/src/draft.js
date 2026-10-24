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

รายการสินค้า
• แก้ข้อ 2 ราคา 4500
• แก้ข้อ 2 จำนวน 3
• แก้ข้อ 2 ชื่อ สายคาด แดงล้วนผ้า 1 ชั้น
• แก้ข้อ 2 หมายเหตุ ยาว 26 เมตร
• ลบข้อ 4
• เพิ่มข้อ ค่าส่ง 350        (หรือ  เพิ่มข้อ โบว์แดง 2 x 450)

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

/** หยิบรายการลำดับที่ n (เริ่มนับ 1) — เกินช่วงให้บอกว่ามีกี่ข้อ */
function itemAt(base, n) {
  const i = Number(n) - 1;
  if (!Number.isInteger(i) || i < 0 || i >= base.items.length) {
    fail(`ร่างนี้มี ${base.items.length} รายการ ไม่มีข้อ ${n} ครับ`);
  }
  return base.items[i];
}

// ---------- ช่องข้อความของลูกค้า ----------
// คำที่ผู้ใช้พิมพ์ -> ช่องใน customer (ล้างค่าได้ด้วยการไม่ใส่ค่าต่อท้าย)
const CUSTOMER_FIELDS = [
  [/^(?:ชื่อลูกค้า|ลูกค้า|ชื่อ)$/, 'name', 'ชื่อลูกค้า'],
  [/^(?:ที่อยู่|ที่อยู่ลูกค้า)$/, 'address', 'ที่อยู่'],
  [/^(?:เลขภาษี|เลขผู้เสียภาษี|เลขประจำตัวผู้เสียภาษี|taxid)$/i, 'tax_id', 'เลขภาษี'],
  [/^(?:สาขา)$/, 'branch', 'สาขา'],
  [/^(?:ผู้ติดต่อ|คนติดต่อ)$/, 'contact', 'ผู้ติดต่อ'],
  [/^(?:เบอร์|โทร|เบอร์โทร|โทรศัพท์)$/, 'phone', 'เบอร์โทร'],
];

// ---------- ช่องข้อความของตัวเอกสาร ----------
const DOC_TEXT_FIELDS = [
  [/^(?:หมายเหตุ|โน้ต)$/, 'note', 'หมายเหตุ'],
  [/^(?:เงื่อนไขชำระ|เงื่อนไขการชำระ|การชำระเงิน|เงื่อนไข)$/, 'payment_terms', 'เงื่อนไขชำระ'],
];

const CMD = String.raw`(?:แก้ไข|แก้|เปลี่ยน|ตั้ง)`;
const ITEM = String.raw`(?:ข้อ|รายการ|บรรทัด)`;

/**
 * อ่านคำสั่งแก้ร่างหนึ่งคำสั่ง
 * คืน null ถ้าข้อความนี้ไม่ใช่คำสั่งแก้ร่างเลย (ให้ไหลไปทางอื่นต่อ)
 * คืน { apply } ถ้าใช่ — apply(base) แก้ base ในที่แล้วคืนข้อความบอกว่าแก้อะไร
 *     (apply อาจ throw EditError ถ้าค่าที่ให้มาใช้ไม่ได้)
 */
export function readDraftEdit(text) {
  const msg = String(text ?? '').trim().replace(/\s+/g, ' ');

  // "แก้" เฉยๆ = ขอดูวิธีแก้
  if (new RegExp(`^${CMD}\\??$`).test(msg)) {
    return { apply: () => fail(EDIT_HELP) };
  }

  // ---------- รายการสินค้า ----------
  let m = msg.match(new RegExp(`^${CMD} ?${ITEM} ?(\\d+) (ราคา|จำนวน|ชื่อ|หมายเหตุ) ?(.*)$`));
  if (m) {
    const [, n, field, raw] = m;
    return {
      apply(base) {
        const it = itemAt(base, n);
        if (field === 'ราคา') {
          const v = readMoney(raw);
          if (v === null) fail(`อ่านราคาไม่ออกครับ — พิมพ์แบบ "แก้ข้อ ${n} ราคา 4500"`);
          it.unit_price = v;
          return `แก้ราคาข้อ ${n} (${it.name}) เป็น ${v.toLocaleString('en-US')}`;
        }
        if (field === 'จำนวน') {
          const v = readMoney(raw);
          if (v === null || v <= 0) fail(`จำนวนต้องมากกว่า 0 ครับ — พิมพ์แบบ "แก้ข้อ ${n} จำนวน 3"`);
          it.qty = v;
          return `แก้จำนวนข้อ ${n} (${it.name}) เป็น ${v}`;
        }
        if (field === 'ชื่อ') {
          const v = raw.trim();
          if (!v) fail('ชื่อรายการว่างไม่ได้ครับ');
          it.name = v;
          return `แก้ชื่อข้อ ${n} เป็น "${v}"`;
        }
        it.note = raw.trim() || null;   // หมายเหตุ — ว่างได้ = ล้างทิ้ง
        return it.note ? `แก้หมายเหตุข้อ ${n} เป็น "${it.note}"` : `ล้างหมายเหตุข้อ ${n}`;
      },
    };
  }

  m = msg.match(new RegExp(`^(?:ลบ|ตัด|เอาออก) ?${ITEM} ?(\\d+)$`));
  if (m) {
    const n = m[1];
    return {
      apply(base) {
        const it = itemAt(base, n);
        if (base.items.length === 1) fail('เอกสารต้องมีอย่างน้อย 1 รายการ ลบข้อสุดท้ายไม่ได้ครับ');
        base.items.splice(Number(n) - 1, 1);
        return `ลบข้อ ${n} (${it.name}) แล้ว`;
      },
    };
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
  const flat = msg.replace(/หัก ?ณ ?ที่ ?จ่าย/g, 'หักณที่จ่าย');
  m = flat.match(new RegExp(`^${CMD} ?(.+?)(?: (.*))?$`));
  if (!m) return null;
  const key = m[1].replace(/\s/g, '');
  const raw = (m[2] ?? '').trim();

  for (const [re, field, label] of CUSTOMER_FIELDS) {
    if (!re.test(key)) continue;
    return {
      apply(base) {
        base.customer[field] = raw || null;
        // เลขภาษีจะถูกตรวจ 13 หลักตอนประกอบร่างใหม่ ไม่ต้องตรวจซ้ำที่นี่
        return raw ? `แก้${label}เป็น "${raw}"` : `ล้าง${label}แล้ว`;
      },
    };
  }

  for (const [re, field, label] of DOC_TEXT_FIELDS) {
    if (!re.test(key)) continue;
    return {
      apply(base) {
        base[field] = raw || null;
        return raw ? `แก้${label}เป็น "${raw}"` : `ล้าง${label}แล้ว`;
      },
    };
  }

  if (/^ส่วนลด$/.test(key)) {
    return {
      apply(base) {
        const v = raw === '' ? 0 : readMoney(raw);
        if (v === null) fail('อ่านส่วนลดไม่ออกครับ — พิมพ์แบบ "แก้ส่วนลด 500"');
        base.discount = v;
        return v ? `แก้ส่วนลดเป็น ${v.toLocaleString('en-US')}` : 'เอาส่วนลดออกแล้ว';
      },
    };
  }

  if (/^หักณที่จ่าย$/.test(key)) {
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

  if (/^ประเภท(เอกสาร)?$/.test(key)) {
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

  if (/^(ผู้ขาย|ในนาม|หัวบิล)$/.test(key)) {
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

  return null;   // ขึ้นต้นด้วย "แก้" แต่ไม่ใช่ช่องที่รู้จัก ปล่อยไปทางอื่น
}
