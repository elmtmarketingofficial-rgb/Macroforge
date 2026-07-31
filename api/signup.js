/* Beta signups from the landing page. One row per email; read back with the
   admin token alongside unknown-food reports. */
import { configured, redis } from './_store.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { email, device } = req.body || {};
    const e = String(email || '').trim().toLowerCase().slice(0, 120);
    if (!EMAIL_RE.test(e)) return res.status(400).json({ error: 'bad email' });
    if (!configured) return res.status(202).json({ stored: false });
    await redis('HSET', 'mf:signups', e, JSON.stringify({
      email: e,
      device: String(device || '').slice(0, 40),
      ts: Date.now(),
    }));
    return res.status(200).json({ stored: true });
  }
  if (req.method === 'GET') {
    const token = (req.query && req.query.token) || '';
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
    if (!configured) return res.status(200).json({ signups: [] });
    const vals = (await redis('HVALS', 'mf:signups')) || [];
    const signups = vals
      .map((v) => { try { return JSON.parse(v); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return res.status(200).json({ signups });
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
