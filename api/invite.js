/* Invite gate. Signing up mints a key tied to that email; the invite email
   carries it in the link. The app trades the key for local access once per
   device and then never asks again — there's still no account and no password.

   Keys work on several devices on purpose (phone + laptop is one person), but
   not unlimited, so a link pasted somewhere public stops working. */
import { randomBytes, createHash } from 'node:crypto';
import { configured, redis } from './_store.js';

const MAX_DEVICES = 8;

export const newKey = () => randomBytes(10).toString('base64url'); // ~14 url-safe chars
const clean = (k) => String(k || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
const deviceId = (req) => {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ua = String(req.headers['user-agent'] || '');
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex').slice(0, 16);
};

/** Mint (or reuse) the key for an email. Called by api/signup.js. */
export async function keyFor(email) {
  if (!configured) return null;
  const existing = await redis('HGET', 'mf:invitekeys', email);
  if (existing) return existing;
  const key = newKey();
  await Promise.all([
    redis('HSET', 'mf:invitekeys', email, key),
    redis('HSET', 'mf:invites', key, JSON.stringify({ email, ts: Date.now(), devices: [] })),
  ]);
  return key;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const key = clean((req.body || {}).key);
  if (!key) return res.status(400).json({ ok: false, error: 'no key' });
  // with no store configured there's nothing to check against — don't lock people out
  if (!configured) return res.status(200).json({ ok: true, note: 'storage not configured' });

  const raw = await redis('HGET', 'mf:invites', key);
  if (!raw) return res.status(403).json({ ok: false, error: 'not a valid invite' });

  let rec;
  try { rec = JSON.parse(raw); } catch { return res.status(403).json({ ok: false, error: 'not a valid invite' }); }
  const devices = Array.isArray(rec.devices) ? rec.devices : [];
  const id = deviceId(req);
  if (!devices.includes(id)) {
    if (devices.length >= MAX_DEVICES) {
      return res.status(429).json({ ok: false, error: 'this invite has been used on too many devices' });
    }
    devices.push(id);
    await redis('HSET', 'mf:invites', key, JSON.stringify({ ...rec, devices, last: Date.now() }));
  }
  return res.status(200).json({ ok: true });
}
