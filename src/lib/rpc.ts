"use client";

import { getSupabase, ensureAuth } from "./supabase/client";
import { getClientId } from "./identity";
import type { Constraints, PairingMode, Phase, RevealMode, WriteTarget } from "./types";

async function call<T = unknown>(fn: string, params: Record<string, unknown>): Promise<T> {
  await ensureAuth();
  const { data, error } = await getSupabase().rpc(fn, params);
  if (error) throw new Error(error.message);
  return data as T;
}

export type CreatedRoom = { room_id: string; code: string; admin_secret: string };
export function createRoom() {
  return call<CreatedRoom>("create_room", {});
}

export type JoinResult = {
  participant_id: string;
  room_id: string;
  code: string;
  phase: Phase;
  current_round_id: string | null;
};
export function joinRoom(code: string, clientId: string, displayName: string) {
  return call<JoinResult>("join_room", {
    p_code: code,
    p_client_id: clientId,
    p_display_name: displayName,
  });
}

export function setRound(args: {
  roomId: string;
  adminSecret: string;
  ordinal: number;
  prompt: string;
  durationSecs: number;
  pairingMode: PairingMode;
  writeTarget: WriteTarget;
  constraints: Constraints;
  revealMode: RevealMode;
}) {
  return call<{ round_id: string }>("set_round", {
    p_room_id: args.roomId,
    p_admin_secret: args.adminSecret,
    p_ordinal: args.ordinal,
    p_prompt: args.prompt,
    p_duration_secs: args.durationSecs,
    p_pairing_mode: args.pairingMode,
    p_write_target: args.writeTarget,
    p_constraints: args.constraints,
    p_reveal_mode: args.revealMode,
  });
}

export function startRound(roomId: string, adminSecret: string, roundId: string) {
  return call("start_round", {
    p_room_id: roomId,
    p_admin_secret: adminSecret,
    p_round_id: roundId,
  });
}

export function setPhase(
  roomId: string,
  adminSecret: string,
  phase: Phase,
  durationSecs?: number,
) {
  return call<{ phase: Phase; phase_ends_at: string | null }>("set_phase", {
    p_room_id: roomId,
    p_admin_secret: adminSecret,
    p_phase: phase,
    p_duration_secs: durationSecs ?? null,
  });
}

export function endRoom(roomId: string, adminSecret: string) {
  return call("end_room", { p_room_id: roomId, p_admin_secret: adminSecret });
}

export function saveWriting(roundId: string, content: string, isFinal = false) {
  return call("save_writing", {
    p_round_id: roundId,
    p_client_id: getClientId(),
    p_content: content,
    p_is_final: isFinal,
  });
}

export function markOut(roundId: string) {
  return call("mark_out", { p_round_id: roundId, p_client_id: getClientId() });
}

export type AdminSubmission = {
  author_name: string;
  subject_name: string | null;
  content: string;
  is_final: boolean;
  lost: boolean;
};
export function adminGetSubmissions(roomId: string, adminSecret: string, roundId: string) {
  return call<AdminSubmission[]>("admin_get_submissions", {
    p_room_id: roomId,
    p_admin_secret: adminSecret,
    p_round_id: roundId,
  });
}
