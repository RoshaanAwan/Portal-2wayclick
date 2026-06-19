"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, ShieldCheck, LogIn, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ApproveActions } from "./ApproveActions";

interface Me {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

type State =
  | { phase: "checking" }
  | { phase: "authed"; user: Me }
  | { phase: "anon" };

/**
 * Client-side auth gate for the approval page.
 *
 * The server couldn't see a session on this navigation — which is expected when
 * a scanned QR opens into the installed PWA: the SameSite=lax session cookie
 * isn't sent on that externally-initiated top-level navigation. But a normal
 * same-origin client fetch DOES carry the cookie, so we re-check here. If the
 * user is in fact signed in, show Approve; only a truly signed-out user is sent
 * to log in. This removes the false "log in again" inside the PWA.
 */
export function ApprovalGate({
  token,
  alreadyApproved,
  device,
  ipAddress,
  loginHref,
}: {
  token: string;
  alreadyApproved: boolean;
  device: string;
  ipAddress: string | null;
  loginHref: string;
}) {
  const [state, setState] = useState<State>({ phase: "checking" });

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as { user: Me };
          setState({ phase: "authed", user: data.user });
        } else {
          setState({ phase: "anon" });
        }
      })
      .catch(() => active && setState({ phase: "anon" }));
    return () => {
      active = false;
    };
  }, []);

  if (state.phase === "checking") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-ink-300" />
        <p className="text-sm text-ink-500">Checking your session…</p>
      </div>
    );
  }

  if (state.phase === "anon") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-accent-soft text-accent-ink">
          <LogIn className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
            Sign in to approve
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Sign in to 2WayClick on this device to approve the sign-in you
            scanned.
          </p>
        </div>
        <Link
          href={loginHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </Link>
      </div>
    );
  }

  // Authenticated — show the approval UI (mirrors the server-rendered version).
  const u = state.user;
  return (
    <>
      <div className="mb-5 flex flex-col items-center text-center">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-accent-soft text-accent-ink">
          <Smartphone className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
          Approve sign-in?
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          A device is trying to sign in to 2WayClick as you.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
        <Avatar name={u.name} src={u.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{u.name}</p>
          <p className="truncate text-xs text-ink-400">{u.email}</p>
        </div>
      </div>

      <dl className="mb-5 space-y-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-400">Device</dt>
          <dd className="truncate font-medium text-ink-700">{device}</dd>
        </div>
        {ipAddress && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-400">IP address</dt>
            <dd className="truncate font-mono text-xs text-ink-700">
              {ipAddress}
            </dd>
          </div>
        )}
      </dl>

      <ApproveActions token={token} alreadyApproved={alreadyApproved} />

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
        Only approve if you just scanned this code yourself. Approving signs that
        device in to your account.
      </p>
    </>
  );
}
