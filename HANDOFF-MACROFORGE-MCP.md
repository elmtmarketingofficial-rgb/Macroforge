# Handoff — MacroForge MCP adapter

**For the chat working in `Macroforge` (macroforge-v2).** Written 2026-09-07 by
Sterling, relaying Ethan.

Sterling cannot reach that chat directly — no Claude sessions are reachable from
the box, and filing a GitHub issue is refused in code as an outward-facing
action. So this file is the handoff. Ethan can paste it in or open the issue
himself.

---

> ## ⚠ CORRECTION 2026-09-07 — read before the section titled "The wall"
>
> Added by the Sterling chat while relaying this file. **The central premise
> below is out of date, and acting on it would waste a session.**
>
> The handoff says *"There is no server holding his data"* and concludes that
> this is *"a data-availability decision first"*. That decision has already been
> made and shipped. Verified by reading this repo, not inferred:
>
> - **`api/sync.js` — account-less device sync, already live.** GET, POST and
>   DELETE, backed by Upstash Redis (`api/_store.js`). A sync code is the
>   credential; the server keys storage by its SHA-256 hash and never logs the
>   raw code. Optimistic concurrency via a rev counter with an atomic Lua
>   compare-and-set.
> - **It is wired into the app,** not dead code — `src/core/App.jsx:2877, 2887,
>   2925, 2941`.
> - There are 13 serverless functions in `api/`, so "no backend" is no longer
>   accurate as a description of the deployment either.
>
> **What this changes:**
>
> - **Option B is roughly 80% built.** The hosted store, the opt-in, and the
>   privacy shape all exist. What is missing is only an MCP server that takes a
>   sync code and calls `GET /api/sync?code=…`.
> - **The privacy trade the handoff agonises over has already been made,** and
>   made well: sync is opt-in by construction (no code, no server data), so a
>   user who never enables it stays exactly as local-first as before. Do not
>   re-litigate it, and do not build a second sync path.
> - **Option C (push-only webhook) is probably unnecessary.** It was proposed as
>   the short path to "automatic", but pointing an MCP server at the existing
>   sync endpoint is shorter and leaves nothing new to maintain.
>
> The rest of the handoff — what to expose, the constraints, Ethan's framing —
> stands unchanged and is still worth reading. Only the premise moved.
>
> **Still genuinely unverified:** whether Ethan personally has sync switched on
> and a code. Ask him; if he does not, that is a one-minute fix rather than a
> build.

---

## What Ethan asked for

Verbatim, 2026-09-07: *"I want it to be automatic so if we need to build an MCM
adapter in it we can, and we can use that as another selling point that it'll
connect to whatever your main ai is that you use."*

Read as **MCP** — Model Context Protocol. Two distinct asks in that sentence:

1. **For him personally:** his MacroForge data should reach Sterling
   automatically, not by exporting a backup file by hand.
2. **As a product feature:** MacroForge connects to whatever AI assistant the
   *user* already has — Claude, or anything else that speaks MCP. That is a
   genuine differentiator for a fitness app and it is the reason to build this
   properly rather than as a one-off pipe to Sterling.

## The wall, stated plainly

From MacroForge's own README: *"a local-first PWA. All data lives on-device in
IndexedDB; no accounts, no backend."*

There is no server holding his data. `macroforge-v2.vercel.app` serves static
files. An MCP server has to read from *somewhere*, and right now that somewhere
exists only inside the browser on his phone.

So this is not "add an MCP endpoint". It is a data-availability decision first,
and the MCP part is easy afterwards.

## Three shapes, with the trade each one makes

**A. Local MCP server, no cloud.** Ship a small MCP server the user runs on
their own machine; the PWA writes an export to a known local location (File
System Access API, or an explicit export the server watches). Keeps local-first
intact, costs nothing to run, and works as a product feature for technical
users. **Does not solve Ethan's problem** — his data is on his phone and
Sterling is on a box in Helsinki.

**B. Opt-in sync + hosted MCP server.** The user opts in; the device syncs an
encrypted blob to a backend; a hosted MCP server reads it and serves the user's
own AI. Solves Ethan's case and is the version that is a real selling point.
**The trade is the honest one:** "no accounts, no backend" is currently a
privacy *feature* of MacroForge, and this adds both. Opt-in, off by default, and
say so in the UI.

**C. Push-only webhook.** The PWA POSTs a snapshot to a URL the user configures
— for Ethan, an endpoint on the Sterling box. No accounts, no stored data on
MacroForge's side, and it is a few hours of work. Weakest as a product feature
because it needs the user to have somewhere to point it, but it is the shortest
path to Ethan's "automatic".

**Sterling's read:** C for Ethan now, B as the product feature, A only if
local-first is treated as inviolable. C and B are not mutually exclusive — the
same snapshot shape serves both.

## What the MCP server should expose, whichever shape wins

Grounded in what the app already computes (`src/lib/engine.ts`,
`src/lib/grocery.ts`):

- current macro targets and today's intake against them
- weight trend (smoothed) and adaptive TDEE
- training log, including Epley e1RM per lift
- adherence scoring over a date range
- the current meal plan and its generated grocery list

Read-only to start. A write path (log this meal, log this set) is the obvious
follow-on and should not be in v1.

## Constraints worth writing into the design

- **Opt-in, off by default, and reversible.** If sync ships, a user who never
  touches it must be exactly as local-first as they are today.
- **The data is health data.** Encrypt in transit and at rest; do not log
  payloads; be able to delete everything on request.
- **Don't hard-code Sterling.** The point is that it connects to *whatever* AI
  the user runs. A MacroForge-shaped MCP server that only talks to one
  assistant is worth much less.

## Ethan's framing, for context

He is building Sterling as his own personal AI — not for resale or
distribution. MacroForge is a separate product where this *is* a sellable
feature. Those two things share a design here but not a purpose; don't collapse
them.
