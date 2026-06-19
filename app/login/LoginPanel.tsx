"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoginForm } from "./LoginForm";
import { QrLogin } from "./QrLogin";

type Mode = "password" | "qr";

/**
 * The right-hand sign-in panel: a small segmented toggle between the classic
 * email/password form and the "scan with your phone" QR flow. Both share the
 * same column so the layout stays put when switching.
 */
export function LoginPanel() {
  const [mode, setMode] = useState<Mode>("password");

  return (
    <div className="w-full max-w-md">
      {/* Segmented mode switch */}
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

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {mode === "password" ? <LoginForm /> : <QrLogin />}
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
