import { CalendarCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequestComposer } from "./RequestComposer";
import { MyRequests } from "./MyRequests";
import { StatStrip } from "./StatStrip";
import { Approvals } from "./Approvals";
import type { RequestStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ownerSelect = {
  id: true,
  name: true,
  title: true,
  avatarUrl: true,
} as const;

export type RequestRow = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  reviewer: { name: string } | null;
  owner: { id: string; name: string; title: string; avatarUrl: string | null };
};

function serialize(r: {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
  reviewer: { name: string } | null;
  owner: { id: string; name: string; title: string; avatarUrl: string | null };
}): RequestRow {
  return {
    id: r.id,
    type: r.type,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    reason: r.reason,
    status: r.status as RequestStatus,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    reviewer: r.reviewer,
    owner: r.owner,
  };
}

export default async function RequestsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const canReview = user.role === "ADMIN" || user.role === "MANAGER";

  const [mineRaw, approvalsRaw] = await Promise.all([
    db.leaveRequest.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        reviewer: { select: { name: true } },
        owner: { select: ownerSelect },
      },
    }),
    canReview
      ? db.leaveRequest.findMany({
          where: {
            status: "PENDING",
            ownerId: { not: user.id },
            // Admins see every pending request; managers see ones routed to
            // them OR any of their direct reports' requests.
            ...(user.role === "ADMIN"
              ? {}
              : {
                  OR: [
                    { reviewerId: user.id },
                    { owner: { managerId: user.id } },
                  ],
                }),
          },
          orderBy: { startDate: "asc" },
          include: {
            reviewer: { select: { name: true } },
            owner: { select: ownerSelect },
          },
        })
      : Promise.resolve([]),
  ]);

  const mine = mineRaw.map(serialize);
  const approvals = approvalsRaw.map(serialize);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Time Off"
        subtitle="Request leave and track approvals"
        icon={CalendarCheck}
        action={<RequestComposer />}
      />

      <StatStrip requests={mine} />

      {canReview && approvals.length > 0 && (
        <Approvals requests={approvals} />
      )}

      <MyRequests requests={mine} />
    </div>
  );
}
