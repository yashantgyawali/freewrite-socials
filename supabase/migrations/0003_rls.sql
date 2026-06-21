-- RLS: readable-within-room, but all mutations go through SECURITY DEFINER RPCs
-- (no INSERT/UPDATE/DELETE policies => default-deny on direct client writes).

alter table rooms         enable row level security;
alter table room_secrets  enable row level security;  -- no policies => nobody can read it
alter table participants  enable row level security;
alter table rounds        enable row level security;
alter table pairings      enable row level security;
alter table submissions   enable row level security;

-- Room cursor, roster, round config, and pairings are non-sensitive within the app.
create policy rooms_read         on rooms        for select to authenticated using (true);
create policy participants_read  on participants for select to authenticated using (true);
create policy rounds_read        on rounds       for select to authenticated using (true);
create policy pairings_read      on pairings     for select to authenticated using (true);

-- Submissions are private: you can read what you wrote, or what was written about you.
create policy submissions_read on submissions for select to authenticated using (
  exists (select 1 from participants p
            where p.id = submissions.author_id  and p.auth_uid = auth.uid())
  or
  exists (select 1 from participants p
            where p.id = submissions.subject_id and p.auth_uid = auth.uid())
);
