# CricPulse — Community Cricket Broadcast Platform

A real-time, multi-tournament cricket scoring & broadcast platform. Think
CricHeroes/ESPNcricinfo for village and community leagues: public viewers follow
live ball-by-ball scores, streams and stats with **no account**; authenticated
**organizers** run tournaments, teams, rosters, fixtures and the pitch-side
scorer.

The platform is fully generic — any league can be created inside it (ball type,
overs, city, banner, stage). Live updates are pushed to every open phone the
instant a scorer taps a button; no page refreshes.

---

## Stack

| Layer      | Tech |
|------------|------|
| Frontend   | Vite + React 19 + TypeScript + Tailwind CSS v4 |
| Realtime   | **Convex** (reactive queries + mutations — ball-by-ball subscriptions) |
| Auth       | Convex Auth (email OTP + anonymous guest), role-gated ADMIN/VIEWER |
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
| `/auth` | Public | Sign in (email OTP or guest) |
| `/admin` | **ADMIN** | Organizer hub: create tournaments, teams, rosters, fixtures, streams |
| `/admin/scorer/:matchId` | **ADMIN** | Mobile ball-by-ball scorer (keypad, wickets, extras, undo, stream) |

Everything under `/admin` is wrapped in `RequireAuth` + `RequireAdmin`; every
write mutation is additionally gated server-side with `requireAdmin()`.

---

## Run locally

```bash
bun install
bunx convex dev          # or: bunx convex dev --once to just codegen
bun run dev              # http://localhost:5173
```

Convex functions live in `src/convex/`. The client connects via
`VITE_CONVEX_URL` (managed for you in this environment).

## Seed demo data

Three tournaments (one live with a YouTube stream, one upcoming, one past) with
8 + 4 + 4 teams, full squads and simulated completed/live matches:

```bash
bunx convex run seed:run
```

The seed wipes and recreates the domain tables (auth users are kept). Safe to
run repeatedly.

## Admin bootstrap (first organizer)

1. Sign in at `/auth` (email OTP, or "Continue as Guest" for a quick demo).
2. Open `/admin` — since no admin exists yet, the gate offers **"Claim admin
   role"**. The first signed-in user becomes the ADMIN.
3. In the console: create a tournament → add teams → build rosters → schedule
   fixtures (venue, overs, stage, stream URL) → open **Score** on a fixture to
   run the live scorer.

Every later admin must be promoted by an existing admin. The scoring engine
enforces the rules server-side: wide/no-ball re-bowls, over changes, crease
tracking, target chasing, innings completion and automatic result + NRR
computation.

## Deploy

- **Convex:** create a project (`bunx convex deploy`), keep
  `VITE_CONVEX_URL` in front of the client build.
- **Frontend:** any static host (Vercel, Netlify, Cloudflare Pages):
  `bun run build && bun run preview`.
- No other secrets are required for a public read-only site; admin actions are
  enforced by role, not by client.

## Porting to Supabase

If you want to run the PostgreSQL/PostgREST version instead:

1. Create a free Supabase project.
2. Run [`supabase-reference/schema.sql`](supabase-reference/schema.sql) in the
   SQL editor — enums, profiles (role ADMIN/VIEWER), tournaments, teams,
   players, matches, innings, deliveries, indexes, and RLS policies
   (**SELECT public, writes require `role = 'ADMIN'`**).
3. Promote the first organizer:
   ```sql
   update public.profiles set role = 'ADMIN' where email = 'you@example.com';
   ```
4. Point a Supabase client at it with `SUPABASE_URL` / `SUPABASE_ANON_KEY` and
   subscribe to `deliveries` + `matches` row changes for the same live UX.

---

## Data model

`tournaments → teams → players` · `matches → innings → deliveries`

- **tournaments** — name, year, city, ball type (Grace/Leather/Tennis), dates,
  banner, default overs, featured flag
- **teams** — tournament, name, short code, color, logo
- **players** — team, name, role, batting/bowling style, jersey number
- **matches** — teams, status (UPCOMING/LIVE/COMPLETED), toss, overs, venue,
  stage, start time, YouTube/Twitch stream URL, result
- **innings** — match, batting/bowling side, runs/wickets/balls, target, live
  crease state (striker, non-striker, bowler)
- **deliveries** — per ball: over, batsman, bowler, runs, extras, wicket
  details, pre-rendered commentary
