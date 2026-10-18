// วันที่/เวลาไทย และจำนวนเงินเป็นตัวอักษร — โมดูลนี้ไม่พึ่ง binding ใดๆ เทสต์ตรงได้
const TZ = 'Asia/Bangkok';
const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const MONTHS_ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

/** วันนี้ตามเวลาไทย เป็น YYYY-MM-DD — ไม่ขึ้นกับเวลาของเครื่องที่รัน (Worker รันที่ UTC) */
export const todayBkk = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);

/** เดือนนี้ตามเวลาไทย เป็น YYYY-MM */
export const monthBkk = (now = new Date()) => todayBkk(now).slice(0, 7);

/**
 * ตรวจว่าเป็น YYYY-MM-DD ค.ศ. ที่มีอยู่จริง
 * ปีต้องอยู่ในช่วง 2000–2100 เพื่อกันกรณีเผลอใส่ปี พ.ศ. มาตรงๆ (2569-10-18)
 * ซึ่งเป็นวันที่ที่ถูกต้องตามปฏิทินแต่ห่างจากความจริง 543 ปี
 */
export const isValidYmd = (s) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s &&
  Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2100;

export function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dayOfWeek = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();

/** 2026-10-18 -> "18 ตุลาคม 2569" หรือ "วันอาทิตย์ที่ 18 ตุลาคม 2569" */
export function thaiDate(ymd, withDay = false) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${withDay ? `วัน${DAYS[dayOfWeek(ymd)]}ที่ ` : ''}${d} ${MONTHS[m - 1]} ${y + 543}`;
}

/** 2026-10-18 -> "18 ต.ค. 69" (ใช้ในหน้า /admin ที่พื้นที่แคบ) */
export function thaiDateShort(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS_ABBR[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}`;
}

/** 2026-10 -> "ตุลาคม 2569" */
export function thaiMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y + 543}`;
}

/** 2026-10-18 -> "18/10/2569" (รูปแบบในช่อง วันที่ ของแม่แบบ) */
export function thaiSlash(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`;
}

/** 2026-10-18 -> "181069" (ddmmyy พ.ศ. 2 หลัก) ใช้ประกอบเลขที่เอกสาร */
export function ddmmyyBE(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return String(d).padStart(2, '0') + String(m).padStart(2, '0') + String((y + 543) % 100).padStart(2, '0');
}

/** สตางค์ -> "1,234.50" */
export const fmtBaht = (satang) =>
  (satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- จำนวนเงินเป็นตัวอักษรไทย ----------
const D = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function chunk(s) {   // s ยาวไม่เกิน 6 หลัก
  let out = '';
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const d = +s[i], pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 1) out += (d === 1 ? '' : d === 2 ? 'ยี่' : D[d]) + 'สิบ';
    else if (pos === 0) out += d === 1 && len > 1 ? 'เอ็ด' : D[d];
    else out += D[d] + P[pos];
  }
  return out;
}

function readInt(s) {
  s = s.replace(/^0+/, '');
  if (!s) return 'ศูนย์';
  if (s.length > 6) return readInt(s.slice(0, -6)) + 'ล้าน' + chunk(s.slice(-6));
  return chunk(s);
}

/** สตางค์ -> "สามพันห้าร้อยห้าสิบบาทถ้วน" */
export function bahtText(satang) {
  const neg = satang < 0;
  const abs = Math.abs(satang);
  const baht = Math.floor(abs / 100), st = abs % 100;
  let out = readInt(String(baht)) + 'บาท';
  out += st ? readInt(String(st)) + 'สตางค์' : 'ถ้วน';
  return (neg ? 'ลบ' : '') + out;
}

// ---------- จำนวนเงินเป็นตัวอักษรอังกฤษ (บรรทัดเล็กใต้ตัวอักษรไทยในแม่แบบ) ----------
const ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS = ['', '', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const SCALE = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [100, 'hundred']];

function readIntEn(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  for (const [value, word] of SCALE) {
    if (n >= value) {
      const rest = n % value;
      return readIntEn(Math.floor(n / value)) + ' ' + word + (rest ? ' ' + readIntEn(rest) : '');
    }
  }
  return ONES[n];
}

/** สตางค์ -> "Three thousand five hundred fifty baht only" */
export function bahtTextEn(satang) {
  const neg = satang < 0;
  const abs = Math.abs(satang);
  const baht = Math.floor(abs / 100), st = abs % 100;
  const words = readIntEn(baht) + ' baht' + (st ? ' and ' + readIntEn(st) + ' satang' : ' only');
  const s = (neg ? 'minus ' : '') + words;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
