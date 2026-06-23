"use client";

import { useRef, useState } from "react";
import { buildDeck, BATCH_SIZE } from "@/lib/prompts";
import { swipe } from "@/lib/rpc";

// Pass too many in a row and you're forced to say yes to the next one.
const PASS_LIMIT = 10;

// Tinder-style prompt deck. Right = "I'd talk about this", left = pass.
// Each person gets their own randomly-shuffled deck so matches surface
// organically (the server pairs anyone who's liked the same card). A mutual
// match pairs you server-side; the parent swaps this out for the matched view.
export default function SwipeDeck({
  roundId,
  levels,
}: {
  roundId: string;
  levels?: number[];
}) {
  // Built once on mount — random per device, never reshuffle under the user.
  const [deck] = useState(() => buildDeck(levels));
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState(false);
  const [batchBreak, setBatchBreak] = useState(false);
  const [noStreak, setNoStreak] = useState(0);
  const startX = useRef<number | null>(null);

  const card = deck[index];
  const batch = Math.floor(index / BATCH_SIZE) + 1;
  const posInBatch = (index % BATCH_SIZE) + 1;
  const forced = noStreak >= PASS_LIMIT; // must say yes
  const heartsLeft = Math.max(0, PASS_LIMIT - noStreak);

  const commit = async (liked: boolean) => {
    if (busy || matched || !card) return;
    if (forced && !liked) return; // out of hearts — can't pass
    setBusy(true);
    setExiting(liked ? "right" : "left");
    try {
      const res = await swipe(roundId, card.id, liked);
      if (res.matched) {
        setMatched(true);
        return;
      }
    } catch {
      /* ignore; let them retry */
    }
    setTimeout(() => {
      const next = index + 1;
      setIndex(next);
      setDragX(0);
      setExiting(null);
      setBusy(false);
      // a no costs a heart; a yes refills one (not all)
      setNoStreak((s) => (liked ? Math.max(0, s - 1) : Math.min(PASS_LIMIT, s + 1)));
      // crossed a batch boundary with no match → pause for the next 12
      if (next < deck.length && next % BATCH_SIZE === 0) setBatchBreak(true);
    }, 220);
  };

  const onDown = (e: React.PointerEvent) => {
    if (busy || matched) return;
    startX.current = e.clientX;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    setDragX(e.clientX - startX.current);
  };
  const onUp = () => {
    if (startX.current == null) return;
    const dx = dragX;
    startX.current = null;
    if (Math.abs(dx) > 90) {
      if (forced && dx < 0) {
        setDragX(0); // out of hearts — left swipe snaps back
        return;
      }
      commit(dx > 0);
    } else setDragX(0);
  };

  if (matched) {
    return (
      <div className="screen flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="text-5xl">✨</div>
        <p className="text-lg font-medium text-zinc-800">It&apos;s a match!</p>
        <p className="text-sm text-zinc-400">Finding your partner…</p>
      </div>
    );
  }

  if (batchBreak) {
    return (
      <div className="screen flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-4xl">🔄</div>
        <p className="text-lg font-medium text-zinc-800">No match yet</p>
        <p className="max-w-xs text-sm text-zinc-400">
          Here come 12 fresh questions. Find one you&apos;d both love to get into.
        </p>
        <button
          onClick={() => setBatchBreak(false)}
          className="mt-2 rounded-xl bg-zinc-900 px-6 py-3 font-medium text-white"
        >
          Next 12 →
        </button>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="screen flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-lg font-medium text-zinc-700">You&apos;ve seen them all.</p>
        <p className="text-sm text-zinc-400">Hang tight — we&apos;ll match you up.</p>
      </div>
    );
  }

  const dragging = startX.current != null;
  const rot = Math.max(-12, Math.min(12, dragX / 12));
  const exitX = exiting === "right" ? 600 : exiting === "left" ? -600 : dragX;
  const likeOpacity = Math.max(0, Math.min(1, dragX / 90));
  const nopeOpacity = Math.max(0, Math.min(1, -dragX / 90));

  return (
    <div className="screen flex flex-col">
      <header className="px-5 pt-5 text-center">
        <p className="text-xs uppercase tracking-widest text-zinc-300">
          Find someone to write with
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Swipe right on a question you&apos;d love to talk about.
        </p>
        <p className="mt-2 text-xs text-zinc-300">
          Batch {batch} · {posInBatch}/{BATCH_SIZE}
        </p>
        <div
          className="mt-2 flex items-center justify-center gap-1"
          aria-label={`${heartsLeft} passes left`}
        >
          {Array.from({ length: PASS_LIMIT }).map((_, i) => (
            <span key={i} className={`text-sm ${i < heartsLeft ? "text-rose-400" : "text-zinc-200"}`}>
              ♥
            </span>
          ))}
        </div>
        {forced && (
          <p className="mt-1 text-xs font-medium text-rose-500">
            Out of hearts — say yes to this one 💛
          </p>
        )}
      </header>

      <div className="relative flex flex-1 items-center justify-center px-6">
        {deck[index + 1] && (
          <div className="absolute h-[58%] w-full max-w-sm translate-y-3 scale-95 rounded-3xl bg-zinc-100" />
        )}
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative flex min-h-[58%] w-full max-w-sm touch-none select-none flex-col rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm"
          style={{
            transform: `translateX(${exitX}px) rotate(${
              exiting ? (exiting === "right" ? 18 : -18) : rot
            }deg)`,
            transition: exiting || !dragging ? "transform .22s ease-out" : "none",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
              {card.levelName}
            </span>
            <span className="text-xs text-zinc-300">{card.category}</span>
          </div>
          <p className="mt-7 text-2xl font-medium leading-snug text-zinc-900">{card.text}</p>

          <span
            className="pointer-events-none absolute left-6 top-6 -rotate-12 rounded-md border-2 border-emerald-500 px-2 py-0.5 text-sm font-bold tracking-wide text-emerald-500"
            style={{ opacity: likeOpacity }}
          >
            TALK
          </span>
          <span
            className="pointer-events-none absolute right-6 top-6 rotate-12 rounded-md border-2 border-rose-500 px-2 py-0.5 text-sm font-bold tracking-wide text-rose-500"
            style={{ opacity: nopeOpacity }}
          >
            PASS
          </span>
        </div>
      </div>

      <footer className="flex items-center justify-center gap-10 px-6 py-7">
        <button
          aria-label="pass"
          onClick={() => commit(false)}
          disabled={busy || forced}
          className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 text-2xl text-rose-500 disabled:opacity-20"
        >
          ✗
        </button>
        <button
          aria-label="talk about this"
          onClick={() => commit(true)}
          disabled={busy}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-2xl text-white disabled:opacity-40"
        >
          ♥
        </button>
      </footer>
    </div>
  );
}
