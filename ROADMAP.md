# MacroForge — roadmap and rules of engagement

*Written 7 Aug 2026. The shared reference for both workstreams. If a decision
isn't in here, it hasn't been made yet — bring it back to Ethan rather than
assuming.*

---

## Where things actually stand

**Built, live, verified:** the app (macroforge.club), invite-only gate,
automated invite email, real mailbox, privacy-preserving funnel analytics,
device sync, barcode scanner, ingredients-first planner, reminders.

**Built but dark:** AI photo logging — code deployed, waiting on Anthropic API
credits. Testers currently see a polite "not switched on yet".

**Not built:** anything to do with membership, billing, or the shop.

**The number that matters:** 2 signups, **0 people have logged food.** Nobody has
completed the core action the product exists for. Everything below is ordered
around fixing that first.

---

## The rule that overrides everything else

> **Nothing gets monetised until activation is proven.**

Do not build billing, design pricing tiers, or promote a paid membership while
`first_log` sits at zero. A checkout built before anyone wants the free product
is a checkout built for an audience that doesn't exist.

The gate to open monetisation work: **a meaningful share of signups reach
"logged food," and some come back a second week.** Until then, both workstreams
are about making the free product land.

---

## Phase 1 — Prove the thing works (now)

Nothing else starts until this is done.

| Item | Owner |
|---|---|
| Real screenshots from a phone with real data | Ethan |
| Add Anthropic credits → photo logging switches itself on | Ethan |
| Get Afterload actually stocked | Ethan |
| First channel post (r/mealprep, tagged `?utm_source=reddit`) | Cowork |
| Watch funnel; act on whatever testers report | Claude Code |

**Success looks like:** people signing up, opening the app, and logging food
without being talked through it.

## Phase 2 — Fix what Phase 1 exposes

Driven entirely by evidence, not by plans made in advance. The last round of
tester feedback produced four real fixes; expect the same again. Landing page
and gate copy get iterated here based on where the funnel actually leaks.

## Phase 3 — The club (only after Phase 1 succeeds)

The membership: a monthly club giving VIP status at Afterload — member pricing,
member-only items, early access — alongside unlimited photo logging.

**Blocked on:** Afterload existing and being stocked. The membership's value is
entirely derivative of the shop; with a thin shop it is worth nothing and churns
in month two.

**The mechanic worth building toward:** the app already knows what someone is
short on. "Your week is 300g protein short — members get X off these three
things" is a recommendation with a reason, not an advert. No supplement shop can
do this, because none of them know what you're short on. That is the moat.

## Phase 4 — Reach

App store distribution via a Capacitor wrapper, and voice logging (Cronometer
shipped it April 2026; it's becoming table stakes). Both deferred deliberately.

---

## Constraints neither workstream may break

These come from product decisions Ethan has already made. They are not open
questions.

1. **The inverse food pyramid is settled.** Whole foods at the base,
   ultra-processed at the tip. Never question, hedge, or invert this framing —
   in copy, in the shop, or in the app.

2. **The shop must agree with the app.** The scanner tells people ultra-processed
   items are a "SKIP IT". If Afterload then sells exactly that, the product
   contradicts itself and the credibility is gone. Applied properly this is an
   advantage: *the only shop that sells what the app would actually tell you to
   buy.* Stock what the pyramid endorses.

3. **Email consent is split and cannot be merged.** Everyone who signed up
   consented to MacroForge beta mail. Only people who ticked the Afterload box
   consented to shop mail. This is enforced in the broadcast endpoint, not left
   to judgement. **The two existing testers signed up before the checkbox
   existed, so they have no shop consent and cannot be sent shop content** —
   winning it back requires a MacroForge-flavoured email *asking* them to opt in,
   never shop content sent presumptively.

4. **Honesty over hype.** The product tells users when their cart can't cover
   the week. The marketing matches that register. No "effortless", no
   "AI-powered revolution", no fake precision. Competitors over-claim; not doing
   so is a differentiator.

5. **Ethan built this personally.** Every channel expects a person who made a
   thing, not a brand doing marketing.

6. **Don't promote what isn't on.** Photo logging stays out of all copy until
   the credits are added. A tester hitting a disabled feature on first contact
   is a broken promise.

7. **Publish `info@macroforge.club` only.** `ethan@` is the real mailbox;
   `info@` is an alias. Everything else on the domain hard-bounces.

---

## Division of labour

**Cowork owns:** social strategy, content and calendars, channel selection,
campaign copy, community management, positioning, membership pricing strategy,
competitive response.

**Claude Code owns:** everything that requires a code change — landing page and
gate copy, funnel instrumentation, the app itself, email templates and sending
infrastructure, and eventually billing and entitlements.

**The handoff in both directions is this file.** Marketing work that needs code
comes back to Claude Code; product decisions that change the story go to Cowork.
