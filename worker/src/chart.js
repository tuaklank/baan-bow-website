// กราฟ SVG ที่วาดจากฝั่งเซิร์ฟเวอร์ — ไม่มี JS ไม่มีไลบรารีจาก CDN
// เปิดบนมือถือที่เน็ตช้าก็ขึ้นทันทีพร้อมหน้า และทุกตัวเลขมีตารางกำกับข้างล่างเสมอ
// กราฟจึงเป็นของแถมให้ดูง่าย ไม่ใช่ทางเดียวที่จะอ่านค่าได้
import { esc } from './render.js';
import { fmtBaht, thaiMonthShort } from './thai.js';

// สีของเส้นข้อมูล ผ่านเครื่องตรวจ contrast/ตาบอดสีบนพื้นขาวแล้ว (ΔE 24.7 protan)
// ห้ามเอาสีไวน์ของแบรนด์มาใช้กับข้อมูล เพราะในหน้านี้สีไวน์แปลว่า "เลยกำหนด/ติดลบ"
export const C = {
  income: '#2a78d6',    // รายรับ
  spend:  '#eb6834',    // รายจ่าย
  grid:   '#E6E1DC',
  axis:   '#C3C2B7',
  muted:  '#898781',
};

/** สตางค์ -> ป้ายแกน Y สั้นๆ หน่วยพัน เช่น 12,500.00 บาท -> "12K" */
function tick(satang) {
  const baht = satang / 100;
  if (baht === 0) return '0';
  if (Math.abs(baht) >= 1000) return Math.round(baht / 1000) + 'K';
  return String(Math.round(baht));
}

/** ขีดแกน Y ที่ลงตัว 4 ช่วง จากค่าสูงสุดจริง */
function niceMax(v) {
  if (v <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (v <= m * pow) return m * pow;
  }
  return 10 * pow;
}

/**
 * แท่งคู่รายเดือน — รายรับเทียบรายจ่าย
 * rows: [{ ym, income, spent }] เรียงเก่า -> ใหม่
 * ติดป้ายตัวเลขเฉพาะเดือนล่าสุด ตามหลัก "ติดป้ายเท่าที่จำเป็น"
 * ถ้าติดทุกแท่งจะกลายเป็นตัวเลขเต็มจอแล้วไม่มีใครอ่าน
 */
export function monthlyBars(rows) {
  const W = 340, H = 190;
  const padL = 30, padR = 8, padT = 22, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = niceMax(Math.max(1, ...rows.flatMap((r) => [r.income, r.spent])));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const band = plotW / rows.length;
  const barW = Math.min(22, (band - 10) / 2);   // ไม่เกิน 24px และเหลือที่ว่างในช่องเสมอ

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const gy = padT + plotH - f * plotH;
    return `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${f === 0 ? C.axis : C.grid}" stroke-width="1"/>`
      + `<text x="${padL - 5}" y="${gy + 3.5}" class="tk" text-anchor="end">${tick(f * max)}</text>`;
  }).join('');

  const last = rows.length - 1;
  const bars = rows.map((r, i) => {
    const cx = padL + band * i + band / 2;
    // ช่องว่าง 2px ระหว่างแท่งที่ติดกัน ให้พื้นขาวเป็นตัวแยก ไม่ใช่เส้นขอบ
    const xIn = cx - barW - 1;
    const xSp = cx + 1;

    // ติดป้ายเฉพาะเดือนล่าสุด และเฉพาะแท่งที่สูงกว่าแท่งเดียว
    // ถ้าติดทั้งคู่ เดือนที่รายรับใกล้รายจ่ายป้ายจะทับกันจนอ่านไม่ออก
    // อีกตัวอ่านได้จากหัวหน้าจอและตาราง "ดูเป็นตัวเลข" อยู่แล้ว
    const top = r.income >= r.spent ? r.income : r.spent;
    const tx = (r.income >= r.spent ? xIn : xSp) + barW / 2;
    const tag = i === last && top > 0
      ? `<text x="${tx}" y="${y(top) - 5}" class="vl" text-anchor="middle">${esc(fmtBaht(top).split('.')[0])}</text>`
      : '';

    return bar(xIn, y(r.income), barW, padT + plotH - y(r.income), C.income,
      `${thaiMonthShort(r.ym)} รายรับ ${fmtBaht(r.income)} บาท`)
      + bar(xSp, y(r.spent), barW, padT + plotH - y(r.spent), C.spend,
        `${thaiMonthShort(r.ym)} รายจ่าย ${fmtBaht(r.spent)} บาท`)
      + tag
      + `<text x="${cx}" y="${H - 8}" class="tk" text-anchor="middle">${esc(thaiMonthShort(r.ym))}</text>`;
  }).join('');

  return svg(W, H, grid + bars, 'กราฟแท่งเทียบรายรับกับรายจ่ายรายเดือน');
}

/**
 * แท่งแนวนอน — ใช้กับหมวดรายจ่ายและยอดแยกบริษัท ที่ชื่อยาวเกินจะวางใต้แกนตั้ง
 * ทุกแท่งสีเดียวกันโดยตั้งใจ: หมวดไม่มีลำดับมาก-น้อยในตัวเอง
 * ถ้าไล่สีเข้มตามยอดจะเป็นการบอกความยาวซ้ำสองครั้ง เปลืองช่องสีไปเปล่าๆ
 */
export function hBars(rows, color) {
  if (!rows.length) return '';
  const W = 340, rowH = 30, padL = 0, padR = 4;
  const H = rows.length * rowH + 4;
  const labelW = 112;
  const plotW = W - labelW - padR - 62;
  const max = Math.max(1, ...rows.map((r) => r.value));

  // ชื่อยาวกว่าช่องต้องตัด ไม่ใช่ปล่อยให้ลอดไปใต้แท่ง (ชื่อเต็มอยู่ใน <title> และในตัวเลขข้างๆ)
  // SVG ไม่มี text-overflow ให้ใช้ จึงตัดตามจำนวนตัวอักษรที่พอดีกับ 112px ที่ 12px
  const fit = (s) => (String(s).length > 15 ? String(s).slice(0, 14) + '…' : String(s));

  const body = rows.map((r, i) => {
    const w = Math.max(2, (r.value / max) * plotW);
    const ty = i * rowH + 4;
    const full = `${r.label} ${fmtBaht(r.value)} บาท`;
    return `<text x="${padL}" y="${ty + 15}" class="cl">${esc(fit(r.label))}<title>${esc(full)}</title></text>`
      + bar(labelW, ty + 4, w, 14, color, full, true)
      + `<text x="${labelW + w + 7}" y="${ty + 15}" class="vl">${esc(fmtBaht(r.value))}</text>`;
  }).join('');

  return svg(W, H, body, 'กราฟแท่งแนวนอนเทียบยอดแต่ละรายการ');
}

/**
 * แท่งเดียว มุมด้านปลายมน 4px ด้านชิดเส้นฐานเหลี่ยม
 * วาดเป็น path เพราะ rect มนได้ทั้ง 4 มุมเท่านั้น
 */
function bar(x, yy, w, h, fill, title, horizontal = false) {
  const r = Math.min(4, horizontal ? w / 2 : h / 2, horizontal ? h / 2 : w / 2);
  const d = horizontal
    ? `M${x},${yy} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${yy + h - r} a${r},${r} 0 0 1 ${-r},${r} H${x} Z`
    : `M${x},${yy + r} a${r},${r} 0 0 1 ${r},${-r} H${x + w - r} a${r},${r} 0 0 1 ${r},${r} V${yy + h} H${x} Z`;
  return `<path d="${d}" fill="${fill}"><title>${esc(title)}</title></path>`;
}

/**
 * ขนาดคุมด้วย CSS (.chart) ไม่ใส่ width/height เป็น attribute
 * เพราะ height="auto" ไม่ใช่ค่าที่ SVG รับ เบราว์เซอร์จะขึ้น error ทุกกราฟ
 */
function svg(w, h, body, desc) {
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"`
    + ` role="img" aria-label="${esc(desc)}">${body}</svg>`;
}

/** ติดลบใช้เครื่องหมายลบจริง (−) ให้ตรงกับตัวเลขนำบนหัวหน้าจอ ไม่ใช่ยัติภังค์ */
export const signed = (satang) => (satang < 0 ? '−' : '') + fmtBaht(Math.abs(satang));

/** คีย์สีของกราฟ — ต้องมีเสมอเมื่อมีตั้งแต่ 2 เส้นข้อมูลขึ้นไป */
export function legend(items) {
  return `<div class="legend">${items.map((i) =>
    `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}

export const CHART_CSS = `
.chart{display:block;width:100%;height:auto;overflow:visible}
.chart .tk{font:400 10px 'Sarabun',sans-serif;fill:${C.muted}}
.chart .cl{font:400 12px 'Sarabun',sans-serif;fill:#52514E}
.chart .vl{font:600 11px 'Sarabun',sans-serif;fill:#52514E;font-variant-numeric:tabular-nums}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:2px 0 10px;font-size:12.5px;color:var(--mute)}
.legend span{display:flex;align-items:center;gap:6px}
.legend i{width:10px;height:10px;border-radius:3px;flex:none}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px 10px;margin-bottom:10px;
  box-shadow:0 1px 3px rgba(0,0,0,.04)}
.panel h2{font-size:14px;font-weight:600;color:var(--wine);margin-bottom:2px}
.panel .sub{font-size:12px;color:var(--mute);margin-bottom:8px}
.hero{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 14px;margin-bottom:10px;
  box-shadow:0 1px 3px rgba(0,0,0,.04)}
.hero .lb{font-size:12.5px;color:var(--mute)}
.hero .big{font-size:40px;line-height:1.15;font-weight:700;letter-spacing:-.5px;margin:2px 0 4px}
.hero .big.up{color:#0A7A0A}
.hero .big.down{color:#C0392B}
.hero .split{display:flex;gap:16px;font-size:13px;color:#52514E;flex-wrap:wrap}
.hero .split b{font-weight:600}
.hero .split i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
.kpi .k{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 8px;text-align:center;
  box-shadow:0 1px 3px rgba(0,0,0,.04)}
.kpi .k .n{font-size:21px;font-weight:700;line-height:1.2}
.kpi .k .t{font-size:11.5px;color:var(--mute);margin-top:1px}
.kpi .k .n.warn{color:var(--wine)}
`;
