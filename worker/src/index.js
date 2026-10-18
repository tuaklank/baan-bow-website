// ทางเข้าของ Worker — รับแค่ 3 path ที่ผูก route ไว้ ที่เหลือไม่ผ่านมาถึงที่นี่
//   POST /webhook   LINE
//   GET  /d/:token  เอกสาร A4
//   GET  /admin     หลังบ้านมือถือ (กั้นด้วย Cloudflare Access)
import { verifySignature, reply, push } from './line.js';
import { handleText, morningDigest } from './handlers.js';
import { docByToken, recentDocs, searchDocs, openJobs, monthSummary } from './db.js';
import { renderDoc } from './render.js';
import { renderAdmin } from './admin.js';
import { todayBkk, monthBkk } from './thai.js';

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
  const tab = ['jobs', 'docs', 'summary'].includes(url.searchParams.get('tab'))
    ? url.searchParams.get('tab') : 'jobs';
  const q = (url.searchParams.get('q') || '').trim();
  const today = todayBkk();

  // แท็บงานกับแท็บสรุปใช้รายการงานชุดเดียวกัน ดึงครั้งเดียวพอ
  const [jobs, docs, summary] = await Promise.all([
    tab === 'docs' ? Promise.resolve([]) : openJobs(env.DB),
    tab === 'docs' ? (q ? searchDocs(env.DB, q, 50) : recentDocs(env.DB, 50)) : Promise.resolve([]),
    tab === 'summary' ? monthSummary(env.DB, monthBkk()) : Promise.resolve(null),
  ]);

  return html(renderAdmin({ tab, today, jobs, docs, summary, q }));
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

  // Cron "0 1 * * *" = 08:00 เวลาไทย — แจ้งเตือนงานเลยกำหนด/ครบวันนี้/ครบพรุ่งนี้
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const msg = await morningDigest(env);
      if (!msg) return;
      const allowed = (env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      for (const uid of allowed) await push(env, uid, msg);
    })());
  },
};
