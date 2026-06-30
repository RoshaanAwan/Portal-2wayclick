import Link from "@/components/Link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  Briefcase,
  Users,
  UserRound,
} from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { isAdminTier, can } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { SlackLinkEditor } from "./SlackLinkEditor";

const deptVariant: Record<
  string,
  "accent" | "cyan" | "pink" | "emerald" | "amber" | "neutral"
> = {
  Executive: "accent",
  Engineering: "cyan",
  People: "emerald",
  Design: "pink",
  Marketing: "amber",
  Data: "cyan",
  Finance: "emerald",
  Sales: "accent",
};


function deptColor(dept: string) {
  return deptVariant[dept] ?? "neutral";
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Directory is admin tier only — gate the detail page too, so it can't be
  // reached by deep-linking to a person's id.
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  if (!isAdminTier(viewer.role)) redirect("/dashboard");

  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      manager: {
        select: { id: true, name: true, title: true, avatarUrl: true },
      },
      reports: {
        select: {
          id: true,
          name: true,
          title: true,
          avatarUrl: true,
          department: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!user) notFound();

  const isKnownRole = (ROLES as readonly string[]).includes(user.role);
  // Some accounts (e.g. a Company Owner provisioned without a display name) can
  // have a blank name — fall back to the email local-part so the header and
  // avatar initials never render empty.
  const displayName = user.name?.trim() || user.email.split("@")[0];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link
        href="/directory"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to directory
      </Link>

      {/* Profile header */}
      <GlassCard strong hover={false} className="overflow-hidden p-0">
        {/* LinkedIn cover ratio: 1584 × 396 px = 4:1. Capped at the native 396px
            height so it never blows up past the source resolution on wide screens. */}
        <div className="relative aspect-[4/1] max-h-[396px] w-full bg-accent-grad">
          {user.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.bannerUrl}
              alt={`${displayName} cover`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-grid opacity-20" />
          )}
        </div>
        <div className="px-6 pb-6 sm:px-8 sm:pb-8">
          {/* Avatar overlaps the banner; the name/title sit BELOW it on the dark
              surface so text never washes out against the bright banner. */}
          <div className="-mt-12 w-fit rounded-full ring-4 ring-surface">
            <Avatar name={displayName} src={user.avatarUrl} size="xl" />
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                  {displayName}
                </h1>
                {isKnownRole && (
                  <Badge variant={isAdminTier(user.role) ? "accent" : "neutral"}>
                    {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex items-center gap-2 text-sm text-ink-500">
                <Briefcase className="h-4 w-4 text-ink-300" />
                {user.title}
              </p>
            </div>
            <div className="shrink-0">
              <Badge variant={deptColor(user.department)}>{user.department}</Badge>
            </div>
          </div>

          {/* Contact grid */}
          <div className="mt-6 grid grid-cols-1 gap-3 border-t border-line pt-6 sm:grid-cols-2">
            <ContactRow icon={Mail} label="Email">
              <a
                href={`mailto:${user.email}`}
                className="text-accent transition hover:underline"
              >
                {user.email}
              </a>
            </ContactRow>
            {user.phone && (
              <ContactRow icon={Phone} label="Phone">
                {user.phone}
              </ContactRow>
            )}
            {user.location && (
              <ContactRow icon={MapPin} label="Location">
                {user.location}
              </ContactRow>
            )}
            <ContactRow icon={CalendarDays} label="Joined">
              {formatDate(user.startDate)}
            </ContactRow>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Bio + Slack identity */}
        <div className="lg:col-span-2 space-y-5">
          <GlassCard hover={false} className="p-6">
            <h2 className="eyebrow">About</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              {user.bio || "No bio has been added yet."}
            </p>
          </GlassCard>
          <GlassCard hover={false} className="p-6">
            <SlackLinkEditor
              userId={user.id}
              initial={user.slackUserId}
              canEdit={can.manageSlackIdentity(viewer.role)}
            />
          </GlassCard>
        </div>

        {/* Manager */}
        <GlassCard hover={false} className="p-6">
          <h2 className="eyebrow">Reports to</h2>
          {user.manager ? (
            <Link
              href={`/directory/${user.manager.id}`}
              className="group mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 transition-all hover:border-accent/30 hover:bg-accent-soft"
            >
              <Avatar
                name={user.manager.name}
                src={user.manager.avatarUrl}
                size="md"
                ring
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {user.manager.name}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {user.manager.title}
                </p>
              </div>
            </Link>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 text-ink-400">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface border border-line">
                <UserRound className="h-5 w-5" />
              </div>
              <p className="text-xs">Top of the reporting chain</p>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Direct reports */}
      <GlassCard hover={false} className="p-6">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-ink-400" />
          <h2 className="eyebrow">Direct reports</h2>
          <span className="rounded-full bg-surface-2 border border-line px-2 py-0.5 text-[11px] tabular-nums text-ink-500">
            {user.reports.length}
          </span>
        </div>

        {user.reports.length === 0 ? (
          <p className="mt-3 text-sm text-ink-400">
            {displayName.split(" ")[0]} has no direct reports.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {user.reports.map((r) => (
              <Link
                key={r.id}
                href={`/directory/${r.id}`}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 transition-all hover:border-accent/30 hover:bg-accent-soft"
              >
                <Avatar name={r.name} src={r.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {r.name}
                  </p>
                  <p className="truncate text-xs text-ink-500">{r.title}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 border border-line">
        <Icon className="h-4 w-4 text-ink-400" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-ink-400">
          {label}
        </p>
        <p className="truncate text-sm text-ink-700">{children}</p>
      </div>
    </div>
  );
}
