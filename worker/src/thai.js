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
  // เดือน/วันเกินช่วง (2026-13-15) ได้ Invalid Date ซึ่ง toISOString จะ throw — เช็คก่อนเสมอ
  !Number.isNaN(new Date(s + 'T00:00:00Z').getTime()) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s &&
  Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2100;

export function addDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- อ่านวันที่จากข้อความที่พิมพ์มา (ไม่เรียก AI) ----------

// ชื่อเดือนแบบที่คนพิมพ์จริง เรียงตามเลขเดือน 1-12 ตัวยาวมาก่อนเพื่อให้จับตัวเต็มได้ก่อนตัวย่อ
const MONTH_WORDS = [
  ['มกราคม', 'มกรา', 'มค'],
  ['กุมภาพันธ์', 'กุมภา', 'กพ'],
  ['มีนาคม', 'มีนา', 'มีค'],
  ['เมษายน', 'เมษา', 'เมย'],
  ['พฤษภาคม', 'พฤษภา', 'พค'],
  ['มิถุนายน', 'มิถุนา', 'มิย'],
  ['กรกฎาคม', 'กรกฎา', 'กค'],
  ['สิงหาคม', 'สิงหา', 'สค'],
  ['กันยายน', 'กันยา', 'กย'],
  ['ตุลาคม', 'ตุลา', 'ตค'],
  ['พฤศจิกายน', 'พฤศจิกา', 'พย'],
  ['ธันวาคม', 'ธันวา', 'ธค'],
];

const MONTH_RE = new RegExp('(' + MONTH_WORDS.flat().join('|') + ')');

const monthOf = (word) => MONTH_WORDS.findIndex((ws) => ws.includes(word)) + 1;

/**
 * ปีที่คนพิมพ์ -> ปี ค.ศ.
 * 2 หลัก = พ.ศ. ย่อ (69 -> 2569 -> 2026) ตรงกับเลขที่เอกสารที่ใช้ ddmmyy พ.ศ.
 * 4 หลักตั้งแต่ 2400 ขึ้นไป = พ.ศ. เต็ม, น้อยกว่านั้น = ค.ศ. อยู่แล้ว
 */
function toAD(raw) {
  const n = Number(raw);
  if (raw.length <= 2) return 2500 + n - 543;
  return n >= 2400 ? n - 543 : n;
}

const ymd = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * ไม่ได้บอกปีมา = ปีนี้ แต่ถ้าได้วันที่ล่วงหน้าเกิน 60 วัน ให้ถอยไปปีก่อน
 * เพราะ "ลงวันที่ 28/12" ที่พิมพ์ต้นเดือนมกราคม หมายถึงธันวาคมที่ผ่านมา ไม่ใช่สิ้นปีนี้
 */
function yearFor(today, m, d) {
  const y = Number(today.slice(0, 4));
  const guess = ymd(y, m, d);
  return isValidYmd(guess) && guess > addDays(today, 60) ? y - 1 : y;
}

/**
 * อ่านวันที่จากข้อความไทยที่พิมพ์มาตรงๆ — คืน YYYY-MM-DD ค.ศ. หรือ null ถ้าอ่านไม่ออก
 * รับได้: วันนี้ / เมื่อวาน / พรุ่งนี้, 18/10, 18/10/69, 18-10-2569, 2026-10-18,
 *         18 ต.ค., 18 ตุลาคม 2569
 * ปี พ.ศ. ทั้งแบบ 2 และ 4 หลักแปลงเป็น ค.ศ. ให้เอง
 */
export function readThaiDate(text, today = todayBkk()) {
  const s = String(text ?? '').replace(/[.\s]/g, '');

  if (/วันนี้/.test(s)) return today;
  if (/เมื่อวานซืน|วานซืน/.test(s)) return addDays(today, -2);
  if (/เมื่อวาน|วานนี้/.test(s)) return addDays(today, -1);
  if (/มะรืน/.test(s)) return addDays(today, 2);
  if (/พรุ่งนี้/.test(s)) return addDays(today, 1);

  // 2026-10-18 (ค.ศ. เต็มรูปแบบ) — ตรวจก่อน ไม่ให้ไปโดน d/m/y จับผิดลำดับ
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const out = ymd(toAD(iso[1]), Number(iso[2]), Number(iso[3]));
    return isValidYmd(out) ? out : null;
  }

  // 18 ตุลาคม 2569 / 18ตค69
  const words = s.match(new RegExp('(\\d{1,2})' + MONTH_RE.source + '(\\d{2,4})?'));
  if (words) {
    const y = words[3] ? toAD(words[3]) : yearFor(today, monthOf(words[2]), Number(words[1]));
    const out = ymd(y, monthOf(words[2]), Number(words[1]));
    return isValidYmd(out) ? out : null;
  }

  // 18/10, 18/10/69, 18-10-2569 — วัน/เดือน/ปี ตามที่คนไทยเขียน
  const slash = s.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (slash) {
    const m = Number(slash[2]), d = Number(slash[1]);
    const y = slash[3] ? toAD(slash[3]) : yearFor(today, m, d);
    const out = ymd(y, m, d);
    return isValidYmd(out) ? out : null;
  }

  return null;
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

/** 2026-10 -> "ต.ค. 69" — ใช้ใต้แกนกราฟ ที่แคบกว่าจะเขียนชื่อเดือนเต็ม */
export function thaiMonthShort(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_ABBR[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}`;
}

/** รายการเดือนย้อนหลัง n เดือนจนถึงเดือนนี้ เรียงเก่า -> ใหม่ เช่น ['2026-05', ..., '2026-10'] */
export function lastMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    // Date รับเดือนเกินช่วง 0-11 แล้วทดปีให้เอง ข้ามปีจึงไม่ต้องคิดเอง
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
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
