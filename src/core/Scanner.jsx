/* Barcode scanner — lazy-loaded so camera + decoder never touch the main bundle.
   Native BarcodeDetector where available (Chrome/Android), @zxing/browser fallback
   elsewhere (iOS Safari), manual entry always. Verdicts come from the pyramid
   scoring engine against the user's remaining weekly gap. */
import React, { useState, useEffect, useRef } from 'react';
import { X, ScanLine, Keyboard, ShoppingCart, Package, BadgeCheck, RefreshCw, WifiOff } from 'lucide-react';
import { num, round, calsFrom } from '../lib/engine';
import { lookupBarcode } from '../lib/off';
import { scoreScan } from '../lib/pyramid';
import { T, MACROS, MK, display, mono } from './tokens';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

const VERDICT_STYLE = {
  great:   { label: 'GOOD PICK',  color: T.lime,   bg: 'rgba(203,255,58,0.12)',  border: 'rgba(203,255,58,0.45)' },
  decent:  { label: 'DECENT',     color: T.text,   bg: 'rgba(243,243,241,0.06)', border: T.borderHi },
  poor:    { label: 'SKIP IT',    color: T.orange, bg: 'rgba(255,122,69,0.12)',  border: 'rgba(255,122,69,0.5)' },
  unknown: { label: 'NO DATA',    color: T.muted,  bg: 'transparent',            border: T.borderHi },
};

export default function Scanner({ open, onClose, goals, list, mealsPerDay, onAdd, onUnknown }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const zxingRef = useRef(null);
  const busyRef = useRef(false);
  const [camState, setCamState] = useState('starting'); // starting | live | denied | none
  const [manual, setManual] = useState('');
  const [result, setResult] = useState(null); // {code, product|null, score|null, status:'loading'|'done'|'offline'|'error'}
  const [added, setAdded] = useState('');

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const handleCode = async (code) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setAdded('');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setResult({ code, product: null, score: null, status: 'offline' });
      return;
    }
    setResult({ code, product: null, score: null, status: 'loading' });
    try {
      const product = await lookupBarcode(code);
      if (!product) {
        onUnknown(code, '');
        setResult({ code, product: null, score: null, status: 'done' });
      } else {
        const score = scoreScan({
          item: { protein: product.protein, carbs: product.carbs, fat: product.fat, offGroups: product.groups, nova: product.nova, sugarPer100: product.sugars },
          goals, list, mealsPerDay,
        });
        setResult({ code, product, score, status: 'done' });
      }
    } catch (e) {
      setResult({ code, product: null, score: null, status: 'error' });
    }
  };

  const resume = () => { busyRef.current = false; setResult(null); setAdded(''); };

  /* camera + decoder lifecycle */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCamState('none'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setCamState('live');
        if ('BarcodeDetector' in window) {
          const detector = new window.BarcodeDetector({ formats: FORMATS });
          loopRef.current = setInterval(async () => {
            if (busyRef.current || !videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes && codes.length && codes[0].rawValue) handleCode(codes[0].rawValue);
            } catch {}
          }, 400);
        } else {
          try {
            const { BrowserMultiFormatReader } = await import('@zxing/browser');
            if (cancelled) return;
            const reader = new BrowserMultiFormatReader();
            zxingRef.current = await reader.decodeFromVideoElement(video, (res) => {
              if (res && !busyRef.current) handleCode(res.getText());
            });
          } catch { /* decoder unavailable — manual entry still works */ }
        }
      } catch {
        if (!cancelled) setCamState('denied');
      }
    })();
    return () => {
      cancelled = true;
      if (loopRef.current) clearInterval(loopRef.current);
      if (zxingRef.current) { try { zxingRef.current.stop(); } catch {} zxingRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
      busyRef.current = false;
    };
  }, [open]);

  if (!open) return null;
  const v = result?.product && result?.score ? VERDICT_STYLE[result.score.verdict] : VERDICT_STYLE.unknown;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-3" style={{ zIndex: 70 }} data-noswipe>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="relative w-full rounded-2xl overflow-hidden fadein" style={{ maxWidth: 440, maxHeight: '90vh', background: T.panel, border: `1px solid ${T.borderHi}`, display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2"><ScanLine size={16} style={{ color: T.lime }} /><span style={{ ...display, fontSize: 18, textTransform: 'uppercase' }}>Scan at the store</span></div>
          <button onClick={onClose} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, border: `1px solid ${T.border}`, color: T.muted }}><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto" style={{ minHeight: 0 }}>
          {/* viewfinder */}
          <div className="relative rounded-xl overflow-hidden mb-3" style={{ background: '#000', border: `1px solid ${T.border}`, aspectRatio: '4/2.6' }}>
            <video ref={videoRef} muted playsInline className="w-full h-full" style={{ objectFit: 'cover', display: camState === 'live' ? 'block' : 'none' }} />
            {camState !== 'live' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <ScanLine size={22} style={{ color: T.faint }} />
                <div className="text-xs" style={{ color: T.faint }}>
                  {camState === 'starting' ? 'Starting camera…' : camState === 'denied' ? 'Camera blocked — allow it in your browser, or type the barcode below.' : 'No camera here — type the barcode below.'}
                </div>
              </div>
            )}
            {camState === 'live' && !result && (
              <div className="absolute inset-x-8 top-1/2 rounded-full" style={{ height: 2, background: T.lime, opacity: 0.8, boxShadow: `0 0 12px ${T.lime}` }} />
            )}
          </div>
          {/* manual entry */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Keyboard size={14} className="absolute" style={{ left: 10, top: 11, color: T.faint }} />
              <input value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))} placeholder="Type a barcode…" inputMode="numeric"
                onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) { busyRef.current = false; handleCode(manual.trim()); } }}
                className="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, ...mono }} />
            </div>
            <button onClick={() => { if (manual.trim()) { busyRef.current = false; handleCode(manual.trim()); } }} className="rounded-lg px-3 text-sm" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700 }}>look up</button>
          </div>
          {offline && !result && (
            <div className="flex items-center gap-2 text-xs rounded-xl p-3" style={{ border: `1px dashed ${T.borderHi}`, color: T.faint }}>
              <WifiOff size={14} /> You're offline — lookups need a connection in the store.
            </div>
          )}
          {/* result */}
          {result && result.status === 'loading' && <div className="text-xs text-center py-3" style={{ color: T.faint }}>Looking up {result.code}…</div>}
          {result && result.status === 'offline' && (
            <div className="rounded-xl p-3 text-xs" style={{ border: `1px dashed ${T.borderHi}`, color: T.faint }}>Can't look up {result.code} while offline. <button onClick={resume} style={{ color: T.lime, fontWeight: 700 }}>try again</button></div>
          )}
          {result && result.status === 'error' && (
            <div className="rounded-xl p-3 text-xs" style={{ border: `1px dashed ${T.borderHi}`, color: T.faint }}>Lookup failed — spotty signal happens in store aisles. <button onClick={resume} style={{ color: T.lime, fontWeight: 700 }}>try again</button></div>
          )}
          {result && result.status === 'done' && !result.product && (
            <div className="rounded-xl p-3.5" style={{ background: VERDICT_STYLE.unknown.bg, border: `1px dashed ${T.borderHi}` }}>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ ...display, fontSize: 16, color: T.muted }}>NO KNOWLEDGE OF THIS ONE</span>
                <span style={{ ...mono, fontSize: 11, color: T.faint }}>{result.code}</span>
              </div>
              <div className="text-xs" style={{ color: T.muted, lineHeight: 1.55 }}>
                The app has no information on this product yet. It's been reported to the developer so the knowledge base can grow — check the label yourself this time.
              </div>
              <button onClick={resume} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs mt-3" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, fontWeight: 700 }}><RefreshCw size={12} /> scan another</button>
            </div>
          )}
          {result && result.status === 'done' && result.product && result.score && (
            <div className="rounded-xl p-3.5" style={{ background: v.bg, border: `1px solid ${v.border}` }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <div className="text-sm" style={{ color: T.text, fontWeight: 700 }}>
                    {result.product.name}
                    {result.product.verified && <span className="inline-flex items-center gap-0.5" style={{ fontSize: 9, color: T.lime, background: T.limeDim, borderRadius: 5, padding: '1px 5px', marginLeft: 6, fontWeight: 700, verticalAlign: 'middle' }}><BadgeCheck size={9} /> VERIFIED</span>}
                  </div>
                  {result.product.brand && <div className="text-xs" style={{ color: T.faint }}>{result.product.brand}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div style={{ ...display, fontSize: 20, color: v.color }}>{v.label}</div>
                  <div style={{ ...mono, fontSize: 10, color: T.faint }}>{result.score.score}/100</div>
                </div>
              </div>
              <div style={{ ...mono, fontSize: 11, color: T.muted }} className="mb-2">
                {MK.map((k) => `${round(result.product[{ protein: 'protein', carbs: 'carbs', fat: 'fat' }[k]])}${k[0]}`).join('  ')} · {Math.round(calsFrom(result.product.protein, result.product.carbs, result.product.fat))} kcal / 100 g
                {result.product.sugars > 0 && ` · ${round(result.product.sugars)}g sugar`}
                {result.product.fiber > 0 && ` · ${round(result.product.fiber)}g fiber`}
              </div>
              <div className="flex flex-col gap-1 mb-2">
                {result.score.reasons.slice(0, 3).map((r, i) => (
                  <div key={i} className="text-xs" style={{ color: T.muted }}>· {r}</div>
                ))}
              </div>
              {(() => {
                const g = result.score.gap;
                const behind = MK.map((k) => ({ k, need: Math.max(0, g[k]) })).sort((a, b) => b.need - a.need)[0];
                if (!(behind && behind.need > 0)) return null;
                return (
                  <div className="text-xs pt-2" style={{ borderTop: `1px solid ${T.border}`, color: T.faint }}>
                    Your week still needs <b style={{ color: MACROS[behind.k].color }}>{Math.round(behind.need)}g {behind.k}</b> (~{Math.round(result.score.perMealGap[behind.k])}g per meal{result.score.mealsCovered > 0 ? ` — 100 g of this covers ~${result.score.mealsCovered} meal${result.score.mealsCovered === 1 ? '' : 's'}' worth` : ''}).
                  </div>
                );
              })()}
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => { onAdd(result.product, 'list'); setAdded('list'); }} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs" style={{ background: added === 'list' ? T.lime : T.limeDim, border: `1px solid ${T.border}`, color: added === 'list' ? '#0c0c0e' : T.lime, fontWeight: 700 }}>
                  <ShoppingCart size={13} /> {added === 'list' ? 'on the list' : 'add to list'}
                </button>
                <button onClick={() => { onAdd(result.product, 'pantry'); setAdded('pantry'); }} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs" style={{ background: added === 'pantry' ? T.lime : T.panel2, border: `1px solid ${T.border}`, color: added === 'pantry' ? '#0c0c0e' : T.muted, fontWeight: 700 }}>
                  <Package size={13} /> {added === 'pantry' ? 'in the pantry' : 'bought it'}
                </button>
                <button onClick={resume} className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, background: T.panel2, border: `1px solid ${T.border}`, color: T.muted }} title="Scan another"><RefreshCw size={14} /></button>
              </div>
            </div>
          )}
          <div className="text-xs mt-3 text-center" style={{ color: T.faint }}>Data: Open Food Facts · judged against your targets and what's already in your list & pantry</div>
        </div>
      </div>
    </div>
  );
}
