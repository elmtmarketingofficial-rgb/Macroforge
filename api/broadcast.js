/* Send one message to every beta signup. Admin-token gated and deliberately
   awkward: it will not send unless the caller passes back the exact recipient
   count it is about to mail, so a mistaken click can't reach the whole list.

   GET  ?token=...            → who would receive it, without sending
   POST {token, subject, body, confirmCount}  → sends
   POST {token, subject, body, testTo}        → sends only to that one address */
import { configured, redis } from './_store.js';

const APP_URL = process.env.APP_URL || 'https://macroforge.club';

const shell = (bodyHtml) => `<!doctype html><html><body style="margin:0;padding:0;background:#0c0c0e;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#0c0c0e;color:#f3f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;">
  <div style="font-size:26px;font-weight:800;letter-spacing:1px;">MACROFORGE</div>
  <div style="font-size:13px;color:#8c8c96;margin-bottom:26px;">fuel &middot; plan &middot; train &middot; adapt</div>
  ${bodyHtml}
  <p style="margin:26px 0 0;"><a href="${APP_URL}" style="display:inline-block;background:#cbff3a;color:#0c0c0e;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:12px;">Open MacroForge</a></p>
  <p style="color:#5b5b65;font-size:12px;margin:22px 0 0;border-top:1px solid #27272f;padding-top:16px;">
    You're getting this because you signed up for the MacroForge beta. Reply to this email to be taken off the list.
  </p>
</div></body></html>`;

/* Plain text in, HTML out. Blank lines separate paragraphs; a line starting
   with "- " becomes a bullet. Nothing else is interpreted. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toHtml(body) {
  return String(body).split(/\n{2,}/).map((block) => {
    const lines = block.split('\n').filter((l) => l.trim());
    if (lines.every((l) => l.trim().startsWith('- '))) {
      return lines.map((l) => `<p style="color:#c9c9cf;margin:0 0 6px;">&bull; ${esc(l.trim().slice(2))}</p>`).join('');
    }
    return `<p style="color:#c9c9cf;margin:0 0 16px;">${lines.map(esc).join('<br />')}</p>`;
  }).join('');
}

const listSignups = async () => {
  const vals = (await redis('HVALS', 'mf:signups')) || [];
  return vals.map((v) => { try { return JSON.parse(v); } catch { return null; } })
    .filter((s) => s && s.email);
};

async function sendOne({ key, from, replyTo, to, subject, body }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject,
      ...(replyTo ? { reply_to: replyTo } : {}),
      html: shell(toHtml(body)), text: String(body),
    }),
  });
  return res.ok;
}

export default async function handler(req, res) {
  const token = (req.method === 'GET' ? req.query?.token : req.body?.token) || '';
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!configured) return res.status(503).json({ error: 'storage not configured' });

  if (req.method === 'GET') {
    const signups = await listSignups();
    return res.status(200).json({ recipients: signups.length, emails: signups.map((s) => s.email) });
  }

  if (req.method === 'POST') {
    const { subject, body, confirmCount, testTo } = req.body || {};
    if (!String(subject || '').trim() || !String(body || '').trim()) {
      return res.status(400).json({ error: 'subject and body are required' });
    }
    const key = process.env.RESEND_API_KEY;
    const from = process.env.INVITE_FROM;
    if (!key || !from) return res.status(503).json({ error: 'mail not configured' });
    const replyTo = process.env.REPLY_TO || '';

    // dry run to one address first — the only way to see it as a tester will
    if (testTo) {
      const ok = await sendOne({ key, from, replyTo, to: String(testTo), subject, body });
      return res.status(ok ? 200 : 502).json({ test: true, sent: ok ? 1 : 0 });
    }

    const signups = await listSignups();
    if (Number(confirmCount) !== signups.length) {
      return res.status(409).json({
        error: 'recipient count mismatch — re-check the list and send again',
        recipients: signups.length,
      });
    }

    let sent = 0; const failed = [];
    for (const s of signups) {
      // sequential on purpose: a beta list is small and rate limits are real
      const ok = await sendOne({ key, from, replyTo, to: s.email, subject, body });
      if (ok) sent++; else failed.push(s.email);
    }
    return res.status(200).json({ sent, failed });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
