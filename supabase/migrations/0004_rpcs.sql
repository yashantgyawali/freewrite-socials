-- All mutations run through these SECURITY DEFINER RPCs. Admin actions are
-- authorized by the room's secret (kept out of any client-readable table).
-- Participant identity is taken from auth.uid() (anonymous auth) so phones
-- cannot impersonate each other.

-- ---- helpers (not client-callable) ----------------------------------------

create or replace function assert_admin(p_room_id uuid, p_admin_secret uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from room_secrets
                 where room_id = p_room_id and secret = p_admin_secret) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
end;
$$;
revoke all on function assert_admin(uuid, uuid) from public;

create or replace function server_now() returns timestamptz language sql stable as $$
  select now();
$$;

-- ---- room lifecycle --------------------------------------------------------

create or replace function create_room()
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_code text;
  v_room_id uuid;
  v_secret uuid;
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';  -- no 0/O/1/I/L
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from rooms where code = v_code);
  end loop;
  insert into rooms(code) values (v_code) returning id into v_room_id;
  insert into room_secrets(room_id) values (v_room_id) returning secret into v_secret;
  return json_build_object('room_id', v_room_id, 'code', v_code, 'admin_secret', v_secret);
end;
$$;

create or replace function join_room(p_code text, p_client_id text, p_display_name text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_room rooms%rowtype;
  v_participant_id uuid;
  v_name text;
begin
  select * into v_room from rooms where code = upper(p_code) and status <> 'ended';
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  v_name := nullif(btrim(p_display_name), '');
  if v_name is null then raise exception 'name required'; end if;

  insert into participants(room_id, client_id, auth_uid, display_name)
    values (v_room.id, p_client_id, auth.uid(), v_name)
    on conflict (room_id, client_id) do update set
      display_name = excluded.display_name,
      auth_uid     = excluded.auth_uid,
      status       = case when participants.status = 'left' then 'active'
                          else participants.status end
    returning id into v_participant_id;

  return json_build_object(
    'participant_id', v_participant_id,
    'room_id', v_room.id,
    'code', v_room.code,
    'phase', v_room.phase,
    'current_round_id', v_room.current_round_id
  );
end;
$$;

create or replace function end_room(p_room_id uuid, p_admin_secret uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin(p_room_id, p_admin_secret);
  update rooms set status = 'ended', phase = 'reveal' where id = p_room_id;
  return json_build_object('ok', true);
end;
$$;

-- ---- round config ----------------------------------------------------------

create or replace function set_round(
  p_room_id uuid, p_admin_secret uuid, p_ordinal int,
  p_prompt text, p_duration_secs int, p_pairing_mode text,
  p_write_target text, p_constraints jsonb, p_reveal_mode text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_round_id uuid;
begin
  perform assert_admin(p_room_id, p_admin_secret);
  insert into rounds(room_id, ordinal, prompt, duration_secs, pairing_mode,
                     write_target, constraints, reveal_mode)
    values (p_room_id, p_ordinal, coalesce(p_prompt, ''), coalesce(p_duration_secs, 300),
            coalesce(p_pairing_mode, 'solo'), coalesce(p_write_target, 'self'),
            coalesce(p_constraints, '{}'::jsonb), coalesce(p_reveal_mode, 'private'))
    on conflict (room_id, ordinal) do update set
      prompt        = excluded.prompt,
      duration_secs = excluded.duration_secs,
      pairing_mode  = excluded.pairing_mode,
      write_target  = excluded.write_target,
      constraints   = excluded.constraints,
      reveal_mode   = excluded.reveal_mode
    returning id into v_round_id;
  return json_build_object('round_id', v_round_id);
end;
$$;

-- ---- pairing (internal) ----------------------------------------------------

create or replace function assign_pairings(p_round_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_room_id uuid;
  v_mode text;
  ids uuid[];
  n int;
  best_ids uuid[];
  best_rep int;
  rep int;
  attempt int;
  i int;
  v_group int;
  past text[];
  key text;
  a uuid; b uuid; c uuid;
begin
  select room_id, pairing_mode into v_room_id, v_mode from rounds where id = p_round_id;
  delete from pairings where round_id = p_round_id;

  select array_agg(id) into ids from
    (select p.id from participants p
     where p.room_id = v_room_id and p.status = 'active'
     order by random()) s;
  if ids is null then return; end if;
  n := array_length(ids, 1);

  if v_mode = 'solo' or n = 1 then
    for i in 1..n loop
      insert into pairings(round_id, participant_id, partner_id, group_id)
        values (p_round_id, ids[i], null, i);
    end loop;
    return;
  end if;

  -- previously-seen partner pairs in this room (sorted key 'a|b')
  select coalesce(array_agg(distinct k), array[]::text[]) into past from (
    select case when pr.participant_id < pr.partner_id
                then pr.participant_id::text || '|' || pr.partner_id::text
                else pr.partner_id::text || '|' || pr.participant_id::text end as k
    from pairings pr
    join rounds r on r.id = pr.round_id
    where r.room_id = v_room_id and pr.partner_id is not null
  ) q;

  -- best-of-N shuffles: minimize repeat partners (greedy enough for a workshop)
  best_ids := ids; best_rep := 2147483647;
  for attempt in 1..30 loop
    select array_agg(id) into ids from
      (select p.id from participants p
       where p.room_id = v_room_id and p.status = 'active'
       order by random()) s;
    rep := 0; i := 1;
    while i + 1 <= n loop
      exit when (n - i) = 2;  -- leave a trio tail for special handling
      if ids[i] < ids[i+1] then key := ids[i]::text || '|' || ids[i+1]::text;
                            else key := ids[i+1]::text || '|' || ids[i]::text; end if;
      if key = any(past) then rep := rep + 1; end if;
      i := i + 2;
    end loop;
    if rep < best_rep then best_rep := rep; best_ids := ids; end if;
    exit when best_rep = 0;
  end loop;
  ids := best_ids;

  v_group := 0; i := 1;
  while i <= n loop
    if (n - i + 1) = 3 then                      -- trio: cycle a->b->c->a
      a := ids[i]; b := ids[i+1]; c := ids[i+2];
      v_group := v_group + 1;
      insert into pairings(round_id, participant_id, partner_id, group_id) values
        (p_round_id, a, b, v_group),
        (p_round_id, b, c, v_group),
        (p_round_id, c, a, v_group);
      i := i + 3;
    else                                          -- pair: mutual
      a := ids[i]; b := ids[i+1];
      v_group := v_group + 1;
      insert into pairings(round_id, participant_id, partner_id, group_id) values
        (p_round_id, a, b, v_group),
        (p_round_id, b, a, v_group);
      i := i + 2;
    end if;
  end loop;
end;
$$;
revoke all on function assign_pairings(uuid) from public;

-- ---- session control -------------------------------------------------------

create or replace function start_round(p_room_id uuid, p_admin_secret uuid, p_round_id uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin(p_room_id, p_admin_secret);
  update participants set status = 'active'
    where room_id = p_room_id and status = 'out';  -- 'out' is per-round; reset
  perform assign_pairings(p_round_id);
  update rooms set current_round_id = p_round_id, phase = 'pairing',
                   phase_ends_at = null, status = 'running'
    where id = p_room_id;
  return json_build_object('ok', true);
end;
$$;

create or replace function set_phase(p_room_id uuid, p_admin_secret uuid,
                                     p_phase text, p_duration_secs int default null)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ends timestamptz;
begin
  perform assert_admin(p_room_id, p_admin_secret);
  if p_duration_secs is not null then
    v_ends := now() + (p_duration_secs || ' seconds')::interval;
  else
    v_ends := null;
  end if;
  update rooms set phase = p_phase, phase_ends_at = v_ends where id = p_room_id;
  return json_build_object('phase', p_phase, 'phase_ends_at', v_ends);
end;
$$;

-- ---- writing ---------------------------------------------------------------

create or replace function save_writing(p_round_id uuid, p_content text,
                                        p_is_final boolean default false)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_room_id uuid; v_target text; v_author uuid; v_subject uuid;
begin
  select room_id, write_target into v_room_id, v_target from rounds where id = p_round_id;
  if v_room_id is null then raise exception 'round not found'; end if;
  select id into v_author from participants
    where room_id = v_room_id and auth_uid = auth.uid();
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

create or replace function mark_out(p_round_id uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_room_id uuid; v_author uuid; v_lose boolean;
begin
  select room_id, coalesce((constraints->'pauseBomb'->>'loseText')::boolean, false)
    into v_room_id, v_lose from rounds where id = p_round_id;
  select id into v_author from participants
    where room_id = v_room_id and auth_uid = auth.uid();
  if v_author is null then raise exception 'not a participant'; end if;
  update participants set status = 'out' where id = v_author;
  if v_lose then
    update submissions set lost = true, content = ''
      where round_id = p_round_id and author_id = v_author;
  end if;
  return json_build_object('ok', true);
end;
$$;

-- ---- admin read (show-on-admin / review) -----------------------------------

create or replace function admin_get_submissions(p_room_id uuid, p_admin_secret uuid,
                                                  p_round_id uuid)
returns table(author_name text, subject_name text, content text,
              is_final boolean, lost boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin(p_room_id, p_admin_secret);
  return query
    select a.display_name, s2.display_name, sub.content, sub.is_final, sub.lost
    from submissions sub
    join participants a on a.id = sub.author_id
    left join participants s2 on s2.id = sub.subject_id
    where sub.round_id = p_round_id
    order by a.display_name;
end;
$$;
