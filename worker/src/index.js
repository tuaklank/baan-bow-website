// ทางเข้าของ Worker — รับแค่ 3 path ที่ผูก route ไว้ ที่เหลือไม่ผ่านมาถึงที่นี่
//   POST /webhook   LINE
//   GET  /d/:token  เอกสาร A4
//   GET  /admin     หลังบ้านมือถือ (กั้นด้วย Cloudflare Access)
import { verifySignature, reply, push } from './line.js';
import { handleText, morningDigest, eveningDigest } from './handlers.js';
import { CRON_EVENING } from './config.js';
import {
  docByToken, recentDocs, searchDocs, openJobs, monthSummary,
  listStock, stockValue, recentExpenses, monthExpenses, monthlyTrend,
} from './db.js';
import { renderDoc } from './render.js';
import { renderAdmin, TABS } from './admin.js';
import { todayBkk, monthBkk, lastMonths } from './thai.js';

const html = (body, status = 200) => new Response(body, {
  status,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  },
});

const TOKEN_RE = /^[0-9a-f]{32}$/;

async function handleWebhook(request, env, ctx) {
  // ต้องอ่าน body เป็นไบต์ดิบก่อนตรวจลายเซ็น ห้าม parse JSON ก่อน
  const raw = await request.arrayBuffer();
  const ok = await verifySignature(env.LINE_CHANNEL_SECRET, raw, request.headers.get('x-line-signature'));
  if (!ok) return new Response('invalid signature', { status: 401 });

  let events = [];
  try {
    events = JSON.parse(new TextDecoder().decode(raw)).events || [];
  } catch {
    return new Response('bad body', { status: 400 });
  }

  // ตอบ LINE 200 ทันที แล้วค่อยประมวลผลต่อเบื้องหลัง (LINE timeout สั้น)
  ctx.waitUntil((async () => {
    for (const ev of events) {
      if (ev.type !== 'message' || ev.message?.type !== 'text') continue;
      const uid = ev.source?.userId;
      if (!uid) continue;
      try {
        const answer = await handleText(env, uid, ev.message.text);
        if (answer) await reply(env, ev.replyToken, answer);
      } catch (e) {
        console.error('handleText', e);
        await reply(env, ev.replyToken, '⚠️ ระบบขัดข้อง ลองใหม่อีกครั้งครับ');
      }
    }
  })());

  return new Response('ok');
}

async function handleDoc(url, env) {
  const token = url.pathname.slice('/d/'.length);
  if (!TOKEN_RE.test(token)) return html('<p>ไม่พบเอกสาร</p>', 404);
  const row = await docByToken(env.DB, token);
  if (!row) return html('<p>ไม่พบเอกสาร</p>', 404);
  return html(renderDoc(row));
}

async function handleAdmin(url, env) {
  const asked = url.searchParams.get('tab');
  const tab = TABS.includes(asked) ? asked : 'jobs';
  const q = (url.searchParams.get('q') || '').trim();
  const today = todayBkk();
  const ym = monthBkk();

  // ดึงเฉพาะที่แท็บนั้นใช้ — แท็บสรุปใช้เกือบทุกชุด แท็บอื่นใช้ชุดเดียว
  const needJobs = tab === 'jobs' || tab === 'summary';
  const needStock = tab === 'stock' || tab === 'summary';
  const needMonthExp = tab === 'expenses' || tab === 'summary';

  // กราฟย้อนหลังครึ่งปี — พอเห็นแนวโน้ม แต่ยังไม่ล้นจอมือถือ
  const months = lastMonths(ym, 6);

  const [jobs, docs, summary, stock, stockVal, expenses, monthExp, raw] = await Promise.all([
    needJobs ? openJobs(env.DB) : [],
    tab === 'docs' ? (q ? searchDocs(env.DB, q, 50) : recentDocs(env.DB, 50)) : [],
    tab === 'summary' ? monthSummary(env.DB, ym) : null,
    needStock ? listStock(env.DB) : [],
    needStock ? stockValue(env.DB) : null,
    tab === 'expenses' ? recentExpenses(env.DB, 50) : [],
    needMonthExp ? monthExpenses(env.DB, ym) : [],
    tab === 'summary' ? monthlyTrend(env.DB, months[0]) : null,
  ]);

  // เดือนที่ไม่มีรายการต้องมีแท่งเป็น 0 ไม่ใช่หายไปจากกราฟ ไม่งั้นแกนเวลาจะโกหก
  const sum = (rows, m) => rows.find((r) => r.ym === m)?.total ?? 0;
  const trend = raw
    ? months.map((m) => ({ ym: m, income: sum(raw.income, m), spent: sum(raw.spent, m) }))
    : [];

  return html(renderAdmin({ tab, today, jobs, docs, summary, q, stock, stockVal, expenses, monthExp, trend }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/webhook') {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      return handleWebhook(request, env, ctx);
    }

    if (url.pathname.startsWith('/d/')) {
      if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });
      return handleDoc(url, env);
    }

    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });
      return handleAdmin(url, env);
    }

    return new Response('not found', { status: 404 });
  },

  // แจ้งเตือน 2 รอบต่อวัน (เวลาใน wrangler.toml เป็น UTC, ไทย = UTC+7)
  //   08:00 น. วางแผนงานวันนี้     — งานเลยกำหนด/ครบวันนี้/ครบพรุ่งนี้
  //   17:00 น. ทวงก่อนเลิกงาน      — งานค้างทั้งหมด ให้ปิดงานที่เสร็จแล้ว
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const msg = event.cron === CRON_EVENING
        ? await eveningDigest(env)
        : await morningDigest(env);
      if (!msg) return;   // ไม่มีงานค้างก็ไม่ต้องรบกวน
      const allowed = (env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const uid of allowed) await push(env, uid, msg);
    })());
  },
};
