-- Tinder-style prompt matching. Everyone swipes prompt cards; a mutual
-- right-swipe on the SAME card instantly pairs the two people, with that card
-- as their shared topic. After 12 swipes with no match, auto-pair.

-- Pairings now remember which card matched a pair.
alter table pairings add column if not exists card_id text;

-- New pairing mode.
alter table rounds drop constraint if exists rounds_pairing_mode_check;
alter table rounds add constraint rounds_pairing_mode_check
  check (pairing_mode in ('solo', 'pairs', 'tinder'));

create table if not exists swipes (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references rounds(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  card_id        text not null,
  liked          boolean not null,
  created_at     timestamptz not null default now(),
  unique (round_id, participant_id, card_id)
);
create index if not exists swipes_round_card_idx on swipes(round_id, card_id) where liked;

alter table swipes enable row level security;
create policy swipes_read on swipes for select to anon, authenticated using (true);

-- Auto-pair threshold (cards swiped before we pair you with anyone available).
create or replace function fw_auto_pair_threshold() returns int language sql immutable as $$
  select 12;
$$;

-- Record a swipe and try to match. Returns {matched, card_id?, count}.
create or replace function swipe(p_round_id uuid, p_client_id text,
                                 p_card_id text, p_liked boolean)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_room_id uuid;
  v_me uuid;
  v_partner uuid;
  v_count int;
  v_group int;
  v_card text;
begin
  select room_id into v_room_id from rounds where id = p_round_id;
  if v_room_id is null then raise exception 'round not found'; end if;
  select id into v_me from participants
    where room_id = v_room_id and client_id = p_client_id;
  if v_me is null then raise exception 'not a participant'; end if;

  -- already matched -> ignore further swipes
  if exists (select 1 from pairings where round_id = p_round_id and participant_id = v_me) then
    return json_build_object('matched', true);
  end if;

  insert into swipes(round_id, participant_id, card_id, liked)
    values (p_round_id, v_me, p_card_id, coalesce(p_liked, false))
    on conflict (round_id, participant_id, card_id) do update set liked = excluded.liked;

  -- serialize matching within this round so two simultaneous swipes can't
  -- double-pair the same person
  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  -- re-check after taking the lock
  if exists (select 1 from pairings where round_id = p_round_id and participant_id = v_me) then
    return json_build_object('matched', true);
  end if;

  if coalesce(p_liked, false) then
    select s.participant_id into v_partner
    from swipes s
    join participants p on p.id = s.participant_id
    where s.round_id = p_round_id and s.card_id = p_card_id and s.liked
      and s.participant_id <> v_me and p.status = 'active'
      and not exists (select 1 from pairings pr
                      where pr.round_id = p_round_id and pr.participant_id = s.participant_id)
    order by s.created_at
    limit 1;

    if v_partner is not null then
      select coalesce(max(group_id), 0) + 1 into v_group from pairings where round_id = p_round_id;
      insert into pairings(round_id, participant_id, partner_id, group_id, card_id) values
        (p_round_id, v_me, v_partner, v_group, p_card_id),
        (p_round_id, v_partner, v_me, v_group, p_card_id);
      return json_build_object('matched', true, 'card_id', p_card_id);
    end if;
  end if;

  -- auto-pair after the threshold
  select count(*) into v_count from swipes where round_id = p_round_id and participant_id = v_me;
  if v_count >= fw_auto_pair_threshold() then
    select p.id into v_partner
    from participants p
    where p.room_id = v_room_id and p.status = 'active' and p.id <> v_me
      and not exists (select 1 from pairings pr
                      where pr.round_id = p_round_id and pr.participant_id = p.id)
    order by (select count(*) from swipes s
              where s.round_id = p_round_id and s.participant_id = p.id) desc
    limit 1;

    if v_partner is not null then
      -- prefer a card both liked, else my latest like, else partner's, else my latest swipe
      select s1.card_id into v_card
      from swipes s1
      join swipes s2 on s2.round_id = s1.round_id and s2.card_id = s1.card_id and s2.liked
      where s1.round_id = p_round_id and s1.participant_id = v_me and s1.liked
        and s2.participant_id = v_partner
      limit 1;
      if v_card is null then
        select card_id into v_card from swipes
          where round_id = p_round_id and participant_id = v_me and liked
          order by created_at desc limit 1;
      end if;
      if v_card is null then
        select card_id into v_card from swipes
          where round_id = p_round_id and participant_id = v_partner and liked
          order by created_at desc limit 1;
      end if;
      if v_card is null then
        select card_id into v_card from swipes
          where round_id = p_round_id and participant_id = v_me
          order by created_at desc limit 1;
      end if;

      select coalesce(max(group_id), 0) + 1 into v_group from pairings where round_id = p_round_id;
      insert into pairings(round_id, participant_id, partner_id, group_id, card_id) values
        (p_round_id, v_me, v_partner, v_group, v_card),
        (p_round_id, v_partner, v_me, v_group, v_card);
      return json_build_object('matched', true, 'card_id', v_card, 'auto', true);
    end if;
  end if;

  return json_build_object('matched', false, 'count', v_count);
end;
$$;

-- start_round: skip random assignment for tinder (pairings come from swiping),
-- and clear any prior swipes/pairings for a clean (re)start.
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
                   phase_ends_at = null, status = 'running'
    where id = p_room_id;
  return json_build_object('ok', true);
end;
$$;
