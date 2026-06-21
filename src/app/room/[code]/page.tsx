"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getClientId, getDisplayName } from "@/lib/identity";
import { joinRoom } from "@/lib/rpc";
import { syncServerTime } from "@/lib/serverTime";
import {
  useRoomState,
  useRound,
  useRoster,
  useMyPairing,
  useRevealForMe,
  useSubmissionByAuthor,
} from "@/lib/realtime";
import PhaseView from "@/components/participant/PhaseView";

export default function RoomPage() {
  const router = useRouter();
  const code = (useParams().code as string)?.toUpperCase() ?? "";
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const room = useRoomState(code);
  const round = useRound(room?.current_round_id ?? null);
  const roster = useRoster(room?.id ?? null);
  const pairing = useMyPairing(room?.current_round_id ?? null, participantId);
  const reveal = useRevealForMe(room?.current_round_id ?? null, participantId);
  const partnerSubmission = useSubmissionByAuthor(
    room?.current_round_id ?? null,
    pairing?.partner_id ?? null,
  );

  // Join (idempotent) so a reload re-attaches to the same participant row.
  useEffect(() => {
    const name = getDisplayName();
    if (!name) {
      router.replace(`/?code=${code}`);
      return;
    }
    let active = true;
    (async () => {
      try {
        await syncServerTime();
        const res = await joinRoom(code, getClientId(), name);
        if (active) setParticipantId(res.participant_id);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not join");
      }
    })();
    return () => {
      active = false;
    };
  }, [code, router]);

  if (error) {
    return (
      <div className="screen flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-lg font-medium text-zinc-800">Couldn&apos;t join {code}</p>
        <p className="text-sm text-zinc-400">{error}</p>
        <button
          onClick={() => router.replace(`/?code=${code}`)}
          className="mt-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!room || !participantId) {
    return (
      <div className="screen flex items-center justify-center">
        <p className="text-sm text-zinc-300">Joining {code}…</p>
      </div>
    );
  }

  // Prefer the roster row, but fall back to what we know locally so our own
  // name never flickers blank if the roster fetch races our own join INSERT.
  const me =
    roster.find((p) => p.id === participantId) ??
    ({
      id: participantId,
      room_id: room.id,
      client_id: getClientId(),
      display_name: getDisplayName(),
      is_facilitator: false,
      status: "active",
    } as const);

  return (
    <PhaseView
      room={room}
      round={round}
      me={me}
      roster={roster}
      pairing={pairing}
      reveal={reveal}
      partnerSubmission={partnerSubmission}
    />
  );
}
