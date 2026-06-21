"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Round } from "@/lib/types";
import { saveWriting, markOut } from "@/lib/rpc";
import { secondsUntil } from "@/lib/serverTime";

// The buffer (real text), not the DOM, is always what gets submitted. Each mode
// only changes how the buffer is captured/rendered.
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
  const [out, setOut] = useState(false);
  const [done, setDone] = useState(false);
  const [remaining, setRemaining] = useState(() => secondsUntil(deadline));

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalize = useCallback(async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    try {
      await saveWriting(round.id, bufferRef.current, true);
    } catch {
      /* best effort */
    }
    setDone(true);
    onFinalized();
  }, [round.id, onFinalized]);

  const triggerOut = useCallback(async () => {
    if (out || finalizedRef.current) return;
    setOut(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    try {
      await markOut(round.id);
    } catch {
      /* best effort */
    }
    // If text is lost, nothing more to submit; otherwise keep what they had.
    if (!bomb?.loseText) await finalize();
    else {
      finalizedRef.current = true;
      onFinalized();
    }
  }, [out, round.id, bomb?.loseText, finalize, onFinalized]);

  const resetIdle = useCallback(() => {
    if (!bomb?.enabled || out || finalizedRef.current) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(triggerOut, (bomb.timeoutSecs || 5) * 1000);
  }, [bomb?.enabled, bomb?.timeoutSecs, out, triggerOut]);

  // Called by the field whenever the buffer changes.
  const onBuffer = useCallback(
    (value: string) => {
      bufferRef.current = value;
      dirtyRef.current = true;
      resetIdle();
    },
    [resetIdle],
  );

  // Countdown + auto-finalize at the server-authoritative deadline.
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

  // Debounced autosave of the draft.
  useEffect(() => {
    const id = setInterval(() => {
      if (dirtyRef.current && !finalizedRef.current) {
        dirtyRef.current = false;
        saveWriting(round.id, bufferRef.current, false).catch(() => {});
      }
    }, 4000);
    return () => clearInterval(id);
  }, [round.id]);

  if (out) {
    return (
      <div className="screen flex flex-col items-center justify-center gap-4 bg-red-600 text-white">
        <div className="text-7xl">💣</div>
        <p className="text-xl font-semibold">You paused too long.</p>
        <p className="text-red-100">
          {bomb?.loseText ? "Your words went up in smoke." : "You're out for this round."}
        </p>
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
    <div className="screen flex flex-col">
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

// ---- plain & no-backspace (real textarea) ---------------------------------

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

  useEffect(() => {
    ref.current?.focus();
  }, []);

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
          // forward-only: reject anything that isn't an append
          if (next.length < value.length || !next.startsWith(value)) {
            next = value;
          }
        }
        setValue(next);
        onBuffer(next);
      }}
      onKeyDown={(e) => {
        if (noBackspace && (e.key === "Backspace" || e.key === "Delete")) {
          e.preventDefault();
        }
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

// ---- disappearing text -----------------------------------------------------

function FadeField({
  disabled,
  onBuffer,
}: {
  disabled: boolean;
  onBuffer: (v: string) => void;
}) {
  const bufferRef = useRef("");
  const idRef = useRef(0);
  const composing = useRef(false);
  const [raw, setRaw] = useState("");
  const [chars, setChars] = useState<{ id: number; ch: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = useCallback(
    (text: string) => {
      if (!text) return;
      bufferRef.current += text;
      onBuffer(bufferRef.current);
      const fresh = [...text].map((ch) => ({ id: idRef.current++, ch }));
      setChars((prev) => [...prev, ...fresh].slice(-60));
      fresh.forEach((c) =>
        setTimeout(
          () => setChars((prev) => prev.filter((x) => x.id !== c.id)),
          2600,
        ),
      );
    },
    [onBuffer],
  );

  return (
    <div
      className="relative flex-1 overflow-hidden"
      onClick={() => inputRef.current?.focus()}
    >
      {/* fading characters */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
        <p className="text-center text-2xl leading-relaxed text-zinc-800 break-words">
          {chars.map((c) => (
            <span key={c.id} className="fade-char">
              {c.ch === " " ? " " : c.ch}
            </span>
          ))}
          <span className="blink text-zinc-400">▌</span>
        </p>
      </div>

      {/* transparent capture input keeps the mobile keyboard + IME alive */}
      <input
        ref={inputRef}
        value={raw}
        disabled={disabled}
        autoCorrect="off"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        aria-label="writing"
        className="absolute inset-0 h-full w-full bg-transparent text-center outline-none"
        style={{ color: "transparent", caretColor: "transparent" }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          commit(e.currentTarget.value);
          setRaw("");
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (composing.current) {
            setRaw(v);
            return;
          }
          commit(v);
          setRaw("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace" || e.key === "Delete") e.preventDefault();
        }}
        onBeforeInput={(e) => {
          const t = (e.nativeEvent as InputEvent).inputType ?? "";
          if (t.startsWith("delete")) e.preventDefault();
        }}
        onPaste={(e) => e.preventDefault()}
      />

      <style jsx>{`
        .fade-char {
          animation: fade 2.6s forwards;
        }
        @keyframes fade {
          0% {
            opacity: 1;
          }
          70% {
            opacity: 0.9;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
