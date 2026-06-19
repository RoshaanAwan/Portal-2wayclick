import type { Metadata } from "next";
import { Smartphone, ShieldCheck, LogIn } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { describeDevice, TICKET_STATUS, TICKET_KIND } from "@/lib/qrLogin";
import { ApproveActions } from "./ApproveActions";
import { DirectSignInActions } from "./DirectSignInActions";
import { ApprovalGate } from "./ApprovalGate";

export const metadata: Metadata = {
  title: "Sign in — 2WayClick",
  robots: { index: false, follow: false },
};

// The page the phone opens after scanning a QR. Two flows, by ticket kind:
//   DIRECT_LINK    — the QR was shown on a signed-in dashboard and is bound to
//     that user. This phone (which need NOT be signed in) signs itself in as
//     that user with one tap. No prior auth required here.
//   SCAN_TO_APPROVE — the QR was shown on a NEW device's login screen. This
//     phone must already be signed in; it approves the new device.
// Lives outside the (app) group so it owns its own auth UX.
export default async function LinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ticket = await db.loginTicket.findUnique({ where: { token } });

  const isDirect = ticket?.kind === TICKET_KIND.DIRECT_LINK;

  const expired =
    !ticket ||
    ticket.expiresAt <= new Date() ||
    ticket.status === TICKET_STATUS.CONSUMED;

  const shell = (children: React.ReactNode) => (
    <main className="grid min-h-screen place-items-center bg-paper px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="glass p-6">{children}</div>
      </div>
    </main>
  );

  const expiredBlock = (
    <div className="text-center">
      <h1 className="font-display text-xl font-semibold text-ink">
        This code expired
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        The sign-in code is no longer valid. Generate a fresh code on the other
        device and scan it again.
      </p>
    </div>
  );

  // ── DIRECT_LINK: phone signs itself in as the bound dashboard user. ─────────
  if (isDirect) {
    if (expired) return shell(expiredBlock);

    const boundUser = ticket!.approvedById
      ? await db.user.findUnique({ where: { id: ticket!.approvedById } })
      : null;

    if (!boundUser || boundUser.disabledAt) return shell(expiredBlock);

    return shell(
      <>
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-accent-soft text-accent-ink">
            <LogIn className="h-6 w-6" />
          </div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink">
            Sign in on this device?
          </h1>
          <p className="mt-1.5 text-sm text-ink-500">
            You scanned a sign-in code from 2WayClick. Confirm to sign in here.
          </p>
        </div>

        <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
          <Avatar name={boundUser.name} src={boundUser.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {boundUser.name}
            </p>
            <p className="truncate text-xs text-ink-400">{boundUser.email}</p>
          </div>
        </div>

        <DirectSignInActions token={token} name={boundUser.name} />

        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
          Only continue if you scanned this code from your own 2WayClick screen.
        </p>
      </>,
    );
  }

  // ── SCAN_TO_APPROVE: signed-in phone approves a NEW device. ─────────────────
  if (expired) return shell(expiredBlock);

  const alreadyApproved = ticket?.status === TICKET_STATUS.APPROVED;
  const device = ticket ? describeDevice(ticket.userAgent) : "Unknown device";
  const user = await getCurrentUser();

  // The approval UI, given a resolved user (name/email/avatar) to show.
  const approveBlock = (u: {
    name: string;
    email: string;
    avatarUrl: string | null;
  }) => (
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
        <Avatar name={u.name} src={u.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{u.name}</p>
          <p className="truncate text-xs text-ink-400">{u.email}</p>
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

      <ApproveActions token={token} alreadyApproved={alreadyApproved} />

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-300" />
        Only approve if you just scanned this code yourself. Approving signs that
        device in to your account.
      </p>
    </>
  );

  // When the SSR navigation carried the session cookie (the common desktop /
  // same-context case), render the approve UI straight away.
  if (user) return shell(approveBlock(user));

  // No cookie on this navigation. This is the PWA deep-link case: a scanned link
  // opens into the installed app, but the SameSite=lax session cookie isn't sent
  // on that externally-initiated navigation — even though the user IS signed in.
  // Re-check from the client (a same-origin fetch DOES carry the cookie); only
  // truly-signed-out users fall through to login. See ApprovalGate / /api/auth/me.
  return shell(
    <ApprovalGate
      token={token}
      alreadyApproved={alreadyApproved}
      device={device}
      ipAddress={ticket?.ipAddress ?? null}
      loginHref={`/login?next=${encodeURIComponent(`/link/${token}`)}`}
    />,
  );
}
