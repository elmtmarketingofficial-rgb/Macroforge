/* Upstash Redis over REST. Reads env from either the Upstash Vercel
   integration (UPSTASH_*) or Vercel KV naming (KV_REST_API_*). When neither
   is present every endpoint degrades gracefully instead of erroring. */
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const configured = Boolean(URL_ && TOKEN);

export async function redis(...cmd) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}
