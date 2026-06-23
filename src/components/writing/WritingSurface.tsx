"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Round } from "@/lib/types";
import { saveWriting, markOut } from "@/lib/rpc";
import { secondsUntil } from "@/lib/serverTime";

export default function WritingSurface({
  round,
  deadline,
  onFinalized,
  promptText,
}: {
  round: Round;
  deadline: string | null;
  onFinalized: () => void;
  promptText?: string;
}) {
  const prompt = promptText || round.prompt;
  const fade = !!round.constraints.fadeText;
  const noBackspace = fade || !!round.constraints.noBackspace;
  const bomb = round.constraints.pauseBomb;

  const bufferRef = useRef("");
  const dirtyRef = useRef(false);
  const finalizedRef = useRef(false);
  const idleStartRef = useRef<number | null>(null);
  const shakeTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [out, setOut] = useState(false);
  const [done, setDone] = useState(false);
  const [remaining, setRemaining] = useState(() => secondsUntil(deadline));
  const [shakeStyle, setShakeStyle] = useState<React.CSSProperties>({});
  const [bombTint, setBombTint] = useState(0);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalize = useCallback(async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    try {
      await saveWriting(round.id, bufferRef.current, true);
    } catch { /* best effort */ }
    setDone(true);
    onFinalized();
  }, [round.id, onFinalized]);

  const triggerOut = useCallback(async () => {
    if (out || finalizedRef.current) return;
    setOut(true);
    idleStartRef.current = null;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    try {
      await markOut(round.id);
    } catch { /* best effort */ }
    if (!bomb?.loseText) await finalize();
    else {
      finalizedRef.current = true;
      onFinalized();
    }
  }, [out, round.id, bomb?.loseText, finalize, onFinalized]);

  const resetIdle = useCallback(() => {
    if (!bomb?.enabled || out || finalizedRef.current) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleStartRef.current = Date.now();
    idleTimer.current = setTimeout(triggerOut, (bomb.timeoutSecs || 5) * 1000);
  }, [bomb?.enabled, bomb?.timeoutSecs, out, triggerOut]);

  const startOver = useCallback(() => {
    bufferRef.current = "";
    finalizedRef.current = false;
    dirtyRef.current = false;
    idleStartRef.current = null;
    setOut(false);
    setDone(false);
    setShakeStyle({});
    setBombTint(0);
    saveWriting(round.id, "", false).catch(() => {});
  }, [round.id]);

  const onBuffer = useCallback(
    (value: string) => {
      bufferRef.current = value;
      dirtyRef.current = true;
      resetIdle();
    },
    [resetIdle],
  );

  // Countdown + auto-finalize.
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const r = secondsUntil(deadline);
      setRemaining(r);
      if (r <= 0) finalize();
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline, finalize]);

  // Autosave draft.
  useEffect(() => {
    const id = setInterval(() => {
      if (dirtyRef.current && !finalizedRef.current) {
        dirtyRef.current = false;
        saveWriting(round.id, bufferRef.current, false).catch(() => {});
      }
    }, 4000);
    return () => clearInterval(id);
  }, [round.id]);

  // Shake + tint as the idle bomb timer counts down.
  useEffect(() => {
    if (!bomb?.enabled || !bomb.timeoutSecs || out) {
      setShakeStyle({});
      setBombTint(0);
      if (shakeTickRef.current) clearInterval(shakeTickRef.current);
      return;
    }

    shakeTickRef.current = setInterval(() => {
      if (!idleStartRef.current || finalizedRef.current) {
        setShakeStyle({});
        setBombTint(0);
        return;
      }
      const elapsed = (Date.now() - idleStartRef.current) / 1000;
      const progress = Math.min(1, elapsed / bomb.timeoutSecs!);

      // Start shaking after 40% of idle time, ramp to full intensity
      if (progress < 0.4) {
        setShakeStyle({});
        setBombTint(0);
        return;
      }

      const intensity = Math.pow((progress - 0.4) / 0.6, 1.8);
      const amp = intensity * 18;
      const x = (Math.random() - 0.5) * amp * 2;
      const y = (Math.random() - 0.5) * amp * 0.35;
      const r = (Math.random() - 0.5) * intensity * 2;

      setShakeStyle({
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)`,
      });
      setBombTint(intensity);
    }, 75);

    return () => {
      if (shakeTickRef.current) clearInterval(shakeTickRef.current);
    };
  }, [bomb?.enabled, bomb?.timeoutSecs, out]);

  if (out) {
    return (
      <div className="screen flex flex-col items-center justify-center gap-4 bg-red-600 text-white px-8 text-center">
        <div className="text-7xl">💣</div>
        <p className="text-xl font-semibold">You paused too long.</p>
        <p className="text-red-200">
          {bomb?.loseText ? "Your words went up in smoke." : "You're out for this round."}
        </p>
        {bomb?.loseText && (
          <button
            onClick={startOver}
            className="mt-2 rounded-2xl border border-white/40 bg-white/10 px-8 py-3 text-sm font-medium text-white active:bg-white/20"
          >
            Start over
          </button>
        )}
      </div>
    );
  }

  if (done) {
    return (
      <div className="screen flex flex-col items-center justify-center gap-3 text-center">
        <div className="text-5xl">✓</div>
        <p className="text-lg font-medium text-zinc-700">Submitted.</p>
        <p className="text-sm text-zinc-400">Sit tight for the next step.</p>
      </div>
    );
  }

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div
      className="screen flex flex-col"
      style={{
        ...shakeStyle,
        backgroundColor: bombTint > 0 ? `rgba(239,68,68,${(bombTint * 0.18).toFixed(3)})` : undefined,
        transition: bombTint > 0 ? undefined : "background-color 0.5s",
      }}
    >
      <header className="px-7 pt-3 pb-2 flex items-start justify-between gap-4">
        <p className="text-sm leading-snug text-zinc-500 max-w-[80%]">{prompt}</p>
        {deadline && (
          <span
            className={`shrink-0 tabular-nums text-sm font-medium ${
              remaining <= 10 ? "text-red-600" : "text-zinc-400"
            }`}
          >
            {mm}:{ss}
          </span>
        )}
      </header>

      {fade ? (
        <FadeField disabled={out} onBuffer={onBuffer} />
      ) : (
        <PlainField noBackspace={noBackspace} disabled={out} onBuffer={onBuffer} />
      )}

      <footer className="px-7 py-3">
        <button
          onClick={finalize}
          className="text-xs text-zinc-400 underline underline-offset-2"
        >
          I&apos;m done
        </button>
      </footer>
    </div>
  );
}

// ---- plain & no-backspace (real textarea) ------------------------------------

function PlainField({
  noBackspace,
  disabled,
  onBuffer,
}: {
  noBackspace: boolean;
  disabled: boolean;
  onBuffer: (v: string) => void;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      autoCorrect="off"
      autoCapitalize="sentences"
      spellCheck={false}
      placeholder="Start writing…"
      className="flex-1 w-full resize-none bg-transparent px-7 py-2 text-lg leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-300"
      style={noBackspace ? { userSelect: "none", WebkitUserSelect: "none" } : undefined}
      onChange={(e) => {
        let next = e.target.value;
        if (noBackspace) {
          if (next.length < value.length || !next.startsWith(value)) next = value;
        }
        setValue(next);
        onBuffer(next);
      }}
      onKeyDown={(e) => {
        if (noBackspace && (e.key === "Backspace" || e.key === "Delete")) e.preventDefault();
      }}
      onBeforeInput={(e) => {
        const t = (e.nativeEvent as InputEvent).inputType ?? "";
        if (noBackspace && t.startsWith("delete")) e.preventDefault();
      }}
      onSelect={(e) => {
        if (noBackspace) {
          const el = e.currentTarget;
          el.selectionStart = el.selectionEnd = el.value.length;
        }
      }}
      onCut={(e) => noBackspace && e.preventDefault()}
      onPaste={(e) => noBackspace && e.preventDefault()}
      onContextMenu={(e) => noBackspace && e.preventDefault()}
    />
  );
}

// ---- disappearing text -------------------------------------------------------
// Uses a real textarea (transparent text, natural cursor) with a synced overlay
// that renders each character with opacity tied to how long ago it was typed.

const FADE_MS = 2600;

function FadeField({
  disabled,
  onBuffer,
}: {
  disabled: boolean;
  onBuffer: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const timestamps = useRef<number[]>([]);
  const [value, setValue] = useState("");
  // Tick every 80ms so opacity updates smoothly while chars are fading.
  const [, tick] = useState(0);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 80);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Fading character overlay — same metrics as the textarea */}
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 px-7 py-2 text-lg leading-relaxed text-zinc-900 overflow-y-scroll"
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowX: "hidden",
          scrollbarWidth: "none",
        }}
      >
        {[...value].map((ch, i) => {
          const age = now - (timestamps.current[i] ?? now);
          const opacity = Math.max(0, 1 - age / FADE_MS);
          // Keep invisible chars in the DOM so layout stays identical to textarea.
          return (
            <span key={i} style={{ opacity }}>
              {ch}
            </span>
          );
        })}
      </div>

      {/* Real textarea: transparent text, natural cursor */}
      <textarea
        ref={ref}
        value={value}
        disabled={disabled}
        autoCorrect="off"
        autoCapitalize="sentences"
        spellCheck={false}
        placeholder="Start writing…"
        className="absolute inset-0 h-full w-full resize-none bg-transparent px-7 py-2 text-lg leading-relaxed outline-none placeholder:text-zinc-300"
        style={{
          color: "transparent",
          caretColor: "#18181b",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        onChange={(e) => {
          const next = e.target.value;
          if (!next.startsWith(value)) return; // reject any deletion
          const t = Date.now();
          for (let i = value.length; i < next.length; i++) timestamps.current.push(t);
          setValue(next);
          onBuffer(next);
        }}
        onScroll={(e) => {
          // Keep overlay in sync so fading chars appear at the right y-position.
          if (overlayRef.current) overlayRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" || e.key === "Delete") e.preventDefault();
        }}
        onBeforeInput={(e) => {
          const t = (e.nativeEvent as InputEvent).inputType ?? "";
          if (t.startsWith("delete")) e.preventDefault();
        }}
        onSelect={(e) => {
          // Keep cursor pinned to end.
          const el = e.currentTarget;
          el.selectionStart = el.selectionEnd = el.value.length;
        }}
        onCut={(e) => e.preventDefault()}
        onPaste={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
