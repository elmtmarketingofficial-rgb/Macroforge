# MacroForge — promo queue, September 2026

*Written 2 Sep 2026 against the live product as verified that day. Revised the same week
on Ethan's direction (dated 3 Sep 2026): MacroForge gets its own social accounts, and
nothing MacroForge goes out on any ELM Tree Marketing channel — not the LinkedIn page,
not his ELM-facing profile, not @elmtmarketing on X, not ELM's Buffer. The businesses do
not mix.*

*Photo logging is DARK (`POST /api/photo` → 503) and is not mentioned in any post below.
If that changes, it is still Ethan's call whether it enters the copy — do not add it by
default.*

Link everywhere: `https://macroforge.club/join` + `?utm_source=<channel>`.
Contact everywhere: `info@macroforge.club`. Nothing else on the domain has a mailbox.

Funnel this is written against (last 30 days): 8 signups, 2 logged food, 0 installs,
about one visitor a day since the 7–10 Aug spike. The job is signups at `/join`.

---

## 0. Channels — MacroForge-owned, three Buffer slots

Buffer's free tier is 3 channels and 10 scheduled posts per channel. The product has no
image pipeline yet (no screenshots, no video — HANDOFF.md gap #1), so the three slots go
to text-first channels where one piece of copy serves all three.

| Slot | Channel | Why |
|---|---|---|
| 1 | **X** | Where "I built a thing" posts get found by people who track macros; the whole category argues here. 280 chars, link counts as 23. Reach is throttled on links — accept it, the link is the point. |
| 2 | **Threads** | Text-first, 500 chars, new accounts get algorithmic reach without followers, and links are not penalised the way X does. Requires an Instagram account to exist (Threads logs in through Instagram) — see Accounts below. |
| 3 | **Bluesky** | Text-first, 300 chars, no link penalty, and the handle can be the domain itself (`@macroforge.club`), which is the cheapest credibility signal available. Smaller audience; costs nothing to include. |

**Dropped: LinkedIn.** A MacroForge company page has to be administered from a personal
LinkedIn profile, and Ethan's is the ELM-facing one — that is the mixing this revision
exists to stop. A company page for a solo beta with eight signups also reads as a brand
doing marketing, which HANDOFF.md's voice rule #3 forbids. Revisit only if there is ever a
MacroForge-only personal presence to hang it on.

**Deferred: Instagram, TikTok.** Both need the screenshots and the 25-second store video
from PROMO.md. The Instagram account gets *created* now (Threads needs it) and stays empty
until there is something real to put on it.

**Reddit is not in Buffer.** It is posted by hand from Ethan's aged account — see §1.

**Buffer:** a **separate free Buffer account** registered on `info@macroforge.club`, with X,
Threads and Bluesky as its three channels. ELM's Buffer is never opened for MacroForge.
The free tier holds 10 queued posts per channel, so load days 1–10 on 3 Sep and add days
11–14 on or after 13 Sep once the early posts have published and freed their slots.

---

## Accounts to create

Create all of these in one sitting, before the first post on Thu 4 Sep. Same handle on
every platform if it is free; fall back in the order shown. Do the email test first —
every platform's verification code depends on it.

**Registration email for every account: `info@macroforge.club`.** It is an alias that
lands in the real `ethan@macroforge.club` Zoho inbox, so codes and recovery mail arrive;
and it is the only address on the domain that is safe to publish (HANDOFF.md). Platforms
surface the registration address through contact-sync and "find friends" features, so the
publishable alias is the one that goes on the accounts, and `ethan@` stays unpublished.
Before registering anything: send one test email to `info@macroforge.club` from another
address and confirm it arrives in the Zoho inbox. Turn on 2FA everywhere, with Ethan's
phone as the recovery number.

**Handles, in order of preference:** `macroforge` → `macroforgeclub` → `macroforge_app`
(`macroforge-app` on Bluesky, where underscores are not allowed).

**What could be verified from here (2 Sep 2026):**
- **Bluesky** — checked against the public profile API with a control: `macroforge.bsky.social`,
  `macroforgeclub.bsky.social`, `macroforge-app.bsky.social` and the domain handle
  `macroforge.club` all return "Profile not found". **Unclaimed as of today.** Take the domain
  handle: Bluesky → Settings → Change handle → "I have my own domain" → add the DNS TXT
  record it shows at the registrar (a two-minute job, no code change).
- **X** — X's public syndication endpoint returns a full timeline for a control account and a
  2 KB stub with no profile for `macroforge`, `macroforgeclub` and `macroforge_app`. That is
  consistent with the handles being free, but a suspended, protected or reserved handle
  looks identical from outside. **Not verified; plausible.** Try `macroforge` first at signup.
- **Threads / Instagram** — both sit behind a login wall from here; nothing could be checked.
  **Unverified.** "MacroForge" is a generic enough word (macro keyboards, Excel tooling) that
  a collision on Instagram is likely — expect to fall back to `macroforgeclub` there, and
  whichever Instagram handle you get is automatically the Threads handle.

| Platform | Handle to try | Link in profile | Notes |
|---|---|---|---|
| X | `@macroforge` | `https://macroforge.club/join?utm_source=x` | Bio 160 max; the bio below fits. Location field: "macroforge.club" or blank. |
| Threads | `@macroforge` (inherits Instagram) | `https://macroforge.club/join?utm_source=threads` | Created from the Instagram account, not separately. Bio 150 max. |
| Bluesky | `@macroforge.club` (domain handle) | `https://macroforge.club/join?utm_source=bluesky` | Sign up as `macroforge.bsky.social`, then switch to the domain handle. Bio 256 max. |
| Instagram | `@macroforge` → `@macroforgeclub` | `https://macroforge.club/join?utm_source=instagram` | Exists so Threads can. Stays empty until screenshots exist. |
| Buffer | — | — | Separate free account on `info@macroforge.club`. Connect X, Threads, Bluesky. |

**Bio (product voice; same on every platform, fits the 150-char Threads limit):**

```
A macro tracker that starts at the grocery store, not the plate. Plan from your cart, hit your macros. No account, no ads. Free beta, built by Ethan.
```

**Display name:** `MacroForge`. Not "MacroForge App", not "MacroForge Club".

**Avatar and banner:** do not design anything new. The brand already exists in code:
- `api/og.tsx` renders the 1200×630 social card — dark `#0c0c0e` ground, a lime `#cbff3a`
  rounded square holding the line-icon mark, headline in `#f3f3f1`. The lime square with the
  mark is the avatar (export it at 400×400 on the dark ground); the card itself is the banner
  on X and Bluesky (both 3:1 — crop to the headline band). Threads has no banner.
- `src/core/tokens.js` holds the palette (`bg #0c0c0e`, `lime #cbff3a`, `orange #ff7a45`,
  `text #f3f3f1`, `muted #8c8c96`) and the type (`Anton` display, `JetBrains Mono`).
- Producing the two PNGs is a small task for Claude Code (a second `ImageResponse` size in
  `og.tsx`, or a one-off render). Until then, screenshot the live card at
  `https://macroforge.club/api/og` and crop it — it is already the right image.

---

## 1. Reddit — by hand, from the aged account

Ethan's Reddit account dates from roughly 7–11 Aug 2026 and has been active since, so it is
likely past the new-account filter that made r/SideProject the only safe first post in the
earlier draft. That changes the order.

**Recommendation: r/mealprep first, r/SideProject a week later — with a two-minute gate.**
r/mealprep is the audience whose signups turn into `first_log`, which is the number the
roadmap says matters; r/SideProject's signups are builders who look, upvote, and leave. The
earlier draft put r/SideProject first only because a zero-history account posting a link in
r/mealprep gets removed. That risk is now small, and a removal on r/mealprep costs one post,
not the account, as long as the disclosure is plain and the same text is not posted anywhere
else the same day.

The gate, on the day, before posting (Reddit blocks fetches from this machine, so the
current rules could not be read here — do this yourself, it takes two minutes):
1. Open the account's profile. If it shows real comments in food or fitness subs over the
   last three weeks, the age is real. If it shows nothing, post r/SideProject first after all.
2. Open r/mealprep's sidebar rules. If self-promotion is banned outright or requires mod
   approval, message the mods with two sentences and the link *before* posting, or go to
   r/SideProject first. If the rule is "disclose and don't spam", post.

Either way both posts are below and both stay ready. Never r/fitness (bans app promo
outright). One sub per day. Reply to everything for three hours.

### Post A — r/mealprep

Post between 8–10am US Eastern on a weekday. Flair: whatever the sub offers for
discussion or tools; never "Recipe".

**Title**
```
I got tired of meal-planning apps that ignore what's actually in my kitchen, so I built one that runs backwards (free beta, I made it, looking for people to break it)
```

**Body**
```
Disclosure up front: I built this myself and I'm posting because I'd like people who actually meal prep to tell me where it's wrong.

Every planner I tried wanted me to pick meals first and then generate a shopping list. That's backwards from how I cook. I shop, and then I work out what those ingredients can become for the week.

So I built the other direction. You put in what you bought (or scan barcodes at the store) and it builds the week's meals from that, aimed at your macro targets. Actual dishes in slots — Overnight Oats, Chicken & Rice Bowl, Salmon Plate — not "180g chicken breast" sitting in a box. If the cart can't cover the week it says so: "short 300g protein for these 7 days." It doesn't pad the plan with food you don't have.

The part I use most: at the store you scan a barcode and it gives a verdict for the week you're actually having — GOOD PICK, DECENT, or SKIP IT — with the reason underneath ("helps your protein gap — the week still needs 300g"). Not a generic health score.

Also: the pantry draws down as you log, so week two plans from what's actually left. And the coach recalculates your maintenance calories from what you actually ate and weighed, instead of trusting a formula.

It's free through the beta, works on phone and desktop, installs from the browser, and there's no account — your log stays on your device. Invite-only, but the invite arrives in seconds and there's no card.

https://macroforge.club/join?utm_source=reddit

Honest state: launched quietly in August, single-digit signups, most people haven't logged a meal yet. I'd rather hear what confused you than "nice app". Feedback also reaches me inside the app (Settings → Send feedback) or at info@macroforge.club.
```

### Post B — r/SideProject

The friendliest sub to a plain link. Flair: whichever "Show / Launch" flair the sub offers.

**Title**
```
I built a macro tracker that starts at the grocery store instead of the plate — free beta, looking for people to break it
```

**Body**
```
Every macro app I tried starts at the plate: log what you ate, feel bad, repeat. My week doesn't start at dinner, it starts in a grocery store. So I built one that starts there.

You put in what you bought (or scan barcodes in the aisle) and it builds the week's meals from that, aimed at your macro targets. Actual dishes in slots — Overnight Oats, Salmon Plate — not "180g chicken breast". If the cart can't cover the week it says so: "short 300g protein for these 7 days." It doesn't pad the plan with food you don't have.

The bit I use most: scan something at the store and it gives a verdict against the week you're actually having — GOOD PICK / DECENT / SKIP IT — and tells you how many meals that item covers. Not a generic health score.

Also in there: a pantry that draws down as you log, a coach that recalculates your maintenance calories from what you actually ate and weighed, and meal reminders.

How it's built: local-first PWA (React + Vite, a few Vercel functions for the parts that need a server). No accounts, no passwords — your log lives on your device, and phone and laptop link through a private sync code. Food data comes from Open Food Facts. The planner is pure functions with 133 tests: given ingredients and targets, pick meals that are cookable from stock, right for the time of day, and varied across the week.

Where it stands, honestly: launched quietly in August, single-digit signups, and most of the people who signed up haven't logged a meal yet. So I'm not here to announce a success — I'm here to find out where it's confusing. It's invite-only (enter an email, the invite lands in seconds, no card, no account) and free for the whole beta.

https://macroforge.club/join?utm_source=reddit

Happy to answer anything about the planning logic or how the verdicts are scored. Feedback also reaches me from inside the app (Settings → Send feedback) or at info@macroforge.club.
```

### Prepared replies (work under either post)

Paste, adjust one line to match what they actually said, send. Never argue.

**"Why not just use MyFitnessPal?"**
```
Fair question, and if MFP works for you, keep using it. Two honest differences.

The small one: MFP is $79.99/yr for Premium, the free tier has ads, and the barcode scanner is behind the paywall. Mine has no ads, the scanner is free, and it's free through the beta.

The real one is direction. MFP starts at the plate — you log what you already ate. MacroForge starts at the store: it builds the week from what you bought, and the scanner judges an item against what your week still needs rather than giving it a generic score.

Where MFP wins: their food database is bigger. Mine runs on Open Food Facts, so some barcodes come back unknown. When that happens the app reports the code to me and I add it.
```

**"Does it do photo logging?"**
```
It's built, but it's paused right now. Each photo costs me real money per call and I've switched it off until I fund it again — if you tap it in the app it tells you plainly it isn't switched on for this beta. I'm not going to promise a date.

Barcode scanning and text search both work. Honestly, the scanner verdict is the part I'd want you to try anyway.
```

**"Is my data sold / where does it go?"**
```
No. There's no ad network, no third-party scripts, and no card.

What actually exists, so you can judge for yourself:
- Your email — stored so the invite can be sent and so I can mail beta updates. Nothing else, no sharing.
- Your food log — on your device. There's no account on my side.
- If you turn on sync, a copy of your log sits on the server keyed by a hash of your sync code, so your other device can pull it. It is not end-to-end encrypted, so I won't call it that. Don't turn sync on and it never leaves your phone.
- Analytics are counters (how many people saw the page, signed up, logged food). No cookies, no profiles, and the visitor hash rotates daily so a device can't be followed from one day to the next.
```

**"How do I install it on iPhone?"**
```
Safari → Share button → Add to Home Screen. Do that before you set anything up: iPhone gives the installed app its own storage, separate from Safari, so anything you configure in the browser tab won't be there. The installed app asks for your invite key once — it's in the email that let you in.

On Android and desktop Chrome the browser offers an Install button directly.
```

**Hostile: "Just another macro app."**
```
Fair. Most are, and I'd rather you say it than scroll past.

The one thing I'd ask you to check before deciding: name a tracker that builds the week from what you already bought and judges a barcode against what your week is short on. If one exists I'd genuinely like to know — I'd rather use it than keep maintaining mine.
```

**Optional sixth — "Barcode wasn't found."** (the most likely reaction from anyone who tries it)
```
That'll happen — I'm on Open Food Facts, not a licensed database, so coverage is patchy on store brands. The app sends me every unknown code and I add them. If you tell me which product, I'll do it today.
```

---

## 2. Two-week queue — X, Threads, Bluesky

Thursday 4 Sep through Wednesday 17 Sep. One text per day serves all three channels; only
the link line differs. Every text is within all three limits: X 280 (link counts 23),
Bluesky 300 (link counts in full, 47 chars), Threads 500.

**How to load into Buffer:** paste the text, then append the channel's link as the last
line — `?utm_source=x`, `?utm_source=threads`, `?utm_source=bluesky`. Buffer's "customise
per channel" step is where the three links diverge. The link is the post's purpose; do not
move it to a reply.

Everything reads in first person as Ethan, from MacroForge's own accounts. No ELM handle
is ever tagged, mentioned, or reposted from.

### Thu 2026-09-04 — the grocery-first line
```
Every other macro app starts at the plate. Mine starts at the grocery store.

You put in what you bought, it builds the week's meals from that, aimed at your macros. Free beta, no account.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Fri 2026-09-05 — your cart can't cover the week
```
The feature I'm proudest of is the one that says no.

Generate a week from your groceries and, if the cart can't cover it, MacroForge tells you: "short 300g protein for these 7 days." It won't pad the plan with food you don't have.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Sat 2026-09-06 — the barcode verdict
```
Scan a barcode in the aisle and MacroForge gives one of three verdicts: GOOD PICK, DECENT, SKIP IT.

Not a generic health score. It's judged against what YOUR week still needs. 300g protein short? It says how many meals this covers.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Sun 2026-09-07 — pantry drawdown
```
Small thing that matters in week two: the pantry draws down as you log.

The half bag of rice and the chicken in the freezer are in the plan before anything new gets bought. Less waste, shorter list.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Mon 2026-09-08 — the adaptive coach
```
A formula guesses your maintenance calories. Your log knows it.

MacroForge's coach recalculates from what you actually ate and what the scale actually said, then adjusts targets as you go. No magic, just arithmetic on your own data.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Tue 2026-09-09 — no account, private sync
```
No account. No password. No email to log in.

Your log lives on your device. Want it on your laptop too? Create a private sync code and both devices share one history. The code is the whole identity, so treat it like a key.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Wed 2026-09-10 — offline, installs from the browser
```
It's a web app, so there's nothing to download from a store. Open it in your browser, tap Install (Share → Add to Home Screen on iPhone), and it runs like a normal app, offline included, on phone and desktop.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Thu 2026-09-11 — contrast: Eat This Much
```
Eat This Much is the closest app to mine and runs the other direction: invent a plan, then hand you a shopping list. Reviews mention oversized lists and repeats by week 3.

MacroForge starts from what you bought. The list is already in your kitchen.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Fri 2026-09-12 — builder note: what I'd change
```
Builder note. "Installs from the browser" is true, and a month of data says nobody has. If I started over I'd wrap it for the app stores sooner. That's on the roadmap, not done. Until then: browser, Add to Home Screen.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Sat 2026-09-13 — ask for testers
```
Honest numbers: 8 people signed up last month. 2 logged food.

Looking for a few more who track macros and cook at home to break it and tell me where it's confusing. Free, no account, the invite lands in seconds.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Sun 2026-09-14 — contrast: MyFitnessPal
```
MyFitnessPal: $79.99/yr for Premium, ads on the free tier, barcode scanner behind the paywall.

MacroForge: scanner free, no ads, free through the beta. The bigger difference is direction. They start at the plate. I start at the store.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Mon 2026-09-15 — whole foods at the base
```
MacroForge refuses to be flattered. A protein bar with convenient macros still can't score well, because ultra-processed food sits at the tip of the pyramid and whole foods at the base. The scanner says SKIP IT and tells you why.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Tue 2026-09-16 — real dishes, not slots
```
A generated day looks like: Overnight Oats / Chicken & Rice Bowl / Salmon Plate.

Actual dishes built from your ingredients, in the right slots, varied across the week. Not "180g chicken breast" sitting in a box.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

### Wed 2026-09-17 — how the planner decides
```
How the planner picks: given your ingredients and targets, choose meals that are (a) cookable from stock, (b) right for the time of day, (c) varied across the week. Pure functions, 133 tests, because macro math you can't trust is worse than none.
```
Links: `https://macroforge.club/join?utm_source=x` · `…?utm_source=threads` · `…?utm_source=bluesky`

---

## 3. Before you post

- **Congruence check — MacroForge only.**
  - No mention of ELM Tree Marketing, ELMTM, the agency, clients, audits, or "marketing"
    as a trade. MacroForge is a thing Ethan built, not a case study.
  - No agency framing: no "we", no "our team", no "our clients". First person singular.
  - Never cross-post, repost, quote, tag or like from any ELM channel (ELM LinkedIn page,
    Ethan's ELM-facing LinkedIn, @elmtmarketing, ELM's Buffer). Never log into ELM's Buffer
    to schedule MacroForge. If a MacroForge post is ever found on an ELM channel, delete it.
  - Voice rules from HANDOFF.md: the inverse food pyramid is settled — whole foods at the
    base, ultra-processed at the tip, never hedged; honesty over hype — no "effortless", no
    "AI-powered", no "revolutionary", no fake precision; Ethan built it personally, and
    replies to comments himself, never argues with critics; no-account / no-harvesting is a
    selling point and is stated precisely (sync is not end-to-end encrypted — say so if asked);
    the beta email list is for MacroForge mail only; Ethan's personal diet is not the
    product's opinion and does not appear.
  - Reddit: post from the aged account (created ~7–11 Aug 2026), not a fresh one. Run the
    two-minute gate in §1. r/mealprep first if it passes, r/SideProject a week later; if it
    fails, the other way round. Never r/fitness.
- **Photo check (constraint 6).** Search the post for "photo", "camera", "snap", "picture".
  Zero matches. Photo logging is dark and, even when it comes back, whether it enters the
  copy is a separate decision — it does not get added by default. The only place it is
  mentioned is the prepared Reddit reply, which says it's paused.
- **UTM.** Every link is `https://macroforge.club/join?utm_source=<channel>` with exactly one
  of `reddit`, `x`, `threads`, `bluesky`, `instagram`. A link with no tag counts as "direct"
  and the post is unmeasurable. The profile-bio links carry the tag too.
- **Reply within hours.** Reddit: stay in the thread for three hours after posting, then
  check twice a day for two days. X, Threads, Bluesky: reply the same day. A post with an
  unanswered question under it reads as a brand; a post with the builder in the comments
  reads as a person.
- **Reddit, one sub per day, never r/fitness.** Do not paste the same text into a second sub
  the same day — the spam filter catches it and the account takes the hit.
- **Contact address.** `info@macroforge.club` only. `hello@` and `support@` hard-bounce.
- **No pricing promises.** "Free through the beta" is the whole pricing story. Nothing about
  Pro, one-time unlocks, or membership until the activation gate in ROADMAP.md opens.
- **Numbers.** The only figures in this queue are 8 signups / 2 logged / 0 installs / $79.99 /
  133 tests. Re-read the funnel before posting the 13 Sep tester ask and update if moved.
- **Screenshot if you have one.** Real phone, real data — the verdict card or a generated
  week. Still the biggest missing asset (HANDOFF.md). A post with one beats a post without;
  a post without still goes out on schedule.
- **Buffer capacity.** Free tier is 10 queued per channel. Days 1–10 go in on 3 Sep; days
  11–14 go in on or after 13 Sep.
