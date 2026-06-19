"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck } from "lucide-react";
import { QrCodeSurface } from "@/components/QrCodeSurface";
import type { QrPhase } from "@/lib/useQrLogin";

/**
 * "Link a device" modal (dashboard side). Shows a QR bound to the current user
 * (a DIRECT_LINK ticket). A phone that scans it — even one that's NOT signed in —
 * opens /link/<token> and signs ITSELF in as this user with one tap. This modal
 * only needs to show the code; it doesn't poll or claim (the phone is the device
 * being signed in, not this one).
 */
function DeviceLinkModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<QrPhase>("loading");
  const [linkUrl, setLinkUrl] = useState("");

  const createCode = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/auth/qr/link/create", { method: "POST" });
      if (!res.ok) throw new Error("create failed");
      const data = (await res.json()) as { token: string };
      setLinkUrl(`${window.location.origin}/link/${data.token}`);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    createCode();
  }, [createCode]);

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
                Sign in on your phone
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Scan this code with your phone to sign in there — no password
                needed.
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

          <div className="flex flex-col items-center gap-4">
            <QrCodeSurface
              phase={phase}
              linkUrl={linkUrl}
              onRestart={createCode}
              size={196}
            />

            <ol className="w-full space-y-1.5 text-xs text-ink-500">
              <li className="flex gap-2">
                <Step n={1} />
                Open your phone camera and point it at this code.
              </li>
              <li className="flex gap-2">
                <Step n={2} />
                Tap the link, then confirm to sign in on your phone.
              </li>
            </ol>

            <p className="flex items-center gap-1.5 text-center text-[11px] text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-300" />
              The code expires in a couple of minutes and signs in one device.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-ink">
      {n}
    </span>
  );
}

/** The dashboard trigger: a button that opens the "show QR" link-a-device modal. */
export function DeviceLinkButton({
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
      {open && <DeviceLinkModal onClose={() => setOpen(false)} />}
    </>
  );
}
