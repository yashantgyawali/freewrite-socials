-- Writing is private. A participant can REQUEST to present their piece; the
-- facilitator chooses what to project (presentation mode on the admin).

alter table submissions add column if not exists present_requested boolean not null default false;
alter table rooms add column if not exists presenting_submission_id uuid
  references submissions(id) on delete set null;

-- Participant asks to share their piece with the room.
create or replace function request_present(p_round_id uuid, p_client_id text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_room_id uuid; v_author uuid;
begin
  select room_id into v_room_id from rounds where id = p_round_id;
  if v_room_id is null then raise exception 'round not found'; end if;
  select id into v_author from participants
    where room_id = v_room_id and client_id = p_client_id;
  if v_author is null then raise exception 'not a participant'; end if;
  update submissions set present_requested = true
    where round_id = p_round_id and author_id = v_author;
  return json_build_object('ok', true);
end;
$$;

-- Facilitator projects a submission (or clears with null).
create or replace function present_submission(p_room_id uuid, p_admin_secret uuid,
                                              p_submission_id uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform assert_admin(p_room_id, p_admin_secret);
  update rooms set presenting_submission_id = p_submission_id where id = p_room_id;
  return json_build_object('ok', true);
end;
$$;

-- Clear any stale presentation when a new round starts.
create or replace function start_round(p_room_id uuid, p_admin_secret uuid, p_round_id uuid)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_mode text;
begin
  perform assert_admin(p_room_id, p_admin_secret);
  update participants set status = 'active'
    where room_id = p_room_id and status = 'out';
  delete from swipes where round_id = p_round_id;
  delete from pairings where round_id = p_round_id;
  select pairing_mode into v_mode from rounds where id = p_round_id;
  if v_mode <> 'tinder' then
    perform assign_pairings(p_round_id);
  end if;
  update rooms set current_round_id = p_round_id, phase = 'pairing',
                   phase_ends_at = null, status = 'running',
                   presenting_submission_id = null
    where id = p_room_id;
  return json_build_object('ok', true);
end;
$$;
