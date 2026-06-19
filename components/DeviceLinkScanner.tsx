"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShieldCheck } from "lucide-react";
import { useQrLogin } from "@/lib/useQrLogin";
import { QrCodeSurface } from "@/components/QrCodeSurface";

/**
 * "Link a device" modal — shows a QR code to be scanned from a phone that's
 * already signed in. Scanning opens the approval page (/link/<token>) on the
 * phone; once approved, this browser's session is confirmed and the modal
 * closes. Same handshake as the login-page QR, surfaced from the dashboard.
 */
function DeviceLinkModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [done, setDone] = useState(false);

  const { phase, linkUrl, restart } = useQrLogin({
    onSignedIn: () => {
      setDone(true);
      // Refresh server components so anything session-derived re-renders, then
      // close the modal shortly after the success tick shows.
      router.refresh();
      setTimeout(onClose, 1100);
    },
  });

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
                Link a device
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Scan this code with a phone you&apos;re already signed in on, then
                approve it there.
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
              onRestart={restart}
              size={196}
            />

            {!done && (
              <ol className="w-full space-y-1.5 text-xs text-ink-500">
                <li className="flex gap-2">
                  <Step n={1} />
                  Open your phone camera and point it at this code.
                </li>
                <li className="flex gap-2">
                  <Step n={2} />
                  Tap the link to open 2WayClick, then approve the device.
                </li>
              </ol>
            )}

            <p className="flex items-center gap-1.5 text-center text-[11px] text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-300" />
              The code expires in a couple of minutes and can be used once.
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
