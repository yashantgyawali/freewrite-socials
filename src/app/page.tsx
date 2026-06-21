"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setDisplayName } from "@/lib/identity";

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [name, setName] = useState("");

  const canJoin = code.trim().length >= 4 && name.trim().length > 0;

  const join = () => {
    if (!canJoin) return;
    setDisplayName(name.trim());
    router.push(`/room/${code.trim().toUpperCase()}`);
  };

  return (
    <div className="screen flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="freewrite"
            className="mb-3 h-16 w-16 rounded-2xl ring-1 ring-zinc-100"
          />
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
            freewrite<span className="text-zinc-300">.socials</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Connect with someone, and just write.</p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="Room code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-center tracking-[0.3em] uppercase outline-none focus:border-zinc-400"
          />
          <input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-center outline-none focus:border-zinc-400"
          />
          <button
            onClick={join}
            disabled={!canJoin}
            className="w-full rounded-xl bg-zinc-900 py-3 font-medium text-white disabled:opacity-30"
          >
            Join
          </button>
        </div>

        <Link href="/admin/new" className="text-center text-xs text-zinc-300 hover:text-zinc-500">
          Host a session
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
