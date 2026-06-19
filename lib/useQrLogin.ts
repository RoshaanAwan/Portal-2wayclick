"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type QrPhase =
  | "loading"
  | "ready"
  | "approved"
  | "signedin"
  | "expired"
  | "error";

interface UseQrLoginOptions {
  /** Called once the ticket is claimed and a session has been minted here. */
  onSignedIn?: () => void;
  /** Start a ticket immediately on mount (default true). */
  autoStart?: boolean;
}

/**
 * Drives the new-device side of the QR sign-in handshake: create a login ticket,
 * expose its /link/<token> URL for rendering as a QR, poll until an authenticated
 * phone approves it, then claim a real session on THIS device. Shared by the
 * login page panel and the dashboard "link a device" modal — both show a QR and
 * wait; they differ only in what happens after sign-in (onSignedIn).
 */
export function useQrLogin({
  onSignedIn,
  autoStart = true,
}: UseQrLoginOptions = {}) {
  const [phase, setPhase] = useState<QrPhase>(autoStart ? "loading" : "ready");
  const [token, setToken] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  // Guards against a double-claim if a poll and a re-render race.
  const claimingRef = useRef(false);
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  const start = useCallback(async () => {
    setPhase("loading");
    claimingRef.current = false;
    try {
      const res = await fetch("/api/auth/qr/create", { method: "POST" });
      if (!res.ok) throw new Error("create failed");
      const data = (await res.json()) as { token: string };
      setToken(data.token);
      setLinkUrl(`${window.location.origin}/link/${data.token}`);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (autoStart) start();
  }, [autoStart, start]);

  const claim = useCallback(async (t: string) => {
    if (claimingRef.current) return;
    claimingRef.current = true;
    try {
      const res = await fetch("/api/auth/qr/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      if (!res.ok) throw new Error("claim failed");
      setPhase("signedin");
      onSignedInRef.current?.();
    } catch {
      claimingRef.current = false;
      setPhase("error");
    }
  }, []);

  // Poll the ticket status while it's live.
  useEffect(() => {
    if (!token || (phase !== "ready" && phase !== "approved")) return;
    let active = true;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/auth/qr/status?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!active) return;
        const data = (await res.json()) as { state: string };
        if (data.state === "approved") {
          setPhase("approved");
          claim(token);
        } else if (
          data.state === "expired" ||
          data.state === "not_found" ||
          data.state === "consumed"
        ) {
          setPhase("expired");
        }
      } catch {
        /* transient network blip — keep polling */
      }
    };

    const id = setInterval(tick, 2000);
    tick();
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [token, phase, claim]);

  return { phase, linkUrl, restart: start };
}
