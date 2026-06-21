"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
  return client;
}

// Identity is the per-device client_id (see lib/identity), not auth — the app
// uses the public anon role and RPCs take client_id explicitly. Kept as a hook
// so it's trivial to reintroduce anonymous auth later if stricter RLS is wanted.
export function ensureAuth(): Promise<void> {
  return Promise.resolve();
}
