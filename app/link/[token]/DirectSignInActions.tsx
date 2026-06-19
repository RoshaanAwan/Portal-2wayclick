"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, CheckCircle2, X } from "lucide-react";

type State = "idle" | "signing" | "done" | "error";

/**
 * One-tap sign-in on the scanning phone for a DIRECT_LINK ticket. Calls the
 * sign-in endpoint (which mints a session cookie on THIS device for the ticket's
 * bound user), then lands on the dashboard.
 */
export function DirectSignInActions({
  token,
  name,
}: {
  token: string;
  name: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  async function signIn() {
    setState("signing");
    setError("");
    try {
      const res = await fetch("/api/auth/qr/link/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not sign in");
      }
      setState("done");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-4 py-4 text-center">
        <CheckCircle2 className="h-7 w-7 text-success" />
        <p className="text-sm font-semibold text-ink">Signed in</p>
        <p className="text-xs text-ink-500">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <button
        onClick={signIn}
        disabled={state === "signing"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {state === "signing" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogIn className="h-4 w-4" />
        )}
        Sign in as {name}
      </button>
      <button
        onClick={() => router.push("/login")}
        disabled={state === "signing"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-500 transition hover:border-line-strong hover:text-ink disabled:opacity-60"
      >
        <X className="h-4 w-4" />
        Cancel
      </button>
      {error && <p className="text-center text-xs text-danger-ink">{error}</p>}
    </div>
  );
}
