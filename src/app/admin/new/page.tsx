"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/rpc";
import { saveAdminSecret } from "@/lib/identity";

export default function NewRoomPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom();
      saveAdminSecret(room.code, room.room_id, room.admin_secret);
      router.push(`/admin/${room.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create room");
      setBusy(false);
    }
  };

  return (
    <div className="screen flex flex-col items-center justify-center gap-6 px-8 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Host a freewrite</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Creates a room with a code your group can join.
        </p>
      </div>
      <button
        onClick={create}
        disabled={busy}
        className="rounded-xl bg-zinc-900 px-6 py-3 font-medium text-white disabled:opacity-40"
      >
        {busy ? "Creating…" : "Create room"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <p className="max-w-xs text-xs text-zinc-300">
        Keep this device as the host — the control link is saved only in this browser.
      </p>
    </div>
  );
}
