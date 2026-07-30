/* Web Push subscriptions + each device's meal schedule. No accounts — a
   subscription is keyed by a hash of its endpoint and carries everything
   the tick needs (times + timezone offset). */
import { createHash } from 'node:crypto';
import { configured, redis } from '../_store.js';

const idFor = (endpoint) => createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 24);

export default async function handler(req, res) {
  if (!configured) return res.status(503).json({ error: 'storage not configured' });
  if (req.method === 'POST') {
    const { sub, meals, nudge, tzOffsetMin } = req.body || {};
    if (!sub || !sub.endpoint || !sub.keys) return res.status(400).json({ error: 'bad subscription' });
    const cleanMeals = (Array.isArray(meals) ? meals : []).slice(0, 8)
      .map((m) => ({ id: String(m.id || '').slice(0, 24), label: String(m.label || 'Meal').slice(0, 40), time: String(m.time || '') }))
      .filter((m) => /^\d{1,2}:\d{2}$/.test(m.time));
    await redis('HSET', 'mf:subs', idFor(sub.endpoint), JSON.stringify({
      sub, meals: cleanMeals, nudge: !!nudge, tz: Number(tzOffsetMin) || 0, at: Date.now(),
    }));
    return res.status(200).json({ ok: true, meals: cleanMeals.length });
  }
  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'bad endpoint' });
    await redis('HDEL', 'mf:subs', idFor(endpoint));
    return res.status(200).json({ ok: true });
  }
  res.setHeader('Allow', 'POST, DELETE');
  return res.status(405).end();
}
