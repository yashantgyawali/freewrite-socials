# freewrite

A **live, multiplayer freewriting workshop** — a hands-on tool for running a 15–30 min session
that teaches people what freewriting is by making them actually do it, together.

- The **facilitator** opens a projected admin console showing a join code and drives the session.
- **Participants** join on their phones and write through a sequence of rounds.
- Each round can pair people up, set a prompt + timer, and apply escalating writing constraints.

## The writing constraints

1. **Plain** — write whatever; the timer ends and it auto-submits.
2. **No backspace** — forward-only; you can't delete, select, or cut.
3. **Fade text** — your words disappear seconds after you type them; you write into a blank screen.
4. **Pause bomb** — stop typing for ~5s and a 💣 knocks you out of the round.

Rounds also choose pairing (solo / pairs, with a trio for odd numbers), whether you write about
**yourself or your partner**, and how the result is revealed (private / sent to your partner).

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Open `/admin/new` on your laptop to create a room, then open `/` on phones to join with the code.

Environment (`.env.local`, already set for the dev project):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # legacy anon JWT (needed for Realtime + RLS)
```

## Architecture

- **Next.js 16 / React 19 / Tailwind v4**, App Router.
- **Supabase** Postgres + Realtime. The `rooms` row is the live cursor (phase, current round,
  `phase_ends_at`); the DB is the recoverable source of truth and every client rehydrates from it
  on (re)connect, then follows Postgres Changes.
- Timers are **server-authoritative**: clients measure their clock offset (`server_now()`) and count
  down to `phase_ends_at`, so phones and admin auto-advance/submit in lockstep.
- All mutations go through **SECURITY DEFINER RPCs** (`supabase/migrations/0004_rpcs.sql`). Pairing is
  computed in Postgres (`assign_pairings`). Facilitator actions are authorized by a per-room secret.
- Identity is a per-device `client_id` (see the auth note in `0005_no_auth.sql`).

## Key files

- `supabase/migrations/` — schema (`0001`), realtime (`0002`), RLS (`0003`), RPCs (`0004`),
  identity model (`0005`), hardening (`0006`).
- `src/components/writing/WritingSurface.tsx` — the three writing mechanics + bomb.
- `src/lib/realtime.ts` — room/round/roster/pairing/reveal subscriptions.
- `src/app/admin/[code]/page.tsx` — facilitator console.
- `src/app/room/[code]/page.tsx` + `src/components/participant/PhaseView.tsx` — the phone experience.
- `src/lib/presets.ts` — the planned workshop round arc (editable live in the admin).

## Deploy

Deploy to Vercel and set the two `NEXT_PUBLIC_*` env vars. Note the Supabase free-tier project pauses
after inactivity — open it (or hit any endpoint) the morning of the demo to wake it.
