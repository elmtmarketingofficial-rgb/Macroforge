# MacroForge — competitor research packet
*Compiled Aug 5, 2026 from live sources (linked at the bottom). Read time ~6 minutes.*

## The one-paragraph version

Every serious competitor starts at the plate and charges a subscription for it. The incumbents
split into three camps: legacy giants coasting on habit (MyFitnessPal), science-first trackers
with no planning (MacroFactor, Cronometer), and photo-first newcomers with churn-machine
paywalls (Cal AI — which MyFitnessPal now owns). Nobody in the macro-tracking camp plans
from the groceries you actually bought, and nobody in the pantry-planning camp (SuperCook,
Mealime) tracks macros. MacroForge sits in the empty seat between them, and as of this week it
also has the one feature that made Cal AI explode: photo logging.

---

## The field, priced

| App | Price (2026) | Model | AI photo | Plans meals? | From YOUR groceries? |
|---|---|---|---|---|---|
| **MyFitnessPal** | $79.99/yr Premium, $99.99/yr Premium+ | Freemium + ads | Yes (paid) | Premium+ only (recipe library) | No |
| **Cal AI** (MFP-owned) | ~$19.99–29.99/yr sticker; real charges reported to $49.99 | 3-day trial → auto-renew | Yes (core feature) | No | No |
| **MacroFactor** | $71.99/yr ($11.99/mo) | Paid only, no free tier | **No** | No | No |
| **Cronometer** | $49.99/yr Gold | Freemium | Gold only (added Aug 2025) | No | No |
| **Lose It** | $39.99/yr Premium | Freemium | "Snap It" — 64/100 on mixed dishes | No | No |
| **Eat This Much** | $60/yr ($5/mo annual) | Freemium | No | **Yes — from macro targets** | No — generates a list *for* you |
| **SuperCook / Mealime / Samsung Food** | Free–cheap | Various | No | From pantry/recipes | Pantry yes — **but zero macro awareness** |
| **MacroForge** | Free beta | Local-first, no account | **Yes (shipped this week)** | **Yes** | **Yes — the whole premise** |

Two apps deserve close watch:

- **Eat This Much** is the nearest neighbor: it generates macro-targeted meal plans and a
  grocery list. But its direction is backwards from ours — it invents a plan, then tells you
  what to buy (reviewers flag "oversized grocery lists" and recipe repetition by week 3).
  We start from what you bought or already own. CNN called it 2025's best meal planner and
  it holds 4.7★ on iOS, so the *category* of auto-planning is validated.
- **Cal AI** proved photo logging sells to a mass audience — and then Apple briefly pulled it
  from the App Store in April 2026 for a deceptive paywall (weekly price shown instead of the
  real bill, hidden auto-renew toggle). It's back, and it's owned by MyFitnessPal now. The
  giant is consolidating the photo-logging market.

## 2026 table stakes (what testers will silently expect)

From the comparison roundups and Reddit threads, an app is taken seriously in 2026 if it has:

1. **Barcode scan** — we have it, with a verdict engine on top nobody else has.
2. **AI photo logging** — shipped (needs the API key flipped on, see below). Accuracy across
   the whole field is ~80% first pass, 90–95% after a human correction — Cal AI included.
   Nobody is magic; our honest "AI estimate, trust the label" framing matches reality.
3. **Adaptive TDEE** — MacroFactor's whole identity. Our Coach recalibrates from logged
   intake + weigh-ins, so we tick it.
4. **No ads inside the logging flow** — the #1 quit-reason on Reddit. We have no ads at all.
5. **Works on any device / web** — MacroFactor brags about this; we're a PWA, same tick.
6. **Voice logging** — Cronometer added it April 2026. We don't have it. Cheap to add later
   via the same endpoint pattern as photos; roadmap, not urgent.

## Where each one is beatable

- **MyFitnessPal** — fallen out of favor across Reddit ("once the default, now almost entirely
  out of the rotation"): ad-choked free tier, $80–100/yr to remove friction, barcode scanner
  paywalled. *Our angle: everything their paywall holds hostage — barcode, custom macros,
  no ads — is free in MacroForge.*
- **Cal AI** — trust is its soft spot: dynamic pricing, shortest trial in the category,
  an App Store removal over deceptive billing, and now big-company ownership. *Our angle:
  no account, no card, data stays on your device. The anti-dark-pattern photo tracker.*
- **MacroFactor** — best-in-class science, but no photo logging, no meal planning, no free
  tier. Serious lifters log 6 ingredients one search at a time. *Our angle: we plan the week
  they're about to eat AND snap the plate they didn't plan.*
- **Cronometer** — micronutrient depth, but photo logging is paywalled behind Gold and it
  plans nothing. *Our angle: same, plus fiber/added-sugar tracking covers the casual end of
  their pitch.*
- **Eat This Much** — plans from a fantasy pantry. Users report buying a giant list of
  ingredients for a plan they abandon by Wednesday. *Our angle: "we don't tell you what to
  buy — we make the week from what you bought." Waste-free framing lands with the
  r/EatCheapAndHealthy crowd.*
- **SuperCook & friends** — pantry-in, recipes-out, but macro-blind. *Our angle: keep the
  convenience, add the targets.*

## What photo logging costs us (pricing input)

Each photo analysis costs roughly **$0.01–0.03** in API spend (image + structured response on
Claude Opus 5). A heavy user snapping 10 meals/day ≈ **$3–9/month** in raw cost; a typical
user (2–3/day) ≈ $1–3/month. The per-IP cap (25/hour) blocks abuse, but the pricing
implication is clear and matches what the whole market already concluded — photo logging is
the natural **paid-tier feature**:

- **Free**: everything MacroForge does today, plus a taste of photo logging (e.g. 3/day).
- **Pro (one-time $29–39 or ~$20/yr)**: unlimited photos + future voice logging.
  Even at $20/yr we undercut every incumbent's *annual* price while covering costs unless a
  user averages >2 photos/day every day — and one-time pricing stays a violent differentiator
  against subscription fatigue, which the Reddit threads confirm is real and rising.

## Threats worth naming

1. **MFP + Cal AI consolidation** — the biggest brand now owns the biggest photo feature.
   They will cross-sell hard. We can't out-spend them; we out-position them (privacy,
   no-subscription, grocery-first).
2. **Photo logging is commoditizing** — every app will have it within a year. It's a
   ticket-to-play, not a moat. The moat stays the ingredients-first loop + verdict scanner.
3. **Web distribution ceiling** — every competitor is in the app stores; we're install-from-
   browser. Capacitor wrap is already on the roadmap and becomes urgent the moment retention
   numbers justify it.

## Sources

- [MyFitnessPal cost breakdown (FitBudd)](https://www.fitbudd.com/post/myfitnesspal-app-cost) · [MFP review 2026 (Garage Gym Reviews)](https://www.garagegymreviews.com/myfitnesspal-review)
- [Cal AI pricing analysis (eesel)](https://www.eesel.ai/blog/cal-ai-pricing) · [Cal AI accuracy review (Nutrola)](https://nutrola.app/en/blog/cal-ai-review-2026) · [Apple pulls Cal AI (MacRumors)](https://www.macrumors.com/2026/04/21/apple-cal-ai-app-store-removal/) · [TechCrunch on the crackdown](https://techcrunch.com/2026/04/21/apples-cal-ai-crackdown-signals-its-still-policing-the-app-store/)
- [MacroFactor pricing (Hronikka)](https://hronikka.com/blog/macrofactor-pricing) · [MacroFactor review — the photo-logging gap (Bento Bunny)](https://www.bentobunny.app/reviews/macrofactor-review)
- [Cronometer pricing tiers (NutriScan)](https://nutriscan.app/blog/posts/cronometer-pricing-2026-basic-vs-gold-vs-pro-b28e621201) · [Cronometer vs Lose It (FuelNutrition)](https://fuelnutrition.app/compare/cronometer-vs-lose-it)
- [Best calorie apps 2026 (CalorieBliss)](https://caloriebliss.com/articles/best-calorie-tracking-apps-2026-myfitnesspal-lose-it-cronometer/) · [Reddit consensus 2026 (TheTestDesk)](https://thetestdesk.com/articles/best-calorie-tracking-app-reddit-2026/)
- [Eat This Much review 2026 (UltimateMealPlans)](https://ultimatemealplans.com/reviews/eat-this-much) · [Pantry meal-planning apps ranked (FoodiePrep)](https://www.foodieprep.ai/blog/best-pantry-meal-planning-apps-2026)
