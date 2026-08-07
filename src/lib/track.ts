/* Funnel tracking, client side. Sends event names and a traffic source —
   never content, never anything about the food someone logs. The source is
   first-touch: whatever brought a person in the first time is what gets the
   credit later, even if they come back by typing the address in.

   Milestone events fire once per device; the flag lives in localStorage. */

const SRC_KEY = 'mf2_src';
const DONE_KEY = 'mf2_ev';
const DID_KEY = 'mf2_did';
const DAY_KEY = 'mf2_evday';

/* A random, meaningless id for this device — the only way to count one person
   as one person. It identifies nothing: no email, no name, not derived from
   anything about the device, and it never leaves this origin. Without it the
   count keys on IP address, which changes on mobile and inflates every number. */
function deviceId(): string {
  try {
    let id = localStorage.getItem(DID_KEY);
    if (!id) {
      const b = new Uint8Array(8);
      (crypto || window.crypto).getRandomValues(b);
      id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DID_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

/** Work out the traffic source from a page's own context.
 *  A campaign tag wins; otherwise the referring site's host; otherwise direct.
 *  Kept pure so the attribution rules can be tested without a browser. */
export function pickSource({ search = '', referrer = '', hostname = '' }: {
  search?: string; referrer?: string; hostname?: string;
}): string {
  let src = '';
  try {
    const q = new URLSearchParams(search);
    src = q.get('utm_source') || q.get('ref') || q.get('src') || '';
  } catch { /* malformed query string — fall through to the referrer */ }
  if (!src && referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, '');
      if (host && host !== hostname) src = host; // our own pages aren't a source
    } catch { /* unparseable referrer */ }
  }
  return (src || 'direct').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32) || 'direct';
}

/** Where this visitor came from. First touch sticks for the life of the device. */
export function captureSource(): string {
  try {
    const stored = localStorage.getItem(SRC_KEY);
    if (stored) return stored;
    const src = pickSource({ search: location.search, referrer: document.referrer, hostname: location.hostname });
    localStorage.setItem(SRC_KEY, src);
    return src;
  } catch {
    return 'direct';
  }
}

const fired = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { return {}; }
};

/** Has this device already recorded a given once-per-device milestone? */
export const hasFired = (event: string): boolean => Boolean(fired()[event]);

export function track(event: string): void {
  try {
    const source = captureSource();
    const body = JSON.stringify({ event, source, did: deviceId() });
    // sendBeacon survives the page being closed mid-request; fetch is the fallback
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* never let measurement break the app */ }
}

/** Fire an event at most once per device, ever. */
export function trackOnce(event: string): void {
  try {
    const done = fired();
    if (done[event]) return;
    done[event] = Date.now();
    localStorage.setItem(DONE_KEY, JSON.stringify(done));
    track(event);
  } catch { /* ignore */ }
}

/** Fire at most once per device per day — "days active", not "times opened".
 *  Opening the app twenty times in an afternoon is one person, one day. */
export function trackDaily(event: string): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let seen: Record<string, string> = {};
    try { seen = JSON.parse(localStorage.getItem(DAY_KEY) || '{}'); } catch { /* reset below */ }
    if (seen[event] === today) return;
    seen[event] = today;
    localStorage.setItem(DAY_KEY, JSON.stringify(seen));
    track(event);
  } catch { /* ignore */ }
}
