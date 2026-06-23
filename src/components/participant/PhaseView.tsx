"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Participant, Pairing, Round, RoomState } from "@/lib/types";
import WritingSurface from "@/components/writing/WritingSurface";
import SwipeDeck from "@/components/participant/SwipeDeck";
import { getPromptText } from "@/lib/prompts";
import { requestPresent, saveWriting } from "@/lib/rpc";

// Your own private piece, with on-device grammar cleanup and the option to ask
// the host to project it.
function PresentablePiece({ roundId, content }: { roundId: string; content: string }) {
  const [text, setText] = useState(content);
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixNote, setFixNote] = useState<string | null>(null);
  const touched = useRef(false);

  // Mirror the loaded submission until the user runs a fix of their own.
  useEffect(() => {
    if (!touched.current) setText(content);
  }, [content]);

  const fix = async () => {
    setFixing(true);
    setFixNote(null);
    touched.current = true;
    try {
      const { fixWithHarper } = await import("@/lib/harper");
      const { fixed, count } = await fixWithHarper(text);
      setText(fixed);
      await saveWriting(roundId, fixed, true); // persist the cleaned-up version
      setFixNote(count > 0 ? `Fixed ${count} ${count === 1 ? "thing" : "things"}` : "Looks clean already ✓");
    } catch {
      setFixNote("Couldn't load Harper — check your connection");
    }
    setFixing(false);
  };

  const send = async () => {
    setBusy(true);
    try {
      await requestPresent(roundId);
      setRequested(true);
    } catch {
      /* let them retry */
    }
    setBusy(false);
  };

  return (
    <div className="screen flex flex-col px-8 py-12">
      <p className="text-sm text-zinc-400">What you wrote</p>
      <textarea
        className="mt-4 flex-1 resize-none whitespace-pre-wrap text-lg leading-relaxed text-zinc-900 outline-none bg-transparent"
        value={text}
        onChange={(e) => { touched.current = true; setText(e.target.value); }}
        placeholder="(nothing yet)"
      />
      {fixNote && <p className="mt-2 text-xs text-zinc-400">{fixNote}</p>}
      <div className="mt-4 flex flex-col gap-2">
        <button
          onClick={fix}
          disabled={fixing || busy}
          className="rounded-xl border border-zinc-300 py-3 font-medium text-zinc-700 disabled:opacity-50"
        >
          {fixing ? "Fixing with Harper…" : "✦ Fix with Harper"}
        </button>
        <button
          onClick={send}
          disabled={busy || requested}
          className="rounded-xl bg-zinc-900 py-3 font-medium text-white disabled:opacity-50"
        >
          {requested ? "✓ Sent to the host" : "Present to the room"}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-zinc-300">
        Harper fixes grammar & punctuation on your device — no AI. Private unless you present.
      </p>
    </div>
  );
}

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
  const isTinder = round?.pairing_mode === "tinder";
  const cardText = getPromptText(pairing?.card_id);

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
      if (isTinder && round) {
        // Not matched yet → keep swiping. Matched → show partner + the card.
        if (!pairing)
          return <SwipeDeck roundId={round.id} levels={round.constraints.deckLevels} />;
        return (
          <Centered>
            <div className="text-5xl">🤝</div>
            <p className="text-sm text-zinc-400">You matched with</p>
            <p className="text-3xl font-semibold text-zinc-900">{partnerName ?? "your partner"}</p>
            {cardText && (
              <div className="mt-2 rounded-2xl bg-zinc-100 px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-zinc-400">Talk about</p>
                <p className="mt-1 text-lg leading-snug text-zinc-800">{cardText}</p>
              </div>
            )}
            <p className="mt-2 max-w-xs text-sm text-zinc-400">
              Find each other and talk it through. You&apos;ll write next.
            </p>
          </Centered>
        );
      }
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
          {(cardText || round?.prompt) && (
            <p className="max-w-md text-xl leading-relaxed text-zinc-800">
              {cardText || round?.prompt}
            </p>
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
          promptText={isTinder ? cardText : undefined}
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
      // Tinder: your piece is private — you see your own, and may ask to present.
      if (isTinder && round) {
        return <PresentablePiece roundId={round.id} content={reveal?.content ?? ""} />;
      }
      if (round?.write_target === "partner") {
        if (reveal) {
          const author = nameById.get(reveal.author_id) ?? "Someone";
          return (
            <div className="screen flex flex-col px-8 py-12">
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
        <div className="screen flex flex-col px-8 py-12">
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
