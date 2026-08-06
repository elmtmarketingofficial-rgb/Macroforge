import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import {
  Plus, Trash2, Check, X, ChevronDown, ChevronLeft, ChevronRight, Dumbbell,
  ShoppingCart, Target, Flame, TrendingUp, Eraser,
  CalendarDays, BarChart3, Settings, Download, Upload, Copy, Trophy,
  Pause, Play, RotateCcw, Search, BookOpen, Utensils, Scale, Zap, Star,
  ChefHat, CalendarRange, Sparkles, ClipboardList, History, ArrowRight,
  Globe, BadgeCheck, WifiOff, ScanLine, Bell, GlassWater, Package, RefreshCw, MessageSquare, Camera
} from 'lucide-react';
import {
  num, round, calsFrom, e1rm, todayISO, parseISO, addDays, daysBetween, fmtDate,
  entryMacros, entryExtras, weightTrend, computeTDEE, mifflin, suggestMacros, dayScore,
  foodPortion, isPer100g,
} from '../lib/engine';
import { normalizeImport } from '../lib/importer';
import { searchOff, queryVariants } from '../lib/off';

/* library matching that forgives plurals and the trailing-e typo (tomatoe → Tomato) */
const nameMatches = (name, q) => {
  const n = String(name).toLowerCase();
  const vs = queryVariants(q);
  return vs.length === 0 || vs.some((v) => n.includes(v));
};
import { generatePlan, takeFromPantry, returnToPantry, reconcileTaken, recipeConsumption } from '../lib/planner';
import { remainingGap } from '../lib/pyramid';
import { DEFAULT_MEALS, DEFAULT_SHOPPING, addMeal, kindForTime, migrateMeals, minutesOf, slotsOf, dueMealReminders, dueNudges, dueShoppingReminder, fireKey } from '../lib/reminders';
import { makeSyncCode, normSyncCode, threeWayMerge, payloadsEqual, SYNC_STORES } from '../lib/sync';
import { makeStarterLibrary, upgradeStarterLibrary, STARTER_FOODS, STARTER_RECIPES } from '../lib/starter';
import { track, trackOnce, hasFired } from '../lib/track';
import { storage } from '../storage';

/* Barcode scanner loads lazily — camera + decoder stay out of the main bundle */
const Scanner = React.lazy(() => import('./Scanner.jsx'));
const PhotoSnap = React.lazy(() => import('./PhotoSnap.jsx'));
import { T, MACROS, MK, display, mono } from './tokens';

/* Recharts loads in its own lazy chunk — see Charts.jsx */
const lazyChart = (name) => React.lazy(() => import('./Charts.jsx').then((m) => ({ default: m[name] })));
const CaloriesChart = lazyChart('CaloriesChart');
const VolumeChart = lazyChart('VolumeChart');
const WeightChart = lazyChart('WeightChart');
const E1rmChart = lazyChart('E1rmChart');
const ChartSkeleton = ({ height }) => <div style={{ height }} />;

/* ================= MacroForge v2 =================
   Tabs: Today · Plan · Train · Coach (+ Settings)
   New in v2: meal sections, recipes, quick-add, coach banner,
   weekly meal plan → auto grocery list, routines with previous-session
   ghosts, set check-offs + auto rest timer, PR detection, per-exercise
   history, weigh-ins + adaptive TDEE engine, goal wizard, weekly report
   card, adherence heatmap, JSON import (v1 & v2), v1 auto-migration.
================================================== */

/* ---------------- constants (theme lives in tokens.js) ---------------- */
const CATEGORIES = ['Produce','Protein','Dairy & Eggs','Grains','Pantry','Frozen','Snacks','Beverages','Other'];
const ACTIVITY = [
  { id: 1.2,   label: 'Sedentary (desk, little exercise)' },
  { id: 1.375, label: 'Light (1–3 workouts/wk)' },
  { id: 1.55,  label: 'Moderate (3–5 workouts/wk)' },
  { id: 1.725, label: 'Very active (6–7 workouts/wk)' },
  { id: 1.9,   label: 'Athlete (2×/day)' },
];

/* ---------------- helpers ---------------- */
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
/* the user's own meals are the app's slots — never a hardcoded list */
const mealsOf = (settings) => (settings?.meals && settings.meals.length ? settings.meals : DEFAULT_MEALS);
/** Which of the user's meals is happening around now (nearest earlier time). */
const mealNow = (meals) => {
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  let best = null;
  for (const m of meals) {
    const t = minutesOf(m.time);
    if (t < 0 || t > now + 45) continue;                 // a little grace before a meal
    if (!best || t > minutesOf(best.time)) best = m;
  }
  return (best || meals[0] || DEFAULT_MEALS[0]).id;
};
/* entries whose slot was deleted still have to show up somewhere */
const UNFILED = { id: '__unfiled', label: 'Unfiled', emoji: '📋' };
const groupsOf = (meals, entries) => {
  const known = new Set(meals.map((m) => m.id));
  const strays = entries.some((e) => !known.has(e.meal || 'snack'));
  return strays ? [...meals, UNFILED] : meals;
};
const entriesFor = (entries, meals, slotId) => {
  const known = new Set(meals.map((m) => m.id));
  return slotId === UNFILED.id
    ? entries.filter((e) => !known.has(e.meal || 'snack'))
    : entries.filter((e) => (e.meal || 'snack') === slotId);
};
const storageAvailable = true;
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const mk = (t, freq) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = freq; o.type = 'sine'; g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2); };
    mk(0, 880); mk(0.22, 1175);
  } catch (e) {}
  try { navigator.vibrate && navigator.vibrate([180, 80, 180]); } catch (e) {}
}
function usePersistentState(key, initial) {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef(null);
  const skip = useRef(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (storageAvailable) {
        try { const res = await storage.get(key, false); if (alive && res && res.value != null) setValue(JSON.parse(res.value)); } catch (e) {}
      }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    if (skip.current) { skip.current = false; return; }
    if (!storageAvailable) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { storage.set(key, JSON.stringify(value), false).catch((e) => console.error('save failed', e)); }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, loaded, key]);
  return [value, setValue, loaded];
}

/* ---------------- atoms ---------------- */
function MIcon({ k, size }) { const Ic = MACROS[k].Icon; return <Ic size={size} style={{ color: MACROS[k].color }} />; }
function Label({ children, style }) {
  return <div className="uppercase" style={{ color: T.faint, fontSize: 10.5, letterSpacing: '0.14em', fontWeight: 700, ...style }}>{children}</div>;
}
function Card({ children, style, onClick }) {
  return <div onClick={onClick} className="rounded-2xl p-4" style={{ background: T.panel, border: `1px solid ${T.border}`, ...style }}>{children}</div>;
}
function NumField({ value, onChange, placeholder = '0', align = 'left', ghost }) {
  return (
    <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={ghost || placeholder}
      className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none transition"
      style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, textAlign: align, ...mono }}
      onFocus={(e) => (e.target.style.borderColor = T.lime)} onBlur={(e) => (e.target.style.borderColor = T.border)} />
  );
}
function TextField({ value, onChange, placeholder, bold, onEnter }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none transition"
      style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, fontWeight: bold ? 700 : 500 }}
      onFocus={(e) => (e.target.style.borderColor = T.lime)} onBlur={(e) => (e.target.style.borderColor = T.border)} />
  );
}
function Select({ value, onChange, options, labels }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg px-2 py-1.5 text-sm outline-none"
      style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted }}>
      {options.map((x, i) => <option key={String(x)} value={x} style={{ background: T.panel2 }}>{labels ? labels[i] : x}</option>)}
    </select>
  );
}
function GhostBtn({ children, onClick, danger, active }) {
  return (
    <button onClick={onClick} className="flex items-center justify-center rounded-lg transition shrink-0"
      style={{ width: 32, height: 32, background: active ? T.limeDim : 'transparent', border: `1px solid ${active ? T.lime : T.border}`, color: danger ? '#ff6b6b' : active ? T.lime : T.muted }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = danger ? '#ff6b6b' : T.borderHi; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = active ? T.lime : T.border; }}>
      {children}
    </button>
  );
}
function PrimaryBtn({ children, onClick, full, dim }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm transition ${full ? 'w-full' : ''}`}
      style={{ background: dim ? T.limeDim : T.lime, color: dim ? T.lime : '#0c0c0e', fontWeight: 800, border: dim ? `1px solid ${T.border}` : 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')} onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}>
      {children}
    </button>
  );
}
function Chip({ children, onClick, active }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition shrink-0"
      style={{ background: active ? T.limeDim : T.panel2, border: `1px solid ${active ? 'rgba(203,255,58,0.45)' : T.border}`, color: active ? T.lime : T.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  );
}
function Stepper({ value, onChange, step = 1, min = 0, suffix }) {
  const v = num(value);
  const btn = (label, fn) => (
    <button onClick={fn} className="flex items-center justify-center transition" style={{ width: 28, height: 30, color: T.muted, fontWeight: 700, fontSize: 16 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = T.lime)} onMouseLeave={(e) => (e.currentTarget.style.color = T.muted)}>{label}</button>
  );
  return (
    <div className="flex items-center rounded-lg overflow-hidden" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
      {btn('−', () => onChange(round(Math.max(min, v - step))))}
      <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="text-center outline-none"
        style={{ width: 40, height: 30, background: 'transparent', color: T.text, ...mono, fontSize: 13 }} />
      {suffix && <span style={{ ...mono, fontSize: 10, color: T.faint, marginLeft: -4 }}>{suffix}</span>}
      {btn('＋', () => onChange(round(v + step)))}
    </div>
  );
}
/* stepper wired to an entry whose servings may count servings or grams */
function QtyStepper({ entry, onChange, servingStep = 1 }) {
  const grams = entry.unitLabel === 'g';
  return <Stepper value={entry.servings} onChange={onChange} step={grams ? 10 : servingStep} suffix={grams ? 'g' : null} />;
}
function Modal({ open, onClose, title, icon, children, maxW = 440 }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-3" style={{ zIndex: 60 }}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div className="relative w-full rounded-2xl overflow-hidden fadein" style={{ maxWidth: maxW, maxHeight: '86vh', background: T.panel, border: `1px solid ${T.borderHi}`, display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2">{icon}<span style={{ ...display, fontSize: 18, textTransform: 'uppercase' }}>{title}</span></div>
          <GhostBtn onClick={onClose}><X size={16} /></GhostBtn>
        </div>
        <div className="p-4 overflow-auto" style={{ minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}
function MacroBar({ k, value, goal, compact }) {
  const m = MACROS[k];
  const pct = goal > 0 ? (value / goal) * 100 : 0;
  const w = Math.max(0, Math.min(100, pct));
  const over = pct > 105;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5"><m.Icon size={13} style={{ color: m.color }} /><span className="text-xs" style={{ color: T.text, fontWeight: 600 }}>{m.label}</span></div>
        <div style={{ ...mono, fontSize: 12, color: T.muted }}>
          <span style={{ color: T.text }}>{round(value)}</span>{goal > 0 && <span style={{ color: T.faint }}> / {round(goal)}g</span>}
        </div>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: compact ? 6 : 7, background: T.panel2 }}>
        <div style={{ height: '100%', width: `${w}%`, background: over ? T.orange : m.color, borderRadius: 999, transition: 'width .4s ease' }} />
      </div>
    </div>
  );
}
function EmptyCard({ Icon, text }) {
  return (
    <Card style={{ borderStyle: 'dashed' }}>
      <div className="text-center py-4" style={{ color: T.faint }}><Icon size={22} className="mx-auto mb-2" style={{ color: T.border }} /><div className="text-sm">{text}</div></div>
    </Card>
  );
}
function CheckToggle({ checked, onToggle, label }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-1.5 text-xs transition" style={{ color: checked ? T.lime : T.faint }}>
      <span className="flex items-center justify-center rounded" style={{ width: 16, height: 16, border: `1.5px solid ${checked ? T.lime : T.borderHi}`, background: checked ? T.lime : 'transparent' }}>{checked && <Check size={11} style={{ color: '#0c0c0e' }} strokeWidth={3} />}</span>
      {label}
    </button>
  );
}
const recipeMacros = (recipe, foods) => (recipe.items || []).reduce((a, it) => {
  const fd = foods.find((f) => f.id === it.foodId); if (!fd) return a;
  const q = num(it.servings) || 0; // grams for per-100g foods
  const per = foodPortion(fd);
  a.protein += per.protein * q; a.carbs += per.carbs * q; a.fat += per.fat * q; return a;
}, { protein: 0, carbs: 0, fat: 0 });

/* ---------------- TODAY ---------------- */
function FoodPickerModal({ open, onClose, foods, recipes, log, onAddExisting, onAddRecipe, onAddCustom, onAddOff, dateLabel, meal, setMeal, meals }) {
  const [mode, setMode] = useState('foods'); // foods | recipes | online
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [f, setF] = useState('');
  const [serv, setServ] = useState(1);
  const [per100, setPer100] = useState(false);
  const [save, setSave] = useState(true);
  const [last, setLast] = useState('');
  const [offState, setOffState] = useState({ status: 'idle', results: [] }); // idle | loading | done | error
  const [offNonce, setOffNonce] = useState(0); // bump to retry the same query
  const recent = useMemo(() => {
    const seen = new Set(); const out = [];
    [...log].forEach((e) => { const k = e.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e); } });
    return out.slice(0, 8);
  }, [log]);
  /* meals repeat — foods you log often float to the top of matches */
  const usage = useMemo(() => {
    const m = new Map();
    log.forEach((e) => { const k = String(e.name || '').trim().toLowerCase(); m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }, [log]);
  const matches = useMemo(() => {
    const list = foods.filter((fd) => nameMatches(fd.name, q));
    const u = (fd) => usage.get(fd.name.trim().toLowerCase()) || 0;
    return [...list].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || u(b) - u(a)).slice(0, 30);
  }, [foods, q, usage]);
  const recipeMatches = useMemo(() => recipes.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase())), [recipes, q]);
  const addCustom = () => {
    if (!q.trim()) return;
    onAddCustom({ name: q.trim(), category: cat, protein: num(p), carbs: num(c), fat: num(f), servings: num(serv) || (per100 ? 100 : 1), unit: per100 ? 'g100' : 'serving', saveToLibrary: save });
    setLast(q.trim()); setQ(''); setP(''); setC(''); setF(''); setServ(per100 ? 100 : 1);
  };
  /* debounced Open Food Facts search; offNonce re-runs the same query on demand */
  useEffect(() => {
    if (mode !== 'online') return;
    const term = q.trim();
    if (term.length < 3) { setOffState({ status: 'idle', results: [] }); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setOffState({ status: 'error', results: [] }); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setOffState((s) => ({ ...s, status: 'loading' }));
      searchOff(term, ctrl.signal)
        .then((results) => setOffState({ status: 'done', results }))
        .catch((e) => { if (e.name !== 'AbortError') setOffState({ status: 'error', results: [] }); });
    }, 500);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [mode, q, offNonce]);
  useEffect(() => { setServ(per100 ? 100 : 1); }, [per100]);
  useEffect(() => { if (!open) { setQ(''); setLast(''); setP(''); setC(''); setF(''); setServ(1); setPer100(false); setMode('foods'); setOffState({ status: 'idle', results: [] }); } }, [open]);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (
    <Modal open={open} onClose={onClose} title="Add food" icon={<Utensils size={16} style={{ color: T.lime }} />}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs" style={{ color: T.faint }}>Logging to <span style={{ color: T.muted }}>{dateLabel}</span></div>
        <div className="flex gap-1 rounded-lg p-0.5 overflow-x-auto" style={{ background: T.panel2, border: `1px solid ${T.border}`, scrollbarWidth: 'none', maxWidth: 190 }}>
          {meals.map((m) => (
            <button key={m.id} onClick={() => setMeal(m.id)} className="rounded-md px-2 py-1 transition shrink-0" title={m.label}
              style={{ background: meal === m.id ? T.lime : 'transparent', fontSize: 12 }}>
              {m.emoji || m.label.slice(0, 2)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 mb-3">
        <Chip active={mode === 'foods'} onClick={() => setMode('foods')}><BookOpen size={12} /> Library</Chip>
        <Chip active={mode === 'recipes'} onClick={() => setMode('recipes')}><ChefHat size={12} /> Recipes</Chip>
        <Chip active={mode === 'online'} onClick={() => setMode('online')}><Globe size={12} /> Search online</Chip>
      </div>
      <div className="relative mb-3">
        <Search size={15} className="absolute" style={{ left: 10, top: 11, color: T.faint }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === 'recipes' ? 'Search recipes…' : mode === 'online' ? 'Search Open Food Facts…' : 'Search library or type a new food…'} autoFocus
          className="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none transition"
          style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text }}
          onFocus={(e) => (e.target.style.borderColor = T.lime)} onBlur={(e) => (e.target.style.borderColor = T.border)} />
      </div>
      {last && <div className="flex items-center gap-1.5 text-xs mb-2" style={{ color: T.lime }}><Check size={13} /> Added {last} — adjust the amount in the list.</div>}
      {mode === 'online' ? (
        <div className="flex flex-col gap-1" style={{ maxHeight: 320, overflow: 'auto' }}>
          {offline ? (
            <div className="rounded-xl p-4 text-center" style={{ border: `1px dashed ${T.borderHi}` }}>
              <WifiOff size={20} className="mx-auto mb-2" style={{ color: T.border }} />
              <div className="text-xs" style={{ color: T.faint }}>You're offline — Open Food Facts search needs a connection. Everything else works offline.</div>
            </div>
          ) : q.trim().length < 3 ? (
            <div className="text-xs px-1 py-4 text-center" style={{ color: T.faint }}>Type at least 3 characters to search the Open Food Facts database. Picked foods are saved to your library with per-100g macros.</div>
          ) : offState.status === 'loading' ? (
            <div className="text-xs px-1 py-4 text-center" style={{ color: T.faint }}>Searching Open Food Facts…</div>
          ) : offState.status === 'error' ? (
            <div className="text-xs px-1 py-4 text-center" style={{ color: T.faint }}>
              Open Food Facts didn't answer — it gets busy in waves.{' '}
              <button onClick={() => setOffNonce((n) => n + 1)} style={{ color: T.lime, fontWeight: 700 }}>retry</button>
            </div>
          ) : offState.status === 'done' && offState.results.length === 0 ? (
            <div className="text-xs px-1 py-4 text-center" style={{ color: T.faint }}>No products with macro data match “{q.trim()}”.</div>
          ) : (
            offState.results.map((r) => (
              <button key={r.code || r.name} onClick={() => { onAddOff(r); setLast(r.name); }} className="flex items-center justify-between rounded-lg px-3 py-2 text-left transition"
                style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                <div className="min-w-0">
                  <div className="text-sm truncate" style={{ color: T.text, fontWeight: 600 }}>
                    {r.name}
                    {r.verified && <span className="inline-flex items-center gap-0.5" style={{ fontSize: 9, color: T.lime, background: T.limeDim, borderRadius: 5, padding: '1px 5px', marginLeft: 6, fontWeight: 700, verticalAlign: 'middle' }}><BadgeCheck size={9} /> VERIFIED</span>}
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: T.faint }}>{r.brand ? `${r.brand} · ` : ''}{MK.map((k) => `${round(r[k])}${k[0]}`).join('  ')} · {Math.round(calsFrom(r.protein, r.carbs, r.fat))} kcal / 100 g</div>
                </div>
                <Plus size={16} style={{ color: T.lime }} />
              </button>
            ))
          )}
        </div>
      ) : mode === 'recipes' ? (
        <div className="flex flex-col gap-1" style={{ maxHeight: 300, overflow: 'auto' }}>
          {recipes.length === 0 && <div className="text-xs px-1 py-4 text-center" style={{ color: T.faint }}>No recipes yet — build them in Settings → Recipes, or save a combo you eat often.</div>}
          {recipeMatches.map((r) => {
            const m = recipeMacros(r, foods);
            const po = Math.max(1, num(r.portions) || 1);
            return (
              <button key={r.id} onClick={() => { onAddRecipe(r); setLast(r.name); }} className="flex items-center justify-between rounded-lg px-3 py-2 text-left transition"
                style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                <div className="min-w-0">
                  <div className="text-sm truncate" style={{ color: T.text, fontWeight: 600 }}>{r.emoji || '🍳'} {r.name}</div>
                  <div style={{ ...mono, fontSize: 11, color: T.faint }}>{MK.map((k) => `${round(m[k] / po)}${k[0]}`).join('  ')} · {Math.round(calsFrom(m.protein, m.carbs, m.fat) / po)} kcal{po > 1 ? ' / portion' : ''} · {(r.items || []).length} items</div>
                </div>
                <Plus size={16} style={{ color: T.lime }} />
              </button>
            );
          })}
        </div>
      ) : (
        <>
          {!q.trim() && recent.length > 0 && (
            <div className="mb-2">
              <Label style={{ marginBottom: 6 }}>Recent</Label>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((e) => (
                  <Chip key={e.id} onClick={() => { onAddCustom({ name: e.name, category: e.category || CATEGORIES[0], protein: num(e.protein), carbs: num(e.carbs), fat: num(e.fat), servings: e.unitLabel === 'g' ? (num(e.servings) || 100) : 1, unitLabel: e.unitLabel || null, saveToLibrary: false }); setLast(e.name); }}>
                    {e.name}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {foods.length > 0 && (
            <div className="flex flex-col gap-1 mb-3" style={{ maxHeight: 200, overflow: 'auto' }}>
              {matches.length === 0 && <div className="text-xs px-1 py-2" style={{ color: T.faint }}>No saved foods match. Create one below.</div>}
              {matches.map((fd) => (
                <button key={fd.id} onClick={() => { onAddExisting(fd); setLast(fd.name); }} className="flex items-center justify-between rounded-lg px-3 py-2 text-left transition"
                  style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: T.text, fontWeight: 600 }}>{fd.favorite && <Star size={11} style={{ color: T.orange, display: 'inline', marginRight: 4, marginTop: -2 }} fill={T.orange} />}{fd.name}</div>
                    <div style={{ ...mono, fontSize: 11, color: T.faint }}>{MK.map((k) => `${round(num(fd[k]))}${k[0]}`).join('  ')} · {Math.round(calsFrom(fd.protein, fd.carbs, fd.fat))} kcal{isPer100g(fd) ? ' / 100 g' : ''}</div>
                  </div>
                  <Plus size={16} style={{ color: T.lime }} />
                </button>
              ))}
            </div>
          )}
          <div className="rounded-xl p-3" style={{ background: T.bg, border: `1px dashed ${T.borderHi}` }}>
            <div className="flex items-center justify-between">
              <Label>Create / log new food {q.trim() && `“${q.trim()}”`}</Label>
              <button onClick={() => setPer100((v) => !v)} className="rounded-md px-2 py-0.5 transition" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', background: per100 ? T.limeDim : 'transparent', border: `1px solid ${per100 ? 'rgba(203,255,58,0.45)' : T.border}`, color: per100 ? T.lime : T.faint }}>
                {per100 ? 'PER 100 G' : 'PER SERVING'}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {MK.map((k) => {
                const setter = { protein: setP, carbs: setC, fat: setF }[k];
                const val = { protein: p, carbs: c, fat: f }[k];
                return (
                  <div key={k}>
                    <div className="flex items-center gap-1" style={{ height: 13 }}><MIcon k={k} size={10} /><span className="uppercase" style={{ color: T.faint, fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>{MACROS[k].short}</span></div>
                    <div className="mt-1"><NumField value={val} onChange={setter} align="center" /></div>
                  </div>
                );
              })}
              <div>
                <div style={{ height: 13 }}><span className="uppercase" style={{ color: T.faint, fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>{per100 ? 'Grams' : 'Serv'}</span></div>
                <div className="mt-1"><NumField value={serv} onChange={setServ} align="center" /></div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <CheckToggle checked={save} onToggle={() => setSave((s) => !s)} label="save to library" />
              <button onClick={addCustom} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700 }}>
                <Plus size={14} /> log it
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function coachSuggestion({ totals, goals, foods }) {
  const goalCals = calsFrom(goals.protein, goals.carbs, goals.fat);
  if (!(goalCals > 0)) return null;
  const cals = calsFrom(totals.protein, totals.carbs, totals.fat);
  const remaining = goalCals - cals;
  if (remaining < -goalCals * 0.05) return { tone: 'over', text: <>You're <b style={{ color: T.orange }}>{Math.round(-remaining)} kcal over</b> today. A lighter dinner or a walk squares it — tomorrow is a clean slate.</> };
  const behind = MK.map((k) => ({ k, goal: num(goals[k]), have: totals[k], pct: num(goals[k]) > 0 ? totals[k] / num(goals[k]) : 1 })).filter((x) => x.goal > 0).sort((a, b) => a.pct - b.pct)[0];
  if (!behind || remaining <= 60) return { tone: 'done', text: <><b style={{ color: T.text }}>Day closed out.</b> {Math.max(0, Math.round(remaining))} kcal left — targets are basically hit.</> };
  const gapG = Math.round(behind.goal - behind.have);
  let pick = null;
  if (gapG > 8 && foods.length) {
    const scored = foods.map((fd) => { const kc = calsFrom(fd.protein, fd.carbs, fd.fat); return { fd, kc, density: kc > 0 ? num(fd[behind.k]) / kc : 0 }; })
      .filter((x) => x.kc > 20 && x.kc <= remaining + 120 && num(x.fd[behind.k]) > 4)
      .sort((a, b) => (b.fd.favorite ? 1 : 0) - (a.fd.favorite ? 1 : 0) || b.density - a.density);
    pick = scored[0] ? scored[0].fd : null;
  }
  return {
    tone: 'ok',
    text: <>
      <b style={{ color: T.text }}>{remaining > 0 ? 'On track.' : 'Close.'}</b> {Math.round(remaining)} kcal left{gapG > 8 && <> — you need <b style={{ color: MACROS[behind.k].color }}>{gapG}g more {MACROS[behind.k].label.toLowerCase()}</b></>}.
      {pick && <> Try <b style={{ color: T.text }}>{pick.name}</b> ({round(num(pick[behind.k]))}g, {Math.round(calsFrom(pick.protein, pick.carbs, pick.fat))} kcal{isPer100g(pick) ? ' per 100 g' : ''}).</>}
    </>,
  };
}

function TodayView({ settings, setSettings, log, setLog, foods, recipes, ensureFood, plan, streak, water, setWater, onConsume, onRestore }) {
  const goals = settings.goals;
  const meals = mealsOf(settings);
  const [viewDate, setViewDate] = useState(todayISO());
  const [picker, setPicker] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [meal, setMeal] = useState(() => mealNow(meals));
  const isToday = viewDate === todayISO();
  const entries = useMemo(() => log.filter((e) => e.date === viewDate), [log, viewDate]);
  const totals = useMemo(() => entryMacros(entries), [entries]);
  const extras = useMemo(() => entryExtras(entries), [entries]);
  const waterToday = useMemo(() => water.filter((w) => w.date === viewDate).reduce((s, w) => s + num(w.ml), 0), [water, viewDate]);
  const waterGoal = num(settings.waterMl) || 2000;
  const addWater = (ml) => setWater((ws) => [...ws, { id: uid(), date: viewDate, ml }]);
  const undoWater = () => setWater((ws) => { const idx = ws.map((w) => w.date).lastIndexOf(viewDate); return idx >= 0 ? ws.filter((_, i) => i !== idx) : ws; });
  const cals = calsFrom(totals.protein, totals.carbs, totals.fat);
  const goalCals = calsFrom(goals.protein, goals.carbs, goals.fat);
  const remaining = goalCals - cals;
  const calPct = goalCals > 0 ? Math.min(100, (cals / goalCals) * 100) : 0;
  const overCals = goalCals > 0 && cals > goalCals * 1.05;
  const suggestion = useMemo(() => coachSuggestion({ totals, goals, foods }), [totals, goals, foods]);
  const planned = useMemo(() => plan.filter((e) => e.date === viewDate), [plan, viewDate]);
  const yesterday = useMemo(() => log.filter((e) => e.date === addDays(viewDate, -1)), [log, viewDate]);
  /* what a set of log/plan entries takes out of the pantry */
  const consumptionOf = (list) => list.flatMap((e) => {
    if (e.refType === 'recipe') {
      const r = recipes.find((x) => x.id === e.refId);
      if (r) return recipeConsumption(r, foods).map((n) => ({ ...n, qty: n.qty * (num(e.servings) || 1) }));
      return [];
    }
    return [{ name: e.name, qty: num(e.servings) }];
  });
  /* Each entry remembers the stock it actually drew, so corrections are exact:
     delete puts it all back, editing the amount settles the difference. */
  const logRef = useRef(log);
  logRef.current = log;
  const updEntry = (id, patch) => {
    const before = logRef.current.find((e) => e.id === id);
    setLog((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    if (!before || patch.servings === undefined) return;
    if (num(before.servings) === num(patch.servings)) return;
    const had = before.taken || [];
    // what this entry ought to be drawing at its new amount
    const wanted = had.length ? consumptionOf([{ ...before, servings: num(patch.servings) }]) : [];
    const { take, give, kept } = reconcileTaken(had, wanted);
    if (give.length) onRestore(give);
    const got = take.length ? onConsume(take) : [];
    if (give.length || got.length) {
      setLog((l) => l.map((e) => (e.id === id ? { ...e, taken: [...kept, ...got] } : e)));
    }
  };
  const delEntry = (id) => {
    const gone = logRef.current.find((e) => e.id === id);
    setLog((l) => l.filter((e) => e.id !== id));
    if (gone && gone.taken && gone.taken.length) onRestore(gone.taken);
  };
  const addExisting = (fd, servings) => {
    const per = foodPortion(fd);
    const qty = servings ?? per.qty;
    const taken = onConsume([{ name: fd.name, qty: num(qty) }]);
    setLog((l) => [{ id: uid(), date: viewDate, meal, refType: 'food', refId: fd.id, name: fd.name, category: fd.category, servings: qty, unitLabel: per.unitLabel, protein: per.protein, carbs: per.carbs, fat: per.fat, fiber: per.fiber, sugar: per.sugar, taken }, ...l]);
  };
  const addRecipe = (r) => {
    const m = recipeMacros(r, foods);
    const portions = Math.max(1, num(r.portions) || 1); // batch recipes log one portion
    const taken = onConsume(recipeConsumption(r, foods));
    setLog((l) => [{ id: uid(), date: viewDate, meal, refType: 'recipe', refId: r.id, name: portions > 1 ? `${r.name} (1 of ${portions})` : r.name, servings: 1, protein: m.protein / portions, carbs: m.carbs / portions, fat: m.fat / portions, taken }, ...l]);
  };
  /* photo estimates are whole-portion snapshots; they never draw on the pantry
     (an AI-guessed "burrito bowl" has no stock row to draw from) */
  const addPhotoLog = (a) => {
    const t = a.total || {};
    setLog((l) => [{ id: uid(), date: viewDate, meal, refType: 'custom', refId: null, name: a.name, category: a.category || 'Other', servings: 1, unitLabel: 'portion', protein: num(t.protein), carbs: num(t.carbs), fat: num(t.fat), fiber: num(t.fiber), sugar: num(t.sugar), source: 'photo', taken: [] }, ...l]);
  };
  const addCustom = ({ name, category, protein, carbs, fat, servings, unit, unitLabel, saveToLibrary }) => {
    let foodId = null;
    if (saveToLibrary) { const fd = ensureFood({ name, category, protein, carbs, fat, unit }); foodId = fd.id; }
    // per-100g foods snapshot per-gram macros; servings then counts grams
    const g100 = unit === 'g100';
    const entry = g100
      ? { protein: num(protein) / 100, carbs: num(carbs) / 100, fat: num(fat) / 100, unitLabel: 'g' }
      : { protein: num(protein), carbs: num(carbs), fat: num(fat), unitLabel: unitLabel || null };
    const taken = onConsume([{ name, qty: num(servings) }]);
    setLog((l) => [{ id: uid(), date: viewDate, meal, refType: foodId ? 'food' : 'custom', refId: foodId, name, category, servings, ...entry, taken }, ...l]);
  };
  const addOff = (r) => {
    const name = r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? `${r.name} (${r.brand})` : r.name;
    const fd = ensureFood({ name, category: 'Other', protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, sugar: r.sugars, unit: 'g100' });
    addExisting(fd);
  };
  /* clone a set of entries onto this day, each carrying its own stock record */
  const cloneOnto = (src) => src.map((e) => ({ ...e, id: uid(), date: viewDate, taken: onConsume(consumptionOf([e])) }));
  const copyYesterday = () => {
    if (!yesterday.length) return;
    setLog((l) => [...cloneOnto(yesterday), ...l]);
  };
  const eatAsPlanned = () => {
    if (!planned.length) return;
    setLog((l) => [...cloneOnto(planned), ...l]);
  };
  const favs = foods.filter((f) => f.favorite).slice(0, 6);
  return (
    <div className="flex flex-col gap-3 fadein">
      <div className="flex items-center justify-between">
        <GhostBtn onClick={() => setViewDate((d) => addDays(d, -1))}><ChevronLeft size={18} /></GhostBtn>
        <button onClick={() => setViewDate(todayISO())} className="flex flex-col items-center">
          <div style={{ ...display, fontSize: 19, textTransform: 'uppercase' }}>{isToday ? 'Today' : fmtDate(viewDate, { weekday: 'long' })}</div>
          <div className="text-xs" style={{ color: T.faint }}>{fmtDate(viewDate, { month: 'short', day: 'numeric', year: 'numeric' })}{!isToday && ' · tap for today'}</div>
        </button>
        <GhostBtn onClick={() => setViewDate((d) => addDays(d, 1))}><ChevronRight size={18} /></GhostBtn>
      </div>
      {suggestion && (
        <div className="rounded-2xl px-3.5 py-3 flex items-start gap-2.5" style={{ background: suggestion.tone === 'over' ? 'linear-gradient(135deg, rgba(255,122,69,0.12), #141418)' : 'linear-gradient(135deg, rgba(203,255,58,0.10), #141418)', border: `1px solid ${suggestion.tone === 'over' ? 'rgba(255,122,69,0.4)' : 'rgba(203,255,58,0.3)'}` }}>
          <Sparkles size={15} style={{ color: suggestion.tone === 'over' ? T.orange : T.lime, marginTop: 1, flexShrink: 0 }} />
          <div className="text-xs" style={{ color: T.muted, lineHeight: 1.55 }}>{suggestion.text}</div>
        </div>
      )}
      <Card style={{ background: `linear-gradient(160deg, ${T.panel}, #101013)` }}>
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1"><Flame size={14} style={{ color: T.orange }} /><Label>Calories eaten</Label></div>
            <div style={{ ...display, fontSize: 40, color: T.text, lineHeight: 0.95 }}>{Math.round(cals)}</div>
          </div>
          <div className="text-right">
            {goalCals > 0 ? (
              <>
                <div style={{ ...mono, fontSize: 18, color: overCals ? T.orange : T.lime, fontWeight: 700 }}>{Math.round(Math.abs(remaining))}</div>
                <div className="text-xs" style={{ color: T.faint }}>kcal {remaining >= 0 ? 'left' : 'over'} · target {Math.round(goalCals)}</div>
              </>
            ) : <div className="text-xs" style={{ color: T.faint, maxWidth: 130 }}>Set targets in Coach to unlock tracking vs. goals</div>}
          </div>
        </div>
        {goalCals > 0 && (
          <div className="rounded-full overflow-hidden mb-3" style={{ height: 8, background: T.panel2 }}>
            <div style={{ height: '100%', width: `${calPct}%`, background: overCals ? T.orange : T.lime, borderRadius: 999, transition: 'width .4s' }} />
          </div>
        )}
        <div className="flex flex-col gap-3">{MK.map((k) => <MacroBar key={k} k={k} value={totals[k]} goal={num(goals[k])} />)}</div>
        {(extras.fiber > 0 || extras.sugar > 0) && (
          <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: `1px solid ${T.border}`, ...mono, fontSize: 11 }}>
            <span style={{ color: extras.fiber >= (num(settings.fiberG) || 30) ? T.lime : T.muted }}>fiber {round(extras.fiber)}<span style={{ color: T.faint }}>/{num(settings.fiberG) || 30}g</span></span>
            <span style={{ color: extras.sugar > (num(settings.sugarMaxG) || 50) ? T.orange : T.muted }}>sugar {round(extras.sugar)}<span style={{ color: T.faint }}>/{num(settings.sugarMaxG) || 50}g max</span></span>
            <span className="text-xs" style={{ color: T.faint, fontFamily: "'Archivo', sans-serif" }}>from scanned & OFF foods</span>
          </div>
        )}
      </Card>
      <Card style={{ padding: '12px 16px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GlassWater size={15} style={{ color: '#46b8ff' }} />
            <span style={{ ...mono, fontSize: 13, color: T.text, fontWeight: 600 }}>{waterToday >= 1000 ? `${round(waterToday / 1000)}L` : `${waterToday}ml`}</span>
            <span className="text-xs" style={{ color: T.faint }}>/ {waterGoal >= 1000 ? `${round(waterGoal / 1000)}L` : `${waterGoal}ml`} water</span>
          </div>
          <div className="flex items-center gap-1.5">
            {waterToday > 0 && <button onClick={undoWater} className="text-xs px-1" style={{ color: T.faint }}>undo</button>}
            <button onClick={() => addWater(250)} className="rounded-lg px-2.5 py-1 text-xs" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: '#46b8ff', fontWeight: 700, ...mono }}>+250</button>
            <button onClick={() => addWater(500)} className="rounded-lg px-2.5 py-1 text-xs" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: '#46b8ff', fontWeight: 700, ...mono }}>+500</button>
          </div>
        </div>
        <div className="rounded-full overflow-hidden mt-2" style={{ height: 5, background: T.panel2 }}>
          <div style={{ height: '100%', width: `${Math.min(100, (waterToday / waterGoal) * 100)}%`, background: '#46b8ff', borderRadius: 999, transition: 'width .3s' }} />
        </div>
      </Card>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }} data-noswipe>
        {yesterday.length > 0 && <Chip onClick={copyYesterday}><Zap size={12} /> Copy yesterday</Chip>}
        {planned.length > 0 && entries.length === 0 && <Chip active onClick={eatAsPlanned}><CalendarRange size={12} /> Ate as planned ({planned.length})</Chip>}
        {favs.map((fd) => (
          <Chip key={fd.id} onClick={() => addExisting(fd)}><Star size={11} style={{ color: T.orange }} fill={T.orange} /> {fd.name}</Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="flex-1"><PrimaryBtn onClick={() => { setMeal(mealNow(meals)); setPicker(true); }} full><Plus size={16} /> Add food</PrimaryBtn></div>
        <button onClick={() => { setMeal(mealNow(meals)); setPhotoOpen(true); }} className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 46, background: T.panel, border: `1px solid ${T.borderHi}`, color: T.lime }} title="Snap your plate"><Camera size={17} /></button>
      </div>
      {entries.length === 0 ? (
        <EmptyCard Icon={Utensils} text={`Nothing logged ${isToday ? 'today' : 'this day'} yet.`} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {groupsOf(meals, entries).map((m) => {
            const es = entriesFor(entries, meals, m.id);
            if (!es.length) return null;
            const mt = entryMacros(es);
            return (
              <div key={m.id}>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <Label style={{ color: T.muted }}>{m.emoji || '🍽️'} {m.label}</Label>
                  <span style={{ ...mono, fontSize: 11, color: T.faint }}>{Math.round(calsFrom(mt.protein, mt.carbs, mt.fat))} kcal</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {es.map((e) => {
                    const q = num(e.servings) || 0;
                    return (
                      <div key={e.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: T.panel, border: `1px solid ${T.border}` }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate" style={{ color: T.text, fontWeight: 600 }}>{e.refType === 'recipe' && <span style={{ fontSize: 10, color: T.lime, background: T.limeDim, borderRadius: 5, padding: '1px 5px', marginRight: 5, fontWeight: 700 }}>RECIPE</span>}{e.name}</div>
                          <div className="flex items-center gap-2 mt-0.5" style={{ ...mono, fontSize: 11 }}>
                            {MK.map((k) => <span key={k} style={{ color: MACROS[k].color }}>{round(num(e[k]) * q)}{k[0]}</span>)}
                            <span style={{ color: T.faint }}>· {Math.round(calsFrom(e.protein, e.carbs, e.fat) * q)} kcal</span>
                          </div>
                        </div>
                        <QtyStepper entry={e} onChange={(v) => updEntry(e.id, { servings: v })} />
                        <button onClick={() => delEntry(e.id)} className="flex items-center justify-center shrink-0 transition" style={{ width: 28, height: 30, color: T.faint }}
                          onMouseEnter={(ev) => (ev.currentTarget.style.color = '#ff8a8a')} onMouseLeave={(ev) => (ev.currentTarget.style.color = T.faint)}><X size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <FoodPickerModal open={picker} onClose={() => setPicker(false)} foods={foods} recipes={recipes} log={log} onAddExisting={addExisting} onAddRecipe={addRecipe} onAddCustom={addCustom} onAddOff={addOff} dateLabel={isToday ? 'today' : fmtDate(viewDate)} meal={meal} setMeal={setMeal} meals={meals} />
      {photoOpen && (
        <Suspense fallback={null}>
          <PhotoSnap open={photoOpen} onClose={() => setPhotoOpen(false)} mode="meal" mealLabel={(meals.find((m) => m.id === meal) || {}).label} goals={goals} list={[]} mealsPerDay={meals.length} onLog={addPhotoLog} />
        </Suspense>
      )}
    </div>
  );
}

/* ---------------- PLAN (meal planning + groceries) ---------------- */
function weekDates(anchor) {
  const dt = parseISO(anchor);
  const dow = (dt.getDay() + 6) % 7; // Monday = 0
  const mon = addDays(anchor, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}
function PlanMealPicker({ open, onClose, foods, recipes, onPick }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (!open) setQ(''); }, [open]);
  const term = q.trim().toLowerCase();
  const rs = recipes.filter((r) => r.name.toLowerCase().includes(term));
  const fs = foods.filter((f) => f.name.toLowerCase().includes(term)).slice(0, 20);
  return (
    <Modal open={open} onClose={onClose} title="Add to plan" icon={<CalendarRange size={16} style={{ color: T.lime }} />}>
      <div className="relative mb-3">
        <Search size={15} className="absolute" style={{ left: 10, top: 11, color: T.faint }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes & foods…" autoFocus
          className="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text }} />
      </div>
      {rs.length > 0 && <Label style={{ marginBottom: 6 }}>Recipes</Label>}
      <div className="flex flex-col gap-1 mb-3">
        {rs.map((r) => {
          const m = recipeMacros(r, foods);
          const po = Math.max(1, num(r.portions) || 1);
          return (
            <button key={r.id} onClick={() => onPick({ refType: 'recipe', refId: r.id, name: po > 1 ? `${r.name} (1 of ${po})` : r.name, protein: m.protein / po, carbs: m.carbs / po, fat: m.fat / po })} className="flex items-center justify-between rounded-lg px-3 py-2 text-left" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
              <div className="min-w-0"><div className="text-sm truncate" style={{ fontWeight: 600 }}>{r.emoji || '🍳'} {r.name}</div><div style={{ ...mono, fontSize: 11, color: T.faint }}>{Math.round(calsFrom(m.protein, m.carbs, m.fat) / po)} kcal{po > 1 ? ' / portion' : ''}</div></div>
              <Plus size={16} style={{ color: T.lime }} />
            </button>
          );
        })}
      </div>
      {fs.length > 0 && <Label style={{ marginBottom: 6 }}>Foods</Label>}
      <div className="flex flex-col gap-1">
        {fs.map((fd) => {
          const per = foodPortion(fd);
          return (
            <button key={fd.id} onClick={() => onPick({ refType: 'food', refId: fd.id, name: fd.name, protein: per.protein, carbs: per.carbs, fat: per.fat, servings: per.qty, unitLabel: per.unitLabel })} className="flex items-center justify-between rounded-lg px-3 py-2 text-left" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
              <div className="min-w-0"><div className="text-sm truncate" style={{ fontWeight: 600 }}>{fd.name}</div><div style={{ ...mono, fontSize: 11, color: T.faint }}>{Math.round(calsFrom(fd.protein, fd.carbs, fd.fat))} kcal / {isPer100g(fd) ? '100 g' : 'serving'}</div></div>
              <Plus size={16} style={{ color: T.lime }} />
            </button>
          );
        })}
        {rs.length === 0 && fs.length === 0 && <div className="text-xs text-center py-4" style={{ color: T.faint }}>Nothing matches. Add foods to your library first.</div>}
      </div>
    </Modal>
  );
}
function AddGrocery({ onAdd, foods, ensureFood }) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [qty, setQty] = useState('1');
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [f, setF] = useState('');
  const [save, setSave] = useState(true);
  const [offSugg, setOffSugg] = useState([]);
  const [added, setAdded] = useState('');
  const sugg = useMemo(() => { const q = name.trim().toLowerCase(); if (!q) return []; return foods.filter((fd) => nameMatches(fd.name, q) && fd.name.toLowerCase() !== q).slice(0, 4); }, [foods, name]);
  const fill = (fd) => { setName(fd.name); setCat(fd.category || CATEGORIES[0]); setP(String(fd.protein ?? '')); setC(String(fd.carbs ?? '')); setF(String(fd.fat ?? '')); };
  /* predict what's being typed: debounced Open Food Facts lookup (online only) */
  useEffect(() => {
    const term = name.trim();
    setAdded('');
    if (term.length < 3 || (typeof navigator !== 'undefined' && navigator.onLine === false)) { setOffSugg([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchOff(term, ctrl.signal)
        .then((rs) => setOffSugg(rs.slice(0, 4)))
        .catch(() => setOffSugg([]));
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); setOffSugg([]); };
  }, [name]);
  /* an OFF pick lands directly on the list as a gram-based item with real macros */
  const addOffPick = (r) => {
    const label = r.brand && !r.name.toLowerCase().includes(r.brand.toLowerCase()) ? `${r.name} (${r.brand})` : r.name;
    ensureFood({ name: label, category: cat, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, sugar: r.sugars, unit: 'g100' });
    onAdd({ id: uid(), name: label, category: cat, qty: 100, unitLabel: 'g', protein: r.protein / 100, carbs: r.carbs / 100, fat: r.fat / 100, checked: false, source: 'manual' });
    setAdded(label); setName(''); setP(''); setC(''); setF('');
  };
  const submit = () => {
    if (!name.trim()) return;
    if (save) ensureFood({ name: name.trim(), category: cat, protein: num(p), carbs: num(c), fat: num(f) });
    onAdd({ id: uid(), name: name.trim(), category: cat, qty: num(qty) || 1, protein: num(p), carbs: num(c), fat: num(f), checked: false, source: 'manual' });
    setName(''); setQty('1'); setP(''); setC(''); setF('');
  };
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3"><Plus size={16} style={{ color: T.lime }} /><Label>Add grocery item</Label></div>
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <div className="flex-1"><TextField value={name} onChange={setName} placeholder="e.g. Chicken breast" bold onEnter={submit} /></div>
          <Select value={cat} onChange={setCat} options={CATEGORIES} />
        </div>
        {sugg.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sugg.map((fd) => <Chip key={fd.id} onClick={() => fill(fd)}><BookOpen size={11} style={{ color: T.lime }} /> {fd.name}</Chip>)}
          </div>
        )}
        {added && <div className="flex items-center gap-1.5 text-xs" style={{ color: T.lime }}><Check size={13} /> Added {added} — adjust grams in the list.</div>}
        {offSugg.length > 0 && (
          <div>
            <Label style={{ marginBottom: 6 }}>Matches with real nutrition</Label>
            <div className="flex flex-col gap-1">
              {offSugg.map((r) => (
                <button key={r.code || r.name} onClick={() => addOffPick(r)} className="flex items-center justify-between rounded-lg px-3 py-2 text-left transition"
                  style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                  <div className="min-w-0">
                    <div className="text-sm truncate" style={{ color: T.text, fontWeight: 600 }}>
                      {r.name}
                      {r.verified && <span className="inline-flex items-center gap-0.5" style={{ fontSize: 9, color: T.lime, background: T.limeDim, borderRadius: 5, padding: '1px 5px', marginLeft: 6, fontWeight: 700, verticalAlign: 'middle' }}><BadgeCheck size={9} /> VERIFIED</span>}
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: T.faint }}>{r.brand ? `${r.brand} · ` : ''}{MK.map((k) => `${round(r[k])}${k[0]}`).join('  ')} · {Math.round(calsFrom(r.protein, r.carbs, r.fat))} kcal / 100 g</div>
                  </div>
                  <Plus size={16} style={{ color: T.lime }} />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-4 gap-2">
          <div><Label>Servings</Label><div className="mt-1"><NumField value={qty} onChange={setQty} align="center" /></div></div>
          {MK.map((k) => (
            <div key={k}>
              <div className="flex items-center gap-1" style={{ height: 13 }}><MIcon k={k} size={10} /><span className="uppercase" style={{ color: T.faint, fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>{MACROS[k].short}</span></div>
              <div className="mt-1"><NumField value={{ protein: p, carbs: c, fat: f }[k]} onChange={{ protein: setP, carbs: setC, fat: setF }[k]} align="center" /></div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <CheckToggle checked={save} onToggle={() => setSave((s) => !s)} label="save to food library" />
        </div>
        <PrimaryBtn onClick={submit} full><Plus size={16} /> Add to list</PrimaryBtn>
        <div className="text-xs" style={{ color: T.faint, marginTop: -2 }}>Macros are per serving.</div>
      </div>
    </Card>
  );
}
function PlanView({ settings, setSettings, plan, setPlan, groceries, setGroceries, pantry, setPantry, foods, recipes, ensureFood, log, meals, onUnknownScan }) {
  const goals = settings.goals;
  const [anchor, setAnchor] = useState(todayISO());
  const [selDate, setSelDate] = useState(todayISO());
  const [pickerFor, setPickerFor] = useState(null); // meal id
  const [expanded, setExpanded] = useState(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genStart, setGenStart] = useState(todayISO());
  const [genDays, setGenDays] = useState(7);
  const [scanOpen, setScanOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const stripTouch = useRef(null);
  const week = weekDates(anchor);
  const goalCals = calsFrom(goals.protein, goals.carbs, goals.fat);
  const dayPlan = useMemo(() => plan.filter((e) => e.date === selDate), [plan, selDate]);
  const dayTotals = useMemo(() => entryMacros(dayPlan), [dayPlan]);
  const dayCals = calsFrom(dayTotals.protein, dayTotals.carbs, dayTotals.fat);
  const addToPlan = (meal, item) => setPlan((p) => [...p, { id: uid(), date: selDate, meal, servings: 1, ...item }]);
  const updPlan = (id, patch) => setPlan((p) => p.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const delPlan = (id) => setPlan((p) => p.filter((e) => e.id !== id));
  const copyDayTo = (targetDates) => {
    setPlan((p) => [...p, ...targetDates.flatMap((d) => dayPlan.map((e) => ({ ...e, id: uid(), date: d })))]);
  };
  /* ingredients-first: the plan is generated FROM the grocery list + pantry */
  const inventory = useMemo(() => [...groceries, ...pantry].map((g) => ({
    name: g.name, category: g.category,
    protein: g.protein, carbs: g.carbs, fat: g.fat,
    qty: g.qty, unitLabel: g.unitLabel || null,
    refId: (foods.find((f) => f.name.trim().toLowerCase() === String(g.name).trim().toLowerCase()) || {}).id || null,
  })), [groceries, pantry, foods]);
  const preview = useMemo(() => {
    if (!genOpen || !(goalCals > 0)) return null;
    return generatePlan({ items: inventory, goals, startDate: genStart, days: Math.max(1, Math.min(14, num(genDays) || 7)), slots: slotsOf(meals), recipes, foods });
  }, [genOpen, goalCals, inventory, goals, genStart, genDays, meals, recipes, foods]);
  const writePlan = () => {
    if (!preview || !preview.entries.length) return;
    const days = Math.max(1, Math.min(14, num(genDays) || 7));
    const end = addDays(genStart, days - 1);
    setPlan((p) => [
      ...p.filter((e) => e.date < genStart || e.date > end),
      ...preview.entries.map((e) => ({ id: uid(), ...e })),
    ]);
    trackOnce('first_plan');
    setGenOpen(false);
    setSelDate(genStart);
    setAnchor(genStart);
  };
  /* checked-off groceries move into the pantry (you own them now) */
  const moveBoughtToPantry = () => {
    const bought = groceries.filter((g) => g.checked);
    if (!bought.length) return;
    setPantry((ps) => {
      const next = [...ps];
      bought.forEach((b) => {
        const i = next.findIndex((p) => p.name.trim().toLowerCase() === b.name.trim().toLowerCase());
        if (i >= 0) next[i] = { ...next[i], qty: round((num(next[i].qty) || 0) + (num(b.qty) || 0)) };
        else next.push({ id: uid(), name: b.name, category: b.category, protein: b.protein, carbs: b.carbs, fat: b.fat, unitLabel: b.unitLabel || null, qty: num(b.qty) || 1 });
      });
      return next;
    });
    setGroceries((gs) => gs.filter((g) => !g.checked));
  };
  const updPantry = (id, patch) => setPantry((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const delPantry = (id) => setPantry((ps) => ps.filter((p) => p.id !== id));
  /* photo of an unlabeled item (deli counter, bakery): same destinations as a
     scan, but the row lands at the item's estimated weight instead of 100g */
  const addPhotoItem = (a, dest) => {
    const t = a.total || {};
    const grams = Math.max(1, Math.round(num(t.grams)) || 100);
    const per100 = (k) => (num(t[k]) / grams) * 100;
    ensureFood({ name: a.name, category: a.category || 'Other', protein: per100('protein'), carbs: per100('carbs'), fat: per100('fat'), fiber: per100('fiber'), sugar: per100('sugar'), unit: 'g100' });
    const row = { id: uid(), name: a.name, category: a.category || 'Other', qty: grams, unitLabel: 'g', protein: num(t.protein) / grams, carbs: num(t.carbs) / grams, fat: num(t.fat) / grams, checked: false, source: 'photo' };
    if (dest === 'pantry') setPantry((ps) => [row, ...ps]);
    else setGroceries((gs) => [row, ...gs]);
  };
  /* scanner: add a scanned product to the list or pantry as a per-100g item */
  const addScanned = (product, dest) => {
    ensureFood({ name: product.name, category: 'Other', protein: product.protein, carbs: product.carbs, fat: product.fat, fiber: product.fiber, sugar: product.sugars, unit: 'g100' });
    const row = { id: uid(), name: product.name, category: 'Other', qty: 100, unitLabel: 'g', protein: product.protein / 100, carbs: product.carbs / 100, fat: product.fat / 100, checked: false, source: 'manual' };
    if (dest === 'pantry') setPantry((ps) => [{ ...row, qty: 100 }, ...ps]);
    else setGroceries((gs) => [row, ...gs]);
  };
  /* food on hand — everything you'd cook from, list plus pantry */
  const onHand = useMemo(() => [...groceries, ...pantry].reduce((a, it) => {
    const q = num(it.qty) || 0;
    a.protein += num(it.protein) * q; a.carbs += num(it.carbs) * q; a.fat += num(it.fat) * q; return a;
  }, { protein: 0, carbs: 0, fat: 0 }), [groceries, pantry]);
  const onHandCals = calsFrom(onHand.protein, onHand.carbs, onHand.fat);
  const daysOfFood = goalCals > 0 ? Math.floor(onHandCals / goalCals) : 0;
  const update = (id, patch) => setGroceries((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const remove = (id) => setGroceries((gs) => gs.filter((g) => g.id !== id));
  const grouped = useMemo(() => { const map = {}; [...groceries].sort((a, b) => (a.checked === b.checked ? 0 : a.checked ? 1 : -1)).forEach((it) => { (map[it.category] = map[it.category] || []).push(it); }); return CATEGORIES.filter((c) => map[c]).map((c) => [c, map[c]]); }, [groceries]);
  const boughtCount = groceries.filter((g) => g.checked).length;
  return (
    <div className="flex flex-col gap-3 fadein">
      {/* week strip — swipe left/right to page weeks */}
      <div className="flex items-center gap-1.5" data-noswipe
        onTouchStart={(e) => { stripTouch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const s = stripTouch.current; stripTouch.current = null;
          if (s == null) return;
          const dx = e.changedTouches[0].clientX - s;
          if (Math.abs(dx) > 50) setAnchor((a) => addDays(a, dx < 0 ? 7 : -7));
        }}>
        <GhostBtn onClick={() => setAnchor((a) => addDays(a, -7))}><ChevronLeft size={16} /></GhostBtn>
        <div className="flex-1 grid grid-cols-7 gap-1">
          {week.map((d) => {
            const es = plan.filter((e) => e.date === d);
            const t = entryMacros(es);
            const sel = d === selDate; const isTod = d === todayISO();
            const dots = MK.map((k) => num(goals[k]) > 0 && t[k] >= num(goals[k]) * 0.9);
            return (
              <button key={d} onClick={() => setSelDate(d)} className="rounded-xl py-1.5 flex flex-col items-center gap-0.5 transition"
                style={{ background: sel ? T.limeDim : T.panel, border: `1px solid ${sel ? 'rgba(203,255,58,0.5)' : isTod ? T.borderHi : T.border}` }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: sel ? T.lime : T.faint, letterSpacing: '0.08em' }}>{fmtDate(d, { weekday: 'short' }).toUpperCase().slice(0, 3)}</span>
                <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: sel ? T.lime : es.length ? T.text : T.faint }}>{es.length || '—'}</span>
                <span className="flex gap-0.5">{MK.map((k, i) => <span key={k} style={{ width: 4, height: 4, borderRadius: 99, background: dots[i] ? MACROS[k].color : T.borderHi }} />)}</span>
              </button>
            );
          })}
        </div>
        <GhostBtn onClick={() => setAnchor((a) => addDays(a, 7))}><ChevronRight size={16} /></GhostBtn>
      </div>
      {/* selected day */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <Label>{fmtDate(selDate, { weekday: 'long', month: 'short', day: 'numeric' })} · planned</Label>
          <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: goalCals > 0 && Math.abs(dayCals - goalCals) <= goalCals * 0.05 ? T.lime : T.muted }}>
            {Math.round(dayCals)} kcal{goalCals > 0 && ` · ${Math.round((dayCals / goalCals) * 100)}%`}
          </span>
        </div>
        {goalCals > 0 && dayPlan.length > 0 && (
          <div className="flex gap-2 mb-2">{MK.map((k) => <div key={k} className="flex-1"><MacroBar k={k} value={dayTotals[k]} goal={num(goals[k])} compact /></div>)}</div>
        )}
        <div className="flex flex-col gap-2 mt-2">
          {groupsOf(meals, dayPlan).map((m) => {
            const es = entriesFor(dayPlan, meals, m.id);
            return (
              <div key={m.id} className="rounded-xl p-2.5" style={{ background: T.bg, border: `1px ${es.length ? 'solid' : 'dashed'} ${T.border}` }}>
                <div className="flex items-center justify-between">
                  <Label style={{ color: T.muted }}>{m.emoji || '🍽️'} {m.label}</Label>
                  <button onClick={() => setPickerFor(m.id)} className="text-xs" style={{ color: T.lime, fontWeight: 700 }}>＋ add</button>
                </div>
                {es.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 min-w-0 text-sm truncate" style={{ fontWeight: 600 }}>{e.refType === 'recipe' ? '🍳 ' : ''}{e.name}</div>
                    <QtyStepper entry={e} onChange={(v) => updPlan(e.id, { servings: v })} servingStep={0.5} />
                    <span style={{ ...mono, fontSize: 11, color: T.faint, width: 52, textAlign: 'right' }}>{Math.round(calsFrom(e.protein, e.carbs, e.fat) * (num(e.servings) || 0))}</span>
                    <button onClick={() => delPlan(e.id)} style={{ color: T.faint }}><X size={14} /></button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {dayPlan.length > 0 && (
          <div className="flex gap-2 mt-3">
            <button onClick={() => copyDayTo(week.filter((d) => d > selDate))} className="flex-1 rounded-lg py-2 text-xs transition" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, fontWeight: 600 }}>Copy to rest of week</button>
            <button onClick={() => copyDayTo([addDays(selDate, 1)])} className="flex-1 rounded-lg py-2 text-xs transition" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, fontWeight: 600 }}>Copy to tomorrow</button>
          </div>
        )}
      </Card>
      <PrimaryBtn onClick={() => setGenOpen(true)} full><Sparkles size={15} /> Generate plan from groceries</PrimaryBtn>
      {/* food on hand — one honest number, list + pantry together */}
      {onHandCals > 0 && (
        <Card style={{ background: `linear-gradient(160deg, ${T.panel}, #101013)` }}>
          <div className="flex items-center gap-2 mb-3"><ShoppingCart size={16} style={{ color: T.lime }} /><Label>Food on hand</Label></div>
          <div className="flex items-end justify-between">
            <div>
              <div style={{ ...display, fontSize: 34, color: T.text, lineHeight: 1 }}>{Math.round(onHandCals).toLocaleString()}</div>
              <div className="text-xs mt-0.5" style={{ color: T.faint }}>kcal across your list and pantry</div>
            </div>
            {goalCals > 0 && (
              <div className="text-right">
                <div style={{ ...mono, fontSize: 18, color: T.lime, fontWeight: 700 }}>~{daysOfFood}</div>
                <div className="text-xs" style={{ color: T.faint }}>day{daysOfFood === 1 ? '' : 's'} of eating</div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: `1px solid ${T.border}`, ...mono, fontSize: 11 }}>
            {MK.map((k) => <span key={k} style={{ color: MACROS[k].color }}>{Math.round(onHand[k])}g {k}</span>)}
          </div>
        </Card>
      )}
      <AddGrocery onAdd={(item) => setGroceries((gs) => [item, ...gs])} foods={foods} ensureFood={ensureFood} />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Label>Shopping list · {groceries.length} item{groceries.length === 1 ? '' : 's'}</Label>
            <button onClick={() => setScanOpen(true)} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition" style={{ background: T.limeDim, border: '1px solid rgba(203,255,58,0.35)', color: T.lime, fontWeight: 700 }}><ScanLine size={12} /> scan</button>
          </div>
          {boughtCount > 0 && <button onClick={moveBoughtToPantry} className="flex items-center gap-1 text-xs transition" style={{ color: T.faint }}><Package size={12} /> move {boughtCount} bought to pantry</button>}
        </div>
        {groceries.length === 0 && <EmptyCard Icon={ShoppingCart} text="List is empty. Add items above, or scan barcodes at the store." />}
        {grouped.map(([cat, items]) => (
          <div key={cat}>
            <div className="px-1 mb-1.5"><Label>{cat}</Label></div>
            <div className="flex flex-col gap-1.5">
              {items.map((it) => {
                const q = num(it.qty) || 0; const isOpen = expanded === it.id;
                return (
                  <div key={it.id} className="rounded-xl overflow-hidden" style={{ background: T.panel, border: `1px solid ${isOpen ? T.borderHi : T.border}`, opacity: it.checked ? 0.5 : 1, transition: 'opacity .2s' }}>
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <button onClick={() => update(it.id, { checked: !it.checked })} className="flex items-center justify-center rounded-md shrink-0 transition" style={{ width: 22, height: 22, border: `1.5px solid ${it.checked ? T.lime : T.borderHi}`, background: it.checked ? T.lime : 'transparent' }}>{it.checked && <Check size={14} style={{ color: '#0c0c0e' }} strokeWidth={3} />}</button>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(isOpen ? null : it.id)}>
                        <div className="text-sm truncate" style={{ color: T.text, fontWeight: 600, textDecoration: it.checked ? 'line-through' : 'none' }}>
                          {it.name} {it.unitLabel === 'g' ? <span style={{ color: T.faint, fontWeight: 500 }}>{round(q)} g</span> : q !== 1 && <span style={{ color: T.faint, fontWeight: 500 }}>×{round(q)}</span>}
                          {it.source === 'generated' && <span style={{ fontSize: 9, color: T.lime, background: T.limeDim, borderRadius: 5, padding: '1px 5px', marginLeft: 6, fontWeight: 700 }}>PLAN</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5" style={{ ...mono, fontSize: 11 }}>{MK.map((k) => <span key={k} style={{ color: MACROS[k].color }}>{round(num(it[k]) * q)}{k[0]}</span>)}<span style={{ color: T.faint }}>· {Math.round(calsFrom(it.protein, it.carbs, it.fat) * q)} kcal</span></div>
                      </div>
                      <button onClick={() => setExpanded(isOpen ? null : it.id)} className="shrink-0 transition" style={{ color: T.faint, transform: isOpen ? 'rotate(180deg)' : 'none' }}><ChevronDown size={18} /></button>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-1" style={{ borderTop: `1px solid ${T.border}` }}>
                        <div className="mb-2 mt-2"><TextField value={it.name} onChange={(v) => update(it.id, { name: v })} placeholder="Name" /></div>
                        <div className="grid grid-cols-4 gap-2">
                          <div><Label>{it.unitLabel === 'g' ? 'Grams' : 'Servings'}</Label><div className="mt-1"><NumField value={it.qty} onChange={(v) => update(it.id, { qty: v })} align="center" /></div></div>
                          {MK.map((k) => <div key={k}><div style={{ height: 13 }}><span className="uppercase" style={{ color: T.faint, fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>{MACROS[k].short}</span></div><div className="mt-1"><NumField value={it[k]} onChange={(v) => update(it.id, { [k]: v })} align="center" /></div></div>)}
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <Select value={it.category} onChange={(v) => update(it.id, { category: v })} options={CATEGORIES} />
                          <GhostBtn danger onClick={() => remove(it.id)}><Trash2 size={15} /></GhostBtn>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {/* pantry */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <Label>Pantry · {pantry.length} item{pantry.length === 1 ? '' : 's'}</Label>
        </div>
        {pantry.length === 0 ? (
          <EmptyCard Icon={Package} text="Nothing in the pantry. Check off groceries and move them here — the plan generator cooks from both." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {pantry.map((it) => {
              const q = num(it.qty) || 0;
              return (
                <div key={it.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: T.panel, border: `1px solid ${T.border}` }}>
                  <Package size={15} style={{ color: T.faint, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: T.text, fontWeight: 600 }}>{it.name} <span style={{ color: T.faint, fontWeight: 500 }}>{it.unitLabel === 'g' ? `${round(q)} g` : `×${round(q)}`}</span></div>
                    <div style={{ ...mono, fontSize: 11, color: T.faint }}>{MK.map((k) => `${round(num(it[k]) * q)}${k[0]}`).join('  ')} · {Math.round(calsFrom(it.protein, it.carbs, it.fat) * q)} kcal</div>
                  </div>
                  <QtyStepper entry={{ servings: it.qty, unitLabel: it.unitLabel }} onChange={(v) => updPantry(it.id, { qty: v })} />
                  <button onClick={() => delPantry(it.id)} className="flex items-center justify-center shrink-0 transition" style={{ width: 24, height: 28, color: T.faint }}><X size={14} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PlanMealPicker open={!!pickerFor} onClose={() => setPickerFor(null)} foods={foods} recipes={recipes} onPick={(item) => { addToPlan(pickerFor, item); }} />
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate plan" icon={<Sparkles size={16} style={{ color: T.lime }} />}>
        {!(goalCals > 0) && (
          <div className="rounded-xl p-3.5 mb-3" style={{ background: 'linear-gradient(135deg, rgba(255,122,69,0.12), #141418)', border: '1px solid rgba(255,122,69,0.45)' }}>
            <div className="text-sm mb-1" style={{ fontWeight: 700 }}>Set your daily targets first</div>
            <div className="text-xs" style={{ color: T.muted, lineHeight: 1.55 }}>
              Planning works backwards from the macros you're aiming at — without them there's nothing to build toward. Head to <b style={{ color: T.text }}>Coach</b> and set them (or run the goal wizard); this takes about thirty seconds, then come back.
            </div>
          </div>
        )}
        <div className="text-xs mb-3" style={{ color: T.muted, lineHeight: 1.5 }}>Builds your meal plan from what's on the grocery list and in the pantry, aiming at your daily targets across {meals.length} meal{meals.length === 1 ? '' : 's'} a day. Recipes you can actually cook come first; loose ingredients fill the gaps.</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div><Label>Start</Label><input type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none mt-1" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, ...mono }} /></div>
          <div><Label>Days</Label><div className="mt-1"><NumField value={genDays} onChange={setGenDays} align="center" /></div></div>
        </div>
        {preview && (
          <div className="rounded-xl p-3 mb-3" style={{ background: T.bg, border: `1px solid ${T.borderHi}` }}>
            {preview.entries.length === 0 ? (
              <div className="text-xs" style={{ color: T.faint }}>Nothing to cook with yet — add groceries (or scan some) first.</div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <Label>Preview</Label>
                  <span style={{ ...mono, fontSize: 12, color: preview.daysCovered >= num(genDays) ? T.lime : T.orange, fontWeight: 700 }}>covers ~{preview.daysCovered}/{num(genDays) || 7} days</span>
                </div>
                <div className="flex flex-col gap-2 mb-1">{MK.map((k) => <MacroBar key={k} k={k} value={preview.planned[k]} goal={preview.target[k]} compact />)}</div>
                {(preview.shortfall.protein > 0 || preview.shortfall.carbs > 0 || preview.shortfall.fat > 0) && (
                  <div className="text-xs mt-2" style={{ color: T.orange }}>
                    Short {MK.filter((k) => preview.shortfall[k] > 0).map((k) => `${Math.round(preview.shortfall[k])}g ${k}`).join(', ')} for the range — worth another store run.
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <PrimaryBtn onClick={writePlan} full dim={!preview || !preview.entries.length}><Sparkles size={15} /> Write it to the plan</PrimaryBtn>
        <div className="text-xs mt-2" style={{ color: T.faint }}>Replaces existing planned meals in the range. Tweak any day afterwards.</div>
      </Modal>
      {scanOpen && (
        <Suspense fallback={null}>
          <Scanner open={scanOpen} onClose={() => setScanOpen(false)} goals={goals} list={[...groceries, ...pantry]} mealsPerDay={meals.length} onAdd={addScanned} onUnknown={onUnknownScan} onPhoto={() => { setScanOpen(false); setPhotoOpen(true); }} />
        </Suspense>
      )}
      {photoOpen && (
        <Suspense fallback={null}>
          <PhotoSnap open={photoOpen} onClose={() => setPhotoOpen(false)} mode="item" goals={goals} list={[...groceries, ...pantry]} mealsPerDay={meals.length} onAddItem={addPhotoItem} />
        </Suspense>
      )}
    </div>
  );
}

/* ---------------- TRAIN ---------------- */
function RestTimer({ autoKey, autoSeconds }) {
  const [dur, setDur] = useState(90);
  const [left, setLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => { setLeft((l) => { if (l <= 1) { clearInterval(ref.current); setRunning(false); setDone(true); beep(); return 0; } return l - 1; }); }, 1000);
    }
    return () => clearInterval(ref.current);
  }, [running]);
  const start = (s) => { setDur(s); setLeft(s); setRunning(true); setDone(false); };
  useEffect(() => { if (autoKey) start(autoSeconds || 90); }, [autoKey]); // auto-start on set completion
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const pct = dur > 0 ? (left / dur) * 100 : 0;
  const active = left > 0 || running;
  return (
    <Card style={{ borderColor: running ? T.lime : (done ? T.orange : T.border), transition: 'border-color .3s' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><div style={{ position: 'relative', width: 8, height: 8 }}><span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: running ? T.lime : (done ? T.orange : T.faint), animation: running ? 'pulse 1s infinite' : 'none' }} /></div><Label>Rest timer{autoKey ? ' · auto' : ''}</Label></div>
        <div style={{ ...mono, fontSize: 28, color: done ? T.orange : (active ? T.lime : T.muted), fontWeight: 700, lineHeight: 1 }}>{mmss(active ? left : dur)}</div>
      </div>
      <div className="rounded-full overflow-hidden my-3" style={{ height: 5, background: T.panel2 }}><div style={{ height: '100%', width: `${active ? pct : 0}%`, background: running ? T.lime : T.orange, transition: 'width 1s linear' }} /></div>
      <div className="flex items-center gap-1.5">
        {[60, 90, 120, 180].map((s) => (
          <button key={s} onClick={() => start(s)} className="flex-1 rounded-lg py-1.5 text-xs transition" style={{ background: dur === s && active ? T.limeDim : T.panel2, border: `1px solid ${dur === s && active ? T.lime : T.border}`, color: dur === s && active ? T.lime : T.muted, ...mono, fontWeight: 600 }}>{s}s</button>
        ))}
        <button onClick={() => setRunning((r) => !r)} disabled={left === 0 && !running} className="flex items-center justify-center rounded-lg transition" style={{ width: 36, height: 32, background: T.panel2, border: `1px solid ${T.border}`, color: left === 0 && !running ? T.faint : T.text }}>{running ? <Pause size={15} /> : <Play size={15} />}</button>
        <button onClick={() => { setRunning(false); setLeft(0); setDone(false); }} className="flex items-center justify-center rounded-lg transition" style={{ width: 36, height: 32, background: T.panel2, border: `1px solid ${T.border}`, color: T.muted }}><RotateCcw size={14} /></button>
      </div>
    </Card>
  );
}
function AddExercise({ onAdd }) {
  const [name, setName] = useState('');
  const submit = () => { if (!name.trim()) return; onAdd(name.trim()); setName(''); };
  return (
    <div className="flex gap-2 mt-2.5">
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Add exercise…"
        className="flex-1 rounded-lg px-2.5 py-2 text-sm outline-none transition" style={{ background: T.panel2, border: `1px dashed ${T.borderHi}`, color: T.text }}
        onFocus={(e) => (e.target.style.borderColor = T.lime)} onBlur={(e) => (e.target.style.borderColor = T.borderHi)} />
      <button onClick={submit} className="flex items-center justify-center rounded-lg shrink-0 transition" style={{ width: 38, background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime }}><Plus size={18} /></button>
    </div>
  );
}
/* exercise history across workouts, oldest → newest */
function exerciseHistory(workouts, name) {
  const nm = name.trim().toLowerCase();
  return [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1)).map((w) => {
    const ex = (w.exercises || []).find((e) => (e.name || '').trim().toLowerCase() === nm);
    if (!ex) return null;
    const best = (ex.sets || []).reduce((m, st) => Math.max(m, e1rm(st.weight, st.reps)), 0);
    const vol = (ex.sets || []).reduce((s, st) => s + num(st.weight) * num(st.reps), 0);
    return { date: w.date, best, vol, sets: ex.sets || [] };
  }).filter(Boolean).filter((h) => h.best > 0 || h.vol > 0);
}
function Sparkline({ points, color, width = 88, height = 24 }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const xs = points.map((p, i) => [ (i / (points.length - 1)) * (width - 8) + 4, height - 4 - ((p - min) / span) * (height - 8) ]);
  const d = xs.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join(' ');
  const [lx, ly] = xs[xs.length - 1];
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.8" fill={color} />
    </svg>
  );
}
function ExerciseHistoryModal({ open, onClose, name, workouts, unit }) {
  const hist = useMemo(() => (name ? exerciseHistory(workouts, name) : []), [name, workouts]);
  const data = hist.map((h) => ({ label: fmtDate(h.date, { month: 'numeric', day: 'numeric' }), best: Math.round(h.best), vol: Math.round(h.vol) }));
  return (
    <Modal open={open} onClose={onClose} title={name || 'History'} icon={<History size={16} style={{ color: T.lime }} />} maxW={480}>
      {hist.length < 2 ? <div className="text-sm text-center py-6" style={{ color: T.faint }}>Log this exercise in at least two sessions to see progression.</div> : (
        <>
          <Label style={{ marginBottom: 6 }}>Estimated 1RM by session</Label>
          <Suspense fallback={<ChartSkeleton height={160} />}><E1rmChart data={data} unit={unit} /></Suspense>
          <div className="flex flex-col gap-1.5 mt-3">
            {[...hist].reverse().slice(0, 8).map((h) => (
              <div key={h.date} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                <span className="text-xs" style={{ color: T.muted }}>{fmtDate(h.date)}</span>
                <span style={{ ...mono, fontSize: 11, color: T.faint }}>{h.sets.map((s) => `${num(s.weight)}×${num(s.reps)}`).join('  ')}</span>
                <span style={{ ...mono, fontSize: 12, color: T.orange, fontWeight: 700 }}>{Math.round(h.best)} {unit}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
function TrainView({ workouts, setWorkouts, routines, setRoutines, unit, setUnit }) {
  const [open, setOpen] = useState(() => new Set());
  const [pr, setPr] = useState(null); // {name, value, prev}
  const [autoRest, setAutoRest] = useState(null); // {key, seconds}
  const [histFor, setHistFor] = useState(null);
  const sorted = useMemo(() => [...workouts].sort((a, b) => (a.date < b.date ? 1 : -1)), [workouts]);
  const exVolume = (ex) => (ex.sets || []).reduce((s, st) => s + num(st.weight) * num(st.reps), 0);
  const woVolume = (w) => (w.exercises || []).reduce((s, ex) => s + exVolume(ex), 0);
  const woSets = (w) => (w.exercises || []).reduce((s, ex) => s + (ex.sets || []).length, 0);
  const stats = useMemo(() => {
    const weekAgo = addDays(todayISO(), -6);
    const thisWeek = workouts.filter((w) => w.date >= weekAgo).length;
    const totalVol = workouts.reduce((s, w) => s + woVolume(w), 0);
    return { total: workouts.length, thisWeek, totalVol };
  }, [workouts]);
  /* all-time best e1RM per exercise, excluding a given workout */
  const bestBefore = (name, excludeWid) => {
    const nm = name.trim().toLowerCase(); let best = 0;
    workouts.forEach((w) => { if (w.id === excludeWid) return; (w.exercises || []).forEach((ex) => { if ((ex.name || '').trim().toLowerCase() !== nm) return; (ex.sets || []).forEach((st) => { best = Math.max(best, e1rm(st.weight, st.reps)); }); }); });
    return best;
  };
  const addWorkout = (fromRoutine) => {
    let exercises = [];
    if (fromRoutine) {
      exercises = fromRoutine.exercises.map((re) => {
        const hist = exerciseHistory(workouts, re.name);
        const last = hist[hist.length - 1];
        const prevSets = last ? last.sets : [];
        const n = Math.max(re.sets || 3, prevSets.length || 0);
        return { id: uid(), name: re.name, rest: re.rest || 90, sets: Array.from({ length: n }, (_, i) => ({ id: uid(), weight: prevSets[i] ? String(prevSets[i].weight) : '', reps: prevSets[i] ? String(prevSets[i].reps) : '', done: false, prevWeight: prevSets[i] ? prevSets[i].weight : null, prevReps: prevSets[i] ? prevSets[i].reps : null })) };
      });
    }
    const w = { id: uid(), date: todayISO(), title: fromRoutine ? fromRoutine.name : '', routineId: fromRoutine ? fromRoutine.id : null, exercises };
    setWorkouts((ws) => [w, ...ws]);
    setOpen((s) => new Set(s).add(w.id));
  };
  const upd = (id, patch) => setWorkouts((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const del = (id) => setWorkouts((ws) => ws.filter((w) => w.id !== id));
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addExercise = (wid, name) => { const w = workouts.find((x) => x.id === wid); upd(wid, { exercises: [...(w?.exercises || []), { id: uid(), name, rest: 90, sets: [{ id: uid(), weight: '', reps: '', done: false }] }] }); };
  const updExercise = (wid, eid, patch) => { const w = workouts.find((x) => x.id === wid); upd(wid, { exercises: w.exercises.map((e) => (e.id === eid ? { ...e, ...patch } : e)) }); };
  const delExercise = (wid, eid) => { const w = workouts.find((x) => x.id === wid); upd(wid, { exercises: w.exercises.filter((e) => e.id !== eid) }); };
  const addSet = (wid, eid) => { const w = workouts.find((x) => x.id === wid); const e = w.exercises.find((x) => x.id === eid); const last = e.sets[e.sets.length - 1]; updExercise(wid, eid, { sets: [...e.sets, { id: uid(), weight: last ? last.weight : '', reps: last ? last.reps : '', done: false }] }); };
  const updSet = (wid, eid, sid, patch) => { const w = workouts.find((x) => x.id === wid); const e = w.exercises.find((x) => x.id === eid); updExercise(wid, eid, { sets: e.sets.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }); };
  const delSet = (wid, eid, sid) => { const w = workouts.find((x) => x.id === wid); const e = w.exercises.find((x) => x.id === eid); updExercise(wid, eid, { sets: e.sets.filter((s) => s.id !== sid) }); };
  const toggleDone = (wid, eid, sid) => {
    const w = workouts.find((x) => x.id === wid); const ex = w.exercises.find((x) => x.id === eid); const st = ex.sets.find((s) => s.id === sid);
    const nowDone = !st.done;
    updSet(wid, eid, sid, { done: nowDone });
    if (nowDone) {
      setAutoRest({ key: uid(), seconds: num(ex.rest) || 90 });
      const val = e1rm(st.weight, st.reps);
      if (val > 0 && ex.name && ex.name.trim()) {
        const others = (ex.sets || []).filter((s) => s.id !== sid).reduce((m, s) => Math.max(m, s.done ? e1rm(s.weight, s.reps) : 0), 0);
        const prev = Math.max(bestBefore(ex.name, null) === 0 ? 0 : bestBefore(ex.name, wid), others);
        if (val > prev && prev > 0) setPr({ name: ex.name, value: Math.round(val), prev: Math.round(prev) });
      }
    }
  };
  const saveAsRoutine = (w) => {
    if (!(w.exercises || []).length) return;
    const r = { id: uid(), name: w.title || `Routine ${routines.length + 1}`, exercises: w.exercises.map((ex) => ({ name: ex.name, sets: (ex.sets || []).length || 3, rest: num(ex.rest) || 90 })) };
    setRoutines((rs) => [r, ...rs]);
  };
  const routineMeta = (r) => {
    const last = sorted.find((w) => w.routineId === r.id || (w.title || '').trim().toLowerCase() === r.name.trim().toLowerCase());
    return last ? `last: ${fmtDate(last.date, { month: 'short', day: 'numeric' })}` : 'never run';
  };
  const lastRunVolume = (w) => {
    if (!w.routineId) return null;
    const prev = sorted.find((x) => x.id !== w.id && x.routineId === w.routineId && x.date <= w.date);
    return prev ? woVolume(prev) : null;
  };
  return (
    <div className="flex flex-col gap-3 fadein">
      {pr && (
        <div className="rounded-2xl px-3.5 py-3 flex items-start gap-2.5 fadein" style={{ background: 'linear-gradient(135deg, rgba(255,122,69,0.16), #141418)', border: '1px solid rgba(255,122,69,0.5)' }}>
          <Trophy size={16} style={{ color: T.orange, marginTop: 1, flexShrink: 0 }} />
          <div className="text-xs flex-1" style={{ color: T.muted, lineHeight: 1.5 }}>
            <b style={{ color: T.text }}>New PR — {pr.name}.</b> <span style={{ ...mono, color: T.orange, fontWeight: 700 }}>{pr.value} {unit} e1RM</span> (+{pr.value - pr.prev} over your previous best).
          </div>
          <button onClick={() => setPr(null)} style={{ color: T.faint }}><X size={14} /></button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2.5">
        {[{ label: 'Workouts', value: stats.total, sub: 'logged', Icon: ClipboardList }, { label: 'This week', value: stats.thisWeek, sub: 'sessions', Icon: TrendingUp }, { label: 'Volume', value: stats.totalVol >= 1000 ? round(stats.totalVol / 1000) + 'k' : Math.round(stats.totalVol), sub: 'all-time ' + unit, Icon: Dumbbell }].map((s) => (
          <Card key={s.label} style={{ padding: 14 }}><s.Icon size={15} style={{ color: T.lime }} /><div style={{ ...display, fontSize: 26, color: T.text, lineHeight: 1.1, marginTop: 6 }}>{s.value}</div><div className="text-xs" style={{ color: T.faint }}>{s.sub}</div></Card>
        ))}
      </div>
      {routines.length > 0 && (
        <div>
          <div className="px-1 mb-1.5"><Label>Routines</Label></div>
          <div className="grid grid-cols-2 gap-2">
            {routines.map((r) => (
              <Card key={r.id} style={{ padding: 12, marginBottom: 0 }}>
                <div className="flex items-start justify-between">
                  <div className="text-sm" style={{ fontWeight: 700 }}>{r.name}</div>
                  <button onClick={() => setRoutines((rs) => rs.filter((x) => x.id !== r.id))} style={{ color: T.faint }}><X size={13} /></button>
                </div>
                <div className="text-xs mt-0.5 mb-2" style={{ color: T.faint }}>{r.exercises.length} exercises · {routineMeta(r)}</div>
                <button onClick={() => addWorkout(r)} className="w-full flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs transition" style={{ background: T.limeDim, border: `1px solid rgba(203,255,58,0.35)`, color: T.lime, fontWeight: 700 }}><Play size={12} /> Start</button>
              </Card>
            ))}
          </div>
        </div>
      )}
      <RestTimer autoKey={autoRest?.key} autoSeconds={autoRest?.seconds} />
      <div className="flex items-center gap-2">
        <PrimaryBtn onClick={() => addWorkout(null)} full><Plus size={16} /> Log a workout</PrimaryBtn>
        <button onClick={() => setUnit(unit === 'lb' ? 'kg' : 'lb')} className="rounded-xl px-3.5 py-2.5 text-sm transition shrink-0" style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.muted, ...mono, fontWeight: 600 }}>{unit}</button>
      </div>
      {workouts.length === 0 && <EmptyCard Icon={Dumbbell} text="No workouts yet. Log one, then save it as a routine to get pre-filled sessions with your last weights." />}
      <div className="flex flex-col gap-2.5">
        {sorted.map((w) => {
          const isOpen = open.has(w.id); const vol = woVolume(w); const prevVol = lastRunVolume(w);
          return (
            <div key={w.id} className="rounded-2xl overflow-hidden" style={{ background: T.panel, border: `1px solid ${isOpen ? T.borderHi : T.border}` }}>
              <div className="flex items-center gap-3 px-3.5 py-3 cursor-pointer" onClick={() => toggle(w.id)}>
                <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 42, height: 42, background: T.limeDim, border: `1px solid ${T.border}` }}><Dumbbell size={18} style={{ color: T.lime }} /></div>
                <div className="flex-1 min-w-0"><div className="text-sm truncate" style={{ color: T.text, fontWeight: 700 }}>{w.title || 'Untitled session'}</div><div className="text-xs mt-0.5" style={{ color: T.faint }}>{fmtDate(w.date)} · {(w.exercises || []).length} exercises · {woSets(w)} sets</div></div>
                <div className="text-right shrink-0">
                  <div style={{ ...mono, fontSize: 14, color: T.lime, fontWeight: 700 }}>{vol >= 1000 ? round(vol / 1000) + 'k' : Math.round(vol)}</div>
                  <div className="text-xs" style={{ color: T.faint }}>{prevVol != null && prevVol > 0 ? <span style={{ color: vol >= prevVol ? T.lime : T.orange }}>{vol >= prevVol ? '+' : ''}{Math.round(((vol - prevVol) / prevVol) * 100)}% vs last</span> : `${unit} vol`}</div>
                </div>
                <ChevronDown size={18} style={{ color: T.faint, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </div>
              {isOpen && (
                <div className="px-3.5 pb-3.5" style={{ borderTop: `1px solid ${T.border}` }}>
                  <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
                    <div><Label>Date</Label><input type="date" value={w.date} onChange={(e) => upd(w.id, { date: e.target.value })} className="w-full rounded-lg px-2.5 py-1.5 text-sm outline-none mt-1" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, ...mono }} /></div>
                    <div><Label>Title</Label><div className="mt-1"><TextField value={w.title} onChange={(v) => upd(w.id, { title: v })} placeholder="Push day" /></div></div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {(w.exercises || []).map((ex) => {
                      const hist = exerciseHistory(workouts, ex.name || '');
                      const spark = hist.map((h) => h.best).slice(-8);
                      return (
                        <div key={ex.id} className="rounded-xl p-2.5" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                          <div className="flex items-center gap-2 mb-1">
                            <input type="text" value={ex.name} onChange={(e) => updExercise(w.id, ex.id, { name: e.target.value })} placeholder="Exercise name" className="flex-1 rounded-lg px-2.5 py-1.5 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, fontWeight: 600, minWidth: 0 }} />
                            {spark.length >= 2 && <button onClick={() => setHistFor(ex.name)} title="History"><Sparkline points={spark} color={T.orange} /></button>}
                            <GhostBtn danger onClick={() => delExercise(w.id, ex.id)}><Trash2 size={15} /></GhostBtn>
                          </div>
                          <div className="flex items-center gap-2 px-1 mb-1" style={{ marginTop: 6 }}>
                            <span style={{ width: 26 }} /><span style={{ width: 64 }}><Label>Prev</Label></span><span className="flex-1"><Label>{unit}</Label></span><span className="flex-1"><Label>Reps</Label></span><span style={{ width: 58 }} />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {(ex.sets || []).map((st, i) => (
                              <div key={st.id} className="flex items-center gap-2">
                                <span className="flex items-center justify-center rounded-md shrink-0" style={{ width: 26, height: 30, background: T.panel2, color: T.faint, ...mono, fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                                <span style={{ width: 64, ...mono, fontSize: 10.5, color: T.faint }}>{st.prevWeight != null ? `${st.prevWeight}×${st.prevReps}` : '—'}</span>
                                <div className="flex-1"><NumField value={st.weight} onChange={(v) => updSet(w.id, ex.id, st.id, { weight: v })} align="center" /></div>
                                <div className="flex-1"><NumField value={st.reps} onChange={(v) => updSet(w.id, ex.id, st.id, { reps: v })} align="center" /></div>
                                <button onClick={() => toggleDone(w.id, ex.id, st.id)} className="flex items-center justify-center rounded-md shrink-0 transition" style={{ width: 28, height: 28, border: `1.5px solid ${st.done ? T.lime : T.borderHi}`, background: st.done ? T.lime : 'transparent' }}>{st.done && <Check size={14} style={{ color: '#0c0c0e' }} strokeWidth={3} />}</button>
                                <button onClick={() => delSet(w.id, ex.id, st.id)} className="flex items-center justify-center shrink-0 transition" style={{ width: 24, height: 28, color: T.faint }}><X size={14} /></button>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-3">
                              <button onClick={() => addSet(w.id, ex.id)} className="flex items-center gap-1 text-xs transition" style={{ color: T.lime, fontWeight: 600 }}><Plus size={13} /> add set</button>
                              <span className="flex items-center gap-1 text-xs" style={{ color: T.faint }}>rest <input type="number" value={ex.rest ?? 90} onChange={(e) => updExercise(w.id, ex.id, { rest: e.target.value })} className="text-center outline-none rounded" style={{ width: 40, background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, ...mono, fontSize: 11 }} />s</span>
                            </div>
                            <div className="flex items-center gap-3" style={{ ...mono, fontSize: 11 }}>
                              {(() => { const b = (ex.sets || []).reduce((m, st) => Math.max(m, e1rm(st.weight, st.reps)), 0); return b > 0 ? <span style={{ color: T.orange }}>~{Math.round(b)} {unit} 1RM</span> : null; })()}
                              <span style={{ color: T.faint }}>{Math.round(exVolume(ex))} {unit} vol</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <AddExercise onAdd={(name) => addExercise(w.id, name)} />
                  <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
                    <span style={{ ...mono, fontSize: 12, color: T.muted }}>{woSets(w)} sets · {Math.round(vol)} {unit}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveAsRoutine(w)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, fontWeight: 600 }}><ClipboardList size={12} /> Save as routine</button>
                      <GhostBtn danger onClick={() => del(w.id)}><Trash2 size={15} /></GhostBtn>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ExerciseHistoryModal open={!!histFor} onClose={() => setHistFor(null)} name={histFor} workouts={workouts} unit={unit} />
    </div>
  );
}

/* ---------------- COACH ---------------- */
function GoalWizard({ open, onClose, settings, setSettings, seedTdee }) {
  const p = settings.profile || {};
  const [sex, setSex] = useState(p.sex || 'male');
  const [age, setAge] = useState(p.age || '');
  const [heightCm, setHeightCm] = useState(p.heightCm || '');
  const [weight, setWeight] = useState(p.weight || '');
  const [activity, setActivity] = useState(p.activity || 1.55);
  const [goalType, setGoalType] = useState(settings.coach?.goalType || 'cut');
  const [rate, setRate] = useState(settings.coach?.rate ?? (settings.unit === 'kg' ? 0.45 : 1));
  const unit = settings.unit || 'lb';
  const tdee = seedTdee || mifflin({ sex, age, heightCm, weight, unit, activity });
  const sugg = tdee > 0 && num(weight) > 0 ? suggestMacros({ tdee, goalType, rate, trendWeight: num(weight), unit }) : null;
  const apply = () => {
    if (!sugg) return;
    setSettings((s) => ({
      ...s,
      profile: { sex, age, heightCm, weight, activity },
      coach: { goalType, rate },
      goalMode: 'coached',
      goals: { protein: String(sugg.protein), carbs: String(sugg.carbs), fat: String(sugg.fat) },
    }));
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Goal wizard" icon={<Target size={16} style={{ color: T.lime }} />}>
      <div className="text-xs mb-3" style={{ color: T.muted, lineHeight: 1.5 }}>
        {seedTdee ? <>Using your <b style={{ color: T.lime }}>measured TDEE ({seedTdee} kcal)</b> from logged data.</> : <>Seeds targets with the Mifflin-St Jeor estimate. Once you've logged ~2 weeks of food + weigh-ins, the adaptive engine takes over with your <i>measured</i> TDEE.</>}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div><Label>Sex</Label><div className="mt-1"><Select value={sex} onChange={setSex} options={['male', 'female']} labels={['Male', 'Female']} /></div></div>
        <div><Label>Age</Label><div className="mt-1"><NumField value={age} onChange={setAge} align="center" /></div></div>
        <div><Label>Height (cm)</Label><div className="mt-1"><NumField value={heightCm} onChange={setHeightCm} align="center" /></div></div>
        <div><Label>Weight ({unit})</Label><div className="mt-1"><NumField value={weight} onChange={setWeight} align="center" /></div></div>
      </div>
      <div className="mb-2"><Label>Activity</Label><div className="mt-1"><Select value={activity} onChange={(v) => setActivity(num(v))} options={ACTIVITY.map((a) => a.id)} labels={ACTIVITY.map((a) => a.label)} /></div></div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div><Label>Goal</Label><div className="mt-1"><Select value={goalType} onChange={setGoalType} options={['cut', 'maintain', 'gain']} labels={['Cut (lose)', 'Maintain', 'Gain (build)']} /></div></div>
        <div><Label>Rate ({unit}/week)</Label><div className="mt-1"><NumField value={rate} onChange={setRate} align="center" /></div></div>
      </div>
      {sugg ? (
        <div className="rounded-xl p-3 mb-3" style={{ background: T.bg, border: `1px solid ${T.borderHi}` }}>
          <div className="flex items-center justify-between mb-2">
            <Label>Suggested targets</Label>
            <span style={{ ...mono, fontSize: 14, color: T.lime, fontWeight: 700 }}>{sugg.kcal} kcal</span>
          </div>
          <div className="flex items-center justify-between" style={{ ...mono, fontSize: 12 }}>
            <span style={{ color: MACROS.protein.color }}>{sugg.protein}g protein</span>
            <span style={{ color: MACROS.carbs.color }}>{sugg.carbs}g carbs</span>
            <span style={{ color: MACROS.fat.color }}>{sugg.fat}g fat</span>
          </div>
          <div className="text-xs mt-2" style={{ color: T.faint }}>Protein {unit === 'kg' ? '2.2g/kg' : '1g/lb'} bodyweight · fat 25% kcal · carbs fill the rest.</div>
        </div>
      ) : <div className="text-xs mb-3" style={{ color: T.faint }}>Fill everything in to see suggested targets.</div>}
      <PrimaryBtn onClick={apply} full><Check size={15} /> Apply targets</PrimaryBtn>
    </Modal>
  );
}
function CoachView({ settings, setSettings, log, workouts, weights, setWeights }) {
  const goals = settings.goals;
  const unit = settings.unit || 'lb';
  const [wizard, setWizard] = useState(false);
  const [range, setRange] = useState(14);
  const [wInput, setWInput] = useState('');
  const goalCals = calsFrom(goals.protein, goals.carbs, goals.fat);
  const trend = useMemo(() => weightTrend(weights), [weights]);
  const todayW = weights.find((w) => w.date === todayISO());
  const tdee = useMemo(() => computeTDEE({ log, weights, unit }), [log, weights, unit]);
  const currentTrendW = trend.length ? trend[trend.length - 1].trend : (settings.profile?.weight || 0);
  const effectiveTdee = tdee.ok ? tdee.tdee : mifflin({ ...(settings.profile || {}), weight: settings.profile?.weight, unit, activity: settings.profile?.activity });
  const coach = settings.coach || {};
  const sugg = effectiveTdee > 0 && num(currentTrendW) > 0 ? suggestMacros({ tdee: effectiveTdee, goalType: coach.goalType || 'maintain', rate: coach.rate || 0, trendWeight: currentTrendW, unit }) : null;
  const paceActual = useMemo(() => {
    if (trend.length < 2) return null;
    const last14 = trend.filter((t) => t.date >= addDays(todayISO(), -14));
    if (last14.length < 2) return null;
    const span = Math.max(1, daysBetween(last14[0].date, last14[last14.length - 1].date));
    return round(((last14[last14.length - 1].trend - last14[0].trend) / span) * 7);
  }, [trend]);
  const logWeight = () => {
    const v = num(wInput); if (!(v > 0)) return;
    setWeights((ws) => [...ws.filter((w) => w.date !== todayISO()), { id: uid(), date: todayISO(), weight: v }]);
    setWInput('');
  };
  /* charts data */
  const wData = useMemo(() => {
    const days = 30; const start = addDays(todayISO(), -(days - 1));
    return trend.filter((t) => t.date >= start).map((t) => ({ label: fmtDate(t.date, { month: 'numeric', day: 'numeric' }), raw: t.weight, trend: t.trend }));
  }, [trend]);
  const wDelta = wData.length >= 2 ? round(wData[wData.length - 1].trend - wData[0].trend) : null;
  const calData = useMemo(() => {
    const arr = [];
    for (let i = range - 1; i >= 0; i--) {
      const date = addDays(todayISO(), -i);
      const t = entryMacros(log.filter((e) => e.date === date));
      arr.push({ date, label: fmtDate(date, { month: 'numeric', day: 'numeric' }), full: fmtDate(date), protein: t.protein, carbs: t.carbs, fat: t.fat, pCal: t.protein * 4, cCal: t.carbs * 4, fCal: t.fat * 9, cals: calsFrom(t.protein, t.carbs, t.fat) });
    }
    return arr;
  }, [log, range]);
  const logged = calData.filter((d) => d.cals > 0);
  const avg = (key) => logged.length ? logged.reduce((s, d) => s + d[key], 0) / logged.length : 0;
  const proteinHit = goals.protein ? logged.filter((d) => d.protein >= num(goals.protein)).length : 0;
  /* weekly report: trailing 7 days */
  const report = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(todayISO(), -(6 - i)));
    const daily = days.map((d) => entryMacros(log.filter((e) => e.date === d)));
    const loggedD = daily.filter((t) => calsFrom(t.protein, t.carbs, t.fat) > 0);
    const pHit = num(goals.protein) > 0 ? daily.filter((t) => t.protein >= num(goals.protein)).length : null;
    const avgC = loggedD.length ? loggedD.reduce((s, t) => s + calsFrom(t.protein, t.carbs, t.fat), 0) / loggedD.length : 0;
    const volThis = workouts.filter((w) => w.date >= days[0] && w.date <= days[6]).reduce((s, w) => s + (w.exercises || []).reduce((ss, ex) => ss + (ex.sets || []).reduce((sss, st) => sss + num(st.weight) * num(st.reps), 0), 0), 0);
    const volPrev = workouts.filter((w) => w.date >= addDays(days[0], -7) && w.date < days[0]).reduce((s, w) => s + (w.exercises || []).reduce((ss, ex) => ss + (ex.sets || []).reduce((sss, st) => sss + num(st.weight) * num(st.reps), 0), 0), 0);
    const scoreParts = [loggedD.length / 7];
    if (pHit != null) scoreParts.push(pHit / 7);
    if (goalCals > 0 && loggedD.length) scoreParts.push(Math.max(0, 1 - Math.abs(avgC - goalCals) / goalCals));
    const score = scoreParts.reduce((a, b) => a + b, 0) / scoreParts.length;
    const grade = score >= 0.93 ? 'A' : score >= 0.85 ? 'A–' : score >= 0.75 ? 'B+' : score >= 0.65 ? 'B' : score >= 0.5 ? 'C' : score > 0.25 ? 'D' : '—';
    return { from: days[0], to: days[6], loggedDays: loggedD.length, pHit, avgC: Math.round(avgC), volThis, volPrev, grade };
  }, [log, workouts, goals, goalCals]);
  /* heatmap: 8 weeks x 7 days, weeks as columns (old → new) */
  const heat = useMemo(() => {
    const out = [];
    const today = todayISO();
    const dow = (parseISO(today).getDay() + 6) % 7;
    const thisMonday = addDays(today, -dow);
    for (let wk = 7; wk >= 0; wk--) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(thisMonday, -wk * 7 + d);
        if (date > today) { col.push(null); continue; }
        const t = entryMacros(log.filter((e) => e.date === date));
        col.push(dayScore(t, goals));
      }
      out.push(col);
    }
    return out;
  }, [log, goals]);
  const woData = useMemo(() => [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-12).map((w) => ({ label: fmtDate(w.date, { month: 'numeric', day: 'numeric' }), vol: (w.exercises || []).reduce((s, ex) => s + (ex.sets || []).reduce((ss, st) => ss + num(st.weight) * num(st.reps), 0), 0) })), [workouts]);
  const prs = useMemo(() => { const m = {}; workouts.forEach((w) => (w.exercises || []).forEach((ex) => { const nm = (ex.name || '').trim(); if (!nm) return; const best = (ex.sets || []).reduce((b, st) => Math.max(b, e1rm(st.weight, st.reps)), 0); if (best > 0) m[nm] = Math.max(m[nm] || 0, best); })); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5); }, [workouts]);
  const applyTargets = () => {
    if (!sugg) return;
    setSettings((s) => ({ ...s, goalMode: 'coached', goals: { protein: String(sugg.protein), carbs: String(sugg.carbs), fat: String(sugg.fat) } }));
  };
  const set = (k, v) => setSettings((s) => ({ ...s, goalMode: 'manual', goals: { ...s.goals, [k]: v } }));
  return (
    <div className="flex flex-col gap-3 fadein">
      {/* weigh-in */}
      <Card style={{ borderColor: todayW ? T.border : 'rgba(203,255,58,0.35)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Scale size={15} style={{ color: T.lime }} /><Label>{todayW ? `Today: ${todayW.weight} ${unit}` : "Log today's weight"}</Label></div>
          <div className="flex items-center gap-2">
            <div style={{ width: 84 }}><NumField value={wInput} onChange={setWInput} placeholder={todayW ? String(todayW.weight) : '—'} align="center" /></div>
            <button onClick={logWeight} className="rounded-lg px-3 py-1.5 text-xs" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700 }}>{todayW ? 'update' : 'log'}</button>
          </div>
        </div>
        {wData.length >= 2 && (
          <>
            <Suspense fallback={<ChartSkeleton height={160} />}><WeightChart data={wData} unit={unit} /></Suspense>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs" style={{ color: T.faint }}>dots = weigh-ins · line = smoothed trend</span>
              {wDelta != null && <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: wDelta <= 0 ? T.lime : T.orange }}>{wDelta > 0 ? '+' : ''}{wDelta} {unit} / 30d</span>}
            </div>
          </>
        )}
      </Card>
      {/* TDEE engine */}
      <Card style={{ background: `linear-gradient(160deg, ${T.panel}, #101013)` }}>
        <div className="flex items-center justify-between mb-1"><Label>Adaptive TDEE engine</Label>{settings.goalMode === 'coached' && <span className="text-xs" style={{ color: T.lime, fontWeight: 700 }}>coached</span>}</div>
        {tdee.ok ? (
          <>
            <div className="flex items-end justify-between">
              <div><div style={{ ...display, fontSize: 36, lineHeight: 1 }}>{tdee.tdee.toLocaleString()}</div><div className="text-xs mt-1" style={{ color: T.faint }}>est. maintenance kcal · {tdee.loggedDays} days of food, {tdee.weighIns} weigh-ins</div></div>
              <div className="text-right"><div style={{ ...mono, fontSize: 13, color: T.muted }}>{tdee.avgIntake.toLocaleString()}</div><div className="text-xs" style={{ color: T.faint }}>avg intake</div></div>
            </div>
            <div className="text-xs mt-3 pt-3" style={{ borderTop: `1px solid ${T.border}`, color: T.muted, lineHeight: 1.55 }}>
              Trend {tdee.delta > 0 ? 'up' : 'down'} <b style={{ color: T.text }}>{Math.abs(tdee.delta)} {unit}</b> over {tdee.span} days.
              {coach.goalType && coach.goalType !== 'maintain' && paceActual != null && <> Goal pace <b style={{ color: T.text }}>{coach.goalType === 'cut' ? '−' : '+'}{coach.rate} {unit}/wk</b> → actual <b style={{ color: Math.abs(paceActual) >= Math.abs(coach.rate) * 0.7 && Math.abs(paceActual) <= Math.abs(coach.rate) * 1.3 ? T.lime : T.orange }}>{paceActual > 0 ? '+' : ''}{paceActual} {unit}/wk</b>.</>}
            </div>
          </>
        ) : (
          <div className="text-xs" style={{ color: T.muted, lineHeight: 1.6 }}>
            Needs <b style={{ color: T.text }}>14+ days of logged food</b> and <b style={{ color: T.text }}>weigh-ins spanning 2+ weeks</b> to measure your real maintenance calories. Progress: {tdee.loggedDays}/14 days · {tdee.weighIns} weigh-ins.{effectiveTdee > 0 && <> Until then, formula estimate: <b style={{ color: T.lime, ...mono }}>{effectiveTdee} kcal</b>.</>}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          {sugg && <PrimaryBtn onClick={applyTargets} full>Apply {sugg.kcal.toLocaleString()} kcal targets</PrimaryBtn>}
          <button onClick={() => setWizard(true)} className="rounded-xl px-3.5 py-2.5 text-sm shrink-0" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, fontWeight: 700 }}>{settings.profile ? 'Edit goal' : 'Set up goal'}</button>
        </div>
      </Card>
      {/* manual goals */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Target size={16} style={{ color: T.lime }} /><Label>Daily macro targets</Label></div>
          <div className="flex items-center gap-1.5"><Flame size={14} style={{ color: T.orange }} /><span style={{ ...mono, fontSize: 13, color: T.text, fontWeight: 600 }}>{goalCals ? Math.round(goalCals) : '—'}</span><span className="text-xs" style={{ color: T.faint }}>kcal</span></div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {MK.map((k) => <div key={k}><div className="flex items-center gap-1 mb-1"><MIcon k={k} size={12} /><span className="text-xs" style={{ color: T.muted, fontWeight: 600 }}>{MACROS[k].label}</span></div><NumField value={goals[k]} onChange={(v) => set(k, v)} align="center" /></div>)}
        </div>
      </Card>
      {/* weekly report */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <Label>Weekly report · {fmtDate(report.from, { month: 'short', day: 'numeric' })}–{fmtDate(report.to, { day: 'numeric', month: 'short' })}</Label>
          <span style={{ ...display, fontSize: 24, color: report.grade.startsWith('A') ? T.lime : report.grade === '—' ? T.faint : T.text }}>{report.grade}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2.5" style={{ background: T.panel2 }}><div style={{ ...mono, fontSize: 15, fontWeight: 700 }}>{report.loggedDays}/7</div><div className="text-xs" style={{ color: T.faint }}>days logged</div></div>
          <div className="rounded-lg p-2.5" style={{ background: T.panel2 }}><div style={{ ...mono, fontSize: 15, fontWeight: 700, color: MACROS.protein.color }}>{report.pHit != null ? `${report.pHit}/7` : '—'}</div><div className="text-xs" style={{ color: T.faint }}>protein target hit</div></div>
          <div className="rounded-lg p-2.5" style={{ background: T.panel2 }}><div style={{ ...mono, fontSize: 15, fontWeight: 700 }}>{report.avgC || '—'}</div><div className="text-xs" style={{ color: T.faint }}>avg kcal{goalCals > 0 && report.avgC ? ` (${Math.round((report.avgC / goalCals) * 100)}%)` : ''}</div></div>
          <div className="rounded-lg p-2.5" style={{ background: T.panel2 }}><div style={{ ...mono, fontSize: 15, fontWeight: 700, color: report.volPrev > 0 && report.volThis >= report.volPrev ? T.lime : T.text }}>{report.volPrev > 0 ? `${report.volThis >= report.volPrev ? '+' : ''}${Math.round(((report.volThis - report.volPrev) / report.volPrev) * 100)}%` : report.volThis > 0 ? Math.round(report.volThis / 1000) + 'k' : '—'}</div><div className="text-xs" style={{ color: T.faint }}>volume vs last wk</div></div>
        </div>
      </Card>
      {/* adherence heatmap */}
      <Card>
        <Label style={{ marginBottom: 8 }}>Adherence · last 8 weeks</Label>
        <div className="flex gap-1">
          {heat.map((col, i) => (
            <div key={i} className="flex-1 flex flex-col gap-1">
              {col.map((s, j) => (
                <div key={j} className="rounded" style={{ height: 9, background: s == null ? 'transparent' : s === 0 ? T.panel2 : T.lime, opacity: s ? 0.15 + s * 0.85 : 1, border: s == null ? `1px dashed ${T.border}` : 'none' }} />
              ))}
            </div>
          ))}
        </div>
        <div className="text-xs mt-2" style={{ color: T.faint }}>columns = weeks (old → new), rows Mon–Sun · brightness = targets hit</div>
      </Card>
      {/* calorie chart */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2"><BarChart3 size={16} style={{ color: T.lime }} /><Label>Calories logged</Label></div>
        <div className="flex gap-1 rounded-lg p-0.5" style={{ background: T.panel, border: `1px solid ${T.border}` }}>{[7, 14, 30].map((r) => <button key={r} onClick={() => setRange(r)} className="rounded-md px-2.5 py-1 text-xs transition" style={{ background: range === r ? T.lime : 'transparent', color: range === r ? '#0c0c0e' : T.muted, fontWeight: 700 }}>{r}d</button>)}</div>
      </div>
      <Card style={{ padding: '14px 8px 8px 4px' }}>
        <Suspense fallback={<ChartSkeleton height={190} />}><CaloriesChart data={calData} range={range} goalCals={goalCals} /></Suspense>
        <div className="flex items-center justify-center gap-4 pt-1 pb-1">{MK.map((k) => <div key={k} className="flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 2, background: MACROS[k].color }} /><span className="text-xs" style={{ color: T.muted }}>{MACROS[k].label}</span></div>)}{goalCals > 0 && <div className="flex items-center gap-1.5"><span style={{ width: 12, height: 0, borderTop: `2px dashed ${T.lime}` }} /><span className="text-xs" style={{ color: T.muted }}>target</span></div>}</div>
      </Card>
      <div className="grid grid-cols-2 gap-2.5">
        <Card style={{ padding: 14 }}><Label>Avg / logged day</Label><div style={{ ...display, fontSize: 26, color: T.text, marginTop: 4, lineHeight: 1 }}>{Math.round(avg('cals'))}</div><div className="text-xs" style={{ color: T.faint }}>kcal · {logged.length} days logged</div></Card>
        <Card style={{ padding: 14 }}><Label>Avg protein</Label><div style={{ ...display, fontSize: 26, color: MACROS.protein.color, marginTop: 4, lineHeight: 1 }}>{Math.round(avg('protein'))}<span style={{ fontSize: 14 }}>g</span></div><div className="text-xs" style={{ color: T.faint }}>{goals.protein ? `target hit ${proteinHit}/${logged.length} days` : 'set a protein target'}</div></Card>
      </div>
      {/* training */}
      <div className="flex items-center gap-2 px-1 mt-1"><Dumbbell size={16} style={{ color: T.lime }} /><Label>Training volume</Label></div>
      {woData.length === 0 ? (
        <EmptyCard Icon={Dumbbell} text="Log workouts to see volume trends." />
      ) : (
        <Card style={{ padding: '14px 8px 8px 4px' }}>
          <Suspense fallback={<ChartSkeleton height={150} />}><VolumeChart data={woData} unit={unit} /></Suspense>
        </Card>
      )}
      {prs.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3"><Trophy size={15} style={{ color: T.orange }} /><Label>Estimated 1RM bests</Label></div>
          <div className="flex flex-col gap-2">
            {prs.map(([name, val], i) => (
              <div key={name} className="flex items-center gap-3">
                <span style={{ ...mono, fontSize: 12, color: T.faint, width: 16 }}>{i + 1}</span>
                <span className="flex-1 text-sm truncate" style={{ color: T.text, fontWeight: 600 }}>{name}</span>
                <span style={{ ...mono, fontSize: 14, color: T.orange, fontWeight: 700 }}>{Math.round(val)} <span style={{ color: T.faint, fontSize: 11 }}>{unit}</span></span>
              </div>
            ))}
          </div>
          <div className="text-xs mt-3 pt-3" style={{ borderTop: `1px solid ${T.border}`, color: T.faint }}>Epley estimate (weight × (1 + reps/30)) from your heaviest sets.</div>
        </Card>
      )}
      <GoalWizard open={wizard} onClose={() => setWizard(false)} settings={settings} setSettings={setSettings} seedTdee={tdee.ok ? tdee.tdee : 0} />
    </div>
  );
}

/* ---------------- LIBRARY / RECIPES / SETTINGS ---------------- */
function LibraryModal({ open, onClose, foods, addFood, updFood, delFood }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return foods.filter((f) => f.name.toLowerCase().includes(term)).sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
  }, [foods, q]);
  return (
    <Modal open={open} onClose={onClose} title="Food library" icon={<BookOpen size={16} style={{ color: T.lime }} />} maxW={480}>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1"><Search size={15} className="absolute" style={{ left: 10, top: 11, color: T.faint }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods…" className="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text }} /></div>
        <button onClick={() => addFood({ id: uid(), name: 'New food', category: CATEGORIES[0], protein: 0, carbs: 0, fat: 0, favorite: false })} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition shrink-0" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700 }}><Plus size={15} /> new</button>
      </div>
      {foods.length === 0 && <div className="text-center py-6 text-sm" style={{ color: T.faint }}>No saved foods yet. Foods you log or add to groceries (with “save to library” on) show up here.</div>}
      <div className="flex flex-col gap-2">
        {list.map((fd) => (
          <div key={fd.id} className="rounded-xl p-2.5" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => updFood(fd.id, { favorite: !fd.favorite })} title="Favorite — shows in quick-add"><Star size={16} style={{ color: fd.favorite ? T.orange : T.faint }} fill={fd.favorite ? T.orange : 'none'} /></button>
              <input value={fd.name} onChange={(e) => updFood(fd.id, { name: e.target.value })} className="flex-1 rounded-lg px-2.5 py-1.5 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, fontWeight: 600, minWidth: 0 }} />
              <GhostBtn danger onClick={() => delFood(fd.id)}><Trash2 size={15} /></GhostBtn>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {MK.map((k) => <div key={k}><div style={{ height: 13 }}><span className="uppercase" style={{ color: T.faint, fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>{MACROS[k].short}</span></div><div className="mt-1"><NumField value={fd[k]} onChange={(v) => updFood(fd.id, { [k]: num(v) })} align="center" /></div></div>)}
              <div><div style={{ height: 13 }}><span className="uppercase" style={{ color: T.faint, fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>kcal</span></div><div className="mt-1 flex items-center justify-center rounded-lg" style={{ height: 32, background: T.panel2, border: `1px solid ${T.border}`, ...mono, fontSize: 13, color: T.muted }}>{Math.round(calsFrom(fd.protein, fd.carbs, fd.fat))}</div></div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Select value={fd.category} onChange={(v) => updFood(fd.id, { category: v })} options={CATEGORIES} />
              <button onClick={() => updFood(fd.id, { unit: isPer100g(fd) ? 'serving' : 'g100' })} title="Macros interpreted per serving, or per 100 g (logged by grams)"
                className="rounded-md px-2 py-1 transition" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', background: isPer100g(fd) ? T.limeDim : 'transparent', border: `1px solid ${isPer100g(fd) ? 'rgba(203,255,58,0.45)' : T.border}`, color: isPer100g(fd) ? T.lime : T.faint }}>
                {isPer100g(fd) ? 'PER 100 G' : 'PER SERVING'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
function RecipesModal({ open, onClose, recipes, setRecipes, foods }) {
  const [editing, setEditing] = useState(null); // recipe id
  const [pick, setPick] = useState('');
  const addRecipe = () => { const r = { id: uid(), name: 'New recipe', emoji: '🍳', items: [] }; setRecipes((rs) => [r, ...rs]); setEditing(r.id); };
  const upd = (id, patch) => setRecipes((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const del = (id) => { setRecipes((rs) => rs.filter((r) => r.id !== id)); if (editing === id) setEditing(null); };
  return (
    <Modal open={open} onClose={onClose} title="Recipes" icon={<ChefHat size={16} style={{ color: T.lime }} />} maxW={480}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs" style={{ color: T.faint }}>Combos of library foods — log or plan them in one tap.</div>
        <button onClick={addRecipe} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm shrink-0" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700 }}><Plus size={15} /> new</button>
      </div>
      {recipes.length === 0 && <div className="text-center py-6 text-sm" style={{ color: T.faint }}>No recipes yet.</div>}
      <div className="flex flex-col gap-2">
        {recipes.map((r) => {
          const m = recipeMacros(r, foods);
          const isEd = editing === r.id;
          return (
            <div key={r.id} className="rounded-xl p-2.5" style={{ background: T.bg, border: `1px solid ${isEd ? T.borderHi : T.border}` }}>
              <div className="flex items-center gap-2">
                <input value={r.emoji || ''} onChange={(e) => upd(r.id, { emoji: e.target.value })} className="text-center rounded-lg outline-none" style={{ width: 38, height: 32, background: T.panel2, border: `1px solid ${T.border}`, fontSize: 15 }} />
                <input value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} className="flex-1 rounded-lg px-2.5 py-1.5 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, fontWeight: 600, minWidth: 0 }} />
                <button onClick={() => setEditing(isEd ? null : r.id)} style={{ color: T.faint, transform: isEd ? 'rotate(180deg)' : 'none' }}><ChevronDown size={16} /></button>
                <GhostBtn danger onClick={() => del(r.id)}><Trash2 size={14} /></GhostBtn>
              </div>
              {(() => { const po = Math.max(1, num(r.portions) || 1); return (
                <div className="mt-1.5" style={{ ...mono, fontSize: 11, color: T.faint }}>
                  {MK.map((k) => `${round(m[k] / po)}${k[0]}`).join('  ')} · {Math.round(calsFrom(m.protein, m.carbs, m.fat) / po)} kcal{po > 1 ? ' / portion' : ''} · {(r.items || []).length} items{po > 1 ? ` · makes ${po}` : ''}
                </div>
              ); })()}
              {isEd && (
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${T.border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: T.muted, fontWeight: 600 }}>Batch — makes how many portions?</span>
                    <Stepper value={r.portions || 1} onChange={(v) => upd(r.id, { portions: Math.max(1, num(v) || 1) })} min={1} />
                  </div>
                  {(r.items || []).map((it, idx) => {
                    const fd = foods.find((f) => f.id === it.foodId);
                    return (
                      <div key={idx} className="flex items-center gap-2 mb-1.5">
                        <span className="flex-1 text-sm truncate" style={{ fontWeight: 600 }}>{fd ? fd.name : '(deleted food)'}</span>
                        <Stepper value={it.servings} onChange={(v) => upd(r.id, { items: r.items.map((x, i) => (i === idx ? { ...x, servings: v } : x)) })} step={fd && isPer100g(fd) ? 10 : 0.5} suffix={fd && isPer100g(fd) ? 'g' : null} />
                        <button onClick={() => upd(r.id, { items: r.items.filter((_, i) => i !== idx) })} style={{ color: T.faint }}><X size={14} /></button>
                      </div>
                    );
                  })}
                  <div className="flex gap-2 mt-2">
                    <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted }}>
                      <option value="">＋ add food from library…</option>
                      {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <button onClick={() => { if (pick) { const fd = foods.find((f) => f.id === pick); upd(r.id, { items: [...(r.items || []), { foodId: pick, servings: fd ? foodPortion(fd).qty : 1 }] }); setPick(''); } }} className="rounded-lg px-3 text-sm" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700 }}>add</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
/* base64url VAPID key → Uint8Array for pushManager.subscribe */
function urlB64ToUint8(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function subscribeToPush(meals, nudge, shopping) {
  const pub = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!pub || !('serviceWorker' in navigator) || !('PushManager' in window)) return { ok: false, why: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(pub) });
    const res = await fetch('/api/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub: sub.toJSON(), meals, nudge, shopping: shopping || null, tzOffsetMin: new Date().getTimezoneOffset() }),
    });
    return { ok: res.ok, why: res.ok ? '' : `server ${res.status}` };
  } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
}
function MealScheduleModal({ open, onClose, settings, setSettings }) {
  const meals = settings.meals && settings.meals.length ? settings.meals : DEFAULT_MEALS;
  const remind = settings.remind || { enabled: false, nudge: true };
  const shopping = settings.shopping || DEFAULT_SHOPPING;
  const [pushState, setPushState] = useState('');
  /* schedule edits re-sync the server subscription (debounced) so pushes follow the new times */
  const syncTimer = useRef(null);
  const mealsKey = JSON.stringify([meals.map((m) => [m.id, m.label, m.time]), shopping]);
  const firstSync = useRef(true);
  useEffect(() => {
    if (!open || !remind.enabled) { firstSync.current = true; return; }
    if (firstSync.current) { firstSync.current = false; return; } // skip the on-open render
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { syncPush(meals, remind.nudge, shopping); }, 1200);
    return () => { if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, [mealsKey, open]);
  const setMeals = (ms) => setSettings((s) => ({ ...s, meals: ms }));
  /* retiming a meal re-infers what kind of food belongs in it */
  const upd = (id, patch) => setMeals(meals.map((m) => (m.id === id
    ? { ...m, ...patch, ...(patch.time !== undefined ? { kind: kindForTime(patch.time) } : {}) }
    : m)));
  const addOne = () => setMeals(addMeal(meals, uid));
  const removeMeal = (id) => { if (meals.length <= 1) return; setMeals(meals.filter((m) => m.id !== id)); };
  const syncPush = async (ms, ndg, shp) => {
    setPushState('syncing…');
    const r = await subscribeToPush(ms, ndg, shp ?? shopping);
    setPushState(r.ok ? 'reminders will also arrive when the app is closed' : 'reminders fire while the app is open (background push not configured)');
  };
  const toggleReminders = async () => {
    if (!remind.enabled) {
      if (typeof Notification === 'undefined') { setPushState('notifications unsupported on this browser'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPushState('permission declined — enable notifications in your browser settings'); return; }
      setSettings((s) => ({ ...s, remind: { ...remind, enabled: true } }));
      syncPush(meals, remind.nudge);
    } else {
      setSettings((s) => ({ ...s, remind: { ...remind, enabled: false } }));
      setPushState('');
      try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); sub.unsubscribe(); } } catch {}
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Meals & reminders" icon={<Bell size={16} style={{ color: T.lime }} />}>
      <Label>Your day</Label>
      <div className="text-xs mb-3 mt-1" style={{ color: T.faint, lineHeight: 1.5 }}>
        These are the meals you log into, plan around, and get reminded about. Rename them, retime them, add as many as you eat. Leave a time blank for a slot that never nags you.
      </div>
      <div className="flex flex-col gap-1.5 mb-4">
        {meals.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <input value={m.label} onChange={(e) => upd(m.id, { label: e.target.value })} className="flex-1 rounded-lg px-2.5 py-1.5 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, fontWeight: 600, minWidth: 0 }} />
            <input type="time" value={m.time} onChange={(e) => upd(m.id, { time: e.target.value })} className="rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, ...mono }} />
            <button onClick={() => removeMeal(m.id)} style={{ color: meals.length <= 1 ? T.border : T.faint }}><X size={14} /></button>
          </div>
        ))}
        {meals.length < 8 && (
          <button onClick={addOne} className="rounded-lg py-2 text-xs" style={{ background: 'transparent', border: `1px dashed ${T.borderHi}`, color: T.muted, fontWeight: 600 }}>＋ add a meal</button>
        )}
      </div>
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
          <div><div className="text-sm" style={{ fontWeight: 600 }}>Meal-time reminders</div><div className="text-xs" style={{ color: T.faint }}>a nudge at each meal time above</div></div>
          <CheckToggle checked={!!remind.enabled} onToggle={toggleReminders} label="" />
        </div>
        <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: T.panel2, border: `1px solid ${T.border}`, opacity: remind.enabled ? 1 : 0.5 }}>
          <div><div className="text-sm" style={{ fontWeight: 600 }}>Missed-meal nudges</div><div className="text-xs" style={{ color: T.faint }}>90 min after a meal time with nothing logged</div></div>
          <CheckToggle checked={!!remind.nudge} onToggle={() => { const n = { ...remind, nudge: !remind.nudge }; setSettings((s) => ({ ...s, remind: n })); if (remind.enabled) syncPush(meals, n.nudge); }} label="" />
        </div>
        <div className="rounded-xl px-3 py-2.5" style={{ background: T.panel2, border: `1px solid ${T.border}`, opacity: remind.enabled ? 1 : 0.5 }}>
          <div className="flex items-center justify-between">
            <div><div className="text-sm" style={{ fontWeight: 600 }}>Shopping day</div><div className="text-xs" style={{ color: T.faint }}>a weekly heads-up with your list size</div></div>
            <CheckToggle checked={!!shopping.enabled} onToggle={() => setSettings((s) => ({ ...s, shopping: { ...shopping, enabled: !shopping.enabled } }))} label="" />
          </div>
          {shopping.enabled && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <div className="flex gap-1 flex-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <button key={i} onClick={() => setSettings((s) => ({ ...s, shopping: { ...shopping, day: i } }))} className="flex-1 rounded-lg py-1.5 text-xs" style={{ background: Number(shopping.day) === i ? T.lime : 'transparent', border: `1px solid ${Number(shopping.day) === i ? T.lime : T.border}`, color: Number(shopping.day) === i ? '#0c0c0e' : T.muted, fontWeight: 700, ...mono }}>{d}</button>
                ))}
              </div>
              <input type="time" value={shopping.time} onChange={(e) => setSettings((s) => ({ ...s, shopping: { ...shopping, time: e.target.value } }))} className="rounded-lg px-2 py-1.5 text-sm outline-none shrink-0" style={{ background: T.panel, border: `1px solid ${T.border}`, color: T.text, ...mono }} />
            </div>
          )}
        </div>
        {pushState && <div className="text-xs px-1" style={{ color: T.faint }}>{pushState}</div>}
      </div>
      <Label style={{ marginBottom: 8 }}>Daily extras</Label>
      <div className="grid grid-cols-3 gap-2">
        <div><div className="text-xs mb-1" style={{ color: T.muted, fontWeight: 600 }}>Water (ml)</div><NumField value={settings.waterMl ?? 2000} onChange={(v) => setSettings((s) => ({ ...s, waterMl: num(v) }))} align="center" /></div>
        <div><div className="text-xs mb-1" style={{ color: T.muted, fontWeight: 600 }}>Fiber (g)</div><NumField value={settings.fiberG ?? 30} onChange={(v) => setSettings((s) => ({ ...s, fiberG: num(v) }))} align="center" /></div>
        <div><div className="text-xs mb-1" style={{ color: T.muted, fontWeight: 600 }}>Sugar max (g)</div><NumField value={settings.sugarMaxG ?? 50} onChange={(v) => setSettings((s) => ({ ...s, sugarMaxG: num(v) }))} align="center" /></div>
      </div>
    </Modal>
  );
}
/* Shown when a device has never been invited. Sign up here and the invite
   lands by email; paste the key from an older email to unlock straight away. */
function InviteGate({ onUnlocked }) {
  const [email, setEmail] = useState('');
  const [key, setKey] = useState('');
  const [state, setState] = useState(''); // '' | 'sending' | 'sent' | 'checking'
  const [err, setErr] = useState('');
  const [showKey, setShowKey] = useState(false);

  const join = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setErr('That email doesn’t look right.'); return; }
    setErr(''); setState('sending');
    try {
      const r = await fetch('/api/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, device: 'app-gate', source: (() => { try { return localStorage.getItem('mf2_src') || 'direct'; } catch { return 'direct'; } })() }),
      });
      if (!r.ok && r.status !== 202) throw new Error('failed');
      setState('sent');
    } catch {
      setState(''); setErr('Couldn’t reach the server — check your connection and try again.');
    }
  };

  const redeem = async () => {
    const k = key.trim();
    if (!k) return;
    setErr(''); setState('checking');
    try {
      const r = await fetch('/api/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k }),
      });
      const d = await r.json();
      if (d.ok) { onUnlocked(); return; }
      setState(''); setErr(d.error === 'this invite has been used on too many devices' ? d.error : 'That key isn’t valid. Check the email it came in.');
    } catch {
      setState(''); setErr('Couldn’t reach the server — check your connection.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ background: `radial-gradient(130% 75% at 50% -8%, ${T.limeDim}, transparent 55%), ${T.bg}`, color: T.text, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap'); input::placeholder { color: #50505a; }`}</style>
      <div className="w-full fadein" style={{ maxWidth: 400 }}>
        <div className="flex items-center gap-2.5 mb-6">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: T.lime }}>
            <Flame size={22} style={{ color: '#0c0c0e' }} />
          </div>
          <div>
            <div style={{ ...display, fontSize: 22, lineHeight: 1 }}>MACROFORGE</div>
            <div className="text-xs" style={{ color: T.faint }}>fuel · plan · train · adapt</div>
          </div>
        </div>

        {state === 'sent' ? (
          <Card>
            <div style={{ ...display, fontSize: 20, marginBottom: 8 }}>CHECK YOUR EMAIL</div>
            <div className="text-sm" style={{ color: T.muted, lineHeight: 1.6 }}>
              Your invite is on its way to <b style={{ color: T.text }}>{email.trim().toLowerCase()}</b>. Open the link in it on this device and you're in.
            </div>
            <div className="text-xs mt-3" style={{ color: T.faint, lineHeight: 1.6 }}>
              Signed up before? That works too — this resends your invite. Nothing after a minute or two? Check spam, then <button onClick={() => { setState(''); setShowKey(true); }} style={{ color: T.lime, fontWeight: 700 }}>enter your key by hand</button>.
            </div>
          </Card>
        ) : (
          <Card>
            <div style={{ ...display, fontSize: 20, marginBottom: 6 }}>INVITE-ONLY BETA</div>
            <div className="text-sm mb-4" style={{ color: T.muted, lineHeight: 1.6 }}>
              MacroForge is the macro tracker that starts at the grocery store. It's free and in closed beta — drop your email and the invite comes straight back.
            </div>
            <div className="flex flex-col gap-2">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
                onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
                className="w-full rounded-xl px-3 py-3 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text }} />
              <PrimaryBtn onClick={join} full>{state === 'sending' ? 'Sending…' : 'Send my invite'}</PrimaryBtn>
            </div>
            {err && <div className="text-xs mt-2.5" style={{ color: '#ff8a8a' }}>{err}</div>}
            <div className="text-xs mt-3" style={{ color: T.faint, lineHeight: 1.6 }}>
              No password, and your food data never leaves your device. Beta updates only — nothing else.
            </div>

            <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
              {showKey ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs" style={{ color: T.muted }}>Paste the invite key from your email:</div>
                  <div className="flex gap-2">
                    <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="invite key"
                      onKeyDown={(e) => { if (e.key === 'Enter') redeem(); }}
                      className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, ...mono, minWidth: 0 }} />
                    <button onClick={redeem} className="rounded-lg px-3 text-sm shrink-0" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700 }}>
                      {state === 'checking' ? '…' : 'unlock'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowKey(true)} className="text-xs" style={{ color: T.faint }}>
                  Already have an invite key? <span style={{ color: T.lime, fontWeight: 700 }}>Enter it</span>
                </button>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
/* The 30-day funnel: how many arrived, how many signed up, how many actually
   used the thing. Percentages are of the step above, so a collapse is obvious. */
function FunnelPanel({ stats }) {
  const t = stats.totals || {};
  const steps = [
    { key: 'join_view', label: 'Saw the landing page' },
    { key: 'signup', label: 'Signed up' },
    { key: 'app_new', label: 'Opened the app' },
    { key: 'first_log', label: 'Logged food' },
    { key: 'first_plan', label: 'Generated a week' },
  ];
  const top = Math.max(1, ...steps.map((s) => t[s.key] || 0));
  const sources = (stats.sources || []).slice(0, 6);
  return (
    <>
      <Label style={{ marginBottom: 6 }}>Funnel · last 30 days</Label>
      <div className="flex items-baseline gap-3 mb-2.5" style={{ ...mono, fontSize: 11, color: T.faint }}>
        <span><b style={{ color: T.text, fontSize: 13 }}>{t.uniques || 0}</b> visitors</span>
        <span><b style={{ color: T.text, fontSize: 13 }}>{t.install || 0}</b> installs</span>
        <span><b style={{ color: T.text, fontSize: 13 }}>{t.first_scan || 0}</b> first scans</span>
      </div>
      <div className="flex flex-col gap-1.5 mb-4">
        {steps.map((s, i) => {
          const n = t[s.key] || 0;
          const prev = i === 0 ? 0 : (t[steps[i - 1].key] || 0);
          const pct = i > 0 && prev > 0 ? Math.round((n / prev) * 100) : null;
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
                <span style={{ color: T.muted }}>{s.label}</span>
                <span style={{ ...mono, color: T.text, fontWeight: 700 }}>
                  {n}{pct !== null && <span style={{ color: pct >= 30 ? T.lime : T.faint, fontWeight: 600, marginLeft: 6 }}>{pct}%</span>}
                </span>
              </div>
              <div className="rounded-full overflow-hidden mt-1" style={{ height: 4, background: T.panel2 }}>
                <div style={{ height: '100%', width: `${Math.round((n / top) * 100)}%`, background: T.lime, borderRadius: 999, opacity: 1 - i * 0.13 }} />
              </div>
            </div>
          );
        })}
      </div>
      {sources.length > 0 && (
        <>
          <Label style={{ marginBottom: 6 }}>Where they came from</Label>
          <div className="flex flex-col gap-1.5 mb-4">
            {sources.map((s) => (
              <div key={s.source} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                <span style={{ ...mono, fontSize: 12, color: T.text }} className="truncate">{s.source}</span>
                <span className="text-xs shrink-0" style={{ color: T.faint, marginLeft: 8 }}>
                  {s.join_view || 0} views · <b style={{ color: T.lime }}>{s.signup || 0}</b> signups
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
function ReportsModal({ open, onClose, token, localUnknowns }) {
  const [rows, setRows] = useState(null);
  const [signups, setSignups] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open) return;
    setRows(null); setSignups(null); setFeedback(null); setStats(null); setErr('');
    fetch(`/api/track?token=${encodeURIComponent(token)}&days=30`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`server ${r.status}`))))
      .then((d) => setStats(d))
      .catch(() => setStats({ totals: {}, sources: [], days: [] }));
    fetch(`/api/report?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`server ${r.status}`))))
      .then((d) => setRows(Array.isArray(d.reports) ? d.reports : []))
      .catch((e) => setErr(String(e.message || e)));
    fetch(`/api/signup?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`server ${r.status}`))))
      .then((d) => setSignups(Array.isArray(d.signups) ? d.signups : []))
      .catch(() => setSignups([]));
    fetch(`/api/feedback?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`server ${r.status}`))))
      .then((d) => setFeedback(Array.isArray(d.feedback) ? d.feedback : []))
      .catch(() => setFeedback([]));
  }, [open, token]);
  return (
    <Modal open={open} onClose={onClose} title="Developer" icon={<ScanLine size={16} style={{ color: T.orange }} />} maxW={480}>
      {stats && <FunnelPanel stats={stats} />}
      {signups !== null && (
        <>
          <Label style={{ marginBottom: 6 }}>Beta signups · {signups.length}</Label>
          {signups.length === 0 ? (
            <div className="text-xs mb-3" style={{ color: T.faint }}>Nobody yet — share {typeof location !== 'undefined' ? `${location.origin}/join` : '/join'}.</div>
          ) : (
            <div className="flex flex-col gap-1.5 mb-4">
              {signups.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                  <span style={{ ...mono, fontSize: 12, color: T.text }} className="truncate">{s.email}</span>
                  <span className="text-xs shrink-0" style={{ color: T.faint, marginLeft: 8 }}>{s.device || '—'} · {s.ts ? new Date(s.ts).toLocaleDateString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {feedback !== null && (
        <>
          <Label style={{ marginBottom: 6 }}>Feedback · {feedback.length}</Label>
          {feedback.length === 0 ? (
            <div className="text-xs mb-3" style={{ color: T.faint }}>None yet — the form lives at /join.</div>
          ) : (
            <div className="flex flex-col gap-1.5 mb-4">
              {feedback.map((f, i) => (
                <div key={i} className="rounded-lg px-3 py-2" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                  <div className="text-sm" style={{ color: T.text, whiteSpace: 'pre-wrap' }}>{f.message}</div>
                  <div className="text-xs mt-1" style={{ color: T.faint }}>{f.email || 'anonymous'} · {f.ts ? new Date(f.ts).toLocaleString() : ''}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <Label style={{ marginBottom: 6 }}>Unknown-food reports</Label>
      <div className="text-xs mb-3" style={{ color: T.faint }}>Barcodes testers scanned that the app had no knowledge of. Collected from all devices via the API; your own device's log is below it.</div>
      {err && <div className="text-xs mb-2" style={{ color: T.orange }}>Couldn't reach the API: {err}</div>}
      {rows === null && !err && <div className="text-xs py-3 text-center" style={{ color: T.faint }}>Loading…</div>}
      {rows && rows.length === 0 && <div className="text-xs py-3 text-center" style={{ color: T.faint }}>No reports collected yet.</div>}
      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-3">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
              <span style={{ ...mono, fontSize: 12, color: T.text }}>{r.code}</span>
              <span className="text-xs" style={{ color: T.faint }}>{r.name || '—'} · {r.ts ? new Date(r.ts).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </div>
      )}
      {localUnknowns.length > 0 && (
        <>
          <Label style={{ marginBottom: 6 }}>This device</Label>
          <div className="flex flex-col gap-1.5">
            {localUnknowns.slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
                <span style={{ ...mono, fontSize: 12 }}>{r.code}</span>
                <span className="text-xs" style={{ color: T.faint }}>{fmtDate(r.date)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
function SyncModal({ open, onClose, meta, status, onCreate, onJoin, onSyncNow, onUnlink, onDeleteRemote }) {
  const [joinCode, setJoinCode] = useState('');
  const [joinErr, setJoinErr] = useState('');
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [qr, setQr] = useState('');
  useEffect(() => { if (!open) { setJoinCode(''); setJoinErr(''); setCopied(false); setConfirmDel(false); } }, [open]);
  useEffect(() => {
    if (!open || !meta?.code) { setQr(''); return; }
    let alive = true;
    import('qrcode').then((m) => m.toDataURL(meta.code, { margin: 1, width: 180, color: { dark: '#f3f3f1', light: '#141418' } }))
      .then((url) => { if (alive) setQr(url); }).catch(() => {});
    return () => { alive = false; };
  }, [open, meta?.code]);
  const join = async () => {
    if (!joinCode.trim() || joining) return;
    setJoining(true); setJoinErr('');
    const err = await onJoin(joinCode);
    setJoining(false);
    if (err) setJoinErr(err); else onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Device sync" icon={<RefreshCw size={16} style={{ color: T.lime }} />}>
      {!meta?.code ? (
        <>
          <div className="text-xs mb-4" style={{ color: T.muted, lineHeight: 1.6 }}>
            Link your phone and desktop into one account — no email, no password. A private <b style={{ color: T.text }}>sync code</b> is the whole identity: devices holding it share one history, synced through MacroForge's server. Treat the code like a key.
          </div>
          <PrimaryBtn onClick={() => { onCreate(); }} full><Sparkles size={15} /> Create my sync code</PrimaryBtn>
          <div className="flex items-center gap-3 my-4"><div className="flex-1" style={{ height: 1, background: T.border }} /><span className="text-xs" style={{ color: T.faint }}>or link to an existing one</span><div className="flex-1" style={{ height: 1, background: T.border }} /></div>
          <div className="flex gap-2">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="ABCD-EFGH-JKMN-PQRS" onKeyDown={(e) => e.key === 'Enter' && join()}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none uppercase" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, ...mono, letterSpacing: '0.08em', minWidth: 0 }} />
            <button onClick={join} disabled={joining} className="rounded-lg px-3.5 text-sm shrink-0" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700, opacity: joining ? 0.6 : 1 }}>{joining ? 'linking…' : 'link'}</button>
          </div>
          {joinErr && <div className="text-xs mt-2" style={{ color: T.orange }}>{joinErr}</div>}
          <div className="text-xs mt-3" style={{ color: T.faint }}>Linking merges this device's history with the account — nothing gets lost.</div>
        </>
      ) : (
        <>
          <Label style={{ marginBottom: 8 }}>Your sync code</Label>
          <div className="rounded-xl p-3.5 mb-3 text-center" style={{ background: T.bg, border: `1px solid ${T.borderHi}` }}>
            <div style={{ ...mono, fontSize: 19, fontWeight: 700, letterSpacing: '0.12em', color: T.lime }}>{meta.code}</div>
            {qr && <img src={qr} alt="sync code QR" className="mx-auto mt-3 rounded-lg" style={{ width: 150, height: 150 }} />}
            <button onClick={() => { try { navigator.clipboard.writeText(meta.code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} }}
              className="mt-3 rounded-lg px-3 py-1.5 text-xs" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: copied ? T.lime : T.muted, fontWeight: 700 }}>
              {copied ? 'copied!' : 'copy code'}
            </button>
          </div>
          <div className="text-xs mb-3" style={{ color: T.faint, lineHeight: 1.55 }}>
            Enter this code (or scan the QR with the other device's camera) in <b style={{ color: T.muted }}>Settings → Device sync → link</b> on your other device. Anyone with the code has the data — keep it private.
          </div>
          <div className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-2" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
            <div className="text-xs" style={{ color: status.error ? T.orange : T.muted }}>
              {status.busy ? 'Syncing…' : status.error ? `Sync issue: ${status.error}` : meta.at ? `Synced ${new Date(meta.at).toLocaleTimeString()} · rev ${meta.rev}` : 'Not synced yet'}
            </div>
            <button onClick={onSyncNow} className="rounded-lg px-2.5 py-1 text-xs shrink-0" style={{ background: T.limeDim, border: `1px solid ${T.border}`, color: T.lime, fontWeight: 700 }}>sync now</button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { onUnlink(); onClose(); }} className="flex-1 rounded-lg py-2 text-xs" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, fontWeight: 600 }}>Unlink this device</button>
            <button onClick={() => { if (confirmDel) { onDeleteRemote(); onClose(); } else { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); } }}
              className="flex-1 rounded-lg py-2 text-xs" style={{ background: 'transparent', border: '1px solid rgba(255,107,107,0.4)', color: '#ff8a8a', fontWeight: 600 }}>
              {confirmDel ? 'Tap again — deletes server copy' : 'Delete synced copy'}
            </button>
          </div>
          <div className="text-xs mt-2" style={{ color: T.faint }}>Unlinking or deleting never touches the data already on each device.</div>
        </>
      )}
    </Modal>
  );
}
function FeedbackModal({ open, onClose }) {
  const [msg, setMsg] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState(''); // '' | sending | sent | error
  useEffect(() => { if (!open) setState(''); }, [open]);
  const send = async () => {
    if (msg.trim().length < 5 || state === 'sending') return;
    setState('sending');
    try {
      const r = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg.trim(), email: email.trim() }) });
      if (!r.ok && r.status !== 202) throw new Error('send failed');
      setState('sent'); setMsg('');
    } catch { setState('error'); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Send feedback" icon={<MessageSquare size={16} style={{ color: T.lime }} />}>
      <div className="text-xs mb-3" style={{ color: T.muted, lineHeight: 1.55 }}>Found a bug, hit a wall, want something the app doesn't do? It goes straight to the person building it — every message gets read.</div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} placeholder="What's working? What's broken? What's missing?"
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text, resize: 'vertical', fontFamily: 'inherit' }}
        onFocus={(e) => (e.target.style.borderColor = T.lime)} onBlur={(e) => (e.target.style.borderColor = T.border)} />
      <div className="mt-2 mb-3">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your email (optional, for a reply)"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none transition" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.text }}
          onFocus={(e) => (e.target.style.borderColor = T.lime)} onBlur={(e) => (e.target.style.borderColor = T.border)} />
      </div>
      <PrimaryBtn onClick={send} full dim={msg.trim().length < 5}>{state === 'sending' ? 'Sending…' : 'Send it'}</PrimaryBtn>
      {state === 'sent' && <div className="flex items-center gap-1.5 text-xs mt-2" style={{ color: T.lime }}><Check size={13} /> Got it — thank you.</div>}
      {state === 'error' && <div className="text-xs mt-2" style={{ color: T.orange }}>Couldn't send — check your connection and try again.</div>}
    </Modal>
  );
}
function SettingsModal({ open, onClose, onManageLibrary, onManageRecipes, onManageSchedule, onManageSync, syncLinked, onSendFeedback, onViewReports, hasAdmin, onExport, onImport, onCopyList, onClearAll, foodCount, recipeCount, logCount }) {
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { if (!open) { setConfirm(false); setCopied(false); } }, [open]);
  const Row = ({ icon, label, sub, onClick, danger, right }) => (
    <button onClick={onClick} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition w-full" style={{ background: T.panel2, border: `1px solid ${T.border}` }}>
      <span style={{ color: danger ? '#ff8a8a' : T.lime }}>{icon}</span>
      <div className="flex-1"><div className="text-sm" style={{ color: danger ? '#ff8a8a' : T.text, fontWeight: 600 }}>{label}</div>{sub && <div className="text-xs" style={{ color: T.faint }}>{sub}</div>}</div>
      {right}
    </button>
  );
  return (
    <Modal open={open} onClose={onClose} title="Settings & data" icon={<Settings size={16} style={{ color: T.lime }} />}>
      <div className="flex flex-col gap-2">
        <Row icon={<BookOpen size={18} />} label="Food library" sub={`${foodCount} saved food${foodCount === 1 ? '' : 's'}`} onClick={onManageLibrary} right={<ChevronRight size={16} style={{ color: T.faint }} />} />
        <Row icon={<ChefHat size={18} />} label="Recipes" sub={`${recipeCount} recipe${recipeCount === 1 ? '' : 's'}`} onClick={onManageRecipes} right={<ChevronRight size={16} style={{ color: T.faint }} />} />
        <Row icon={<Bell size={18} />} label="Meals & reminders" sub="Meal count, times, notifications, daily extras" onClick={onManageSchedule} right={<ChevronRight size={16} style={{ color: T.faint }} />} />
        <Row icon={<RefreshCw size={18} />} label="Device sync" sub={syncLinked ? 'Linked — phone & desktop share one history' : 'Local only — link your other devices'} onClick={onManageSync} right={<ChevronRight size={16} style={{ color: T.faint }} />} />
        <Row icon={<MessageSquare size={18} />} label="Send feedback" sub="Bugs, walls, wishes — straight to the builder" onClick={onSendFeedback} right={<ChevronRight size={16} style={{ color: T.faint }} />} />
        {hasAdmin && <Row icon={<ScanLine size={18} />} label="Unknown-food reports" sub="Developer — barcodes the app had no knowledge of" onClick={onViewReports} right={<ChevronRight size={16} style={{ color: T.faint }} />} />}
        <Row icon={<Download size={18} />} label="Export all data (JSON)" sub="Download a backup of everything" onClick={onExport} />
        <Row icon={<Upload size={18} />} label="Import data (JSON)" sub="Restore a v1 or v2 backup" onClick={() => fileRef.current && fileRef.current.click()} />
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onImport(f); e.target.value = ''; }} />
        <Row icon={<Copy size={18} />} label={copied ? 'Copied to clipboard!' : 'Copy shopping list'} sub="Plain text of unbought items" onClick={() => { onCopyList(); setCopied(true); setTimeout(() => setCopied(false), 1800); }} />
        <Row icon={<Trash2 size={18} />} danger label={confirm ? 'Tap again to confirm — this erases everything' : 'Clear all data'} sub={`${logCount} log entries + plans, workouts, weights, foods`} onClick={() => { if (confirm) { onClearAll(); onClose(); } else { setConfirm(true); setTimeout(() => setConfirm(false), 3500); } }} />
      </div>
      <div className="flex items-center gap-1.5 mt-4 justify-center"><span style={{ width: 7, height: 7, borderRadius: 999, background: storageAvailable ? T.lime : T.orange }} /><span className="text-xs" style={{ color: T.faint }}>{storageAvailable ? 'Data auto-saves on this device' : 'Storage unavailable — session only'}</span></div>
    </Modal>
  );
}

/* ---------------- FIRST RUN ---------------- */
function OnboardingModal({ open, onDone, settings, setSettings, onAddStarterPack, onCreateSync, syncCode }) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('calc'); // calc | manual
  const unit = settings.unit || 'lb';
  const [sex, setSex] = useState('male');
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState(1.55);
  const [goalType, setGoalType] = useState('cut');
  const [rate, setRate] = useState(unit === 'kg' ? 0.45 : 1);
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [f, setF] = useState('');
  const [packAdded, setPackAdded] = useState(false);
  const tdee = mifflin({ sex, age, heightCm, weight, unit, activity });
  const sugg = tdee > 0 && num(weight) > 0 ? suggestMacros({ tdee, goalType, rate, trendWeight: num(weight), unit }) : null;
  const manualOk = num(p) > 0 || num(c) > 0 || num(f) > 0;
  const applyCalc = () => {
    if (!sugg) return;
    setSettings((s) => ({
      ...s,
      profile: { sex, age, heightCm, weight, activity },
      coach: { goalType, rate },
      goalMode: 'coached',
      goals: { protein: String(sugg.protein), carbs: String(sugg.carbs), fat: String(sugg.fat) },
    }));
    setStep(2);
  };
  const applyManual = () => {
    if (!manualOk) return;
    setSettings((s) => ({ ...s, goalMode: 'manual', goals: { protein: String(num(p)), carbs: String(num(c)), fat: String(num(f)) } }));
    setStep(2);
  };
  const Dots = () => (
    <div className="flex items-center justify-center gap-1.5 mt-4">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ width: i === step ? 18 : 6, height: 6, borderRadius: 999, background: i === step ? T.lime : T.border, transition: 'width .2s' }} />
      ))}
    </div>
  );
  const Skip = ({ children, to }) => (
    <button onClick={() => (to === 'done' ? onDone() : setStep(to))} className="w-full text-xs mt-2 py-1.5" style={{ color: T.faint }}>{children}</button>
  );
  return (
    <Modal open={open} onClose={onDone} title={['Welcome', 'Your targets', 'Your kitchen', 'Keep it safe'][step]} icon={<Flame size={16} style={{ color: T.lime }} />}>
      {step === 0 && (
        <>
          <div style={{ ...display, fontSize: 28, lineHeight: 1.05, marginBottom: 10 }}>Plan from your cart.<br />Hit your macros.</div>
          <div className="text-sm mb-4" style={{ color: T.muted, lineHeight: 1.6 }}>
            Most macro apps start at the plate. This one starts at the store — it builds your meals from the food you'll actually have, scores barcodes against what your week still needs, and learns your real maintenance calories from your own logs.
          </div>
          <div className="rounded-xl p-3 mb-4" style={{ background: T.bg, border: `1px dashed ${T.borderHi}` }}>
            <div className="text-xs" style={{ color: T.muted, lineHeight: 1.55 }}>Two minutes of setup and the whole thing works. Everything lives on this device — no account, no password.</div>
          </div>
          <PrimaryBtn onClick={() => setStep(1)} full>Set it up <ArrowRight size={15} /></PrimaryBtn>
          <Dots />
        </>
      )}
      {step === 1 && (
        <>
          <div className="text-xs mb-3" style={{ color: T.muted, lineHeight: 1.55 }}>
            Your daily targets drive everything — meal plans, the scanner's verdicts, the progress bars. Takes about thirty seconds.
          </div>
          <div className="flex gap-1.5 mb-3">
            <Chip active={mode === 'calc'} onClick={() => setMode('calc')}><Sparkles size={12} /> Work them out for me</Chip>
            <Chip active={mode === 'manual'} onClick={() => setMode('manual')}><Target size={12} /> I know my numbers</Chip>
          </div>
          {mode === 'calc' ? (
            <>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div><Label>Sex</Label><div className="mt-1"><Select value={sex} onChange={setSex} options={['male', 'female']} labels={['Male', 'Female']} /></div></div>
                <div><Label>Age</Label><div className="mt-1"><NumField value={age} onChange={setAge} align="center" /></div></div>
                <div><Label>Height (cm)</Label><div className="mt-1"><NumField value={heightCm} onChange={setHeightCm} align="center" /></div></div>
                <div><Label>Weight ({unit})</Label><div className="mt-1"><NumField value={weight} onChange={setWeight} align="center" /></div></div>
              </div>
              <div className="mb-2"><Label>Activity</Label><div className="mt-1"><Select value={activity} onChange={(v) => setActivity(num(v))} options={ACTIVITY.map((a) => a.id)} labels={ACTIVITY.map((a) => a.label)} /></div></div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><Label>Goal</Label><div className="mt-1"><Select value={goalType} onChange={setGoalType} options={['cut', 'maintain', 'gain']} labels={['Lose', 'Maintain', 'Gain']} /></div></div>
                <div><Label>Rate ({unit}/wk)</Label><div className="mt-1"><NumField value={rate} onChange={setRate} align="center" /></div></div>
              </div>
              {sugg ? (
                <div className="rounded-xl p-3 mb-3" style={{ background: T.bg, border: `1px solid ${T.borderHi}` }}>
                  <div className="flex items-center justify-between mb-2"><Label>Suggested</Label><span style={{ ...mono, fontSize: 14, color: T.lime, fontWeight: 700 }}>{sugg.kcal} kcal</span></div>
                  <div className="flex items-center justify-between" style={{ ...mono, fontSize: 12 }}>
                    <span style={{ color: MACROS.protein.color }}>{sugg.protein}g protein</span>
                    <span style={{ color: MACROS.carbs.color }}>{sugg.carbs}g carbs</span>
                    <span style={{ color: MACROS.fat.color }}>{sugg.fat}g fat</span>
                  </div>
                  <div className="text-xs mt-2" style={{ color: T.faint }}>An estimate to start with — the Coach replaces it with your measured numbers after a couple of weeks of logging.</div>
                </div>
              ) : <div className="text-xs mb-3" style={{ color: T.faint }}>Fill these in to see your targets.</div>}
              <PrimaryBtn onClick={applyCalc} full dim={!sugg}><Check size={15} /> Use these targets</PrimaryBtn>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {MK.map((k) => (
                  <div key={k}>
                    <div className="flex items-center gap-1 mb-1"><MIcon k={k} size={11} /><span className="text-xs" style={{ color: T.muted, fontWeight: 600 }}>{MACROS[k].label}</span></div>
                    <NumField value={{ protein: p, carbs: c, fat: f }[k]} onChange={{ protein: setP, carbs: setC, fat: setF }[k]} align="center" />
                  </div>
                ))}
              </div>
              <div className="text-xs mb-3" style={{ color: T.faint }}>Daily grams. That works out to <span style={{ ...mono, color: T.lime }}>{Math.round(calsFrom(p, c, f))}</span> kcal a day.</div>
              <PrimaryBtn onClick={applyManual} full dim={!manualOk}><Check size={15} /> Save targets</PrimaryBtn>
            </>
          )}
          <Skip to={2}>Skip — I'll set them later in Coach</Skip>
          <Dots />
        </>
      )}
      {step === 2 && (
        <>
          <div className="text-sm mb-3" style={{ color: T.muted, lineHeight: 1.6 }}>
            Start with a stocked kitchen: <b style={{ color: T.text }}>{STARTER_FOODS.length} everyday whole foods</b> with real macros, plus <b style={{ color: T.text }}>{STARTER_RECIPES.length} meals</b> built from them.
          </div>
          <div className="rounded-xl p-3 mb-4" style={{ background: T.bg, border: `1px dashed ${T.borderHi}` }}>
            <div className="text-xs" style={{ color: T.faint, lineHeight: 1.6 }}>
              Chicken, salmon, eggs, rice, oats, the produce aisle — and dishes like Overnight Oats and Salmon Plate that your meal plans can be built from. Edit or delete any of it; add your own as you go.
            </div>
          </div>
          {packAdded ? (
            <div className="flex items-center gap-1.5 text-sm mb-3" style={{ color: T.lime, fontWeight: 700 }}><Check size={16} /> Added to your library</div>
          ) : (
            <PrimaryBtn onClick={() => { onAddStarterPack(); setPackAdded(true); }} full><Plus size={15} /> Stock my kitchen</PrimaryBtn>
          )}
          <button onClick={() => setStep(3)} className="w-full rounded-xl py-2.5 text-sm mt-2" style={{ background: T.panel2, border: `1px solid ${T.border}`, color: T.muted, fontWeight: 700 }}>
            {packAdded ? 'Next' : 'Start empty instead'}
          </button>
          <Dots />
        </>
      )}
      {step === 3 && (
        <>
          <div className="text-sm mb-3" style={{ color: T.muted, lineHeight: 1.6 }}>
            Your log lives on this device only. Create a <b style={{ color: T.text }}>sync code</b> and your phone and computer share one history — it's also your backup if this device ever gets wiped.
          </div>
          {syncCode ? (
            <div className="rounded-xl p-3.5 mb-3 text-center" style={{ background: T.bg, border: `1px solid ${T.borderHi}` }}>
              <Label style={{ marginBottom: 6 }}>Your sync code</Label>
              <div style={{ ...mono, fontSize: 17, fontWeight: 700, letterSpacing: '0.12em', color: T.lime }}>{syncCode}</div>
              <div className="text-xs mt-2" style={{ color: T.faint }}>Save this somewhere. Settings → Device sync has it again any time, with a QR code.</div>
            </div>
          ) : (
            <PrimaryBtn onClick={onCreateSync} full><RefreshCw size={15} /> Create my sync code</PrimaryBtn>
          )}
          <div className="rounded-xl p-3 my-3" style={{ background: T.bg, border: `1px dashed ${T.borderHi}` }}>
            <div className="text-xs" style={{ color: T.faint, lineHeight: 1.6 }}>
              Also worth a minute later: <b style={{ color: T.muted }}>Settings → Meals & reminders</b> sets how many meals you eat and when, and nudges you at meal times.
            </div>
          </div>
          <PrimaryBtn onClick={onDone} full dim={!syncCode}>{syncCode ? 'Start using MacroForge' : 'Finish'}</PrimaryBtn>
          {!syncCode && <Skip to="done">Skip — set it up later</Skip>}
          <Dots />
        </>
      )}
    </Modal>
  );
}

/* ---------------- ROOT ---------------- */
const DEFAULT_SETTINGS = {
  unit: 'lb', days: 7, goals: { protein: '', carbs: '', fat: '' }, goalMode: 'manual',
  coach: { goalType: 'cut', rate: 1 }, profile: null,
  meals: DEFAULT_MEALS, remind: { enabled: false, nudge: true },
  waterMl: 2000, fiberG: 30, sugarMaxG: 50,
};
export default function App() {
  const [tab, setTab] = useState('today');
  const [settings, setSettings, sL] = usePersistentState('mf2_settings', DEFAULT_SETTINGS);
  const [foods, setFoods, fL] = usePersistentState('mf2_foods', []);
  const [recipes, setRecipes, rL] = usePersistentState('mf2_recipes', []);
  const [log, setLog, lL] = usePersistentState('mf2_log', []);
  const [plan, setPlan, pL] = usePersistentState('mf2_plan', []);
  const [groceries, setGroceries, gL] = usePersistentState('mf2_groceries', []);
  const [pantry, setPantry, paL] = usePersistentState('mf2_pantry', []);
  const [water, setWater, waL] = usePersistentState('mf2_water', []);
  const [unknownScans, setUnknownScans, uL] = usePersistentState('mf2_unknown', []);
  const [workouts, setWorkouts, wL] = usePersistentState('mf2_workouts', []);
  const [routines, setRoutines, roL] = usePersistentState('mf2_routines', []);
  const [weights, setWeights, weL] = usePersistentState('mf2_weights', []);
  const [migrated, setMigrated, mL] = usePersistentState('mf2_migrated', false);
  const [syncMeta, setSyncMeta, syL] = usePersistentState('mf2_sync', null); // {code, rev, base, at}
  const [seedState, setSeedState, sdL] = usePersistentState('mf2_seed', ''); // '' | 'added' | 'dismissed'
  const [seedVersion, setSeedVersion, svL] = usePersistentState('mf2_seedVersion', 0);
  const [onboarded, setOnboarded, obL] = usePersistentState('mf2_onboarded', false);
  const [invited, setInvited, ivL] = usePersistentState('mf2_invited', false);
  const ready = sL && fL && rL && lL && pL && gL && paL && waL && uL && wL && roL && weL && mL && syL && sdL && svL && obL && ivL;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ busy: false, error: '' });
  const [adminToken, setAdminToken] = useState(() => { try { return localStorage.getItem('mf2_adminToken') || ''; } catch { return ''; } });
  const [notice, setNotice] = useState('');
  const meals = mealsOf(settings);
  /* schedules saved by earlier builds used ids the log never referenced */
  useEffect(() => {
    if (!ready) return;
    const fixed = migrateMeals(settings.meals);
    if (JSON.stringify(fixed) !== JSON.stringify(settings.meals)) setSettings((s) => ({ ...s, meals: fixed }));
  }, [ready]);
  /* Invite gate. The link in the invite email carries ?k=… — spend it once and
     the device is unlocked for good. Anyone already using the app keeps their
     access: a device with history predates the gate and is never locked out. */
  useEffect(() => {
    if (!ready || invited) return;
    if (onboarded || log.length || foods.length || syncMeta?.code || adminToken) { setInvited(true); return; }
    let key = '';
    try { key = new URLSearchParams(location.search).get('k') || ''; } catch {}
    if (!key) return;
    fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setInvited(true);
        // don't leave the key sitting in the address bar to be copied around
        try { history.replaceState(null, '', location.pathname); } catch {}
      })
      .catch(() => {});
  }, [ready, invited, onboarded, adminToken]);
  /* funnel: counts only — which channel brought someone, and how far they got.
     Waits for storage so a brand-new device isn't miscounted as returning. */
  const counted = useRef(false);
  useEffect(() => {
    if (!ready || counted.current) return;
    counted.current = true;
    const seen = hasFired('app_new');
    trackOnce('app_new');
    if (seen) track('app_open');
    const onInstalled = () => trackOnce('install');
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, [ready]);
  /* activation: first food ever logged on this device, whichever way it got there */
  useEffect(() => {
    if (ready && log.length) trackOnce('first_log');
  }, [ready, log.length]);
  /* developer token arrives via #admin=TOKEN in the URL */
  useEffect(() => {
    const m = /^#admin=(.+)$/.exec(window.location.hash || '');
    if (m) {
      try { localStorage.setItem('mf2_adminToken', m[1]); } catch {}
      setAdminToken(m[1]);
      history.replaceState(null, '', window.location.pathname);
      setNotice('Developer mode enabled — reports live in Settings.');
    }
  }, []);
  /* local reminders while the app is running (push covers the closed-app case) */
  useEffect(() => {
    if (!ready || !settings.remind?.enabled) return;
    const tick = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const now = new Date();
      let firedArr = [];
      try { firedArr = JSON.parse(localStorage.getItem('mf2_fired') || '[]'); } catch {}
      const today = todayISO();
      firedArr = firedArr.filter((k) => k.startsWith(today));
      const fired = new Set(firedArr);
      const show = (title, body, key) => {
        fired.add(key);
        try {
          navigator.serviceWorker?.getRegistration().then((reg) => {
            if (reg) reg.showNotification(title, { body, icon: '/pwa-192.png', badge: '/pwa-192.png' });
            else new Notification(title, { body });
          });
        } catch { try { new Notification(title, { body }); } catch {} }
      };
      const goals = settings.goals;
      const goalCals = calsFrom(goals.protein, goals.carbs, goals.fat);
      const eaten = entryMacros(log.filter((e) => e.date === today));
      const left = Math.max(0, Math.round(goalCals - calsFrom(eaten.protein, eaten.carbs, eaten.fat)));
      dueMealReminders({ meals, now, fired }).forEach((m) => {
        show(`Time for ${m.label}`, goalCals > 0 ? `${left} kcal left today — protein first.` : 'Log it when you eat it.', fireKey(m.id, 'meal', now));
      });
      if (settings.remind?.nudge) {
        const hasLogged = (m) => log.some((e) => e.date === today && (e.meal || 'snack') === m.id);
        dueNudges({ meals, now, fired, hasLogged }).forEach((m) => {
          show(`${m.label} not logged yet`, 'Even a rough entry beats a blank day.', fireKey(m.id, 'nudge', now));
        });
      }
      if (dueShoppingReminder({ shopping: settings.shopping, now, fired })) {
        const open = groceries.filter((g) => !g.checked).length;
        show('Shopping run today 🛒', open > 0 ? `${open} item${open === 1 ? '' : 's'} on the list — scan as you shop.` : 'Your list is empty — generate the week from Plan first.', fireKey('shopping', 'shop', now));
      }
      try { localStorage.setItem('mf2_fired', JSON.stringify([...fired])); } catch {}
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [ready, settings.remind, settings.shopping, settings.goals, meals, log, groceries]);
  /* one-time v1 → v2 migration */
  useEffect(() => {
    if (!ready || migrated || !storageAvailable) return;
    (async () => {
      try {
        const hasData = foods.length || log.length || workouts.length || groceries.length;
        if (hasData) { setMigrated(true); return; }
        const read = async (k) => { try { const r = await storage.get(k, false); return r && r.value != null ? JSON.parse(r.value) : null; } catch { return null; } };
        const [g1, gr1, w1, f1, l1] = await Promise.all([read('mf_goals'), read('mf_groceries'), read('mf_workouts'), read('mf_foods'), read('mf_log')]);
        if (!g1 && !gr1 && !w1 && !f1 && !l1) { setMigrated(true); return; }
        applyImport({ version: 1, goals: g1, groceries: gr1, workouts: w1, foods: f1, log: l1 });
        setMigrated(true);
        setNotice('Imported your MacroForge v1 data automatically.');
      } catch (e) { console.error(e); setMigrated(true); }
    })();
  }, [ready, migrated]);
  const applyImport = (data) => {
    const n = normalizeImport(data);
    if (n.settings) setSettings({ ...DEFAULT_SETTINGS, ...n.settings });
    if (n.foods) setFoods(n.foods);
    if (n.recipes) setRecipes(n.recipes);
    if (n.log) setLog(n.log);
    if (n.plan) setPlan(n.plan);
    if (n.groceries) setGroceries(n.groceries);
    if (n.pantry) setPantry(n.pantry);
    if (n.water) setWater(n.water);
    if (n.workouts) setWorkouts(n.workouts);
    if (n.routines) setRoutines(n.routines);
    if (n.weights) setWeights(n.weights);
  };
  const importFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { const data = JSON.parse(reader.result); applyImport(data); setNotice('Import complete.'); setSettingsOpen(false); }
      catch (e) { setNotice('Import failed — not a valid MacroForge backup.'); }
    };
    reader.readAsText(file);
  };
  const unit = settings.unit || 'lb';
  const setUnit = (u) => setSettings((s) => ({ ...s, unit: u }));
  const ensureFood = ({ name, category, protein, carbs, fat, fiber, sugar, unit }) => {
    const existing = foods.find((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const fd = { id: uid(), name: name.trim(), category: category || CATEGORIES[0], protein: num(protein), carbs: num(carbs), fat: num(fat), fiber: num(fiber), sugar: num(sugar), unit: unit === 'g100' ? 'g100' : 'serving', favorite: false };
    setFoods((fs) => [fd, ...fs]);
    return fd;
  };
  const addFood = (fd) => setFoods((fs) => [fd, ...fs]);
  const updFood = (id, patch) => setFoods((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const delFood = (id) => setFoods((fs) => fs.filter((f) => f.id !== id));
  const streak = useMemo(() => {
    const days = new Set(log.map((e) => e.date));
    let s = 0; let d = todayISO();
    if (!days.has(d)) d = addDays(d, -1); // today not logged yet doesn't break the streak
    while (days.has(d)) { s++; d = addDays(d, -1); }
    return s;
  }, [log]);
  const swipeRef = useRef(null);
  /* first run: an empty library and no targets make a weak first week, so walk
     new users through targets → kitchen → backup before they land in the app.
     The decision is latched on first load — filling the library mid-flow must
     not yank the flow out from under them. */
  const [onboardOpen, setOnboardOpen] = useState(false);
  const onboardChecked = useRef(false);
  useEffect(() => {
    if (!ready || onboardChecked.current) return;
    onboardChecked.current = true;
    if (!onboarded && foods.length === 0 && log.length === 0) setOnboardOpen(true);
  }, [ready, onboarded, foods.length, log.length]);
  const addStarterPack = () => {
    const lib = makeStarterLibrary(uid);
    setFoods((fs) => [...lib.foods, ...fs]);
    setRecipes((rs) => [...lib.recipes, ...rs]);
    setSeedState('added');
    setSeedVersion(2);
  };
  /* early installs got a smaller pack whose recipes had no meal tags — top up
     the staples they're missing and tag the dishes, once, additively */
  useEffect(() => {
    // never resurrect a library the user cleared — only top up a real one
    if (!ready || seedState !== 'added' || seedVersion >= 2 || (!foods.length && !recipes.length)) return;
    const up = upgradeStarterLibrary(foods, recipes, uid);
    if (up.addedFoods) setFoods(up.foods);
    if (up.taggedRecipes) setRecipes(up.recipes);
    setSeedVersion(2);
    if (up.addedFoods || up.taggedRecipes) {
      setNotice(`Library updated — ${up.addedFoods} foods added, ${up.taggedRecipes} recipes now know their meal times.`);
    }
  }, [ready, seedState, seedVersion]);
  /* Eating draws stock down and corrections put it back, so the pantry keeps
     telling the truth. A ref mirrors state so consecutive edits in one tick
     settle against fresh numbers, and callers get the exact record back. */
  const pantryRef = useRef(pantry);
  pantryRef.current = pantry;
  const takeStock = (consumptions) => {
    if (!consumptions || !consumptions.length) return [];
    const { pantry: next, taken } = takeFromPantry(pantryRef.current, consumptions);
    if (taken.length) { pantryRef.current = next; setPantry(next); }
    return taken;
  };
  const giveStock = (taken) => {
    if (!taken || !taken.length) return;
    const next = returnToPantry(pantryRef.current, taken, uid);
    pantryRef.current = next;
    setPantry(next);
  };
  /* unknown barcode: keep a local log AND report to the collection API (fire-and-forget) */
  const recordUnknownScan = (code, name) => {
    setUnknownScans((u) => [{ id: uid(), code, name: name || '', date: todayISO() }, ...u.filter((x) => x.code !== code)].slice(0, 100));
    fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name: name || '', ts: Date.now() }) }).catch(() => {});
  };
  /* ---------- device sync (sync-code, no accounts) ---------- */
  const syncPayload = useMemo(() => ({ settings, foods, recipes, log, plan, groceries, pantry, water, workouts, routines, weights }),
    [settings, foods, recipes, log, plan, groceries, pantry, water, workouts, routines, weights]);
  const applyPayload = (d) => {
    if (!d) return;
    if (d.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings });
    const setters = { foods: setFoods, recipes: setRecipes, log: setLog, plan: setPlan, groceries: setGroceries, pantry: setPantry, water: setWater, workouts: setWorkouts, routines: setRoutines, weights: setWeights };
    SYNC_STORES.forEach((s) => { if (Array.isArray(d[s])) setters[s](d[s]); });
  };
  const syncRef = useRef({});
  syncRef.current = { meta: syncMeta, payload: syncPayload, ready };
  const syncBusy = useRef(false);
  const doSync = async () => {
    const { meta, payload, ready: ok } = syncRef.current;
    if (!ok || !meta || !meta.code || syncBusy.current) return;
    syncBusy.current = true;
    setSyncStatus({ busy: true, error: '' });
    try {
      let rev = meta.rev || 0;
      let base = meta.base || {};
      let current = payload;
      const res = await fetch(`/api/sync?code=${encodeURIComponent(meta.code)}&sinceRev=${rev}`);
      if (!res.ok) throw new Error(`sync server ${res.status}`);
      const remote = await res.json();
      if (remote.rev === 0 && rev > 0) throw new Error('synced copy was deleted on the server');
      if (!remote.unchanged && remote.rev > rev && remote.data) {
        const merged = threeWayMerge(base, current, remote.data);
        applyPayload(merged);
        current = merged; rev = remote.rev; base = remote.data;
      }
      if (!payloadsEqual(current, base)) {
        const pres = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: meta.code, baseRev: rev, data: current }) });
        if (pres.status === 409) { syncBusy.current = false; setTimeout(doSync, 1200); return; } // raced another device — re-pull & re-merge
        if (!pres.ok) throw new Error(`sync push ${pres.status}`);
        const pj = await pres.json();
        rev = pj.rev; base = current;
      }
      setSyncMeta({ code: meta.code, rev, base, at: Date.now() });
      setSyncStatus({ busy: false, error: '' });
    } catch (e) {
      setSyncStatus({ busy: false, error: String((e && e.message) || e) });
    } finally {
      syncBusy.current = false;
    }
  };
  useEffect(() => { // pull on load, on returning to the app, and every 45s while open
    if (!ready || !syncMeta?.code) return;
    doSync();
    const iv = setInterval(doSync, 45000);
    const onVis = () => { if (document.visibilityState === 'visible') doSync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [ready, syncMeta?.code]);
  useEffect(() => { // debounced push after local edits settle
    if (!ready || !syncMeta?.code) return;
    if (payloadsEqual(syncPayload, syncMeta.base || {})) return;
    const t = setTimeout(doSync, 4000);
    return () => clearTimeout(t);
  }, [syncPayload, ready, syncMeta?.code]);
  const syncCreate = () => {
    const code = makeSyncCode();
    setSyncMeta({ code, rev: 0, base: {}, at: 0 });
    setTimeout(doSync, 100);
    return code;
  };
  const syncJoin = async (input) => {
    const code = normSyncCode(input);
    if (!code) return 'That doesn’t look like a sync code — it’s 16 characters like ABCD-EFGH-JKMN-PQRS.';
    try {
      const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}&sinceRev=-1`);
      if (!res.ok) return `Sync server error (${res.status}) — try again.`;
      const remote = await res.json();
      if (!remote.rev || !remote.data) return 'No synced data found for that code — double-check it on the other device.';
      const merged = threeWayMerge({}, syncRef.current.payload, remote.data);
      applyPayload(merged);
      setSyncMeta({ code, rev: remote.rev, base: remote.data, at: Date.now() });
      setNotice('Devices linked — history merged.');
      setTimeout(doSync, 600); // push the union back up
      return null;
    } catch (e) { return 'Couldn’t reach the sync server — check your connection.'; }
  };
  const syncUnlink = () => { setSyncMeta(null); setSyncStatus({ busy: false, error: '' }); };
  const syncDeleteRemote = async () => {
    const meta = syncRef.current.meta;
    if (!meta?.code) return;
    try { await fetch('/api/sync', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: meta.code }) }); } catch {}
    syncUnlink();
    setNotice('Synced copy deleted — data stays on each device.');
  };
  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify({ app: 'MacroForge', version: 3, exportedAt: new Date().toISOString(), settings, foods, recipes, log, plan, groceries, pantry, water, workouts, routines, weights }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `macroforge-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { console.error(e); }
  };
  const copyList = () => {
    const text = groceries.filter((g) => !g.checked).map((g) => `- ${g.name}${g.unitLabel === 'g' ? ` ${round(num(g.qty))}g` : num(g.qty) !== 1 ? ` x${round(num(g.qty))}` : ''}`).join('\n') || '(list empty)';
    try { navigator.clipboard && navigator.clipboard.writeText(text); } catch (e) {}
  };
  const clearAll = () => {
    setSettings(DEFAULT_SETTINGS); setFoods([]); setRecipes([]); setLog([]); setPlan([]); setGroceries([]);
    setPantry([]); setWater([]); setUnknownScans([]); setWorkouts([]); setRoutines([]); setWeights([]);
    setSeedState(''); setSeedVersion(0); setOnboarded(false); // a true fresh start, onboarding included
  };
  const tabs = [
    { id: 'today', label: 'Today', Icon: CalendarDays },
    { id: 'plan', label: 'Plan', Icon: CalendarRange },
    { id: 'train', label: 'Train', Icon: Dumbbell },
    { id: 'coach', label: 'Coach', Icon: Target },
  ];
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); } }, [notice]);
  // hold the gate until storage has loaded, so an invited device never flashes it
  if (ready && !invited) return <InviteGate onUnlocked={() => setInvited(true)} />;
  return (
    <div className="min-h-screen w-full" style={{ background: `radial-gradient(130% 75% at 50% -8%, ${T.limeDim}, transparent 55%), ${T.bg}`, color: T.text, fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #50505a; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=date] { color-scheme: dark; }
        select { color-scheme: dark; appearance: none; }
        @keyframes fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .fadein { animation: fadein .32s ease both; }
        .recharts-surface { overflow: visible; }
        ::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>
      <div className="mx-auto px-4 pb-16 pt-6" style={{ maxWidth: 560 }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: T.lime }}><Flame size={20} style={{ color: '#0c0c0e' }} /></div>
            <div><div style={{ ...display, fontSize: 26, lineHeight: 0.95, textTransform: 'uppercase' }}>MacroForge</div><div className="text-xs" style={{ color: T.faint, marginTop: 1 }}>fuel · plan · train · adapt</div></div>
          </div>
          <div className="flex items-center gap-2">
            {streak > 1 && <div className="flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: T.limeDim, border: '1px solid rgba(203,255,58,0.35)' }}><Flame size={12} style={{ color: T.lime }} /><span style={{ ...mono, fontSize: 11, color: T.lime, fontWeight: 700 }}>{streak}d</span></div>}
            <GhostBtn onClick={() => setSettingsOpen(true)}><Settings size={17} /></GhostBtn>
          </div>
        </div>
        {notice && <div className="rounded-xl px-3 py-2 mt-3 text-xs fadein" style={{ background: T.limeDim, border: '1px solid rgba(203,255,58,0.4)', color: T.lime, fontWeight: 600 }}>{notice}</div>}
        <div className="flex gap-1 p-1 rounded-2xl my-4" style={{ background: T.panel, border: `1px solid ${T.border}` }}>
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition" style={{ background: active ? T.lime : 'transparent', color: active ? '#0c0c0e' : T.muted, fontWeight: 700, fontSize: 12.5 }}>
                <t.Icon size={15} /> <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div
          onTouchStart={(e) => { const t = e.touches[0]; swipeRef.current = { x: t.clientX, y: t.clientY, block: !!e.target.closest('[data-noswipe],input,textarea,select') }; }}
          onTouchEnd={(e) => {
            const s = swipeRef.current; swipeRef.current = null;
            if (!s || s.block) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - s.x, dy = t.clientY - s.y;
            if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return;
            const i = tabs.findIndex((x) => x.id === tab);
            const next = dx < 0 ? Math.min(tabs.length - 1, i + 1) : Math.max(0, i - 1);
            if (next !== i) setTab(tabs[next].id);
          }}
        >
        {!ready ? (
          <div className="flex items-center justify-center py-20" style={{ color: T.faint }}><div className="text-sm">Loading your data…</div></div>
        ) : tab === 'today' ? (
          <TodayView settings={settings} setSettings={setSettings} log={log} setLog={setLog} foods={foods} recipes={recipes} ensureFood={ensureFood} plan={plan} streak={streak} water={water} setWater={setWater} onConsume={takeStock} onRestore={giveStock} />
        ) : tab === 'plan' ? (
          <PlanView settings={settings} setSettings={setSettings} plan={plan} setPlan={setPlan} groceries={groceries} setGroceries={setGroceries} pantry={pantry} setPantry={setPantry} foods={foods} recipes={recipes} ensureFood={ensureFood} log={log} meals={meals} onUnknownScan={recordUnknownScan} />
        ) : tab === 'train' ? (
          <TrainView workouts={workouts} setWorkouts={setWorkouts} routines={routines} setRoutines={setRoutines} unit={unit} setUnit={setUnit} />
        ) : (
          <CoachView settings={settings} setSettings={setSettings} log={log} workouts={workouts} weights={weights} setWeights={setWeights} />
        )}
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)}
        onManageLibrary={() => { setSettingsOpen(false); setLibraryOpen(true); }}
        onManageRecipes={() => { setSettingsOpen(false); setRecipesOpen(true); }}
        onManageSchedule={() => { setSettingsOpen(false); setScheduleOpen(true); }}
        onManageSync={() => { setSettingsOpen(false); setSyncOpen(true); }} syncLinked={!!syncMeta?.code}
        onSendFeedback={() => { setSettingsOpen(false); setFeedbackOpen(true); }}
        onViewReports={() => { setSettingsOpen(false); setReportsOpen(true); }} hasAdmin={!!adminToken}
        onExport={exportData} onImport={importFile} onCopyList={copyList} onClearAll={clearAll}
        foodCount={foods.length} recipeCount={recipes.length} logCount={log.length} />
      <LibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} foods={foods} addFood={addFood} updFood={updFood} delFood={delFood} />
      <RecipesModal open={recipesOpen} onClose={() => setRecipesOpen(false)} recipes={recipes} setRecipes={setRecipes} foods={foods} />
      <MealScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} settings={settings} setSettings={setSettings} />
      <ReportsModal open={reportsOpen} onClose={() => setReportsOpen(false)} token={adminToken} localUnknowns={unknownScans} />
      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} meta={syncMeta} status={syncStatus}
        onCreate={syncCreate} onJoin={syncJoin} onSyncNow={doSync} onUnlink={syncUnlink} onDeleteRemote={syncDeleteRemote} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <OnboardingModal open={onboardOpen} onDone={() => { setOnboardOpen(false); setOnboarded(true); if (!seedState) setSeedState('dismissed'); }}
        settings={settings} setSettings={setSettings} onAddStarterPack={addStarterPack}
        onCreateSync={syncCreate} syncCode={syncMeta?.code || ''} />
    </div>
  );
}
