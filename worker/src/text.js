// อ่านคำตอบสั้นๆ จากข้อความตรงๆ ไม่ต้องเรียก AI (ถูกกว่าและไม่มีโอกาสเดาผิด)

/**
 * ตรวจเลขประจำตัวผู้เสียภาษีไทย — ต้องมี 13 หลักพอดี
 * รับได้ทุกแบบที่คนพิมพ์มา (มีขีด มีช่องว่าง หรือเลขล้วน) แล้วจัดรูปเป็น X-XXXX-XXXXX-XX-X
 * ตามที่แม่แบบเอกสารใช้
 *
 * คืน { ok, empty, digits, formatted }
 *   empty = ไม่ได้กรอกมา (ไม่ถือว่าผิด)
 *   ok=false = กรอกมาแล้วแต่จำนวนหลักไม่ใช่ 13 ต้องถามกลับ ห้ามปล่อยขึ้นเอกสาร
 */
export function parseTaxId(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits === '') return { ok: true, empty: true, digits: '', formatted: null };
  if (digits.length !== 13) return { ok: false, empty: false, digits, formatted: null };
  const d = digits;
  return {
    ok: true,
    empty: false,
    digits: d,
    formatted: `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`,
  };
}

/**
 * อ่านโหมด VAT จากข้อความ — เช็คคำว่า "ไม่" ก่อนเสมอ
 * ไม่พบคำที่ชัดเจน คืน null (ระบบจะถามกลับ ห้ามเดาให้)
 */
export function readVatMode(text) {
  const s = String(text).toLowerCase().replace(/\s+/g, '');
  if (/(ไม่มีvat|ไม่คิดvat|novat|ไม่ต้องvat)/.test(s)) return 'none';
  if (/(ไม่รวมvat|แยกvat|\+vat|บวกvat|vatแยก)/.test(s)) return 'exclusive';
  if (/(รวมvat|vatin|ราคารวมภาษี|รวมภาษีแล้ว)/.test(s)) return 'inclusive';
  return null;
}
