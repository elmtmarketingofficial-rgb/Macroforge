/* Photo → macros. The app sends a JPEG (client-side resized) and gets back a
   structured nutrition estimate: dish name, per-item breakdown, totals, and the
   pyramid signals (category / processing level) the client scores locally.
   Degrades to 503 when no ANTHROPIC_API_KEY is set so the UI can say so. */
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { configured as storeConfigured, redis } from './_store.js';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const MEDIA_OK = new Set(['image/jpeg', 'image/png', 'image/webp']);

/* Every call here spends real money, and the invite gate only guards the UI —
   the endpoint itself is open to anyone who reads the network tab. So spend is
   tied to an invite key instead of an address: a known key gets a working daily
   allowance, anything else gets barely enough to try the feature once.

   Deliberately not a hard rejection without a key. Devices that were using the
   app before invite keys existed have none, and locking them out to close a
   hole nobody has found yet is the worse trade. The per-key allowance is also
   the switch the membership will flip: free stays here, members go unlimited. */
const DAILY_WITH_KEY = 30;
const DAILY_NO_KEY = 3;

/* The model fills this exactly; the client never has to guess at the shape. */
const SCHEMA = {
  type: 'object',
  properties: {
    known: { type: 'boolean', description: 'true only if identifiable food or drink is visible' },
    name: { type: 'string', description: 'short dish or product name, e.g. "Chicken burrito bowl"' },
    items: {
      type: 'array',
      description: 'visible components with estimated cooked weights',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number', description: 'estimated grams of this component' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'grams', 'protein', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
    total: {
      type: 'object',
      properties: {
        grams: { type: 'number' },
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fat: { type: 'number' },
        fiber: { type: 'number' },
        sugar: { type: 'number' },
      },
      required: ['grams', 'protein', 'carbs', 'fat', 'fiber', 'sugar'],
      additionalProperties: false,
    },
    category: {
      type: 'string',
      enum: ['Protein', 'Produce', 'Dairy & Eggs', 'Frozen', 'Grains', 'Pantry', 'Beverages', 'Snacks', 'Other'],
      description: 'dominant grocery category of the food',
    },
    processing: {
      type: 'integer', enum: [1, 2, 3, 4],
      description: 'NOVA group: 1 unprocessed/minimally processed, 2 processed culinary ingredient, 3 processed, 4 ultra-processed',
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    notes: { type: 'string', description: 'one short caveat, e.g. "dressing amount unclear" — empty string if none' },
  },
  required: ['known', 'name', 'items', 'total', 'category', 'processing', 'confidence', 'notes'],
  additionalProperties: false,
};

const PROMPT_BY_MODE = {
  meal: `Estimate the nutrition of the food in this photo as a portion someone is about to eat.
Break it into visible components with realistic cooked weights (use plate/hand/packaging for scale).
Macros are grams for the WHOLE pictured portion, not per 100g. Be conservative rather than flattering —
hidden oil, dressing and sauce count. If nothing edible is clearly visible, set known=false and zero everything.`,
  item: `This is a single grocery or deli item someone is deciding whether to buy.
Estimate nutrition for the whole item as pictured (or one package if packaged).
Judge its processing level honestly — a fried or breaded deli item is NOVA 3-4 even without a label.
If nothing edible is clearly visible, set known=false and zero everything.`,
};

const ipOf = (req) =>
  String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

/** Count this call against whoever is making it. Returns how much is left and
 *  whether they're a recognised invite. */
async function checkQuota(req, rawKey) {
  if (!storeConfigured) return { ok: true, keyed: false }; // no store → no limiter, still works locally
  try {
    const day = new Date().toISOString().slice(0, 10);
    const key = String(rawKey || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    let bucket = '', cap = DAILY_NO_KEY, keyed = false;
    if (key && (await redis('HGET', 'mf:invites', key))) {
      // hashed so the quota keys never carry the invite around with them
      bucket = `k:${createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
      cap = DAILY_WITH_KEY;
      keyed = true;
    } else {
      bucket = `i:${ipOf(req)}`;
    }
    const qk = `mf:photoq:${bucket}:${day}`;
    const n = await redis('INCR', qk);
    if (n === 1) await redis('EXPIRE', qk, 172800);
    return { ok: n <= cap, cap, used: n, keyed };
  } catch {
    return { ok: true, keyed: false }; // a broken limiter shouldn't take the feature down
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'not configured', configured: false });
  }
  const { image, media, mode, key } = req.body || {};
  const mediaType = MEDIA_OK.has(media) ? media : 'image/jpeg';
  const data = String(image || '');
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 120))) {
    return res.status(400).json({ error: 'bad image' });
  }
  if (data.length > 4_200_000) return res.status(413).json({ error: 'image too large' });
  const quota = await checkQuota(req, key);
  if (!quota.ok) {
    return res.status(429).json({
      error: quota.keyed
        ? `That's ${quota.cap} photos today — the daily limit resets tomorrow.`
        : 'Photo analysis is for invited testers. Open the app from your invite link and try again.',
      keyed: quota.keyed,
    });
  }

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: PROMPT_BY_MODE[mode === 'item' ? 'item' : 'meal'] },
        ],
      }],
    });
    const text = response.content.find((b) => b.type === 'text');
    if (!text) return res.status(502).json({ error: 'no analysis returned' });
    const analysis = JSON.parse(text.text);
    return res.status(200).json({
      analysis,
      usage: { in: response.usage?.input_tokens, out: response.usage?.output_tokens },
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error('photo: api error', e.status, String(e.message).slice(0, 300));
      if (e.status === 401) return res.status(503).json({ error: 'not configured', configured: false });
      // an out-of-credits account is "not configured" from the tester's point of view
      if (e.status === 400 && /credit balance/i.test(String(e.message))) {
        return res.status(503).json({ error: 'not configured', configured: false });
      }
      if (e.status === 429) return res.status(429).json({ error: 'analysis service is busy — try again shortly' });
      if (e.status === 529) return res.status(503).json({ error: 'analysis service is overloaded — try again shortly' });
    } else {
      console.error('photo: unexpected error', e);
    }
    return res.status(502).json({ error: 'analysis failed' });
  }
}
