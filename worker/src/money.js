// คำนวณยอดทั้งหมดที่นี่ที่เดียว — AI ไม่เคยคิดเลข มีหน้าที่อ่านข้อความเท่านั้น
// ทุกค่าเป็นสตางค์ (integer) ปัดด้วย Math.round ครั้งเดียวต่อขั้น
import { VAT_RATE_BP, WHT_ALLOWED_BP } from './config.js';

/** "3,500" / "3500.50" / 3500 -> สตางค์ (throw ถ้าอ่านไม่ออก) */
export function toSatang(x) {
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw new Error('จำนวนเงินไม่ถูกต้อง');
    return Math.round(x * 100);
  }
  const s = String(x ?? '').replace(/[,\s฿]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error('จำนวนเงินไม่ถูกต้อง: ' + x);
  return Math.round(Number(s) * 100);
}

/**
 * คำนวณยอดของบิลหนึ่งใบ
 * items     [{ name, note?, qty?, unit_price }]  unit_price เป็นบาท (ตามที่ลูกค้าพิมพ์)
 * discount  ส่วนลดเป็นบาท
 * vat_mode  'none' ไม่มี VAT | 'exclusive' ราคายังไม่รวม VAT | 'inclusive' ราคารวม VAT แล้ว
 * wht_rate  0 | 100 (1%) | 300 (3%) — หัก ณ ที่จ่าย คิดจากมูลค่าก่อนภาษี
 */
export function compute({ items, discount = 0, vat_mode, wht_rate = 0 }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('ไม่มีรายการสินค้า/บริการ');
  if (!['none', 'exclusive', 'inclusive'].includes(vat_mode)) throw new Error('ต้องระบุ vat_mode');
  const rate = Number(wht_rate) || 0;
  if (rate !== 0 && !WHT_ALLOWED_BP.includes(rate)) throw new Error('หัก ณ ที่จ่าย รับเฉพาะ 1% หรือ 3%');

  const lines = items.map((i) => {
    const qty = Number(i.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('จำนวนไม่ถูกต้อง: ' + i.name);
    const unit_price = toSatang(i.unit_price);
    return {
      name: String(i.name ?? '').trim(),
      note: i.note ? String(i.note).trim() : null,
      qty,
      unit_price,
      amount: Math.round(unit_price * qty),
    };
  });

  const subtotal = lines.reduce((a, l) => a + l.amount, 0);
  const disc = toSatang(discount || 0);
  if (disc < 0) throw new Error('ส่วนลดติดลบไม่ได้');
  if (disc > subtotal) throw new Error('ส่วนลดมากกว่ายอดรวม');
  const afterDiscount = subtotal - disc;

  let base, vat, total;
  if (vat_mode === 'exclusive') {
    // ราคาที่พิมพ์มายังไม่รวม VAT -> บวก 7% เพิ่ม
    base = afterDiscount;
    vat = Math.round((base * VAT_RATE_BP) / 10000);
    total = base + vat;
  } else if (vat_mode === 'inclusive') {
    // ราคาที่พิมพ์มารวม VAT แล้ว -> ถอด VAT ออกมาแสดง ยอดรวมไม่เปลี่ยน
    total = afterDiscount;
    base = Math.round((total * 10000) / (10000 + VAT_RATE_BP));
    vat = total - base;      // ให้ base + vat = total เสมอ ไม่มีเศษหาย
  } else {
    base = afterDiscount;
    vat = 0;
    total = afterDiscount;
  }

  // หัก ณ ที่จ่าย คิดจากมูลค่าก่อนภาษี (ฐานภาษีเงินได้ ไม่รวม VAT)
  const wht = rate ? Math.round((base * rate) / 10000) : 0;

  return {
    lines, subtotal, discount: disc, vat_mode,
    base, vat, total,
    wht_rate: rate, wht,
    net_payable: total - wht,
  };
}
