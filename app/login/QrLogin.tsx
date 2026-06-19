"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useQrLogin } from "@/lib/useQrLogin";
import { QrCodeSurface } from "@/components/QrCodeSurface";

/**
 * The "scan to sign in" panel on the login screen (new-device side).
 *
 * Shows a short-lived ticket's /link/<token> URL as a QR code and polls until an
 * already-authenticated phone approves it — then a session is minted on THIS
 * device and we go to the dashboard. The approving device never hands over its
 * own session; the server mints a fresh one here on claim. See lib/useQrLogin.
 */
export function QrLogin() {
  const router = useRouter();

  const onSignedIn = useCallback(() => {
    // Brief beat so the success state is visible, then into the app.
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 700);
  }, [router]);

  const { phase, linkUrl, restart } = useQrLogin({ onSignedIn });

  return (
    <div className="w-full max-w-md">
      <div className="mb-6">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Sign in with your phone
        </h2>
        <p className="mt-1.5 text-sm text-ink-500">
          Open 2WayClick on a phone you&apos;re already signed in on, then scan
          this code to sign in here.
        </p>
      </div>

      <div className="flex flex-col items-center gap-5">
        <QrCodeSurface phase={phase} linkUrl={linkUrl} onRestart={restart} />

        <p className="flex items-center gap-1.5 text-center text-xs text-ink-400">
          <ShieldCheck className="h-3.5 w-3.5 text-ink-300" />
          You&apos;ll confirm the sign-in on your phone before this device is
          allowed in.
        </p>
      </div>
    </div>
  );
}
