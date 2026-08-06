/* Photo → macros. The app sends a JPEG (client-side resized) and gets back a
   structured nutrition estimate: dish name, per-item breakdown, totals, and the
   pyramid signals (category / processing level) the client scores locally.
   Degrades to 503 when no ANTHROPIC_API_KEY is set so the UI can say so. */
import Anthropic from '@anthropic-ai/sdk';
import { configured as storeConfigured, redis } from './_store.js';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const MEDIA_OK = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HOURLY_CAP = 25; // per IP — this endpoint spends real money per call

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

async function overLimit(req) {
  if (!storeConfigured) return false; // no Redis → no limiter, still works locally
  try {
    const key = `mf:photo:${ipOf(req)}:${Math.floor(Date.now() / 3600000)}`;
    const n = await redis('INCR', key);
    if (n === 1) await redis('EXPIRE', key, 3900);
    return n > HOURLY_CAP;
  } catch {
    return false; // a broken limiter should never take the feature down
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
  const { image, media, mode } = req.body || {};
  const mediaType = MEDIA_OK.has(media) ? media : 'image/jpeg';
  const data = String(image || '');
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 120))) {
    return res.status(400).json({ error: 'bad image' });
  }
  if (data.length > 4_200_000) return res.status(413).json({ error: 'image too large' });
  if (await overLimit(req)) return res.status(429).json({ error: 'hourly photo limit reached — try again in a bit' });

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
