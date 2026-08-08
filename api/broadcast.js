/* Send one message to every beta signup. Admin-token gated and deliberately
   awkward: it will not send unless the caller passes back the exact recipient
   count it is about to mail, so a mistaken click can't reach the whole list.

   GET  ?token=...            → who would receive it, without sending
   POST {token, subject, body, confirmCount}  → sends
   POST {token, subject, body, testTo}        → sends only to that one address */
import { configured, redis } from './_store.js';

const APP_URL = process.env.APP_URL || 'https://macroforge.club';

/* Email clients are not browsers: no flexbox, no grid, no external CSS, and
   Outlook throws away anything clever. Tables and inline styles only. */
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const LIME = '#cbff3a';
const INK = '#0c0c0e';

const shell = (bodyHtml, preheader) => `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
</head><body style="margin:0;padding:0;background:#08080a;">
<!-- the grey line under the subject in the inbox list -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#08080a;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:#0c0c0e;border:1px solid #1f1f25;border-radius:20px;overflow:hidden;">

      <!-- lime rule across the top: the one flash of brand colour -->
      <tr><td style="height:4px;background:${LIME};line-height:4px;font-size:0;">&nbsp;</td></tr>

      <tr><td style="padding:26px 28px 6px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="44" style="padding-right:12px;">
              <img src="${APP_URL}/pwa-192.png" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border-radius:12px;" />
            </td>
            <td style="vertical-align:middle;">
              <div style="font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:1.5px;color:#f3f3f1;line-height:1.1;">MACROFORGE</div>
              <div style="font-family:${FONT};font-size:12px;color:#5b5b65;letter-spacing:0.5px;">fuel &middot; plan &middot; train &middot; adapt</div>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:14px 28px 4px;font-family:${FONT};">${bodyHtml}</td></tr>

      <tr><td style="padding:10px 28px 28px;">
        <!-- bulletproof button: a table, not a padded anchor -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="${LIME}" style="border-radius:12px;">
            <a href="${APP_URL}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:800;color:${INK};text-decoration:none;border-radius:12px;">Open MacroForge &rarr;</a>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 28px 26px;">
        <div style="height:1px;background:#1f1f25;font-size:0;line-height:0;">&nbsp;</div>
        <div style="font-family:${FONT};font-size:12px;color:#5b5b65;line-height:1.6;padding-top:16px;">
          You're getting this because you signed up for the MacroForge beta.<br />
          Reply to this email any time — it reaches a person, not a robot.
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

/* Plain text in, styled HTML out. Deliberately tiny grammar so a message can
   be written without thinking about markup:
     ## Heading      → section heading with a lime rule
     - item          → bullet
     > note          → highlighted callout box
     blank line      → new paragraph
   The first paragraph is set larger, as a standfirst. */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f3f3f1;">$1</strong>');

function toHtml(body) {
  let isFirstPara = true;
  return String(body).trim().split(/\n{2,}/).map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return '';

    if (lines[0].startsWith('## ')) {
      const rest = lines.slice(1);
      return `<div style="margin:26px 0 10px;">
        <div style="width:26px;height:3px;background:${LIME};border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
        <div style="font-size:17px;font-weight:800;color:#f3f3f1;letter-spacing:0.2px;margin-top:10px;">${inline(lines[0].slice(3))}</div>
      </div>${rest.length ? `<p style="color:#c9c9cf;font-size:15px;line-height:1.65;margin:0 0 14px;">${rest.map(inline).join('<br />')}</p>` : ''}`;
    }

    if (lines.every((l) => l.startsWith('> '))) {
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
        <tr><td style="background:#121216;border-left:3px solid ${LIME};border-radius:0 10px 10px 0;padding:13px 16px;">
          <div style="color:#c9c9cf;font-size:14px;line-height:1.6;">${lines.map((l) => inline(l.slice(2))).join('<br />')}</div>
        </td></tr></table>`;
    }

    if (lines.every((l) => l.startsWith('- '))) {
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${
        lines.map((l) => `<tr>
          <td width="16" style="vertical-align:top;padding:5px 10px 0 2px;">
            <div style="width:6px;height:6px;background:${LIME};border-radius:3px;font-size:0;line-height:0;">&nbsp;</div>
          </td>
          <td style="color:#c9c9cf;font-size:15px;line-height:1.6;padding-bottom:8px;">${inline(l.slice(2))}</td>
        </tr>`).join('')}</table>`;
    }

    const lead = isFirstPara;
    isFirstPara = false;
    return `<p style="color:${lead ? '#e6e6e4' : '#c9c9cf'};font-size:${lead ? '17px' : '15px'};line-height:${lead ? '1.6' : '1.65'};margin:0 0 16px;">${lines.map(inline).join('<br />')}</p>`;
  }).join('');
}

/* Two audiences, and they are not interchangeable. Everyone consented to beta
   mail about MacroForge; only people who ticked the box consented to hearing
   about the shop. Sending shop mail to the wrong list breaks a written promise,
   so the filter lives here rather than in whoever is composing the message. */
const listSignups = async (audience = 'all') => {
  const vals = (await redis('HVALS', 'mf:signups')) || [];
  const all = vals.map((v) => { try { return JSON.parse(v); } catch { return null; } })
    .filter((s) => s && s.email);
  return audience === 'afterload' ? all.filter((s) => s.afterload === true) : all;
};

async function sendOne({ key, from, replyTo, to, subject, body }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject,
      ...(replyTo ? { reply_to: replyTo } : {}),
      // preview line in the inbox: the opening sentence, trimmed of markup
      html: shell(toHtml(body), String(body).trim().split('\n')[0].replace(/^[#>-]+\s*/, '').slice(0, 140)),
      text: String(body),
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
    const audience = req.query?.audience === 'afterload' ? 'afterload' : 'all';
    const signups = await listSignups(audience);
    const everyone = await listSignups('all');
    return res.status(200).json({
      audience,
      recipients: signups.length,
      emails: signups.map((s) => s.email),
      shopOptIns: everyone.filter((s) => s.afterload === true).length,
      total: everyone.length,
    });
  }

  if (req.method === 'POST') {
    const { subject, body, confirmCount, testTo, audience: aud } = req.body || {};
    const audience = aud === 'afterload' ? 'afterload' : 'all';
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

    const signups = await listSignups(audience);
    if (Number(confirmCount) !== signups.length) {
      return res.status(409).json({
        error: 'recipient count mismatch — re-check the list and send again',
        audience,
        recipients: signups.length,
      });
    }

    let sent = 0; const failed = [];
    for (const s of signups) {
      // sequential on purpose: a beta list is small and rate limits are real
      const ok = await sendOne({ key, from, replyTo, to: s.email, subject, body });
      if (ok) sent++; else failed.push(s.email);
    }
    return res.status(200).json({ audience, sent, failed });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}
