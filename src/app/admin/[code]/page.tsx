"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { getAdminSecret } from "@/lib/identity";
import { ensureAuth } from "@/lib/supabase/client";
import { setRound, startRound, setPhase, endRoom } from "@/lib/rpc";
import { syncServerTime, secondsUntil } from "@/lib/serverTime";
import {
  useRoomState,
  useRoster,
  useRound,
  useMatchedCount,
  usePresentRequests,
  useSubmissionById,
} from "@/lib/realtime";
import { PRESETS, type Preset } from "@/lib/presets";
import { buildDeckOrder } from "@/lib/prompts";
import { presentSubmission } from "@/lib/rpc";
import PhoneFrame from "@/components/admin/PhoneFrame";
import type { Constraints, Phase } from "@/lib/types";

type Config = {
  ordinal: number;
  prompt: string;
  durationSecs: number;
  talkSecs: number;
  pairingMode: "solo" | "pairs" | "tinder";
  writeTarget: "self" | "partner";
  noBackspace: boolean;
  fadeText: boolean;
  bombEnabled: boolean;
  bombSecs: number;
  loseText: boolean;
  revealMode: "private" | "send-to-partner" | "show-on-admin";
  deckLevels: number[];
};

function fromPreset(p: Preset, ordinal: number): Config {
  return {
    ordinal,
    prompt: p.prompt,
    durationSecs: p.durationSecs,
    talkSecs: 180,
    pairingMode: p.pairingMode,
    writeTarget: p.writeTarget,
    noBackspace: !!p.constraints.noBackspace,
    fadeText: !!p.constraints.fadeText,
    bombEnabled: !!p.constraints.pauseBomb?.enabled,
    bombSecs: p.constraints.pauseBomb?.timeoutSecs ?? 5,
    loseText: !!p.constraints.pauseBomb?.loseText,
    revealMode: p.revealMode,
    deckLevels: p.constraints.deckLevels ?? [1, 2, 3],
  };
}

function toConstraints(c: Config): Constraints {
  const out: Constraints = {};
  if (c.noBackspace) out.noBackspace = true;
  if (c.fadeText) out.fadeText = true;
  if (c.bombEnabled)
    out.pauseBomb = { enabled: true, timeoutSecs: c.bombSecs, loseText: c.loseText };
  if (c.pairingMode === "tinder") {
    out.deckLevels = [1, 2, 3];
    out.deckOrder = buildDeckOrder([1, 2, 3]);
  }
  return out;
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export default function AdminPage() {
  const code = (useParams().code as string)?.toUpperCase() ?? "";
  const admin = getAdminSecret(code);
  const room = useRoomState(code);
  const roster = useRoster(room?.id ?? null);
  const round = useRound(room?.current_round_id ?? null);
  const matchedCount = useMatchedCount(room?.current_round_id ?? null);
  const presentRequests = usePresentRequests(room?.current_round_id ?? null);
  const presenting = useSubmissionById(room?.presenting_submission_id ?? null);

  const [config, setConfig] = useState<Config | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qrFull, setQrFull] = useState(false);
  const [timerFull, setTimerFull] = useState(false);
  const [presentFull, setPresentFull] = useState(false);
  const [vmin, setVmin] = useState(600);

  useEffect(() => {
    ensureAuth().then(() => syncServerTime());
    const base = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin;
    setJoinUrl(`${base.replace(/\/$/, "")}/?code=${code}`);
  }, [code]);

  useEffect(() => {
    const onResize = () => setVmin(Math.min(window.innerWidth, window.innerHeight));
    onResize();
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setQrFull(false);
        setTimerFull(false);
        setPresentFull(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!room?.phase_ends_at) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const r = secondsUntil(room.phase_ends_at);
      setRemaining(r);
      if (r <= 0 && room.phase === "writing" && admin) {
        setPhase(room.id, admin.secret, "submitted").catch(() => {});
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [room?.phase_ends_at, room?.phase, room?.id, admin]);

  const loadPreset = useCallback(
    async (p: Preset, idx: number) => {
      if (!admin || !room) return;
      const c = fromPreset(p, idx + 1);
      setConfig(c);
      const res = await setRound({
        roomId: room.id,
        adminSecret: admin.secret,
        ordinal: c.ordinal,
        prompt: c.prompt,
        durationSecs: c.durationSecs,
        pairingMode: c.pairingMode,
        writeTarget: c.writeTarget,
        constraints: toConstraints(c),
        revealMode: c.revealMode,
      });
      setRoundId(res.round_id);
    },
    [admin, room],
  );

  const autoLoaded = useRef(false);
  useEffect(() => {
    if (autoLoaded.current || !admin || !room || config) return;
    if (room.status === "lobby") {
      autoLoaded.current = true;
      loadPreset(PRESETS[0], 0);
    }
  }, [admin, room, config, loadPreset]);

  const saveConfig = useCallback(async () => {
    if (!admin || !room || !config) return;
    setBusy(true);
    try {
      const res = await setRound({
        roomId: room.id,
        adminSecret: admin.secret,
        ordinal: config.ordinal,
        prompt: config.prompt,
        durationSecs: config.durationSecs,
        pairingMode: config.pairingMode,
        writeTarget: config.writeTarget,
        constraints: toConstraints(config),
        revealMode: config.revealMode,
      });
      setRoundId(res.round_id);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setBusy(false);
    }
  }, [admin, room, config]);

  const phase = useCallback(
    async (p: Phase, duration?: number) => {
      if (!admin || !room) return;
      setBusy(true);
      try {
        await setPhase(room.id, admin.secret, p, duration);
      } finally {
        setBusy(false);
      }
    },
    [admin, room],
  );

  const begin = useCallback(async () => {
    if (!admin || !room || !roundId) return;
    setBusy(true);
    try {
      await startRound(room.id, admin.secret, roundId);
    } finally {
      setBusy(false);
    }
  }, [admin, room, roundId]);

  const beginNextRound = useCallback(async () => {
    if (!admin || !room || !config) return;
    const nextIdx = config.ordinal; // ordinal is 1-based, so this is the 0-based next index
    if (nextIdx >= PRESETS.length) return;
    setBusy(true);
    try {
      const p = PRESETS[nextIdx];
      const c = fromPreset(p, nextIdx + 1);
      setConfig(c);
      const res = await setRound({
        roomId: room.id,
        adminSecret: admin.secret,
        ordinal: c.ordinal,
        prompt: c.prompt,
        durationSecs: c.durationSecs,
        pairingMode: c.pairingMode,
        writeTarget: c.writeTarget,
        constraints: toConstraints(c),
        revealMode: c.revealMode,
      });
      await startRound(room.id, admin.secret, res.round_id);
      setRoundId(res.round_id);
    } finally {
      setBusy(false);
    }
  }, [admin, room, config]);

  if (!admin) {
    return (
      <div className="screen flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-lg font-medium text-zinc-800">Not the host for {code}</p>
        <p className="text-sm text-zinc-400">
          The control link lives only in the browser that created the room.
        </p>
        <Link href="/admin/new" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white">
          Create a new room
        </Link>
      </div>
    );
  }

  const active = roster.filter((p) => p.status !== "left");
  const nameById = new Map(roster.map((p) => [p.id, p.display_name]));
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");
  const currentPreset = config ? PRESETS[config.ordinal - 1] : null;
  const hasNextRound = config ? config.ordinal < PRESETS.length : false;

  // ── Lobby view ──────────────────────────────────────────────────────────────
  if (!room || room.phase === "lobby") {
    return (
      <div className="min-h-dvh bg-white flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm flex flex-col gap-8">
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-zinc-400 mb-2">Room</p>
            <p className="font-mono text-7xl font-bold tracking-[0.15em] text-zinc-900">{code}</p>
            {joinUrl && (
              <div className="mt-5 flex flex-col items-center gap-2">
                <button
                  onClick={() => setQrFull(true)}
                  className="rounded-2xl border border-zinc-100 p-4 transition hover:border-zinc-300"
                  title="Tap to show fullscreen"
                >
                  <QRCodeSVG value={joinUrl} size={180} level="M" />
                </button>
                <p className="text-xs text-zinc-400">Scan to join · tap to enlarge</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-zinc-400 mb-2">{active.length} joined</p>
            <div className="flex flex-wrap gap-2">
              {active.length === 0 ? (
                <p className="text-sm text-zinc-300">Waiting for people to join…</p>
              ) : (
                active.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
                  >
                    {p.display_name}
                  </span>
                ))
              )}
            </div>
          </div>

          <button
            onClick={begin}
            disabled={busy || !roundId}
            className="w-full rounded-2xl bg-zinc-900 py-4 text-base font-medium text-white disabled:opacity-30"
          >
            {busy ? "Starting…" : "Let's Begin →"}
          </button>
        </div>

        {qrFull && joinUrl && (
          <div
            onClick={() => setQrFull(false)}
            className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-8 bg-white p-6"
          >
            <p className="font-mono text-5xl font-bold tracking-[0.2em] text-zinc-900 sm:text-7xl">
              {code}
            </p>
            <QRCodeSVG value={joinUrl} size={Math.floor(vmin * 0.7)} level="M" />
            <p className="text-lg text-zinc-500">{joinUrl.replace(/^https?:\/\//, "")}</p>
            <p className="text-sm text-zinc-300">Tap anywhere or press Esc to close</p>
          </div>
        )}
      </div>
    );
  }

  // ── Session view ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-mono text-sm text-zinc-300">{code}</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">{active.length} in room</span>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            title="Settings"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <p className="text-xs uppercase tracking-widest text-zinc-300 mb-1">Round</p>
        <h1 className="text-[9rem] font-bold leading-none text-zinc-900 tabular-nums">
          {round?.ordinal ?? config?.ordinal ?? 1}
        </h1>
        <p className="text-2xl text-zinc-400 mt-1">
          {currentPreset?.funName ?? currentPreset?.name}
        </p>

        {/* Constraint badges */}
        {(config?.noBackspace || config?.fadeText || config?.bombEnabled) && (
          <div className="flex gap-2 mt-3">
            {config.noBackspace && (
              <span className="rounded-full bg-amber-50 px-3 py-0.5 text-xs text-amber-600">
                no backspace
              </span>
            )}
            {config.fadeText && (
              <span className="rounded-full bg-blue-50 px-3 py-0.5 text-xs text-blue-600">
                fade text
              </span>
            )}
            {config.bombEnabled && (
              <span className="rounded-full bg-red-50 px-3 py-0.5 text-xs text-red-500">
                pause bomb
              </span>
            )}
          </div>
        )}

        {/* Phase info */}
        <div className="mt-6 flex flex-col items-center gap-3">
          {room.phase === "pairing" && (
            <p className="text-zinc-500">
              <span className="text-4xl font-bold text-zinc-900">{matchedCount}</span>
              <span className="text-sm"> of {active.length} matched</span>
            </p>
          )}
          {(room.phase === "writing" || room.phase === "talk") && room.phase_ends_at && (
            <div className="flex items-center gap-3">
              <p
                className="font-mono text-6xl font-bold tabular-nums"
                style={{ color: remaining <= 10 ? "#f87171" : "#18181b" }}
              >
                {mm}:{ss}
              </p>
              <button
                onClick={() => setTimerFull(true)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-300"
              >
                ⛶
              </button>
            </div>
          )}
        </div>

        {/* CTA buttons */}
        <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
          {room.phase === "pairing" && (
            <>
              <button
                onClick={() => phase("writing", config?.durationSecs ?? round?.duration_secs)}
                disabled={busy}
                className="w-full rounded-2xl bg-zinc-900 py-4 text-sm font-medium text-white disabled:opacity-40"
              >
                Start writing →
              </button>
              <button
                onClick={() => phase("talk", config?.talkSecs ?? 120)}
                disabled={busy}
                className="w-full rounded-2xl bg-zinc-100 py-3.5 text-sm font-medium text-zinc-700 disabled:opacity-40"
              >
                Begin talk first
              </button>
            </>
          )}
          {room.phase === "talk" && (
            <button
              onClick={() => phase("writing", config?.durationSecs ?? round?.duration_secs)}
              disabled={busy}
              className="w-full rounded-2xl bg-zinc-900 py-4 text-sm font-medium text-white disabled:opacity-40"
            >
              Start writing →
            </button>
          )}
          {room.phase === "writing" && (
            <button
              onClick={() => phase("submitted")}
              disabled={busy}
              className="w-full rounded-2xl bg-zinc-100 py-4 text-sm font-medium text-zinc-700 disabled:opacity-40"
            >
              Pens down
            </button>
          )}
          {room.phase === "submitted" && (
            <button
              onClick={() => phase("reveal")}
              disabled={busy}
              className="w-full rounded-2xl bg-zinc-900 py-4 text-sm font-medium text-white disabled:opacity-40"
            >
              Reveal
            </button>
          )}
          {room.phase === "reveal" &&
            (hasNextRound ? (
              <button
                onClick={beginNextRound}
                disabled={busy}
                className="w-full rounded-2xl bg-zinc-900 py-4 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? "Starting…" : "Next round →"}
              </button>
            ) : (
              <button
                onClick={() => endRoom(room.id, admin.secret)}
                className="w-full rounded-2xl bg-zinc-100 py-4 text-sm font-medium text-zinc-600"
              >
                Wrap up session
              </button>
            ))}
        </div>

        {/* Presentation requests */}
        {presentRequests.length > 0 && (
          <div className="mt-8 rounded-2xl bg-zinc-50 p-4 w-full max-w-xs">
            <p className="text-xs text-zinc-400 mb-2">Wants to share:</p>
            <div className="flex flex-wrap gap-2">
              {presentRequests.map((r) => (
                <button
                  key={r.id}
                  onClick={() => presentSubmission(room.id, admin.secret, r.id)}
                  className={`rounded-full px-3 py-1 text-sm ${
                    presenting?.id === r.id
                      ? "bg-zinc-900 text-white"
                      : "bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {nameById.get(r.author_id) ?? "Someone"}
                </button>
              ))}
              {presenting && (
                <button
                  onClick={() => presentSubmission(room.id, admin.secret, null)}
                  className="rounded-full px-3 py-1 text-xs text-zinc-400"
                >
                  Stop
                </button>
              )}
            </div>
            {presenting && (
              <button
                onClick={() => setPresentFull(true)}
                className="mt-2 text-xs text-zinc-400 hover:text-zinc-600"
              >
                ⛶ Project fullscreen
              </button>
            )}
          </div>
        )}
      </main>

      {/* Settings panel */}
      {settingsOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-80 overflow-y-auto bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
              <h2 className="font-medium text-zinc-800">Settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-6 p-6 flex-1">
              {/* QR + room code */}
              {joinUrl && (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={() => setQrFull(true)}
                    className="rounded-xl border border-zinc-100 p-3 transition hover:border-zinc-300"
                    title="Tap to show fullscreen"
                  >
                    <QRCodeSVG value={joinUrl} size={150} level="M" />
                  </button>
                  <p className="font-mono text-3xl font-bold text-zinc-900">{code}</p>
                  <p className="text-xs text-zinc-400">{joinUrl.replace(/^https?:\/\//, "")}</p>
                </div>
              )}

              {/* Config editor */}
              {config && (
                <div className="flex flex-col gap-3 border-t border-zinc-100 pt-5">
                  <h3 className="text-sm font-medium text-zinc-600">Round config</h3>
                  <textarea
                    value={config.prompt}
                    onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                    rows={3}
                    placeholder="Prompt (optional)"
                    className="w-full rounded-lg border border-zinc-200 p-2 text-sm outline-none focus:border-zinc-400"
                  />
                  <div className="flex gap-4 text-sm text-zinc-600">
                    <label className="flex items-center gap-1">
                      Talk
                      <input
                        type="number"
                        value={config.talkSecs}
                        onChange={(e) =>
                          setConfig({ ...config, talkSecs: Number(e.target.value) })
                        }
                        className="w-16 rounded border border-zinc-200 px-1 py-0.5"
                      />
                      s
                    </label>
                    <label className="flex items-center gap-1">
                      Write
                      <input
                        type="number"
                        value={config.durationSecs}
                        onChange={(e) =>
                          setConfig({ ...config, durationSecs: Number(e.target.value) })
                        }
                        className="w-16 rounded border border-zinc-200 px-1 py-0.5"
                      />
                      s
                    </label>
                  </div>
                  <button
                    onClick={saveConfig}
                    disabled={busy}
                    className="self-start rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-40"
                  >
                    {busy ? "Saving…" : savedFlash ? "Saved!" : "Save changes"}
                  </button>
                </div>
              )}

              {/* Participants */}
              <div className="border-t border-zinc-100 pt-5">
                <h3 className="text-sm font-medium text-zinc-600 mb-2">
                  In the room ({active.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {active.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
                    >
                      {p.display_name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* End session */}
            {room.status !== "ended" && (
              <div className="px-6 py-5 border-t border-zinc-100">
                <button
                  onClick={() => endRoom(room.id, admin.secret)}
                  className="text-sm text-red-400 hover:text-red-600"
                >
                  End session
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Fullscreen QR */}
      {qrFull && joinUrl && (
        <div
          onClick={() => setQrFull(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-8 bg-white p-6"
        >
          <p className="font-mono text-5xl font-bold tracking-[0.2em] text-zinc-900 sm:text-7xl">
            {code}
          </p>
          <QRCodeSVG value={joinUrl} size={Math.floor(vmin * 0.7)} level="M" />
          <p className="text-lg text-zinc-500">{joinUrl.replace(/^https?:\/\//, "")}</p>
          <p className="text-sm text-zinc-300">Tap anywhere or press Esc to close</p>
        </div>
      )}

      {/* Fullscreen countdown */}
      {timerFull && (
        <div
          onClick={() => setTimerFull(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-10 bg-zinc-950"
        >
          <p className="text-2xl uppercase tracking-[0.3em] text-zinc-500">
            {room.phase === "talk" ? "Talk" : "Write"}
          </p>
          <p
            className="font-mono font-bold tabular-nums"
            style={{
              fontSize: `${Math.floor(vmin * 0.3)}px`,
              lineHeight: 1,
              color: remaining <= 10 ? "#f87171" : "#ffffff",
            }}
          >
            {mm}:{ss}
          </p>
          <p className="text-sm text-zinc-600">Tap or Esc to exit</p>
        </div>
      )}

      {/* Fullscreen presentation */}
      {presentFull && presenting && (
        <div
          onClick={() => setPresentFull(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-5 bg-zinc-100 p-6"
        >
          <p className="text-xl text-zinc-500">
            <span className="font-semibold text-zinc-800">
              {nameById.get(presenting.author_id) ?? "Someone"}
            </span>{" "}
            is sharing
          </p>
          <PhoneFrame className="h-[78vh]">
            <div className="h-full overflow-y-auto p-7">
              <p className="whitespace-pre-wrap text-lg leading-relaxed text-zinc-900">
                {presenting.content || "(empty)"}
              </p>
            </div>
          </PhoneFrame>
          <p className="text-sm text-zinc-400">Tap or Esc to exit</p>
        </div>
      )}
    </div>
  );
}
