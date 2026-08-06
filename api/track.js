/* Funnel analytics. Counters only — no cookies, no profiles, nothing that
   identifies a person. Unique visitors go through a HyperLogLog keyed by a
   salted hash that rotates daily, so the same device can't be followed from
   one day to the next and the raw IP is never stored anywhere.

   What it answers: how many people saw /join, how many signed up, how many
   actually opened the app, and how many reached the moments that matter —
   first food logged, first week planned. Broken down by traffic source. */
import { createHash } from 'node:crypto';
import { configured, redis } from './_store.js';

/* Only these are recorded; anything else is dropped. Order is funnel order. */
export const EVENTS = [
  'join_view',   // landing page seen
  'signup',      // email submitted (recorded server-side by api/signup.js)
  'app_new',     // app opened on a device for the first time
  'app_open',    // app opened by a returning device
  'install',     // installed as a PWA
  'first_log',   // first food ever logged on this device — activation
  'first_plan',  // first week generated from groceries — the USP moment
  'first_scan',  // first barcode scanned
];
const EVENT_SET = new Set(EVENTS);

const DAYS_KEPT = 90;
const TTL = DAYS_KEPT * 86400;

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/** Traffic source, normalised to something readable and low-cardinality. */
const cleanSource = (src) => {
  const s = String(src || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
  return s || 'direct';
};

const visitorHash = (req, day) => {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ua = String(req.headers['user-agent'] || '');
  const salt = process.env.ADMIN_TOKEN || 'macroforge';
  return createHash('sha256').update(`${day}|${ip}|${ua}|${salt}`).digest('hex').slice(0, 16);
};

/** Record one event. Safe to call from other endpoints (see api/signup.js). */
export async function record({ event, source, req }) {
  if (!configured || !EVENT_SET.has(event)) return;
  const day = dayKey();
  const src = cleanSource(source);
  await Promise.all([
    redis('HINCRBY', `mf:an:d:${day}`, event, 1),
    redis('HINCRBY', `mf:an:s:${day}`, `${src}|${event}`, 1),
    redis('EXPIRE', `mf:an:d:${day}`, TTL),
    redis('EXPIRE', `mf:an:s:${day}`, TTL),
  ]);
  if (req && (event === 'join_view' || event === 'app_new' || event === 'app_open')) {
    await redis('PFADD', `mf:an:u:${day}`, visitorHash(req, day));
    await redis('EXPIRE', `mf:an:u:${day}`, TTL);
  }
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { event, source } = req.body || {};
    if (!EVENT_SET.has(event)) return res.status(400).json({ error: 'unknown event' });
    if (!configured) return res.status(202).json({ ok: false });
    try {
      await record({ event, source, req });
    } catch { /* analytics must never break the page it measures */ }
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const token = (req.query && req.query.token) || '';
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
    if (!configured) return res.status(200).json({ days: [], sources: [], totals: {} });

    const span = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const dates = Array.from({ length: span }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      return dayKey(d);
    });

    const perDay = await Promise.all(dates.map(async (date) => {
      const [flat, uniques] = await Promise.all([
        redis('HGETALL', `mf:an:d:${date}`),
        redis('PFCOUNT', `mf:an:u:${date}`),
      ]);
      const counts = {};
      for (let i = 0; i + 1 < (flat || []).length; i += 2) counts[flat[i]] = Number(flat[i + 1]) || 0;
      return { date, uniques: Number(uniques) || 0, ...counts };
    }));

    // source × event, summed across the window
    const bySource = {};
    const srcFlats = await Promise.all(dates.map((date) => redis('HGETALL', `mf:an:s:${date}`)));
    for (const flat of srcFlats) {
      for (let i = 0; i + 1 < (flat || []).length; i += 2) {
        const [src, event] = String(flat[i]).split('|');
        if (!src || !event) continue;
        bySource[src] = bySource[src] || { source: src };
        bySource[src][event] = (bySource[src][event] || 0) + (Number(flat[i + 1]) || 0);
      }
    }

    const totals = { uniques: 0 };
    for (const d of perDay) {
      for (const k of ['uniques', ...EVENTS]) totals[k] = (totals[k] || 0) + (d[k] || 0);
    }

    const sources = Object.values(bySource).sort((a, b) => (b.join_view || 0) - (a.join_view || 0));
    return res.status(200).json({ days: perDay, sources, totals, events: EVENTS });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
