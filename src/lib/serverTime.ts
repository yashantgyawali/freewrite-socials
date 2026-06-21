"use client";

import { getSupabase } from "./supabase/client";

// Timers are server-authoritative: phases carry a `phase_ends_at` timestamp.
// We measure the client<->server clock offset once so every device counts down
// to the same instant regardless of local clock skew.
let offsetMs = 0;
let synced = false;

export async function syncServerTime(): Promise<void> {
  const sb = getSupabase();
  const t0 = Date.now();
  const { data, error } = await sb.rpc("server_now");
  const t1 = Date.now();
  if (error || !data) return;
  const server = new Date(data as unknown as string).getTime();
  const rtt = t1 - t0;
  offsetMs = server - (t0 + rtt / 2);
  synced = true;
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function isSynced(): boolean {
  return synced;
}

// Seconds remaining until an ISO deadline, floored at 0.
export function secondsUntil(endsAtIso: string | null): number {
  if (!endsAtIso) return 0;
  const ms = new Date(endsAtIso).getTime() - serverNow();
  return Math.max(0, Math.ceil(ms / 1000));
}
