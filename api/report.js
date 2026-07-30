/* Unknown-food reports: the app POSTs barcodes it had no knowledge of;
   the developer reads them back with the admin token. One row per barcode. */
import { configured, redis } from './_store.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { code, name, ts } = req.body || {};
    const clean = String(code || '').replace(/\D/g, '').slice(0, 32);
    if (!clean) return res.status(400).json({ error: 'bad code' });
    if (!configured) return res.status(202).json({ stored: false, note: 'storage not configured' });
    await redis('HSET', 'mf:reports', clean, JSON.stringify({
      code: clean,
      name: String(name || '').slice(0, 120),
      ts: Number(ts) || Date.now(),
    }));
    return res.status(200).json({ stored: true });
  }
  if (req.method === 'GET') {
    const token = (req.query && req.query.token) || '';
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
    if (!configured) return res.status(200).json({ reports: [], note: 'storage not configured' });
    const vals = (await redis('HVALS', 'mf:reports')) || [];
    const reports = vals
      .map((v) => { try { return JSON.parse(v); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return res.status(200).json({ reports });
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
