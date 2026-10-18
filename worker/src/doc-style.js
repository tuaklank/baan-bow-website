// CSS จากแม่แบบ baanbow-doc-a4.html คัดลอกมาทั้งบล็อกแบบไม่แก้อะไรเลย
// ไฟล์นี้สร้างด้วยสคริปต์ ห้ามแก้มือ — ถ้าแม่แบบเปลี่ยน ให้คัดลอกบล็อก <style> มาทับ
export const DOC_CSS = `
:root{
  --wine:#B5161F; --wine2:#D23A44; --gold:#B8895A; --gold-l:#F3E7D9;
  --ink:#1F2430; --mute:#6B7280; --line:#E6E1DC; --soft:#FBF7F4;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#E9E5E1;font-family:'Sarabun',sans-serif;color:var(--ink);font-size:13px;line-height:1.45}
.toolbar{position:sticky;top:0;z-index:5;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:10px;background:#2B2B2B}
.toolbar button{font:500 13px 'Sarabun';border:0;border-radius:6px;padding:7px 12px;background:#444;color:#fff;cursor:pointer}
.toolbar button.on{background:var(--wine)}
.toolbar .print{background:var(--gold)}
.page{width:210mm;min-height:297mm;margin:16px auto;background:#fff;position:relative;overflow:hidden;
  padding:12mm 13mm 10mm;display:flex;flex-direction:column;box-shadow:0 4px 24px rgba(0,0,0,.12)}
/* ribbon accent */
.page::before{content:"";position:absolute;left:0;top:0;width:100%;height:4mm;
  background:linear-gradient(90deg,var(--wine),var(--wine2) 60%,var(--gold))}
.void{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none}
.void span{transform:rotate(-30deg);font:700 120px 'Prompt';color:rgba(200,0,0,.12);border:10px solid rgba(200,0,0,.12);padding:0 40px;border-radius:20px}
.is-void .void{display:flex}

header{display:flex;justify-content:space-between;align-items:flex-start;margin-top:3mm}
.brand{display:flex;align-items:center;gap:10px}
.brand svg{width:64px;height:64px}
.brand .n{font:600 20px 'Prompt';letter-spacing:4px;color:var(--gold)}
.brand .t{font-size:11px;letter-spacing:3px;color:var(--mute);text-transform:uppercase}
.seller{text-align:center;font-size:12px;color:#374151;flex:1;padding-left:8mm}
.seller b{font-size:13.5px;color:var(--ink)}

.titlebar{display:flex;justify-content:space-between;align-items:flex-end;margin:7mm 0 5mm}
.title h1{font:700 30px 'Prompt';line-height:1;color:var(--ink);letter-spacing:1px}
.title h2{font:500 20px 'Prompt';color:var(--wine);margin-top:4px}
.copy{display:inline-block;margin-top:6px;font:600 11px 'Sarabun';color:var(--wine);border:1.5px solid var(--wine);border-radius:4px;padding:1px 8px}
.meta{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:8px 14px;min-width:68mm}
.meta div{display:flex;justify-content:space-between;gap:12px;padding:2px 0}
.meta span{color:var(--mute);font-size:12px}
.meta b{font-weight:600}

.cust{border:1px solid var(--line);border-radius:10px;padding:10px 14px;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:5mm}
.cust .h{grid-column:1/-1;font:600 13px 'Prompt';color:var(--wine);border-bottom:1px dashed var(--line);padding-bottom:4px;margin-bottom:2px}
.cust .full{grid-column:1/-1}
.cust label{display:block;font-size:10.5px;color:var(--mute)}
.cust p{font-weight:500}

table{width:100%;border-collapse:collapse}
thead th{background:linear-gradient(90deg,var(--wine),var(--wine2));color:#fff;font-weight:600;font-size:12.5px;padding:7px 8px;line-height:1.2}
thead th small{display:block;font-weight:300;font-size:10.5px;opacity:.9}
thead th:first-child{border-radius:8px 0 0 0}thead th:last-child{border-radius:0 8px 0 0}
tbody td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:nth-child(even) td{background:var(--soft)}
tbody td small{display:block;color:var(--mute);font-size:11px}
.c{text-align:center}.r{text-align:right;font-variant-numeric:tabular-nums}
tbody tr.fill td{height:9mm;background:transparent!important}

.bottom{display:grid;grid-template-columns:1fr 74mm;gap:6mm;margin-top:4mm}
.words{background:var(--gold-l);border-radius:8px;padding:8px 12px;font-weight:600;color:var(--wine)}
.words small{display:block;font-weight:400;color:var(--mute)}
.pay{display:flex;gap:10px;align-items:center;margin-top:4mm;border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.qr{width:22mm;height:22mm;border:1px dashed var(--gold);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9.5px;color:var(--mute);text-align:center;flex:none}
.pay h4,.note h4{font:600 12.5px 'Prompt';color:var(--wine)}
.note{margin-top:4mm;font-size:12px}
.note ul{padding-left:16px}
.tot div{display:flex;justify-content:space-between;padding:4px 2px;border-bottom:1px solid var(--line)}
.tot span{color:#374151}
.tot .grand{background:var(--wine);color:#fff;border-radius:8px;padding:8px 10px;margin-top:6px;border:0;align-items:baseline}
.tot .grand span{color:#fff;font-weight:500}
.tot .grand b{font:700 20px 'Prompt'}
.tot .wht{color:var(--mute)}

.sign{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:auto;padding-top:10mm;text-align:center;font-size:12px}
.sign .ln{border-top:1px dotted #9CA3AF;margin:0 6mm 4px;padding-top:4px}
.sign small{color:var(--mute)}
footer{text-align:center;font-size:10px;letter-spacing:3px;color:var(--gold);margin-top:6mm;text-transform:uppercase}

[data-only]{display:none}
@media print{
  @page{size:A4;margin:0}
  body{background:#fff}.toolbar{display:none}
  .page{margin:0;box-shadow:none;width:210mm;height:297mm}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@media screen and (max-width:820px){.page{transform-origin:top left;zoom:.45}}
`;
