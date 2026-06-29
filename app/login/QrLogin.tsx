"use client";

import { useCallback } from "react";
import { ShieldCheck } from "lucide-react";
import { useQrLogin } from "@/lib/useQrLogin";
import { QrCodeSurface } from "@/components/QrCodeSurface";
import { useBrand } from "@/components/BrandProvider";

/**
 * The "scan to sign in" panel on the login screen (new-device side).
 *
 * Shows a short-lived ticket's /link/<token> URL as a QR code and polls until an
 * already-authenticated phone approves it — then a session is minted on THIS
 * device and we go to the dashboard. The approving device never hands over its
 * own session; the server mints a fresh one here on claim. See lib/useQrLogin.
 */
export function QrLogin() {
  const brand = useBrand();

  const onSignedIn = useCallback(() => {
    // Brief beat so the success state is visible, then into the app. Hard
    // navigation (not router.push) so the server's (app)-layout gate runs fresh
    // — a lapsed-trial tenant is 307'd to /trial-ended with no flash/limbo.
    setTimeout(() => {
      window.location.assign("/dashboard");
    }, 700);
  }, []);

  const { phase, linkUrl, restart } = useQrLogin({ onSignedIn });

  return (
    <div className="w-full max-w-md">
      <div className="mb-6">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Sign in with your phone
        </h2>
        <p className="mt-1.5 text-sm text-ink-500">
          Use a phone that&apos;s <span className="font-medium text-ink-700">already
          signed in</span> to {brand.name} to log in here without a password.
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <QrCodeSurface phase={phase} linkUrl={linkUrl} onRestart={restart} />

        {/* Explicit steps — the #1 source of confusion is scanning with a phone
            that isn't signed in (then there's no one to approve). */}
        <ol className="w-full space-y-1.5 text-xs text-ink-500">
          <li className="flex gap-2">
            <Step n={1} />
            On your phone, open {brand.name} and make sure you&apos;re signed in.
          </li>
          <li className="flex gap-2">
            <Step n={2} />
            Scan this code with the phone&apos;s camera and tap Approve.
          </li>
          <li className="flex gap-2">
            <Step n={3} />
            This device signs in automatically.
          </li>
        </ol>

        <p className="flex items-center gap-1.5 text-center text-[11px] text-ink-400">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-300" />
          New phone? Open {brand.name} on it and sign in once with your password
          first — then this works.
        </p>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent-ink">
      {n}
    </span>
  );
}
