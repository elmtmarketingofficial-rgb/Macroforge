/* Photo → macros, lazy-loaded like the barcode scanner. Two jobs:
   'meal' — snap the plate you're about to eat, log the estimate to a meal slot;
   'item' — snap an unlabeled store/deli item and get the same pyramid verdict
   a barcode scan would give, minus the barcode.
   The image is downscaled client-side so uploads stay small and cheap. */
import React, { useState, useRef } from 'react';
import { X, Camera, RefreshCw, WifiOff, Utensils, ShoppingCart, Package, Sparkles } from 'lucide-react';
import { num, round, calsFrom } from '../lib/engine';
import { scoreScan } from '../lib/pyramid';
import { T, MACROS, MK, display, mono } from './tokens';

const VERDICT_STYLE = {
  great:   { label: 'GOOD PICK',  color: T.lime,   bg: 'rgba(203,255,58,0.12)',  border: 'rgba(203,255,58,0.45)' },
  decent:  { label: 'DECENT',     color: T.text,   bg: 'rgba(243,243,241,0.06)', border: T.borderHi },
  poor:    { label: 'SKIP IT',    color: T.orange, bg: 'rgba(255,122,69,0.12)',  border: 'rgba(255,122,69,0.5)' },
};

const ERR_TEXT = {
  offline: "You're offline — photo analysis needs a connection.",
  noconfig: 'Photo analysis isn’t switched on for this beta yet — coming very soon. Log it manually for now.',
  limit: 'Hourly photo limit reached — give it a little while and try again.',
  toobig: 'That photo is too large even after compression — try again a bit further back.',
  fail: 'Couldn’t analyze that one — bad signal or a hiccup on our side.',
};

/** Downscale to ≤1280px JPEG so a 12MP phone photo becomes a ~200KB upload. */
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return { dataUrl, b64: dataUrl.split(',')[1], media: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PhotoSnap({ open, onClose, mode = 'meal', mealLabel, goals, list, mealsPerDay, onLog, onAddItem }) {
  const fileRef = useRef(null);
  const [img, setImg] = useState(null);        // {dataUrl, b64, media}
  const [phase, setPhase] = useState('pick');  // pick | ready | busy | done | err
  const [err, setErr] = useState('fail');
  const [analysis, setAnalysis] = useState(null);
  const [score, setScore] = useState(null);
  const [acted, setActed] = useState('');

  if (!open) return null;
  const isMeal = mode === 'meal';
  const goalCals = calsFrom(num(goals?.protein), num(goals?.carbs), num(goals?.fat));

  const reset = () => { setImg(null); setAnalysis(null); setScore(null); setActed(''); setPhase('pick'); if (fileRef.current) fileRef.current.value = ''; };

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const shrunk = await shrink(f);
      setImg(shrunk);
      setPhase('ready');
      setAnalysis(null); setScore(null); setActed('');
    } catch {
      setErr('fail'); setPhase('err');
    }
  };

  const analyze = async () => {
    if (!img) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setErr('offline'); setPhase('err'); return; }
    setPhase('busy');
    try {
      const res = await fetch('/api/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: img.b64, media: img.media, mode }),
      });
      if (!res.ok) {
        setErr(res.status === 503 ? 'noconfig' : res.status === 429 ? 'limit' : res.status === 413 ? 'toobig' : 'fail');
        setPhase('err');
        return;
      }
      const { analysis: a } = await res.json();
      if (!a || !a.known) { setAnalysis(a || null); setScore(null); setPhase('done'); return; }
      const t = a.total || {};
      const sugarPer100 = num(t.grams) > 0 ? (num(t.sugar) / num(t.grams)) * 100 : 0;
      setAnalysis(a);
      setScore(goalCals > 0 ? scoreScan({
        item: { protein: t.protein, carbs: t.carbs, fat: t.fat, category: a.category, nova: a.processing, sugarPer100 },
        goals, list: list || [], mealsPerDay,
      }) : null);
      setPhase('done');
    } catch {
      setErr('fail'); setPhase('err');
    }
  };

  const t = analysis?.total || {};
  const kcal = calsFrom(num(t.protein), num(t.carbs), num(t.fat));
  const v = score ? VERDICT_STYLE[score.verdict] : null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-3" style={{ zIndex: 70 }} data-noswipe>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="relative w-full rounded-2xl overflow-hidden fadein" style={{ maxWidth: 440, maxHeight: '90vh', background: T.panel, border: `1px solid ${T.borderHi}`, display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2"><Camera size={16} style={{ color: T.lime }} /><span style={{ ...display, fontSize: 18, textTransform: 'uppercase' }}>{isMeal ? 'Snap your plate' : 'Snap the item'}</span></div>
          <button onClick={onClose} className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, border: `1px solid ${T.border}`, color: T.muted }}><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto" style={{ minHeight: 0 }}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />

          {/* photo well */}
          <button onClick={() => fileRef.current?.click()} className="relative w-full rounded-xl overflow-hidden mb-3" style={{ background: '#000', border: `1px solid ${T.border}`, aspectRatio: '4/2.8', display: 'block' }}>
            {img ? (
              <img src={img.dataUrl} alt="" className="w-full h-full" style={{ objectFit: 'cover' }} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <Camera size={24} style={{ color: T.faint }} />
                <div className="text-xs" style={{ color: T.faint }}>{isMeal ? 'Tap to photograph the food' : 'Tap to photograph the item — no barcode needed'}</div>
              </div>
            )}
            {img && phase !== 'busy' && (
              <div className="absolute bottom-2 right-2 rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(0,0,0,0.6)', color: T.muted, ...mono }}>retake</div>
            )}
          </button>

          {phase === 'ready' && (
            <button onClick={analyze} className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm mb-1" style={{ background: T.lime, color: '#0c0c0e', fontWeight: 800 }}>
              <Sparkles size={15} /> Analyze photo
            </button>
          )}
          {phase === 'busy' && (
            <div className="text-xs text-center py-3" style={{ color: T.faint }}>Reading the {isMeal ? 'plate' : 'item'}… usually a few seconds.</div>
          )}
          {phase === 'err' && (
            <div className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ border: `1px dashed ${T.borderHi}`, color: T.muted, lineHeight: 1.55 }}>
              {err === 'offline' ? <WifiOff size={14} className="shrink-0" style={{ marginTop: 1 }} /> : <Camera size={14} className="shrink-0" style={{ marginTop: 1 }} />}
              <div>
                {ERR_TEXT[err]}
                {err !== 'noconfig' && <button onClick={() => setPhase(img ? 'ready' : 'pick')} style={{ color: T.lime, fontWeight: 700, marginLeft: 6 }}>try again</button>}
              </div>
            </div>
          )}

          {phase === 'done' && analysis && !analysis.known && (
            <div className="rounded-xl p-3.5" style={{ border: `1px dashed ${T.borderHi}` }}>
              <div style={{ ...display, fontSize: 16, color: T.muted }}>COULDN'T SEE FOOD IN THAT ONE</div>
              <div className="text-xs mt-1" style={{ color: T.muted, lineHeight: 1.55 }}>Try again closer, with the whole {isMeal ? 'plate' : 'item'} in frame and decent light.</div>
              <button onClick={reset} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs mt-3" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, fontWeight: 700 }}><RefreshCw size={12} /> new photo</button>
            </div>
          )}

          {phase === 'done' && analysis && analysis.known && (
            <div className="rounded-xl p-3.5" style={{ background: v ? v.bg : T.panel2, border: `1px solid ${v ? v.border : T.borderHi}` }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <div className="text-sm" style={{ color: T.text, fontWeight: 700 }}>{analysis.name}</div>
                  <div className="text-xs" style={{ color: T.faint }}>~{Math.round(num(t.grams))}g · {analysis.confidence} confidence</div>
                </div>
                {v && (
                  <div className="text-right shrink-0">
                    <div style={{ ...display, fontSize: 20, color: v.color }}>{v.label}</div>
                    <div style={{ ...mono, fontSize: 10, color: T.faint }}>{score.score}/100</div>
                  </div>
                )}
              </div>
              <div style={{ ...mono, fontSize: 11, color: T.muted }} className="mb-2">
                {MK.map((k) => `${round(num(t[k]))}${k[0]}`).join('  ')} · {Math.round(kcal)} kcal
                {num(t.sugar) > 0 && ` · ${round(num(t.sugar))}g sugar`}
                {num(t.fiber) > 0 && ` · ${round(num(t.fiber))}g fiber`}
              </div>
              {(analysis.items || []).length > 1 && (
                <div className="flex flex-col gap-1 mb-2">
                  {analysis.items.slice(0, 6).map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-xs" style={{ color: T.muted }}>
                      <span className="truncate">· {it.name}</span>
                      <span style={{ ...mono, fontSize: 10, color: T.faint }} className="shrink-0">{Math.round(num(it.grams))}g · {Math.round(calsFrom(num(it.protein), num(it.carbs), num(it.fat)))} kcal</span>
                    </div>
                  ))}
                </div>
              )}
              {score && score.reasons.slice(0, 2).map((r, i) => (
                <div key={i} className="text-xs" style={{ color: T.muted }}>· {r}</div>
              ))}
              {analysis.notes && <div className="text-xs mt-1.5" style={{ color: T.faint }}>⚠ {analysis.notes}</div>}
              <div className="flex items-center gap-2 mt-3">
                {isMeal ? (
                  <button onClick={() => { if (!acted) { onLog(analysis); setActed('logged'); } }} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs" style={{ background: acted ? T.lime : T.limeDim, border: `1px solid ${T.border}`, color: acted ? '#0c0c0e' : T.lime, fontWeight: 700 }}>
                    <Utensils size={13} /> {acted ? 'logged' : `Log to ${mealLabel || 'this meal'}`}
                  </button>
                ) : (
                  <>
                    <button onClick={() => { onAddItem(analysis, 'list'); setActed('list'); }} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs" style={{ background: acted === 'list' ? T.lime : T.limeDim, border: `1px solid ${T.border}`, color: acted === 'list' ? '#0c0c0e' : T.lime, fontWeight: 700 }}>
                      <ShoppingCart size={13} /> {acted === 'list' ? 'on the list' : 'add to list'}
                    </button>
                    <button onClick={() => { onAddItem(analysis, 'pantry'); setActed('pantry'); }} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs" style={{ background: acted === 'pantry' ? T.lime : T.panel2, border: `1px solid ${T.border}`, color: acted === 'pantry' ? '#0c0c0e' : T.muted, fontWeight: 700 }}>
                      <Package size={13} /> {acted === 'pantry' ? 'in the pantry' : 'bought it'}
                    </button>
                  </>
                )}
                <button onClick={reset} className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 34, height: 34, background: T.panel2, border: `1px solid ${T.border}`, color: T.muted }} title="New photo"><RefreshCw size={14} /></button>
              </div>
            </div>
          )}

          <div className="text-xs mt-3 text-center" style={{ color: T.faint }}>
            AI estimate from the photo — portions are approximate, so trust the label when you have one.
          </div>
        </div>
      </div>
    </div>
  );
}
