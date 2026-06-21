-- Self-contained identity: instead of anonymous auth (which needs a dashboard
-- toggle), participants are identified by their per-device client_id. RLS opens
-- reads to the public anon role; all writes still go through SECURITY DEFINER
-- RPCs. Tradeoff: submissions are readable within a room before reveal — fine
-- for a trusted workshop. (To harden later: re-enable anon auth + tighten.)

-- Reads: allow the anon role (no sign-in) in addition to authenticated.
drop policy if exists rooms_read        on rooms;
drop policy if exists participants_read on participants;
drop policy if exists rounds_read       on rounds;
drop policy if exists pairings_read      on pairings;
drop policy if exists submissions_read  on submissions;

create policy rooms_read        on rooms        for select to anon, authenticated using (true);
create policy participants_read on participants for select to anon, authenticated using (true);
create policy rounds_read       on rounds       for select to anon, authenticated using (true);
create policy pairings_read     on pairings     for select to anon, authenticated using (true);
create policy submissions_read  on submissions  for select to anon, authenticated using (true);

-- Writing RPCs now take the client_id explicitly (no auth.uid()).
drop function if exists save_writing(uuid, text, boolean);
create or replace function save_writing(p_round_id uuid, p_client_id text,
                                        p_content text, p_is_final boolean default false)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_room_id uuid; v_target text; v_author uuid; v_subject uuid;
begin
  select room_id, write_target into v_room_id, v_target from rounds where id = p_round_id;
  if v_room_id is null then raise exception 'round not found'; end if;
  select id into v_author from participants
    where room_id = v_room_id and client_id = p_client_id;
  if v_author is null then raise exception 'not a participant'; end if;

  if v_target = 'partner' then
    select partner_id into v_subject from pairings
      where round_id = p_round_id and participant_id = v_author;
  else
    v_subject := v_author;
  end if;

  insert into submissions(round_id, author_id, subject_id, content, is_final, updated_at)
    values (p_round_id, v_author, v_subject, coalesce(p_content, ''),
            coalesce(p_is_final, false), now())
    on conflict (round_id, author_id) do update set
      content    = excluded.content,
      subject_id = coalesce(submissions.subject_id, excluded.subject_id),
      is_final   = submissions.is_final or excluded.is_final,
      updated_at = now()
    where submissions.is_final = false or excluded.is_final = true;
  return json_build_object('ok', true);
end;
$$;

create or replace function mark_out(p_round_id uuid, p_client_id text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_room_id uuid; v_author uuid; v_lose boolean;
begin
  select room_id, coalesce((constraints->'pauseBomb'->>'loseText')::boolean, false)
    into v_room_id, v_lose from rounds where id = p_round_id;
  select id into v_author from participants
    where room_id = v_room_id and client_id = p_client_id;
  if v_author is null then raise exception 'not a participant'; end if;
  update participants set status = 'out' where id = v_author;
  if v_lose then
    update submissions set lost = true, content = ''
      where round_id = p_round_id and author_id = v_author;
  end if;
  return json_build_object('ok', true);
end;
$$;

-- Drop the now-obsolete single-arg signature.
drop function if exists mark_out(uuid);
