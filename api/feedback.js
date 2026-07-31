/* Tester feedback from the landing page (and later the app). Newest first,
   capped at 500 entries; read back with the admin token. */
import { configured, redis } from './_store.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { message, email } = req.body || {};
    const msg = String(message || '').trim().slice(0, 2000);
    if (msg.length < 5) return res.status(400).json({ error: 'message too short' });
    if (!configured) return res.status(202).json({ stored: false });
    await redis('LPUSH', 'mf:feedback', JSON.stringify({
      message: msg,
      email: String(email || '').trim().toLowerCase().slice(0, 120),
      ts: Date.now(),
    }));
    await redis('LTRIM', 'mf:feedback', 0, 499);
    return res.status(200).json({ stored: true });
  }
  if (req.method === 'GET') {
    const token = (req.query && req.query.token) || '';
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
    if (!configured) return res.status(200).json({ feedback: [] });
    const raw = (await redis('LRANGE', 'mf:feedback', 0, 199)) || [];
    const feedback = raw.map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
    return res.status(200).json({ feedback });
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
