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
    talkSecs: 120,
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
    out.deckLevels = c.deckLevels;
    // fixed, shared order so everyone sees the same batches of 12
    out.deckOrder = buildDeckOrder(c.deckLevels);
  }
  return out;
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
  const [qrFull, setQrFull] = useState(false);
  const [timerFull, setTimerFull] = useState(false);
  const [presentFull, setPresentFull] = useState(false);
  const [vmin, setVmin] = useState(600);

  useEffect(() => {
    ensureAuth().then(() => syncServerTime());
    // Prefer the public deployed URL so the QR is scannable even when the admin
    // console is opened locally; fall back to wherever this page is served.
    const base = process.env.NEXT_PUBLIC_BASE_URL || window.location.origin;
    setJoinUrl(`${base.replace(/\/$/, "")}/?code=${code}`);
  }, [code]);

  // Track viewport min-dimension (for a big fullscreen QR) + Esc to close it.
  useEffect(() => {
    const onResize = () => setVmin(Math.min(window.innerWidth, window.innerHeight));
    onResize();
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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

  // Live countdown for the writing phase + auto-advance to "submitted".
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

  // One-flow app: auto-load the single preset so "Start round" is ready.
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
  const outCount = roster.filter((p) => p.status === "out").length;
  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="min-h-dvh w-full bg-zinc-50 text-zinc-900">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-6 lg:grid-cols-2">
        {/* Projected panel: code + roster */}
        <section className="flex flex-col gap-6">
          <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm uppercase tracking-widest text-zinc-400">Join at</p>
            <p className="mt-1 text-lg text-zinc-500">{joinUrl.replace(/^https?:\/\//, "")}</p>
            <p className="mt-4 font-mono text-7xl font-bold tracking-[0.2em] text-zinc-900">
              {code}
            </p>
            {joinUrl && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  onClick={() => setQrFull(true)}
                  className="rounded-2xl border border-zinc-100 p-4 transition hover:border-zinc-300"
                  title="Tap to show fullscreen"
                >
                  <QRCodeSVG value={joinUrl} size={200} level="M" />
                </button>
                <p className="text-xs text-zinc-400">Scan to join · tap to enlarge</p>
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium text-zinc-700">In the room</h2>
              <span className="text-sm text-zinc-400">
                {active.length} joined{outCount ? ` · ${outCount} out` : ""}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {active.length === 0 && (
                <p className="text-sm text-zinc-300">Waiting for people to join…</p>
              )}
              {active.map((p) => (
                <span
                  key={p.id}
                  className={`rounded-full px-3 py-1 text-sm ${
                    p.status === "out"
                      ? "bg-red-50 text-red-400 line-through"
                      : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {p.display_name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Control panel */}
        <section className="flex flex-col gap-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-zinc-700">Now</h2>
              <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                {room?.phase ?? "…"}
              </span>
            </div>
            {round && (
              <p className="mt-2 text-sm text-zinc-500">
                Round {round.ordinal} · {round.pairing_mode} · writes about {round.write_target}
              </p>
            )}
            {room?.phase === "pairing" && round?.pairing_mode === "tinder" && (
              <p className="mt-2 text-2xl font-bold text-zinc-900">
                {matchedCount}{" "}
                <span className="text-sm font-normal text-zinc-400">
                  of {active.length} matched
                </span>
              </p>
            )}
            {(room?.phase === "writing" || room?.phase === "talk") && room.phase_ends_at && (
              <div className="mt-2 flex items-center gap-3">
                <p className="font-mono text-4xl font-bold tabular-nums text-zinc-900">
                  {mm}:{ss}
                </p>
                <button
                  onClick={() => setTimerFull(true)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-300"
                >
                  ⛶ Fullscreen
                </button>
              </div>
            )}

            {/* Contextual controls */}
            <div className="mt-4 flex flex-wrap gap-2">
              {(room?.phase === "lobby" || room?.phase === "reveal" || room?.phase === "submitted") && (
                <button
                  onClick={begin}
                  disabled={busy || !roundId}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-30"
                >
                  Start round →
                </button>
              )}
              {room?.phase === "pairing" && (
                <>
                  <button
                    onClick={() => phase("talk", config?.talkSecs ?? 120)}
                    disabled={busy}
                    className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800"
                  >
                    Begin talk
                  </button>
                  <button
                    onClick={() => phase("writing", config?.durationSecs ?? round?.duration_secs)}
                    disabled={busy}
                    className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Start writing
                  </button>
                </>
              )}
              {room?.phase === "talk" && (
                <button
                  onClick={() => phase("writing", config?.durationSecs ?? round?.duration_secs)}
                  disabled={busy}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Start writing
                </button>
              )}
              {room?.phase === "writing" && (
                <button
                  onClick={() => phase("submitted")}
                  disabled={busy}
                  className="rounded-xl bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800"
                >
                  Pens down
                </button>
              )}
              {room?.phase === "submitted" && (
                <button
                  onClick={() => phase("reveal")}
                  disabled={busy}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Reveal
                </button>
              )}
              {room && room.status !== "ended" && (
                <button
                  onClick={() => admin && room && endRoom(room.id, admin.secret)}
                  className="ml-auto rounded-xl px-4 py-2 text-sm text-red-400 hover:text-red-600"
                >
                  End session
                </button>
              )}
            </div>
          </div>

          {/* Presentations — participants who asked to share their piece */}
          {(presentRequests.length > 0 || presenting) && (
            <div className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-zinc-700">Presentations</h2>
                {presenting && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPresentFull(true)}
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      ⛶ Project
                    </button>
                    <button
                      onClick={() => admin && room && presentSubmission(room.id, admin.secret, null)}
                      className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      Stop
                    </button>
                  </div>
                )}
              </div>
              {presenting && (
                <div className="mt-3 rounded-2xl bg-zinc-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">
                    Now showing · {nameById.get(presenting.author_id) ?? "—"}
                  </p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-zinc-700">
                    {presenting.content}
                  </p>
                </div>
              )}
              {presentRequests.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-zinc-400">Wants to share — tap to project:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {presentRequests.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => admin && room && presentSubmission(room.id, admin.secret, r.id)}
                        className={`rounded-full px-3 py-1 text-sm ${
                          presenting?.id === r.id
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                        }`}
                      >
                        {nameById.get(r.author_id) ?? "Someone"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Round picker + editor */}
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="font-medium text-zinc-700">Set up the next round</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={p.name}
                  onClick={() => loadPreset(p, i)}
                  className={`rounded-xl border p-3 text-left ${
                    config?.ordinal === i + 1
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <p className="text-sm font-medium text-zinc-800">
                    {i + 1}. {p.name}
                  </p>
                  <p className="text-xs text-zinc-400">{p.blurb}</p>
                </button>
              ))}
            </div>

            {config && (
              <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4">
                <textarea
                  value={config.prompt}
                  onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-200 p-2 text-sm outline-none focus:border-zinc-400"
                />
                <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
                  <label className="flex items-center gap-1">
                    Talk
                    <input
                      type="number"
                      value={config.talkSecs}
                      onChange={(e) => setConfig({ ...config, talkSecs: Number(e.target.value) })}
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
                  <select
                    value={config.pairingMode}
                    onChange={(e) =>
                      setConfig({ ...config, pairingMode: e.target.value as Config["pairingMode"] })
                    }
                    className="rounded border border-zinc-200 px-1 py-0.5"
                  >
                    <option value="solo">solo</option>
                    <option value="pairs">pairs</option>
                    <option value="tinder">tinder (swipe)</option>
                  </select>
                  <select
                    value={config.writeTarget}
                    onChange={(e) =>
                      setConfig({ ...config, writeTarget: e.target.value as Config["writeTarget"] })
                    }
                    className="rounded border border-zinc-200 px-1 py-0.5"
                  >
                    <option value="self">about self</option>
                    <option value="partner">about partner</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-zinc-600">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={config.noBackspace}
                      onChange={(e) => setConfig({ ...config, noBackspace: e.target.checked })}
                    />
                    no backspace
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={config.fadeText}
                      onChange={(e) => setConfig({ ...config, fadeText: e.target.checked })}
                    />
                    fade text
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={config.bombEnabled}
                      onChange={(e) => setConfig({ ...config, bombEnabled: e.target.checked })}
                    />
                    pause bomb
                  </label>
                  {config.bombEnabled && (
                    <>
                      <label className="flex items-center gap-1">
                        after
                        <input
                          type="number"
                          value={config.bombSecs}
                          onChange={(e) =>
                            setConfig({ ...config, bombSecs: Number(e.target.value) })
                          }
                          className="w-12 rounded border border-zinc-200 px-1 py-0.5"
                        />
                        s
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={config.loseText}
                          onChange={(e) => setConfig({ ...config, loseText: e.target.checked })}
                        />
                        lose text
                      </label>
                    </>
                  )}
                </div>
                {config.pairingMode === "tinder" && (
                  <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-600">
                    <span className="text-zinc-400">Deck levels:</span>
                    {[
                      { n: 1, label: "1 · Light" },
                      { n: 2, label: "2 · Real" },
                      { n: 3, label: "3 · Bold" },
                    ].map((lvl) => (
                      <label key={lvl.n} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={config.deckLevels.includes(lvl.n)}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              deckLevels: e.target.checked
                                ? [...config.deckLevels, lvl.n].sort()
                                : config.deckLevels.filter((x) => x !== lvl.n),
                            })
                          }
                        />
                        {lvl.label}
                      </label>
                    ))}
                  </div>
                )}
                <button
                  onClick={saveConfig}
                  className="self-start rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700"
                >
                  Save changes
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Fullscreen QR for projecting — the whole room scans at once. */}
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

      {/* Fullscreen countdown for the TV (talk / writing) */}
      {timerFull && (
        <div
          onClick={() => setTimerFull(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-10 bg-zinc-950"
        >
          <p className="text-2xl uppercase tracking-[0.3em] text-zinc-500">
            {room?.phase === "talk" ? "Talk" : "Write"}
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

      {/* Fullscreen presentation — a participant's piece in a phone wrapper */}
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
