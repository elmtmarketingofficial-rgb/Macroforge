/* The reminder heartbeat. An external scheduler (QStash / cron-job.org) calls
   this every ~10 minutes with ?key=CRON_SECRET; it fires meal-time pushes to
   every subscription whose local clock is inside a meal window. Idempotent —
   Redis SET NX guards each meal per device per day. */
import webpush from 'web-push';
import { configured, redis } from '../_store.js';

const WINDOW_MIN = 12; // matches the ~10-min scheduler cadence with a little slack

const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return -1;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? -1 : h * 60 + mi;
};

export default async function handler(req, res) {
  const key = (req.query && req.query.key) || req.headers['x-cron-key'] || '';
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });
  if (!configured) return res.status(200).json({ sent: 0, note: 'storage not configured' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(200).json({ sent: 0, note: 'vapid not configured' });
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:elmtmarketingofficial@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const flat = (await redis('HGETALL', 'mf:subs')) || [];
  const nowUtcMin = (() => { const d = new Date(); return d.getUTCHours() * 60 + d.getUTCMinutes(); })();
  let sent = 0, pruned = 0, checked = 0;

  for (let i = 0; i + 1 < flat.length; i += 2) {
    const id = flat[i];
    let cfg;
    try { cfg = JSON.parse(flat[i + 1]); } catch { continue; }
    if (!cfg || !cfg.sub || !Array.isArray(cfg.meals)) continue;
    checked++;
    // tz = getTimezoneOffset(): minutes to ADD to local time to reach UTC → local = UTC − tz
    const localMin = ((nowUtcMin - (Number(cfg.tz) || 0)) % 1440 + 1440) % 1440;
    const localDay = new Date(Date.now() - (Number(cfg.tz) || 0) * 60000).toISOString().slice(0, 10);
    for (const meal of cfg.meals) {
      const t = minutesOf(meal.time);
      if (t < 0 || localMin < t || localMin >= t + WINDOW_MIN) continue;
      const guard = await redis('SET', `mf:sent:${localDay}:${id}:${meal.id}`, '1', 'NX', 'EX', 86400);
      if (guard !== 'OK') continue; // already fired this window today
      try {
        await webpush.sendNotification(cfg.sub, JSON.stringify({
          title: `Time for ${meal.label}`,
          body: 'Log it as you eat it — protein first.',
          tag: `meal-${meal.id}`,
        }));
        sent++;
      } catch (e) {
        const status = e && (e.statusCode || e.status);
        if (status === 404 || status === 410) { await redis('HDEL', 'mf:subs', id); pruned++; }
      }
    }
  }
  return res.status(200).json({ sent, pruned, subscriptions: checked });
}
