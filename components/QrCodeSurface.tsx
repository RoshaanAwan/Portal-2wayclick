"use client";

import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import type { QrPhase } from "@/lib/useQrLogin";

/**
 * The QR + status square shared by every "show a QR and wait to be signed in"
 * surface (login panel, dashboard link-a-device modal). Renders the code while
 * waiting, an "approved — signing in" overlay, a success tick, or an expiry/
 * error state with a "new code" button. Kept on a white field for scan contrast.
 */
export function QrCodeSurface({
  phase,
  linkUrl,
  onRestart,
  size = 200,
}: {
  phase: QrPhase;
  linkUrl: string;
  onRestart: () => void;
  size?: number;
}) {
  const box = size + 32; // padding around the code

  return (
    <div
      className="relative grid place-items-center rounded-2xl border border-line bg-white p-4"
      style={{ height: box, width: box }}
    >
      {phase === "loading" && (
        <Loader2 className="h-7 w-7 animate-spin text-ink-300" />
      )}

      {(phase === "ready" || phase === "approved") && linkUrl && (
        <>
          <QRCodeSVG
            value={linkUrl}
            size={size}
            level="M"
            marginSize={0}
            bgColor="#ffffff"
            fgColor="#181a1f"
          />
          {phase === "approved" && (
            <div className="absolute inset-0 grid place-items-center rounded-2xl bg-white/85">
              <div className="flex flex-col items-center gap-2 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
                <p className="text-xs font-medium text-ink-700">
                  Approved — signing in…
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {phase === "signedin" && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <CheckCircle2 className="h-9 w-9 text-success" />
          <p className="text-sm font-semibold text-ink">Signed in</p>
        </motion.div>
      )}

      {(phase === "expired" || phase === "error") && (
        <div className="flex flex-col items-center gap-3 px-4 text-center">
          <p className="text-sm text-ink-500">
            {phase === "expired"
              ? "This code expired."
              : "Something went wrong."}
          </p>
          <button
            onClick={onRestart}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-700 transition hover:border-line-strong"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            New code
          </button>
        </div>
      )}
    </div>
  );
}
