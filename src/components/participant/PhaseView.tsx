"use client";

import { useMemo } from "react";
import type { Participant, Pairing, Round, RoomState } from "@/lib/types";
import WritingSurface from "@/components/writing/WritingSurface";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="screen flex flex-col items-center justify-center gap-4 px-8 text-center">
      {children}
    </div>
  );
}

export default function PhaseView({
  room,
  round,
  me,
  roster,
  pairing,
  reveal,
}: {
  room: RoomState;
  round: Round | null;
  me: Participant | null;
  roster: Participant[];
  pairing: Pairing | null;
  reveal: { author_id: string; content: string; lost: boolean } | null;
}) {
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    roster.forEach((p) => m.set(p.id, p.display_name));
    return m;
  }, [roster]);

  const partnerName = pairing?.partner_id ? nameById.get(pairing.partner_id) : null;

  if (room.status === "ended") {
    return (
      <Centered>
        <div className="text-5xl">🌱</div>
        <p className="text-lg font-medium text-zinc-700">That&apos;s a wrap.</p>
        <p className="text-sm text-zinc-400">Thanks for writing.</p>
      </Centered>
    );
  }

  switch (room.phase) {
    case "lobby":
      return (
        <Centered>
          <p className="text-sm text-zinc-400">You&apos;re in.</p>
          <p className="text-2xl font-semibold text-zinc-900">{me?.display_name}</p>
          <p className="text-sm text-zinc-400">Waiting for the session to start…</p>
        </Centered>
      );

    case "pairing":
      return (
        <Centered>
          {round?.pairing_mode === "pairs" && partnerName ? (
            <>
              <p className="text-sm text-zinc-400">You&apos;re paired with</p>
              <p className="text-3xl font-semibold text-zinc-900">{partnerName}</p>
              <p className="max-w-xs text-sm text-zinc-400">
                Say hi in the room. You&apos;ll talk, then write.
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold text-zinc-900">Get ready</p>
              <p className="text-sm text-zinc-400">This one&apos;s just you.</p>
            </>
          )}
        </Centered>
      );

    case "talk":
      return (
        <Centered>
          <p className="text-xs uppercase tracking-wide text-zinc-300">Talk</p>
          {partnerName && (
            <p className="text-lg text-zinc-500">
              with <span className="font-semibold text-zinc-800">{partnerName}</span>
            </p>
          )}
          {round?.prompt && (
            <p className="max-w-md text-xl leading-relaxed text-zinc-800">{round.prompt}</p>
          )}
        </Centered>
      );

    case "writing":
      if (!round) return <Centered><p className="text-zinc-400">Loading…</p></Centered>;
      return (
        <WritingSurface
          key={round.id}
          round={round}
          deadline={room.phase_ends_at}
          onFinalized={() => {}}
        />
      );

    case "submitted":
      return (
        <Centered>
          <div className="text-4xl">⏳</div>
          <p className="text-lg font-medium text-zinc-700">Pens down.</p>
          <p className="text-sm text-zinc-400">Waiting for the reveal…</p>
        </Centered>
      );

    case "reveal": {
      if (round?.write_target === "partner") {
        if (reveal) {
          const author = nameById.get(reveal.author_id) ?? "Someone";
          return (
            <div className="screen flex flex-col px-7 py-10">
              <p className="text-sm text-zinc-400">
                <span className="font-medium text-zinc-700">{author}</span> wrote about you
              </p>
              <div className="mt-5 flex-1 overflow-y-auto whitespace-pre-wrap text-lg leading-relaxed text-zinc-900">
                {reveal.lost ? "💨 …their words were lost to the bomb." : reveal.content || "(nothing)"}
              </div>
            </div>
          );
        }
        return (
          <Centered>
            <div className="text-4xl">✉️</div>
            <p className="text-sm text-zinc-400">Waiting for your partner&apos;s words…</p>
          </Centered>
        );
      }
      // self round: show your own piece back
      return (
        <div className="screen flex flex-col px-7 py-10">
          <p className="text-sm text-zinc-400">What you wrote</p>
          <div className="mt-5 flex-1 overflow-y-auto whitespace-pre-wrap text-lg leading-relaxed text-zinc-900">
            {reveal?.content || "(saved)"}
          </div>
        </div>
      );
    }

    default:
      return <Centered><p className="text-zinc-400">…</p></Centered>;
  }
}
