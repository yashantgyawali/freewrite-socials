"use client";

import { useRef, useState } from "react";
import { buildDeck, BATCH_SIZE } from "@/lib/prompts";
import { swipe } from "@/lib/rpc";

const PASS_LIMIT = 5;

const LEVEL_COLORS: Record<number, string> = {
  1: "#e0f0ff",
  2: "#fde8d8",
  3: "#f0dff8",
};

export default function SwipeDeck({
  roundId,
  levels,
}: {
  roundId: string;
  levels?: number[];
}) {
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
  const nextCard = deck[index + 1];
  const batch = Math.floor(index / BATCH_SIZE) + 1;
  const posInBatch = (index % BATCH_SIZE) + 1;
  const forced = noStreak >= PASS_LIMIT;
  const heartsLeft = Math.max(0, PASS_LIMIT - noStreak);

  const commit = async (liked: boolean) => {
    if (busy || matched || !card) return;
    if (forced && !liked) return;
    setBusy(true);
    setExiting(liked ? "right" : "left");
    try {
      const res = await swipe(roundId, card.id, liked);
      if (res.matched) {
        setMatched(true);
        return;
      }
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      const next = index + 1;
      setIndex(next);
      setDragX(0);
      setExiting(null);
      setBusy(false);
      setNoStreak((s) => (liked ? Math.max(0, s - 1) : Math.min(PASS_LIMIT, s + 1)));
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
      if (forced && dx < 0) { setDragX(0); return; }
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
  const likeOpacity = Math.max(0, Math.min(1, dragX / 80));
  const nopeOpacity = Math.max(0, Math.min(1, -dragX / 80));
  const cardBg = LEVEL_COLORS[card.level] ?? "#f4f4f5";

  return (
    <div className="screen flex flex-col bg-zinc-50">
      {/* Header */}
      <header className="px-6 pt-8 pb-2 text-center">
        <p className="text-sm font-medium text-zinc-400">Find someone to write with</p>
        {/* Hearts */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {Array.from({ length: PASS_LIMIT }).map((_, i) => (
            <svg
              key={i}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={i < heartsLeft ? "#fb7185" : "#e4e4e7"}
            >
              <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
            </svg>
          ))}
        </div>
        {forced && (
          <p className="mt-1 text-xs font-medium text-rose-500">
            Say yes to this one to keep going
          </p>
        )}
      </header>

      {/* Card stack */}
      <div className="relative flex flex-1 items-center justify-center px-6">
        {/* Background card (next) */}
        {nextCard && (
          <div
            className="absolute w-full max-w-sm rounded-3xl shadow-sm"
            style={{
              height: "62%",
              background: LEVEL_COLORS[nextCard.level] ?? "#f4f4f5",
              transform: "translateY(10px) scale(0.95)",
            }}
          />
        )}

        {/* Active card */}
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative flex w-full max-w-sm touch-none select-none flex-col overflow-hidden rounded-3xl shadow-lg"
          style={{
            height: "62%",
            background: cardBg,
            transform: `translateX(${exitX}px) rotate(${
              exiting ? (exiting === "right" ? 18 : -18) : rot
            }deg)`,
            transition: exiting || !dragging ? "transform .22s ease-out" : "none",
          }}
        >
          {/* Colored top band */}
          <div className="flex-1 p-7 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-zinc-600 backdrop-blur-sm">
                {card.levelName}
              </span>
              <span className="text-xs text-zinc-400/70">{card.category}</span>
            </div>
            <p className="text-2xl font-semibold leading-snug text-zinc-900 mt-6">
              {card.text}
            </p>
          </div>

          {/* Progress bar at bottom */}
          <div className="px-7 pb-5">
            <div className="flex gap-1">
              {Array.from({ length: BATCH_SIZE }).map((_, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full"
                  style={{
                    background: i < posInBatch ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.08)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* TALK stamp */}
          <span
            className="pointer-events-none absolute left-6 top-7 -rotate-12 rounded-lg border-[3px] border-emerald-500 px-2.5 py-1 text-base font-black tracking-widest text-emerald-500 uppercase"
            style={{ opacity: likeOpacity }}
          >
            Talk
          </span>
          {/* PASS stamp */}
          <span
            className="pointer-events-none absolute right-6 top-7 rotate-12 rounded-lg border-[3px] border-rose-500 px-2.5 py-1 text-base font-black tracking-widest text-rose-500 uppercase"
            style={{ opacity: nopeOpacity }}
          >
            Pass
          </span>
        </div>
      </div>

      {/* Buttons */}
      <footer className="flex items-center justify-center gap-8 px-6 py-8">
        {/* Pass — white circle */}
        <button
          aria-label="pass"
          onClick={() => commit(false)}
          disabled={busy || forced}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md disabled:opacity-30 active:scale-95 transition-transform"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9f9f9f" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Like — coral circle */}
        <button
          aria-label="talk about this"
          onClick={() => commit(true)}
          disabled={busy}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-md disabled:opacity-40 active:scale-95 transition-transform"
          style={{ background: "#ff6b6b" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
          </svg>
        </button>
      </footer>
    </div>
  );
}
