"use client";

import { useEffect, useState } from "react";
import { getSupabase, ensureAuth } from "./supabase/client";
import type { Participant, Pairing, RoomState, Round } from "./types";

// Subscribe to the room's live cursor (phase / current round / timer). The DB
// row is the source of truth — we read it on mount (rehydrate) then follow
// Postgres Changes. Surviving a reconnect is just re-running this.
export function useRoomState(code: string): RoomState | null {
  const [room, setRoom] = useState<RoomState | null>(null);
  useEffect(() => {
    const sb = getSupabase();
    const upper = code.toUpperCase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    (async () => {
      await ensureAuth();
      const { data } = await sb.from("rooms").select("*").eq("code", upper).maybeSingle();
      if (!active) return;
      if (data) setRoom(data as RoomState);
      channel = sb
        .channel(`rooms:${upper}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rooms", filter: `code=eq.${upper}` },
          (payload) => setRoom(payload.new as RoomState),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [code]);
  return room;
}

export function useRound(roundId: string | null): Round | null {
  const [round, setRound] = useState<Round | null>(null);
  useEffect(() => {
    if (!roundId) {
      setRound(null);
      return;
    }
    const sb = getSupabase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    (async () => {
      await ensureAuth();
      const { data } = await sb.from("rounds").select("*").eq("id", roundId).maybeSingle();
      if (!active) return;
      if (data) setRound(data as Round);
      channel = sb
        .channel(`round:${roundId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rounds", filter: `id=eq.${roundId}` },
          (payload) => setRound(payload.new as Round),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [roundId]);
  return round;
}

export function useRoster(roomId: string | null): Participant[] {
  const [roster, setRoster] = useState<Participant[]>([]);
  useEffect(() => {
    if (!roomId) return;
    const sb = getSupabase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    const refetch = async () => {
      const { data } = await sb
        .from("participants")
        .select("*")
        .eq("room_id", roomId)
        .order("joined_at");
      if (active && data) setRoster(data as Participant[]);
    };
    (async () => {
      await ensureAuth();
      await refetch();
      channel = sb
        .channel(`roster:${roomId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${roomId}` },
          () => refetch(),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [roomId]);
  return roster;
}

// My pairing for the current round (who I write about / my group).
export function useMyPairing(
  roundId: string | null,
  participantId: string | null,
): Pairing | null {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  useEffect(() => {
    if (!roundId || !participantId) {
      setPairing(null);
      return;
    }
    const sb = getSupabase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    const refetch = async () => {
      const { data } = await sb
        .from("pairings")
        .select("*")
        .eq("round_id", roundId)
        .eq("participant_id", participantId)
        .maybeSingle();
      if (active) setPairing((data as Pairing) ?? null);
    };
    (async () => {
      await ensureAuth();
      await refetch();
      channel = sb
        .channel(`pairing:${roundId}:${participantId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pairings",
            filter: `participant_id=eq.${participantId}`,
          },
          () => refetch(),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [roundId, participantId]);
  return pairing;
}

export interface PresentItem {
  id: string;
  author_id: string;
  content: string;
}

// Submissions whose author asked to present them (admin view).
export function usePresentRequests(roundId: string | null): PresentItem[] {
  const [items, setItems] = useState<PresentItem[]>([]);
  useEffect(() => {
    if (!roundId) {
      setItems([]);
      return;
    }
    const sb = getSupabase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    const refetch = async () => {
      const { data } = await sb
        .from("submissions")
        .select("id, author_id, content")
        .eq("round_id", roundId)
        .eq("present_requested", true)
        .order("updated_at");
      if (active && data) setItems(data as PresentItem[]);
    };
    (async () => {
      await ensureAuth();
      await refetch();
      channel = sb
        .channel(`present:${roundId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "submissions", filter: `round_id=eq.${roundId}` },
          () => refetch(),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [roundId]);
  return items;
}

// A single submission by id — for the live "now presenting" panel.
export function useSubmissionById(submissionId: string | null): PresentItem | null {
  const [sub, setSub] = useState<PresentItem | null>(null);
  useEffect(() => {
    if (!submissionId) {
      setSub(null);
      return;
    }
    const sb = getSupabase();
    let active = true;
    (async () => {
      await ensureAuth();
      const { data } = await sb
        .from("submissions")
        .select("id, author_id, content")
        .eq("id", submissionId)
        .maybeSingle();
      if (active) setSub((data as PresentItem) ?? null);
    })();
    return () => {
      active = false;
    };
  }, [submissionId]);
  return sub;
}

// How many participants are currently matched this round (admin view).
export function useMatchedCount(roundId: string | null): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!roundId) {
      setCount(0);
      return;
    }
    const sb = getSupabase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    const refetch = async () => {
      const { count: c } = await sb
        .from("pairings")
        .select("*", { count: "exact", head: true })
        .eq("round_id", roundId)
        .not("partner_id", "is", null);
      if (active) setCount(c ?? 0);
    };
    (async () => {
      await ensureAuth();
      await refetch();
      channel = sb
        .channel(`matched:${roundId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pairings", filter: `round_id=eq.${roundId}` },
          () => refetch(),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [roundId]);
  return count;
}

// A specific author's submission this round — used for the tinder "swap & read
// each other's" reveal, where you read what your partner wrote.
export function useSubmissionByAuthor(
  roundId: string | null,
  authorId: string | null | undefined,
): { content: string; lost: boolean } | null {
  const [sub, setSub] = useState<{ content: string; lost: boolean } | null>(null);
  useEffect(() => {
    if (!roundId || !authorId) {
      setSub(null);
      return;
    }
    const sb = getSupabase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    const refetch = async () => {
      const { data } = await sb
        .from("submissions")
        .select("content, lost")
        .eq("round_id", roundId)
        .eq("author_id", authorId)
        .maybeSingle();
      if (active) setSub((data as { content: string; lost: boolean }) ?? null);
    };
    (async () => {
      await ensureAuth();
      await refetch();
      channel = sb
        .channel(`authorsub:${roundId}:${authorId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "submissions", filter: `round_id=eq.${roundId}` },
          () => refetch(),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [roundId, authorId]);
  return sub;
}

// The piece written ABOUT me this round (reveal). Author name resolved by caller.
export function useRevealForMe(
  roundId: string | null,
  participantId: string | null,
): { author_id: string; content: string; lost: boolean } | null {
  const [reveal, setReveal] = useState<{
    author_id: string;
    content: string;
    lost: boolean;
  } | null>(null);
  useEffect(() => {
    if (!roundId || !participantId) {
      setReveal(null);
      return;
    }
    const sb = getSupabase();
    let active = true;
    let channel: ReturnType<typeof sb.channel> | null = null;
    const refetch = async () => {
      const { data } = await sb
        .from("submissions")
        .select("author_id, content, lost")
        .eq("round_id", roundId)
        .eq("subject_id", participantId)
        .maybeSingle();
      if (active) setReveal((data as { author_id: string; content: string; lost: boolean }) ?? null);
    };
    (async () => {
      await ensureAuth();
      await refetch();
      channel = sb
        .channel(`reveal:${roundId}:${participantId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "submissions",
            filter: `round_id=eq.${roundId}`,
          },
          () => refetch(),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) sb.removeChannel(channel);
    };
  }, [roundId, participantId]);
  return reveal;
}
