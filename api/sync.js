/* Account-less device sync. The sync code IS the credential; the server keys
   storage by its hash and never logs the raw code. Optimistic concurrency via
   a rev counter with an atomic Lua compare-and-set, so two devices pushing at
   once can't clobber each other — the loser gets a 409 and re-merges. */
import { createHash } from 'node:crypto';
import { configured, redis } from './_store.js';

const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const MAX_BYTES = 900_000;

const keysFor = (code) => {
  const h = createHash('sha256').update(String(code)).digest('hex').slice(0, 32);
  return { rev: `mf:sync:${h}:rev`, data: `mf:sync:${h}:data` };
};

const CAS_LUA =
  "local cur = tonumber(redis.call('GET', KEYS[1]) or '0') " +
  "if cur == tonumber(ARGV[1]) then " +
  "redis.call('SET', KEYS[1], cur + 1) redis.call('SET', KEYS[2], ARGV[2]) " +
  "return cur + 1 else return -cur end";

export default async function handler(req, res) {
  if (!configured) return res.status(503).json({ error: 'storage not configured' });

  if (req.method === 'GET') {
    const code = String((req.query && req.query.code) || '').toUpperCase();
    if (!CODE_RE.test(code)) return res.status(400).json({ error: 'bad code' });
    const sinceRev = Number((req.query && req.query.sinceRev) ?? -1);
    const k = keysFor(code);
    const rev = Number((await redis('GET', k.rev)) || 0);
    if (rev === 0) return res.status(200).json({ rev: 0, data: null });
    if (Number.isFinite(sinceRev) && sinceRev >= rev) return res.status(200).json({ rev, unchanged: true });
    const raw = await redis('GET', k.data);
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    return res.status(200).json({ rev, data });
  }

  if (req.method === 'POST') {
    const { code, baseRev, data } = req.body || {};
    const c = String(code || '').toUpperCase();
    if (!CODE_RE.test(c)) return res.status(400).json({ error: 'bad code' });
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'bad payload' });
    const body = JSON.stringify(data);
    if (body.length > MAX_BYTES) return res.status(413).json({ error: 'payload too large' });
    const k = keysFor(c);
    const result = Number(await redis('EVAL', CAS_LUA, '2', k.rev, k.data, String(Number(baseRev) || 0), body));
    if (result > 0) return res.status(200).json({ rev: result });
    return res.status(409).json({ rev: -result }); // stale baseRev — pull, merge, retry
  }

  if (req.method === 'DELETE') {
    const c = String((req.body && req.body.code) || '').toUpperCase();
    if (!CODE_RE.test(c)) return res.status(400).json({ error: 'bad code' });
    const k = keysFor(c);
    await redis('DEL', k.rev);
    await redis('DEL', k.data);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).end();
}
