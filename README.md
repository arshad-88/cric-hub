# CricPulse — Community Cricket Broadcast Platform

A real-time, multi-tournament cricket scoring & broadcast platform. Think
CricHeroes/ESPNcricinfo for community leagues: fans follow live ball-by-ball
scores, streams and stats with **no account**; anyone can **sign in with their
Gmail** — a 6-digit code lands in the inbox, no password — and start their own
tournament. The creator becomes its **organizer** and decides who else may
edit and score.

The platform is fully generic — any league can be created inside it (name,
city, ball type, overs, dates, banner, stage). Live updates are pushed to every
open phone the instant a scorer taps a button; no page refreshes.

> There is **no admin role and no admin page**. Every write (teams, rosters,
> fixtures, ball-by-ball scoring, streams) is allowed only to the tournament's
> **organizers** — the creator plus anyone they add by phone number. All other
> signed-in users see the same public, read-only views as anonymous fans.
> There is also **no demo data**: the app starts empty.

---

## Stack

| Layer      | Tech |
|------------|------|
| Frontend   | Vite + React 19 + TypeScript + Tailwind CSS v4 |
| Realtime   | **Convex** (reactive queries + mutations — ball-by-ball subscriptions) |
| Auth       | Convex Auth email-OTP — **Gmail + 6-digit code** (no password). Phone numbers are the *player identity* organizers use to auto-fill rosters |
| Permissions| Per-tournament organizer checks (`requireOrganizer`) enforced inside every write mutation |
| Routing    | React Router |
| Streams    | Embedded YouTube / Twitch players (toggleable) |
| UI         | shadcn/ui primitives + custom broadcast design system (`src/components/swiss.tsx`) |

> The original brief asked for Next.js + Supabase. This environment's managed
> runtime is Vite + Convex (Convex's reactive queries are the native realtime
> layer here), so the product is built on that stack. A complete, portable
> **PostgreSQL/Supabase DDL with RLS** mirroring the same data model ships in
> [`supabase-reference/schema.sql`](supabase-reference/schema.sql) — see
> "Porting to Supabase" below.

---

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Stadium landing: featured live match, tournaments, caps, fixtures |
| `/tournaments` | Public | Tournament directory (active / upcoming / past) |
| `/matches` | Public | Fixtures with live/upcoming/completed filters |
| `/matches/:id` | Public | Broadcast match center — Scorecard · Overs · Commentary · Playing XI · Points · Caps tabs + live stream |
| `/leaderboard` | Public | Points table (P/W/L/T, NRR) + Orange & Purple cap boards |
| `/teams`, `/teams/:id` | Public | Team grid and squad pages |
| `/auth` | Public | **Gmail + OTP sign-in** (6-digit code by email, no password) |
| `/dashboard` | Signed in | **My Hub** — profile, create a tournament, manage the ones you organize (teams, rosters, fixtures, streams, co-organizers), all tournaments |
| `/scorer/:matchId` | Signed in + organizer | Mobile ball-by-ball scorer (keypad, wickets, extras, undo, stream) — blocked for non-organizers |

Legacy `/admin` and `/admin/scorer/:matchId` redirect to `/dashboard` and
`/scorer/:matchId`. Every write mutation is gated server-side by
`requireOrganizer(tournamentId)` — the client UI is just the convenience layer.

---

## Run locally

```bash
bun install
bunx convex dev          # or: bunx convex dev --once to just codegen
bun run dev              # http://localhost:5173
```

Convex functions live in `src/convex/`. The client connects via
`VITE_CONVEX_URL` (managed for you in this environment).

## No demo data

The app ships **empty** — no seeded tournaments, teams or matches. Everything
is created by real users through the app. If you ever want to wipe the domain
tables while developing (auth users are kept):

```bash
bunx convex run seed:reset
```

## How organizing works

1. Sign in at `/auth` with your **Gmail** — a 6-digit code is emailed to you.
   Your phone number is optional; it is the identity organizers type when
   building rosters, and it pulls your name + every stat you've ever scored
   into the squad automatically (still editable).
2. Open `/dashboard` → **Start a new tournament**. You are its creator and
   first organizer.
3. Manage it from My Hub: add teams, build rosters (enter a player's phone
   number and their name is pulled from their account — still editable),
   schedule fixtures (venue, overs, stage, stream URL), and add
   **co-organizers by phone number** so they can edit and score too.
4. Open **Score** on a fixture to run the live scorer: set the openers and
   bowler, then tap the keypad. Wide/no-ball re-bowls, over changes, crease
   tracking, target chasing, innings completion and automatic result + NRR
   computation are all enforced server-side.

Anyone who is *not* an organizer sees the tournament read-only — every write
mutation throws without organizer permission.

## Deploy

- **Convex:** create a project (`bunx convex deploy`), keep
  `VITE_CONVEX_URL` in front of the client build.
- **Frontend:** any static host (Vercel, Netlify, Cloudflare Pages):
  `bun run build && bun run preview`.
- No secrets are required for the public read-only site; every write is
  enforced by organizer permission, not by the client.

## Porting to Supabase

If you want to run the PostgreSQL/PostgREST version instead:

1. Create a free Supabase project.
2. Run [`supabase-reference/schema.sql`](supabase-reference/schema.sql) in the
   SQL editor — profiles (with `phone`), tournaments (with `created_by`),
   `tournament_organizers`, teams, players, matches, innings, deliveries,
   indexes, and RLS policies (**SELECT public; writes require the caller to be
   an organizer of that tournament**, via `is_organizer()`).
3. Point a Supabase client at it with `SUPABASE_URL` / `SUPABASE_ANON_KEY` and
   subscribe to `deliveries` + `matches` row changes for the same live UX.

---

## Data model

`tournaments → teams → players` · `matches → innings → deliveries`

- **users** — Convex Auth accounts (Gmail + OTP) with an optional canonical
  `phone` — the player identity used for roster auto-fill — and editable `name`
- **tournaments** — name, year, city, ball type (Grace/Leather/Tennis), dates,
  banner, default overs, featured flag, `organizers[]` (creator first)
- **teams** — tournament, name, short code, color, logo
- **players** — team, name, phone (auto-fill source), role, batting/bowling
  style, jersey number
- **matches** — teams, status (UPCOMING/LIVE/COMPLETED), toss, overs, venue,
  stage, start time, YouTube/Twitch stream URL, result
- **innings** — match, batting/bowling side, runs/wickets/balls, target, live
  crease state (striker, non-striker, bowler)
- **deliveries** — per ball: over, batsman, bowler, runs, extras, wicket
  details, pre-rendered commentary
