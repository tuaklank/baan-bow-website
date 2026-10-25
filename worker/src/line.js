// LINE Messaging API — ตรวจลายเซ็นด้วย Web Crypto (Worker ไม่มี node:crypto)
const enc = new TextEncoder();

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * ตรวจ x-line-signature = HMAC-SHA256(channel secret, raw body) เข้ารหัส base64
 * ใช้ crypto.subtle.verify ซึ่งเทียบแบบ constant-time อยู่แล้ว ไม่ต้องเทียบ string เอง
 * rawBody ต้องเป็นไบต์ดิบของ request ห้าม parse JSON ก่อน ไม่งั้นลายเซ็นไม่ตรง
 */
export async function verifySignature(secret, rawBody, signature) {
  if (!secret || !signature) return false;
  let sig;
  try {
    sig = b64ToBytes(signature);
  } catch {
    return false;   // ลายเซ็นไม่ใช่ base64 ที่ถูกต้อง
  }
  if (sig.length !== 32) return false;
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, sig, rawBody);
}

const LIMIT = 4900;   // LINE จำกัด 5,000 ตัวอักษรต่อข้อความ เผื่อไว้เล็กน้อย

async function call(env, path, body) {
  const res = await fetch('https://api.line.me/v2/bot/message/' + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('LINE', path, res.status, await res.text());
  return res;
}

export const reply = (env, replyToken, text) =>
  call(env, 'reply', { replyToken, messages: [{ type: 'text', text: String(text).slice(0, LIMIT) }] });

export const push = (env, to, text) =>
  call(env, 'push', { to, messages: [{ type: 'text', text: String(text).slice(0, LIMIT) }] });
