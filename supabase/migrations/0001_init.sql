-- Freewrite workshop schema
-- Core idea: `rooms` holds the live cursor (phase/round/timer); `rounds` holds
-- per-round config; pairings & submissions key off rounds. Admin secret lives in
-- a separate table that participants can never SELECT.

create table if not exists rooms (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  status            text not null default 'lobby' check (status in ('lobby','running','ended')),
  current_round_id  uuid,
  phase             text not null default 'lobby'
                      check (phase in ('lobby','pairing','talk','writing','submitted','reveal')),
  phase_ends_at     timestamptz,
  created_at        timestamptz not null default now()
);

-- Facilitator authorization token. RLS denies all client access; only SECURITY
-- DEFINER RPCs read it. The admin client keeps its copy in localStorage.
create table if not exists room_secrets (
  room_id  uuid primary key references rooms(id) on delete cascade,
  secret   uuid not null default gen_random_uuid()
);

create table if not exists participants (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references rooms(id) on delete cascade,
  client_id       text not null,                 -- stable id from phone localStorage
  auth_uid        uuid,                           -- anonymous auth user; RLS ownership
  display_name    text not null,
  is_facilitator  boolean not null default false,
  status          text not null default 'active' check (status in ('active','out','left')),
  joined_at       timestamptz not null default now(),
  unique (room_id, client_id)
);
create index if not exists participants_room_idx on participants(room_id);
create index if not exists participants_auth_idx on participants(auth_uid);

create table if not exists rounds (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  ordinal       int not null,
  prompt        text not null default '',
  duration_secs int not null default 300,
  pairing_mode  text not null default 'solo'  check (pairing_mode in ('solo','pairs')),
  write_target  text not null default 'self'  check (write_target in ('self','partner')),
  constraints   jsonb not null default '{}'::jsonb,
  reveal_mode   text not null default 'private'
                  check (reveal_mode in ('private','send-to-partner','show-on-admin')),
  created_at    timestamptz not null default now(),
  unique (room_id, ordinal)
);

-- Resolve the circular reference now that rounds exists.
alter table rooms
  add constraint rooms_current_round_fk
  foreign key (current_round_id) references rounds(id) on delete set null;

-- One row per (round, participant): who is MY partner / group this round.
create table if not exists pairings (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references rounds(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  partner_id     uuid references participants(id) on delete set null, -- person you write ABOUT
  group_id       int,                                                  -- groups pair / trio
  unique (round_id, participant_id)
);
create index if not exists pairings_round_idx on pairings(round_id);

create table if not exists submissions (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references rounds(id) on delete cascade,
  author_id   uuid not null references participants(id) on delete cascade,
  subject_id  uuid references participants(id) on delete set null, -- who it's ABOUT
  content     text not null default '',
  is_final    boolean not null default false,
  lost        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (round_id, author_id)
);
create index if not exists submissions_round_subject_idx on submissions(round_id, subject_id);
