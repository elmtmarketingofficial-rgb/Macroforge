# MacroForge v2

Macros, meal planning, auto-generated groceries, training log, and an adaptive
TDEE coach — a local-first PWA. All data lives on-device in IndexedDB; no
accounts, no backend.

## Run it

    npm install
    npm run dev        # dev server
    npm test           # unit tests for the calculation engines
    npm run build      # production build → dist/ (deploy anywhere static)

Deploy `dist/` to Vercel/Netlify/GitHub Pages. Open on your phone → "Add to
Home Screen" for the installable, offline app.

## Structure

    src/lib/engine.ts     pure math: kcal, Epley e1RM, smoothed weight trend,
                          adaptive TDEE, Mifflin-St Jeor seed, macro suggestion,
                          adherence scoring, per-100g portions — fully unit-tested
    src/lib/grocery.ts    meal-plan → aggregated shopping list (grams-aware)
    src/lib/importer.ts   v1/v2 backup normalization (Settings → Import)
    src/lib/off.ts        Open Food Facts search (the app's only network feature)
    src/storage.ts        IndexedDB key-value persistence
    src/core/tokens.js    design tokens (colors, macro palette, fonts)
    src/core/Charts.jsx   all Recharts usage, code-split into a lazy chunk
    src/core/App.jsx      the full UI (Today · Plan · Train · Coach)

## Food units

Foods are per-serving by default. Flip a food to **per 100 g** (in the picker's
create box, or Settings → Food library) and it logs by grams instead — steppers
move in 10 g increments and grocery lists aggregate in grams. Foods picked from
the **Search online** tab (Open Food Facts, online only) are saved per-100g
automatically, with a verified badge on completed OFF entries.

## Importing your old data

Settings (gear) → Import data (JSON) accepts both v1 and v2 MacroForge
exports. v1 log entries land under "Snacks" (v1 had no meals) — drag nothing,
just keep logging; new entries are meal-aware.
