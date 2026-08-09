-- ============================================================================
-- CricPulse — multi-tournament cricket broadcast platform
-- PostgreSQL DDL (Supabase-ready) with Row Level Security
--
--   Access model (mirrors the app):
--     - There is NO global admin role and no admin page.
--     - Everyone reads everything (anon SELECT).
--     - Any authenticated user can CREATE a tournament; they become its
--       creator/organizer and may add co-organizers by phone.
--     - INSERT/UPDATE/DELETE on a tournament and its teams/players/matches/
--       innings/deliveries require the caller to be an organizer of that
--       tournament (see public.is_organizer()).
--
-- Run this file in the Supabase SQL editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------

create type public.match_status as enum ('UPCOMING', 'LIVE', 'COMPLETED');

create type public.player_role as enum ('Batsman', 'Bowler', 'All-rounder');

create type public.wicket_type as enum ('Bowled', 'Caught', 'Run out', 'Stumped', 'LBW');

create type public.extra_type as enum ('none', 'wide', 'noball', 'bye', 'legbye');

create type public.toss_decision as enum ('bat', 'bowl');

create type public.match_stage as enum ('Group', 'Quarter-final', 'Semi-final', 'Final');

create type public.ball_type as enum ('Grace Ball', 'Leather', 'Tennis');

-- ----------------------------------------------------------------------------
-- 2. PROFILES  (auth.users → profile; phone is the login handle)
-- ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text unique,                                -- phone-number login handle
  full_name text,
  created_at timestamptz not null default now()
);

-- auto-create a profile on sign-up (phone comes from the client sign-in payload)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do update
    set phone = coalesce(public.profiles.phone, excluded.phone);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. DOMAIN TABLES
-- ----------------------------------------------------------------------------

-- tournaments (id, name, year, description, organizers)
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year integer not null,
  description text,
  city text,
  ball_type public.ball_type,
  start_date date,
  end_date date,
  banner_url text,
  default_overs integer check (default_overs between 1 and 50),
  active boolean not null default false,           -- featured on the landing page
  created_by uuid not null references public.profiles (id),  -- the creator / first organizer
  created_at timestamptz not null default now()
);

create index tournaments_active_idx on public.tournaments (active) where active;

-- organizers: who may edit + score a tournament (creator row is created first)
create table public.tournament_organizers (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_creator boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create index organizers_user_idx on public.tournament_organizers (user_id);

-- teams (id, tournament_id, team_name, logo_url)
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  short_code text not null,
  color text not null default '#22c55e',
  logo_url text,
  created_at timestamptz not null default now()
);

create index teams_tournament_idx on public.teams (tournament_id);

-- players (id, team_id, name, phone, role, styles, jersey)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  phone text,                                       -- matches the account phone (auto-fill)
  role public.player_role not null default 'Batsman',
  batting_style text,
  bowling_style text,
  jersey_number integer,
  created_at timestamptz not null default now()
);

create index players_team_idx on public.players (team_id);

-- matches (id, tournament_id, team_a_id, team_b_id, status, toss, overs, stream_url)
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_a_id uuid not null references public.teams (id),
  team_b_id uuid not null references public.teams (id),
  status public.match_status not null default 'UPCOMING',
  toss_winner_id uuid references public.teams (id),
  toss_decision public.toss_decision,
  overs integer not null default 20,
  venue text,
  stage public.match_stage,
  start_time timestamptz not null,
  stream_url text,                                  -- YouTube URL/ID or Twitch URL
  current_innings_id uuid,                          -- set once scoring begins
  result text,                                      -- computed result line
  created_at timestamptz not null default now(),
  check (team_a_id <> team_b_id)
);

create index matches_tournament_status_idx on public.matches (tournament_id, status);
create index matches_status_idx on public.matches (status);
create index matches_team_a_idx on public.matches (team_a_id);
create index matches_team_b_idx on public.matches (team_b_id);

-- innings (id, match_id, batting_team_id, bowling_team_id, totals)
create table public.innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  number integer not null check (number in (1, 2)),
  batting_team_id uuid not null references public.teams (id),
  bowling_team_id uuid not null references public.teams (id),
  total_runs integer not null default 0,
  wickets integer not null default 0,
  balls_bowled integer not null default 0,          -- legal balls only
  target integer,                                   -- set on the chasing innings
  -- live crease state
  opening_striker_id uuid references public.players (id),
  opening_non_striker_id uuid references public.players (id),
  striker_id uuid references public.players (id),
  non_striker_id uuid references public.players (id),
  current_bowler_id uuid references public.players (id),
  unique (match_id, number)
);

create index innings_match_idx on public.innings (match_id);

-- deliveries (id, match_id, innings_id, over_number, ball_number, ...)
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  innings_id uuid not null references public.innings (id) on delete cascade,
  over_number integer not null,                     -- 1-based
  ball_number integer not null,                     -- legal-ball position in the over
  bowler_id uuid not null references public.players (id),
  batsman_id uuid not null references public.players (id),
  non_striker_id uuid references public.players (id),
  runs_scored integer not null default 0,           -- credited to the batsman
  extra_type public.extra_type not null default 'none',
  extra_runs integer not null default 0,            -- wide/noball penalty or byes
  total_runs integer not null default 0,            -- added to the team total
  is_wicket boolean not null default false,
  wicket_type public.wicket_type,
  dismissed_batter_id uuid references public.players (id),
  fielder_id uuid references public.players (id),
  new_batsman_id uuid references public.players (id),
  commentary text,                                  -- pre-rendered ball-by-ball text
  created_at timestamptz not null default now()
);

create index deliveries_innings_idx on public.deliveries (innings_id);
create index deliveries_match_idx on public.deliveries (match_id);

-- circular FK: matches.current_innings_id → innings
alter table public.matches
  add constraint matches_current_innings_fk
  foreign key (current_innings_id) references public.innings (id);

-- ----------------------------------------------------------------------------
-- 4. ORGANIZER CHECK (no global admin — per-tournament permission)
-- ----------------------------------------------------------------------------

-- True when the current user is an organizer of the given tournament.
create or replace function public.is_organizer(tournament_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournament_organizers
    where tournament_id = $1 and user_id = auth.uid()
  );
$$;

-- Convenience: which tournament does an innings/delivery belong to?
create or replace function public.tournament_of_innings(innings_id uuid)
returns uuid
language sql
stable
as $$
  select m.tournament_id
  from public.innings i
  join public.matches m on m.id = i.match_id
  where i.id = $1;
$$;

create or replace function public.tournament_of_delivery(delivery_id uuid)
returns uuid
language sql
stable
as $$
  select m.tournament_id
  from public.deliveries d
  join public.innings i on i.id = d.innings_id
  join public.matches m on m.id = i.match_id
  where d.id = $1;
$$;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--    SELECT → everyone (anon viewers)
--    CREATE tournament → any authenticated user (becomes organizer)
--    INSERT / UPDATE / DELETE on domain rows → tournament organizer only
-- ----------------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.tournaments           enable row level security;
alter table public.tournament_organizers enable row level security;
alter table public.teams                 enable row level security;
alter table public.players               enable row level security;
alter table public.matches               enable row level security;
alter table public.innings               enable row level security;
alter table public.deliveries            enable row level security;

-- --- public read (anon + authenticated) -------------------------------------
create policy "profiles_public_select"
  on public.profiles for select using (true);

create policy "tournaments_public_select"
  on public.tournaments for select using (true);

create policy "organizers_public_select"
  on public.tournament_organizers for select using (true);

create policy "teams_public_select"
  on public.teams for select using (true);

create policy "players_public_select"
  on public.players for select using (true);

create policy "matches_public_select"
  on public.matches for select using (true);

create policy "innings_public_select"
  on public.innings for select using (true);

create policy "deliveries_public_select"
  on public.deliveries for select using (true);

-- --- tournament creation: anyone signed in, becomes the creator -------------
create policy "tournaments_anyone_create"
  on public.tournaments for insert
  to authenticated
  with check (auth.uid() = created_by);

-- the creator's organizer row (created together with the tournament)
create policy "organizers_creator_insert"
  on public.tournament_organizers for insert
  to authenticated
  with check (auth.uid() = user_id and is_creator);

-- organizers may add / remove co-organizers
create policy "organizers_coorganizer_manage"
  on public.tournament_organizers for all
  to authenticated
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

-- --- organizer-only write on domain rows -------------------------------------
create policy "tournaments_organizer_write"
  on public.tournaments for update
  to authenticated
  using (public.is_organizer(id))
  with check (public.is_organizer(id));

create policy "tournaments_organizer_delete"
  on public.tournaments for delete
  to authenticated
  using (public.is_organizer(id));

create policy "teams_organizer_write"
  on public.teams for all
  to authenticated
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

create policy "players_organizer_write"
  on public.players for all
  to authenticated
  using (public.is_organizer((select tournament_id from public.teams where id = team_id)))
  with check (public.is_organizer((select tournament_id from public.teams where id = team_id)));

create policy "matches_organizer_write"
  on public.matches for all
  to authenticated
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

create policy "innings_organizer_write"
  on public.innings for all
  to authenticated
  using (public.is_organizer(public.tournament_of_innings(id)))
  with check (public.is_organizer(public.tournament_of_innings(id)));

create policy "deliveries_organizer_write"
  on public.deliveries for all
  to authenticated
  using (public.is_organizer(public.tournament_of_delivery(id)))
  with check (public.is_organizer(public.tournament_of_delivery(id)));

-- --- exceptions: users may update their own profile --------------------------
create policy "profiles_self_update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --- grants -----------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
