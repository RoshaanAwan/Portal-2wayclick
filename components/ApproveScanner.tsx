"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ScanLine, X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";

type State = "starting" | "scanning" | "approving" | "done" | "error";

/**
 * "Scan to approve a device" — the phone side of the login-page QR flow, run
 * ENTIRELY inside the logged-in app (NOT via a deep link).
 *
 * Why this exists: when a scanned `/link/<token>` URL opens in the phone's
 * camera browser / a fresh PWA window, that context often doesn't share the
 * cookie jar where the user is signed in, so the approval page sees no session
 * ("log in again"). Approving from within the already-authenticated app avoids
 * the deep link entirely: we read the token from the QR here and POST it to
 * /api/auth/qr/approve as a same-origin fetch that DOES carry the session cookie.
 */
function ApproveScannerModal({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const [state, setState] = useState<State>("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        if (cancelled) return;
        const controls = await reader.decodeFromVideoDevice(
          undefined, // default camera (back camera on phones)
          videoRef.current!,
          (result) => {
            if (!result || handledRef.current) return;
            handledRef.current = true;
            handleScan(result.getText());
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setState("scanning");
      } catch (e) {
        if (cancelled) return;
        setState("error");
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access and try again."
            : "Couldn't start the camera on this device.",
        );
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function extractToken(text: string): string | null {
    // Accept a full /link/<token> URL or a bare 64-hex token.
    try {
      const url = new URL(text);
      const m = url.pathname.match(/\/link\/([^/?#]+)/);
      if (m) return m[1];
    } catch {
      if (/^[a-f0-9]{32,}$/i.test(text.trim())) return text.trim();
    }
    return null;
  }

  async function handleScan(text: string) {
    const token = extractToken(text);
    if (!token) {
      // Not one of ours — keep scanning.
      handledRef.current = false;
      return;
    }
    controlsRef.current?.stop();
    setState("approving");
    try {
      const res = await fetch("/api/auth/qr/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not approve");
      }
      setState("done");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not approve the device");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] grid place-items-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="glass-strong relative z-10 w-full max-w-sm overflow-hidden p-5"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                Approve a device
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Point your camera at the QR on the other device&apos;s sign-in
                screen to log it in.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="hover-surface -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:text-ink-700"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
            />
            {state === "scanning" && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="relative h-2/3 w-2/3 rounded-xl border-2 border-white/70">
                  <ScanLine className="absolute inset-0 m-auto h-8 w-8 text-white/80" />
                </div>
              </div>
            )}
            {state === "starting" && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="h-7 w-7 animate-spin text-white/70" />
              </div>
            )}
            {state === "approving" && (
              <div className="absolute inset-0 grid place-items-center bg-black/50">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-7 w-7 animate-spin text-white" />
                  <p className="text-xs text-white/90">Approving…</p>
                </div>
              </div>
            )}
            {state === "done" && (
              <div className="absolute inset-0 grid place-items-center bg-success-soft/95">
                <div className="flex flex-col items-center gap-2 text-center">
                  <CheckCircle2 className="h-9 w-9 text-success" />
                  <p className="text-sm font-semibold text-ink">Device approved</p>
                  <p className="px-6 text-xs text-ink-500">
                    The other device is signing in now.
                  </p>
                </div>
              </div>
            )}
            {state === "error" && (
              <div className="absolute inset-0 grid place-items-center px-6 text-center">
                <div className="flex flex-col items-center gap-2">
                  <AlertTriangle className="h-7 w-7 text-warn" />
                  <p className="text-xs text-white/90">{error}</p>
                </div>
              </div>
            )}
          </div>

          {state === "done" ? (
            <button
              onClick={onClose}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Done
            </button>
          ) : (
            <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
              On the other device, open the 2WayClick sign-in page and choose
              “Scan QR” to show its code.
            </p>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
}

/** Trigger that opens the approve-by-scan modal. Render children as the button. */
export function ApproveScannerButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && <ApproveScannerModal onClose={() => setOpen(false)} />}
    </>
  );
}
