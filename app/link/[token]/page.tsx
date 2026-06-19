import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Smartphone, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { describeDevice, TICKET_STATUS } from "@/lib/qrLogin";
import { ApproveActions } from "./ApproveActions";

export const metadata: Metadata = {
  title: "Approve sign-in — 2WayClick",
  robots: { index: false, follow: false },
};

// The page the phone opens after scanning the login QR. The phone is expected
// to already be signed in; the user reviews the requesting device and approves
// (or denies) it. Lives outside the (app) group so it owns its own auth UX.
export default async function LinkApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();

  // Not signed in on this phone → send to login, then back here to approve.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/link/${token}`)}`);
  }

  const ticket = await db.loginTicket.findUnique({ where: { token } });

  const expired =
    !ticket ||
    ticket.expiresAt <= new Date() ||
    ticket.status === TICKET_STATUS.CONSUMED;
  const alreadyApproved = ticket?.status === TICKET_STATUS.APPROVED;
  const device = ticket ? describeDevice(ticket.userAgent) : "Unknown device";

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="glass p-6">
          {expired ? (
            <div className="text-center">
              <h1 className="font-display text-xl font-semibold text-ink">
                This request expired
              </h1>
              <p className="mt-2 text-sm text-ink-500">
                The sign-in code is no longer valid. Generate a fresh code on the
                other device and scan it again.
              </p>
            </div>
          ) : (
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

              {/* Who this will sign in as. */}
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
                <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-ink-400">{user.email}</p>
                </div>
              </div>

              {/* Requesting device details. */}
              <dl className="mb-5 space-y-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-400">Device</dt>
                  <dd className="truncate font-medium text-ink-700">{device}</dd>
                </div>
                {ticket?.ipAddress && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-400">IP address</dt>
                    <dd className="truncate font-mono text-xs text-ink-700">
                      {ticket.ipAddress}
                    </dd>
                  </div>
                )}
              </dl>

              <ApproveActions
                token={token}
                alreadyApproved={alreadyApproved}
              />

              <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
                Only approve if you just scanned this code yourself. Approving
                signs that device in to your account.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
