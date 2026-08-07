# MacroForge — marketing handoff

*Written Aug 6, 2026, at the point where the product is finished and promotion begins.
This is the self-contained brief: everything needed to run marketing without reading
the build history. Companion docs in this repo: `PROMO.md` (ready-to-post copy),
`RESEARCH.md` (competitor landscape, Aug 2026).*

---

## The product in one paragraph

MacroForge is a macro tracker and meal planner that starts at the grocery store instead of
the plate. You put in what you bought — or scan barcodes in the aisle — and it builds the
week's meals from that, aimed at your macro targets. At the store, scanning an item tells you
whether it's worth buying *for the week you're actually having* ("your week still needs 300g
protein — this covers three meals' worth"), not a generic health score. It's a local-first web
app: no accounts, no passwords, no server holding your data; devices link with a private sync
code. Free through the beta.

**USP, exact wording:** *Plan from your cart. Hit your macros.*

**The line that does the work in every channel:** every other macro app starts at the plate;
this one starts at the grocery store. Lead with that, never with a feature list.

---

## Where to reach it

| Thing | URL / location |
|---|---|
| App | https://macroforge.club |
| Signup / landing page | https://macroforge.club/join |
| Social preview card | auto-renders on any link (1200×630, branded) |
| Funnel + signups + feedback | inside the app: Settings → Developer (needs the admin token) |
| Admin unlock | open the app with `#admin=<ADMIN_TOKEN>` — token is in `macroforge-v2\.secrets.local` |

Never promote the old `macroforge-v2.vercel.app` URL. It still works for already-installed
apps, but every public link should be macroforge.club.

---

## What's live and honest to claim

Everything below is built, deployed, and verified in production:

- **Ingredients-first planning** — the week's meals are generated from the grocery list + pantry
- **Barcode scanner with verdicts** — judged against the user's remaining weekly macro gap
- **Whole-foods scoring** — ultra-processed items can't score well by having convenient macros
- **Recipe-aware planner** — real dishes in slots ("Overnight Oats", "Salmon Plate"), not "180g chicken"
- **Pantry tracking** — stock draws down as food is logged, so next week plans from what's left
- **Adaptive TDEE coach** — recalculates from actual logged intake and weigh-ins
- **Configurable meals per day** with per-meal times (not everyone eats three)
- **Push reminders** — meal times, missed-meal nudges, weekly shopping-day heads-up
- **Device sync via private code** — no account, no password, no email required
- **Water, fiber, added-sugar tracking**, meal-prep batch portions
- **Works offline, installs from the browser** on phone and desktop
- **Automated invite email** on signup, from info@macroforge.club (replies go to ethan@macroforge.club)

**Contact addresses:** `ethan@macroforge.club` is the real mailbox (Zoho — its own app,
deliberately separate from the ELMT Marketing Gmail so a beta tester is never mistaken for a
sales lead). `info@macroforge.club` is an alias landing in the same inbox; it's what the app
sends from and the only address safe to publish. Anything else on the domain bounces —
`support@`, `hello@` and friends have no mailbox, so never print them in a post, bio, or video.

## Invite-only: how access actually works

The app can't be used without signing up first. Someone who lands on macroforge.club sees a
gate, not the app. This shapes every campaign — **the call to action is always "get an invite",
never "try it now"**, and scarcity/exclusivity is a legitimate angle to lean on.

The flow: enter email → invite arrives within seconds → the link in it (`?k=…`) unlocks the app
on that device permanently. The email also prints the key in plain text so a second device can
be unlocked by hand; a key works on up to 8 devices, so a link pasted publicly stops working.
Someone who loses the email can re-enter their address to have it resent (throttled to once an
hour so it can't be used to bombard anyone).

Practical consequences for marketing:

- **Every signup is a real, deliverable email address**, so the signup number is a true lead count.
- **The gate is the conversion point.** If people arrive and don't sign up, the gate copy is the
  thing to change — that's a code change, so bring it back to Claude Code.
- **Anyone you want to demo it to needs an invite**, including press, friends, and collaborators.

## Measurement: what you can see

Analytics are built in and privacy-preserving — no cookies, no third-party scripts, no personal
data, which keeps the "we don't harvest you" claim honest. Settings → Developer shows a 30-day
funnel: **saw the landing page → signed up → opened the app → logged food → generated a week**,
each step showing conversion from the step above, plus unique visitors, installs and first scans,
broken down by traffic source.

**Tag every campaign link** or the source shows as "direct". Append `?utm_source=NAME` —
e.g. `https://macroforge.club/join?utm_source=reddit`. First touch is what gets the credit, so
whoever brought someone in keeps it even if they return later by typing the address. Use one
clear name per channel (`reddit`, `instagram`, `tiktok`, `x`) and keep it consistent — the
dashboard groups by exactly that string.

### ⚠️ Do NOT promote yet: AI photo logging

The feature is fully built and deployed, but it needs API credits on Ethan's Anthropic account
before it actually analyzes anything. Right now testers who tap it get a polite "not switched on
for this beta yet" message. **Until credits are added, no post, script, or caption should mention
photo logging.** Once it's on, it's arguably the strongest hook in the arsenal — treat it as a
held-back launch beat, not part of round one.

---

## Voice and hard rules

These are non-negotiable and come from the product's design, not preference:

1. **The inverse food pyramid is settled.** Whole foods form the foundation; refined and
   ultra-processed sit at the narrow tip. Never question, hedge, or suggest flipping this
   framing in any copy.
2. **Honesty over hype.** The product tells users when their cart *can't* cover the week. Copy
   should match that tone — no "effortless", no "AI-powered nutrition revolution", no fake
   precision. The competitive research shows the whole category over-claims; not doing that
   is a differentiator.
3. **Ethan built this, personally.** Every channel expects a person who made a thing, not a
   brand doing marketing. Disclose that he built it, reply to comments, never argue with critics.
4. **No accounts / no data harvesting is a selling point.** Lead with it in privacy-conscious
   channels — it's true and rivals can't copy it without rebuilding.
5. **Email consent is narrow.** The signup fine print promises MacroForge updates only. The
   list must not be used for Afterload (Ethan's fitness ecom shop) or anything else without a
   separate, explicit opt-in. This is a legal/trust line, not a style preference.
6. **Ethan's personal diet is not the product's opinion** and shouldn't appear in content.

---

## Competitive position (details in RESEARCH.md)

- **MyFitnessPal** — $80–100/yr, ad-choked free tier, barcode paywalled, has fallen out of
  favor on Reddit. It also now **owns Cal AI**.
- **Cal AI** — the photo-logging breakout; Apple briefly pulled it in April 2026 over a
  deceptive paywall. Trust is its soft spot.
- **MacroFactor** — $72/yr, best-in-class adaptive TDEE, but **no photo logging, no meal
  planning, no free tier**.
- **Cronometer / Lose It** — $40–50/yr, photo logging paywalled or weak, plan nothing.
- **Eat This Much** — nearest neighbor: auto-plans to macro targets, but backwards — it
  invents a plan then tells you what to buy (reviewers cite oversized lists, repetition by week 3).
- **SuperCook / Mealime** — plan from your pantry, but completely macro-blind.

**The empty seat we occupy:** nobody combines grocery-first planning with macro tracking.
That's the story, and it's defensible in a way features aren't.

**Pricing narrative:** free through the beta; at launch, free core plus a one-time Pro unlock
(~$29–39) instead of a subscription. Against $12–20/month incumbents, "pay once" is a strong
angle — subscription fatigue is a recurring, documented complaint in the category.

---

## Channels already chosen and prepped

`PROMO.md` has finished copy for each. Summary of what's there and the traps:

- **Reddit** — r/mealprep is the best fit (full post drafted). r/EatCheapAndHealthy reframed
  around food waste, r/loseit around adherence, r/SideProject as a build story.
  **r/fitness bans app self-promo outright — do not post there.** Don't post the same text to
  multiple subs the same day; Reddit's spam filter catches it. A zero-history account posting
  a link reads as spam — comment elsewhere for a few days first.
- **Instagram / TikTok** — 25-second script, shot-by-shot, filmed in a real store. The scanner
  verdict is the hook, not an app tour.
- **X / Threads** — six-tweet thread; link goes in the LAST post (reach is throttled on links).

---

## What's missing and blocking good marketing

Honest list of gaps, roughly in priority order:

1. **Real screenshots.** Every piece of promo needs them and none exist yet. Needed from a real
   phone, not a mockup: the scanner verdict card, a generated week, and the Today screen with
   real numbers in it. This is the single highest-leverage thing to produce first.
2. **No demo video or GIF** for people who won't install anything to evaluate it.
4. **No App Store presence.** It's a web app; every competitor is in the stores. A Capacitor
   wrapper is on the roadmap but deliberately deferred.
5. **Photo logging is dark** until credits (see above).

---

## The split: what to bring back to Claude Code

Marketing strategy, content, scheduling, community management, and creative direction are
better handled elsewhere. But some marketing *needs* code changes, and those come back here:

- **Landing page and gate copy** — new headlines, social proof, restructured layout, A/B variants
- **New funnel steps or metrics** if a campaign needs something the dashboard doesn't show
- **The social preview card** — the image that renders when links are shared is generated in code
- **UTM handling** — if campaigns need per-channel attribution
- **Anything about how the product behaves** in response to what testers say
- **Separate consent checkbox** if the Afterload cross-promotion ever goes ahead
- **Turning on photo logging** once credits are added (no code change needed — it self-enables)

---

## Immediate next moves, in order

1. **Take the screenshots** (phone, real data) — blocks everything else.
2. **Add Anthropic credits**, then decide whether photo logging launches with round one or
   as a follow-up beat.
3. **Post to r/mealprep first** — best fit, copy is ready, single channel so the result is
   readable. Tag the link `?utm_source=reddit`.
4. Watch the funnel in Settings → Developer. Signups auto-receive their invite; the number that
   matters is not signups but how many reach **logged food** — that's the one that predicts
   whether anyone stays.
