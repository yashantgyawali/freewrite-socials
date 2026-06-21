-- Batches of 12: with a shared, fixed deck order, "no match after 12" now means
-- "show the next batch" (handled client-side). Auto-pair becomes a final safety
-- net that only fires once the whole shared deck is exhausted.
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
  v_threshold int;
begin
  select room_id,
         coalesce(jsonb_array_length(constraints->'deckOrder'), fw_auto_pair_threshold())
    into v_room_id, v_threshold
    from rounds where id = p_round_id;
  if v_room_id is null then raise exception 'round not found'; end if;
  select id into v_me from participants
    where room_id = v_room_id and client_id = p_client_id;
  if v_me is null then raise exception 'not a participant'; end if;

  if exists (select 1 from pairings where round_id = p_round_id and participant_id = v_me) then
    return json_build_object('matched', true);
  end if;

  insert into swipes(round_id, participant_id, card_id, liked)
    values (p_round_id, v_me, p_card_id, coalesce(p_liked, false))
    on conflict (round_id, participant_id, card_id) do update set liked = excluded.liked;

  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

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

  -- safety net: only once the entire shared deck has been swiped
  select count(*) into v_count from swipes where round_id = p_round_id and participant_id = v_me;
  if v_count >= v_threshold then
    select p.id into v_partner
    from participants p
    where p.room_id = v_room_id and p.status = 'active' and p.id <> v_me
      and not exists (select 1 from pairings pr
                      where pr.round_id = p_round_id and pr.participant_id = p.id)
    order by (select count(*) from swipes s
              where s.round_id = p_round_id and s.participant_id = p.id) desc
    limit 1;

    if v_partner is not null then
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
