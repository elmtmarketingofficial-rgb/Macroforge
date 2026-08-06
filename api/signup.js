/* Beta signups from the landing page. One row per email; read back with the
   admin token alongside unknown-food reports. New signups get the invite
   emailed immediately — cold traffic goes cold within the hour. */
import { configured, redis } from './_store.js';
import { record } from './track.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const APP_URL = process.env.APP_URL || 'https://macroforge-v2.vercel.app';

const SUBJECT = "You're in — MacroForge beta";

const inviteText = `Thanks for jumping on the beta.

MacroForge is a macro tracker that starts where your week actually starts: the grocery store. It builds your meal plan from the food you'll actually have, and while you're shopping you can scan a barcode and find out whether that item is worth buying for the week you're having.

Open this on your phone:
${APP_URL}

Three things worth doing first (about two minutes):

1. Install it. Your browser will offer "Add to Home Screen" or "Install app" — do that. It runs like a normal app and works offline.

2. Walk through the setup. It asks your height, weight and age to work out daily targets. Don't skip it — the meal planner and the barcode scanner both need targets before they can do anything useful.

3. Create a sync code at the end. There are no accounts or passwords: your data lives on your device, and that code is both your backup and how you link your phone and computer to the same history. Keep it somewhere safe.

What would help most:

- Log a few days of food. Search pulls from a big product database, and barcodes work too.
- Add some groceries, then open Plan and hit "Generate plan from groceries".
- Scan things at the store and tell me whether the verdicts feel right.

Feedback goes straight to me from inside the app: Settings, then Send feedback. Bugs, confusion, anything that annoys you — the annoying stuff is the most useful thing you can send.

It's early, so expect rough edges. Free now, free for the whole beta.

— Ethan`;

const inviteHtml = `<!doctype html><html><body style="margin:0;padding:0;background:#0c0c0e;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#0c0c0e;color:#f3f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;">
  <div style="font-size:26px;font-weight:800;letter-spacing:1px;color:#f3f3f1;">MACROFORGE</div>
  <div style="font-size:13px;color:#8c8c96;margin-bottom:26px;">fuel &middot; plan &middot; train &middot; adapt</div>

  <div style="font-size:22px;font-weight:700;margin-bottom:12px;">You're in.</div>
  <p style="color:#c9c9cf;margin:0 0 18px;">MacroForge is a macro tracker that starts where your week actually starts: the grocery store. It builds your meal plan from the food you'll actually have, and while you're shopping you can scan a barcode and find out whether that item is worth buying for the week you're having.</p>

  <p style="margin:0 0 26px;"><a href="${APP_URL}" style="display:inline-block;background:#cbff3a;color:#0c0c0e;font-weight:800;text-decoration:none;padding:13px 24px;border-radius:12px;">Open MacroForge</a></p>

  <div style="font-size:11px;letter-spacing:1.5px;color:#5b5b65;font-weight:700;margin-bottom:10px;">THREE THINGS FIRST</div>
  <p style="color:#c9c9cf;margin:0 0 10px;"><b style="color:#f3f3f1;">1. Install it.</b> Your browser will offer &ldquo;Add to Home Screen&rdquo; or &ldquo;Install app&rdquo;. It then runs like a normal app and works offline.</p>
  <p style="color:#c9c9cf;margin:0 0 10px;"><b style="color:#f3f3f1;">2. Do the setup.</b> It asks height, weight and age to work out your targets. Don't skip it — the planner and the scanner both need targets to be useful.</p>
  <p style="color:#c9c9cf;margin:0 0 22px;"><b style="color:#f3f3f1;">3. Save your sync code.</b> No accounts, no passwords: your data lives on your device. The code is your backup and how you link phone and laptop.</p>

  <div style="font-size:11px;letter-spacing:1.5px;color:#5b5b65;font-weight:700;margin-bottom:10px;">WHAT WOULD HELP MOST</div>
  <p style="color:#c9c9cf;margin:0 0 6px;">&bull; Log a few days of food</p>
  <p style="color:#c9c9cf;margin:0 0 6px;">&bull; Add groceries, then Plan &rarr; &ldquo;Generate plan from groceries&rdquo;</p>
  <p style="color:#c9c9cf;margin:0 0 22px;">&bull; Scan things at the store and tell me if the verdicts feel right</p>

  <p style="color:#c9c9cf;margin:0 0 22px;">Feedback goes straight to me inside the app: <b style="color:#f3f3f1;">Settings &rarr; Send feedback</b>. Bugs, confusion, anything that annoys you — the annoying stuff is the most useful thing you can send.</p>

  <p style="color:#5b5b65;font-size:13px;margin:0;border-top:1px solid #27272f;padding-top:18px;">It's early, so expect rough edges. Free now, free for the whole beta.<br />&mdash; Ethan</p>
</div></body></html>`;

/** Fire the invite. Returns quietly if no mail provider is configured. */
async function sendInvite(email) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM;
  if (!key || !from) return { sent: false, reason: 'mail not configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: SUBJECT, html: inviteHtml, text: inviteText }),
    });
    if (!res.ok) return { sent: false, reason: `resend ${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String((e && e.message) || e) };
  }
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { email, device, source } = req.body || {};
    const e = String(email || '').trim().toLowerCase().slice(0, 120);
    if (!EMAIL_RE.test(e)) return res.status(400).json({ error: 'bad email' });
    if (!configured) return res.status(202).json({ stored: false });

    const existing = await redis('HGET', 'mf:signups', e);
    // count the conversion once, against whatever channel sent them
    if (!existing) { try { await record({ event: 'signup', source }); } catch {} }
    await redis('HSET', 'mf:signups', e, JSON.stringify({
      email: e,
      device: String(device || '').slice(0, 40),
      ts: existing ? (JSON.parse(existing).ts || Date.now()) : Date.now(),
    }));
    // only invite once, so a double-submit doesn't double-mail
    const invite = existing ? { sent: false, reason: 'already invited' } : await sendInvite(e);
    return res.status(200).json({ stored: true, invited: invite.sent });
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
