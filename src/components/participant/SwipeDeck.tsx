"use client";

import { useEffect, useRef, useState } from "react";
import { buildDeck, BATCH_SIZE } from "@/lib/prompts";
import { swipe } from "@/lib/rpc";

const PASS_LIMIT = 5;

const COLORS = [
  "#e8d5f0", // lavender
  "#c8d8f2", // powder blue
  "#f5d5e0", // blush
  "#ceeedd", // mint
  "#fae0cc", // peach
  "#ddd0f0", // lilac
  "#c8e0f2", // sky
  "#f0e8c8", // warm cream
  "#f2d0d8", // rose
  "#d0e8e0", // sage
];

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
  const [dragY, setDragY] = useState(0);
  const [exiting, setExiting] = useState<null | "left" | "right">(null);
  const [flyingOff, setFlyingOff] = useState(false);
  const [justReset, setJustReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState(false);
  const [batchBreak, setBatchBreak] = useState(false);
  const [noStreak, setNoStreak] = useState(0);
  const [showHint, setShowHint] = useState(true);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isDragging = useRef(false);

  const card = deck[index];
  const batch = Math.floor(index / BATCH_SIZE) + 1;
  const posInBatch = (index % BATCH_SIZE) + 1;
  const forced = noStreak >= PASS_LIMIT;
  const heartsLeft = Math.max(0, PASS_LIMIT - noStreak);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(t);
  }, []);

  const doSwipe = async (dir: 1 | -1) => {
    if (busy || matched || !card) return;
    if (forced && dir === -1) return;
    const liked = dir === 1;
    setBusy(true);
    const flyX = dir * 1400;
    setDragX(flyX);
    setDragY((prev) => prev * 1.4);
    setFlyingOff(true);
    try {
      const res = await swipe(roundId, card.id, liked);
      if (res.matched) { setMatched(true); return; }
    } catch { /* ignore */ }
    setTimeout(() => {
      const next = index + 1;
      setIndex(next);
      setDragX(0);
      setDragY(0);
      setFlyingOff(false);
      setJustReset(true);
      setExiting(null);
      setBusy(false);
      setNoStreak((s) => (liked ? Math.max(0, s - 1) : Math.min(PASS_LIMIT, s + 1)));
      if (next < deck.length && next % BATCH_SIZE === 0) setBatchBreak(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setJustReset(false)));
    }, 420);
  };

  const onDown = (e: React.PointerEvent) => {
    if (busy || matched || flyingOff) return;
    e.preventDefault();
    setShowHint(false);
    startX.current = e.clientX;
    startY.current = e.clientY;
    isDragging.current = true;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setDragX(e.clientX - (startX.current ?? e.clientX));
    setDragY(e.clientY - (startY.current ?? e.clientY));
  };
  const onUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dx = dragX;
    if (Math.abs(dx) > 90) {
      if (forced && dx < 0) { setDragX(0); setDragY(0); return; }
      doSwipe(dx > 0 ? 1 : -1);
    } else {
      setDragX(0);
      setDragY(0);
    }
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

  const nc = COLORS.length;
  const rot = dragX * 0.06;
  const likeOpacity = Math.max(0, Math.min(dragX / 75, 1));
  const nopeOpacity = Math.max(0, Math.min(-dragX / 75, 1));
  const prog = flyingOff ? 1 : Math.min(Math.abs(dragX) / 120, 1);

  const s1 = 0.94 + prog * 0.06;
  const y1 = 16 - prog * 16;
  const s2 = 0.86 + prog * 0.08;
  const y2 = 30 - prog * 14;

  const card0Bg = COLORS[index % nc];
  const card1Bg = COLORS[(index + 1) % nc];
  const card2Bg = COLORS[(index + 2) % nc];

  const cardTransition = flyingOff
    ? "transform 0.42s ease-in, opacity 0.3s ease-in 0.06s"
    : justReset
    ? "none"
    : isDragging.current
    ? "none"
    : "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease";

  return (
    <div
      className="screen flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "#f2f2f7", padding: "20px" }}
    >
      <style>{`
        @keyframes hint-nudge {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          25%       { transform: translate(-16px, -3px) rotate(-4deg); }
          75%       { transform: translate(16px, 3px) rotate(4deg); }
        }
        .hint-nudge {
          animation: hint-nudge 0.9s ease-in-out 1.5s;
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <div style={{ color: "#8e8e93", fontSize: 14, fontWeight: 500 }}>Conversation Starters</div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          {Array.from({ length: PASS_LIMIT }).map((_, i) => (
            <span
              key={i}
              style={{
                fontSize: 16,
                color: i < heartsLeft ? "#f0909a" : "rgba(240,144,154,0.25)",
                lineHeight: 1,
              }}
            >
              ♥
            </span>
          ))}
        </div>
        {forced && (
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#ff3b30" }}>
            Say yes to keep going
          </p>
        )}
      </div>

      {/* Card stack */}
      <div style={{ position: "relative", width: 380, height: 520, maxWidth: "90vw", maxHeight: "60vh" }}>
        {/* Back card */}
        <div
          style={{
            position: "absolute", inset: 0,
            borderRadius: 22, overflow: "hidden",
            background: card2Bg,
            transform: `scale(${s2}) translateY(${y2}px)`,
            transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />
        {/* Middle card */}
        <div
          style={{
            position: "absolute", inset: 0,
            borderRadius: 22, overflow: "hidden",
            background: card1Bg,
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            transform: `scale(${s1}) translateY(${y1}px)`,
            transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
        {/* Front card */}
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={showHint ? "hint-nudge" : ""}
          style={{
            position: "absolute", inset: 0,
            borderRadius: 22, overflow: "hidden",
            background: card0Bg,
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            transform: `translate(${dragX}px, ${dragY}px) rotate(${rot}deg)`,
            transition: cardTransition,
            opacity: flyingOff ? 0 : 1,
            cursor: isDragging.current ? "grabbing" : "grab",
            userSelect: "none",
            touchAction: "none",
            zIndex: 3,
          }}
        >
          {/* NOPE stamp */}
          <div
            style={{
              position: "absolute", top: 28, left: 20,
              border: "3px solid #ff3b30", borderRadius: 10,
              padding: "3px 10px",
              color: "#ff3b30", fontSize: 22, fontWeight: 900,
              letterSpacing: 2,
              transform: "rotate(-16deg)",
              opacity: nopeOpacity,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            NOPE
          </div>
          {/* LOVE stamp */}
          <div
            style={{
              position: "absolute", top: 28, right: 20,
              border: "3px solid #f07078", borderRadius: 10,
              padding: "3px 10px",
              color: "#f07078", fontSize: 22, fontWeight: 900,
              letterSpacing: 2,
              transform: "rotate(16deg)",
              opacity: likeOpacity,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            LOVE
          </div>

          {/* Card body */}
          <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "32px 28px 22px" }}>
            <p
              style={{
                margin: 0,
                color: "#1c1c1e",
                fontSize: 32,
                fontWeight: 800,
                lineHeight: 1.3,
                letterSpacing: "-0.3px",
              }}
            >
              {card.text}
            </p>
            <div style={{ flex: 1 }} />
            {/* Progress dashes */}
            <div style={{ display: "flex", gap: 3, width: "100%" }}>
              {Array.from({ length: BATCH_SIZE }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    background: i < posInBatch ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.1)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 16, marginTop: 28, alignItems: "center" }}>
        <button
          aria-label="pass"
          onClick={() => doSwipe(-1)}
          disabled={busy || forced}
          style={{
            width: 56, height: 56,
            borderRadius: "50%",
            background: "white",
            border: "none",
            boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
            color: "#8e8e93",
            fontSize: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.16s",
            opacity: forced ? 0.3 : 1,
          }}
        >
          ✕
        </button>
        <button
          aria-label="talk about this"
          onClick={() => doSwipe(1)}
          disabled={busy}
          style={{
            width: 68, height: 68,
            borderRadius: "50%",
            background: "#f07078",
            border: "none",
            boxShadow: "0 4px 18px rgba(240,112,120,0.38)",
            color: "white",
            fontSize: 26,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.16s",
          }}
        >
          ♥
        </button>
      </div>

      {/* iOS home bar */}
      <div
        style={{
          width: 120, height: 5,
          borderRadius: 3,
          background: "rgba(0,0,0,0.14)",
          marginTop: 20,
        }}
      />
    </div>
  );
}
