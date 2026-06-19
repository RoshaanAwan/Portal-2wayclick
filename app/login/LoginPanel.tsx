"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, QrCode, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoginForm } from "./LoginForm";
import { QrLogin } from "./QrLogin";

type Mode = "password" | "qr";

/**
 * The right-hand sign-in panel: a small segmented toggle between the classic
 * email/password form and the "scan with your phone" QR flow. Both share the
 * same column so the layout stays put when switching.
 *
 * Special case: when we arrived here from a device-approval link (`?next=/link/…`),
 * the user scanned a QR on another device but isn't signed in on THIS one yet.
 * We then drop the QR tab (it'd be circular) and show a banner explaining they
 * just need to sign in to approve — after which they're sent back to approve.
 */
export function LoginPanel() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const approvingDevice = !!next && next.startsWith("/link/");

  const [mode, setMode] = useState<Mode>("password");

  return (
    <div className="w-full max-w-md">
      {approvingDevice ? (
        // Approval context — sign in here, then we bounce back to the approve page.
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" />
          <div>
            <p className="text-sm font-semibold text-ink">
              Approve a device sign-in
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              Sign in below to confirm the device that scanned your code. You&apos;ll
              be taken to approve it right after.
            </p>
          </div>
        </div>
      ) : (
        /* Segmented mode switch — only when this is a normal sign-in. */
        <div className="mb-7 inline-flex rounded-xl border border-line bg-surface-2 p-1">
          <ModeButton
            active={mode === "password"}
            onClick={() => setMode("password")}
            icon={<KeyRound className="h-3.5 w-3.5" />}
            label="Password"
          />
          <ModeButton
            active={mode === "qr"}
            onClick={() => setMode("qr")}
            icon={<QrCode className="h-3.5 w-3.5" />}
            label="Scan QR"
          />
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={approvingDevice ? "password" : mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {approvingDevice || mode === "password" ? <LoginForm /> : <QrLogin />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
        active ? "text-white" : "text-ink-500 hover:text-ink",
      )}
    >
      {active && (
        <motion.span
          layoutId="login-mode-pill"
          className="absolute inset-0 rounded-lg bg-accent-grad"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </button>
  );
}
