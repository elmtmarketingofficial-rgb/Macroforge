# MacroForge — roadmap and rules of engagement

*Written 7 Aug 2026. Reconciled 12 Aug 2026. The shared reference for both
workstreams. If a decision isn't in here, it hasn't been made yet — bring it
back to Ethan rather than assuming.*

**When reality has moved past this file, fix this file.** Working around a
stale roadmap is how the last five days got spent chasing an item that was
already done. Correct it in the same session, and date the correction.

---

## Where things actually stand

**Full stack health check — 13 Oct 2026.** Every line below was exercised
against production this session, not inferred:

| Thing | State |
|---|---|
| `macroforge.club`, `/join`, OG card | 200 |
| Invite pipeline (signup → email → `?k=` unlock → app) | works end to end |
| Resend domain | verified, us-east-1; last send delivered 6 Oct |
| Reminder cron (QStash `scd_68Uiof…`) | active, every 10 min, not paused |
| `/api/push/tick` | 200, 1 live subscription |
| Starter pack, food logging, header nav | work (63 foods + 12 recipes, log + `first_log` fire) |
| `/api/invite`, `/api/feedback`, `/api/report`, `/api/sync` | alive, rejecting correctly |
| Tests / build | 133 passing, builds clean |
| Vercel Web Analytics | installed 30 Aug via PR #1, serving (runs alongside the first-party funnel) |
| **`/api/photo`** | **503 — out of credits, see below** |

Production has been running the 30 Aug deployment untouched for 44 days.

**Built and verified previously:** the app (macroforge.club), invite-only gate,
automated invite email, real mailbox, privacy-preserving funnel analytics,
device sync, barcode scanner, ingredients-first planner, reminders.

**AI photo logging — LIVE AGAIN as of 9 Nov 2026.** Ethan topped up the shared
Anthropic balance; a real `POST /api/photo` returned 200 the same day and
correctly read the test image as "a logo, no food visible" rather than
inventing a meal. It was dark from roughly early September until then.

*History, so nobody trusts this line blindly: live 7 Aug → dark ~Sep → live
12 Aug claim → found dark 13 Oct → live 9 Nov. The cause every time is the
balance it shares with the Prediction Desk, and nothing alerts when it drains
(open question 1). Re-verify with a real POST before writing this either way.*
**Not built:** anything to do with membership, billing, or the shop.

**The number that matters:** signups vs `first_log`.

**Reading taken 13 Oct 2026** — the first clean one, and the blocker this
table used to carry is now cleared.

| Window | Signups | Opened app | **Logged food** | Planned a week | Scanned |
|---|---|---|---|---|---|
| 60d (14 Aug – 13 Oct, all post-`560b76f`) | 3 | 1 | **1** | 0 | 1 |
| **27d (13 Oct – 9 Nov)** | **0** | **0** | **0** | 0 | 0 |
| 90d (all time, pre-fix data contaminated) | 9 events / 5 real rows | 81 | **2** | 0 | 1 |

Signup list holds **5 real addresses** (7 Aug ×2, 14 Aug, 22 Aug, 6 Oct). The
6 Oct one is the first to tick the Afterload consent box.

**9 Nov update:** the four weeks since the last reading produced nothing — no
signups, no new opens, no logs; only 8 returning opens. Signup list is 6 (the
13 Oct arrival ticked the Afterload box, so 2 of 6 have shop consent). Ethan's
own diagnosis of why is in Phase 1 below.

Read honestly: **5 people have signed up over two months and 2 have ever logged
food. Nobody has generated a week's plan — the thing the product is for.** No
tester feedback has ever been submitted (`/api/feedback` returns 0). The gate to
monetisation is nowhere near open.

Caveat on the pre-fix column: commit `560b76f` (10 Aug) fixed `app_new` firing
ahead of the invite gate, which had been counting crawlers. Anything older than
10 Aug overstates the top of the funnel by roughly an order of magnitude.

Re-read with `/api/track?token=<ADMIN_TOKEN>&days=30` — token in
`.secrets.local`. Record the date, numbers and window here each time.

---

## The rule that overrides everything else

> **Nothing gets monetised until activation is proven.**

Do not build billing, design pricing tiers, or promote a paid membership while
`first_log` sits at zero. A checkout built before anyone wants the free product
is a checkout built for an audience that doesn't exist.

The gate to open monetisation work: **a meaningful share of signups reach
"logged food," and some come back a second week.** Until then, both workstreams
are about making the free product land.

**This gate is currently unmeasurable.** The instrument that reads it was
repaired on 10 Aug and has not been read since. Reading it is therefore the
first task in Phase 1, ahead of everything else — a gate nobody can measure is
a gate that gets stepped over by accident.

---

## Live risk to the gate: the shared Anthropic balance

Confirmed by Ethan, 12 Aug 2026. Photo logging and the Prediction Intelligence
Desk bill the **same metered Anthropic account**.

| | Burn |
|---|---|
| Prediction Desk | ~$2.89/night (~$87/mo), paper-only, no revenue |
| MacroForge photo logging | ~$0.023/photo (~$2/mo per active tester) |

When that balance drains, photo logging does not warn anybody — it degrades
silently. `api/photo.js:167-172` maps an out-of-credits `400` to
`503 {"error":"not configured"}`, which the app renders to the tester as
"not switched on for this beta yet". That was the right call for the tester's
experience and the wrong shape for an operator: the flagship feature can go
dark, with testers who were personally told to use it hitting a polite refusal,
and nothing on the MacroForge side reports it.

Consequences to hold in view:

- The 20×-costlier project on the shared card can switch off the only feature
  in the portfolio with actual users.
- A drained balance during a promotion window turns an activation push into a
  broken promise, which is exactly the failure this roadmap's constraint 6
  exists to prevent.
- Lever, if it is ever needed: `RESEARCH_AI_MAX_DAILY_REQUESTS` in the
  Prediction Desk's Render blueprint. **That is Ethan's call, not a
  session's** — it is a cross-project budget decision.

Open, unowned: nothing alerts on the balance. See "Open questions" below.

---

## Phase 1 — Prove the thing works (now)

Nothing else starts until this is done.

**Reordered 9 Nov 2026 by Ethan** (`jarvis/work/handoffs/HANDOFF-AFTERLOAD.md`,
from his 7–8 Nov voice notes). The funnel is not under-promoted, it is
**blocked at the install step**. His words: *"Nobody wants to go through all the
download and access hassle... that was a lot of work just to download a single
app."* So activation is not failing — it is currently **unmeasurable**, which
must not be reported as a pass or a fail. Order is now: remove install
friction → measure activation → decide the USP and promote.

Engineering note on that diagnosis: the hassle has two halves. **Download**
(no store listing; iOS has no install prompt) is what an app store fixes.
**Access** (the invite gate: email → wait → open mail → tap link, and on iOS
the home-screen app has its own storage so it asks for the key *again*) is
self-inflicted, and an app store does not fix it. Both are in the table.

| Item | Owner | Status |
|---|---|---|
| **Remove access friction — the invite gate** | Ethan decides, Claude Code builds | **open — see open question 5** |
| **Store listing — Play and/or App Store** | Ethan decides spend + creates accounts, Claude Code builds | **open — see open question 6** |
| Read the funnel post-`560b76f` and record it above | Claude Code | **done 13 Oct, again 9 Nov** |
| Add Anthropic credits → photo logging on | Ethan | **done again 9 Nov** (verified 200) |
| Real screenshots from a phone with real data | Ethan | open since 7 Aug |
| Get Afterload actually stocked | Ethan | open since 7 Aug (also blocks Phase 3) |
| First channel post (r/mealprep, tagged `?utm_source=reddit`) | Cowork | open |
| Watch funnel; act on whatever testers report | Claude Code | continuous |

**Success looks like:** people signing up, opening the app, and logging food
without being talked through it.

Note for whoever picks up the copy work: photo logging is **live again as of
9 Nov** and is still not on `landing.html`. Constraint 6 now permits it, but
whether it leads is open question 2 — and check it returns 200 on the day the
copy goes out, because it has gone dark without warning twice.

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

Voice logging (Cronometer shipped it April 2026; it's becoming table stakes).
Deferred. *App store distribution lived here until 9 Nov 2026, when Ethan named
the install as the blocker; it is now in Phase 1.*

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
   consented to shop mail. This is enforced in the broadcast endpoint
   (`api/broadcast.js:120-124` filters on `afterload === true`), not left to
   judgement. **The two existing testers signed up before the checkbox existed,
   so they have no shop consent and cannot be sent shop content** — winning it
   back requires a MacroForge-flavoured email *asking* them to opt in, never
   shop content sent presumptively.

4. **Honesty over hype.** The product tells users when their cart can't cover
   the week. The marketing matches that register. No "effortless", no
   "AI-powered revolution", no fake precision. Competitors over-claim; not doing
   so is a differentiator.

5. **Ethan built this personally.** Every channel expects a person who made a
   thing, not a brand doing marketing.

6. **Don't promote what isn't on — and check, don't assume.** Photo logging is
   **ON as of 9 Nov 2026** (it was off 13 Oct), so this does not block it today. The rule, in
   its sharpest form: **before any copy claims a feature works, confirm the
   feature works that day**, because the shared Anthropic balance above takes
   photo logging down without notice — it has now done so twice. A tester
   hitting a disabled feature on first contact is a broken promise. The check
   is one POST to `/api/photo`; `503 {"configured": false}` means it is off,
   200 with an analysis means it is on. Do not take this document’s word for
   it in either direction.

7. **Publish `info@macroforge.club` only.** `ethan@` is the real mailbox;
   `info@` is an alias. Everything else on the domain hard-bounces.

---

## Documents that still need correcting

Tracked here so the next session doesn't re-litigate settled facts. These are
outside this file and need someone with edit rights on them:

- `HANDOFF.md:98-104` — the "⚠️ Do NOT promote yet: AI photo logging" block.
  Photo logging is funded and live; the block should say so, and the standing
  rule is now constraint 6 above (verify-before-claiming), not a blanket ban.
- `HANDOFF.md:177` — "Photo logging is dark until credits (see above)" should
  come off the blocking-gaps list. Items 1 and 2 (screenshots, demo video)
  are still true.

---

## Open questions — not decided, do not invent an answer

1. **Nothing watches the shared Anthropic balance.** A drained account takes
   photo logging dark silently. Options range from a cheap synthetic check on
   `/api/photo` to a spend cap on the Desk to separate billing. No option has
   been chosen. Ethan's call — it is a money and cross-project priority
   decision.
2. **Whether photo logging leads the public copy.** Permitted now, not
   decided. Cowork and Ethan.
3. **What activation number opens the monetisation gate.** "A meaningful
   share" was written before any trustworthy funnel reading existed. Once the
   post-`560b76f` figure is on the table, it should be replaced with an actual
   threshold, agreed by Ethan and written here.
4. **Whether the two pre-checkbox testers get the Afterload opt-in email.**
   Constraint 3 says it is the only legitimate route to shop consent, and it
   is gated on Afterload being stocked. Not scheduled.
5. **The invite gate — keep, make optional, or remove.** Ethan asked for it on
   6 Aug ("they can't just access the application without going through the
   email sign up first"). On 7–8 Nov he named access hassle as the reason
   nobody uses the app. Those pull against each other; reversing his own
   instruction is his call. *Raised 9 Nov.*
6. **Which store listings, given cash.** Google Play is $25 once; Apple is
   $99 a year. Rent is the live constraint. 3 of the 4 signups with a known
   device are iPhone, so Android-first serves the minority and iOS is the
   expensive one. *Raised 9 Nov.*
7. **Afterload's launch shape** — compromise/dropship start versus a tiny
   catalogue he can stand behind. Explicitly his call per the handoff; the
   engineering side owes him a one-page choice, not a recommendation.
   *Raised 9 Nov.*

---

## Division of labour

**Cowork owns:** social strategy, content and calendars, channel selection,
campaign copy, community management, positioning, membership pricing strategy,
competitive response.

**Claude Code owns:** everything that requires a code change — landing page and
gate copy, funnel instrumentation, the app itself, email templates and sending
infrastructure, and eventually billing and entitlements.

**Ethan owns:** anything that spends money, anything that goes out to real
people (invariant: outward-facing sends are draft-first), and every item marked
"Ethan's call" above.

**The handoff in both directions is this file.** Marketing work that needs code
comes back to Claude Code; product decisions that change the story go to Cowork.
