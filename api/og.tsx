/* Social share card. Posting the link anywhere — Reddit, X, Discord, iMessage —
   pulls this 1200×630 image instead of rendering a bare URL.
   Satori rule: every element with more than one child needs an explicit display. */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const LIME = '#cbff3a';
const BG = '#0c0c0e';
const PANEL = '#141418';
const BORDER = '#27272f';
const TEXT = '#f3f3f1';
const MUTED = '#8c8c96';

const headline = { fontSize: '74px', fontWeight: 800, color: TEXT, lineHeight: 1.06, letterSpacing: '-2px' };

export default function handler() {
  return new ImageResponse(
    (
      <div style={{
        width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: BG, padding: '62px 72px',
        backgroundImage: 'radial-gradient(1000px 520px at 50% -12%, rgba(203,255,58,0.18), transparent 62%)',
      }}>
        {/* brand */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '18px', background: LIME,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '18px',
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={BG} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '36px', fontWeight: 800, color: TEXT, letterSpacing: '1px' }}>MACROFORGE</div>
            <div style={{ fontSize: '18px', color: MUTED }}>fuel · plan · train · adapt</div>
          </div>
        </div>

        {/* pitch */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex' }}>
            <span style={headline}>Plan from your&nbsp;</span>
            <span style={{ ...headline, color: LIME }}>cart.</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={headline}>Hit your macros.</span>
          </div>
          <div style={{ display: 'flex', fontSize: '26px', color: MUTED, marginTop: '24px', maxWidth: '940px', lineHeight: 1.45 }}>
            The macro tracker that starts at the grocery store — meal plans built from the food
            you'll actually have, and barcode verdicts based on what your week still needs.
          </div>
        </div>

        {/* proof chips */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {['Scan before you buy', 'No account needed', 'Free beta'].map((t) => (
            <div key={t} style={{
              display: 'flex', fontSize: '22px', color: MUTED, background: PANEL,
              border: `1px solid ${BORDER}`, borderRadius: '999px', padding: '11px 24px', marginRight: '14px',
            }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
