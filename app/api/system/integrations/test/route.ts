import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { open } from "@/lib/cryptoBox";
import { verifyToken, listOpenPRs, GitHubError, type GitHubConfig } from "@/lib/integrations/github";

const schema = z.object({
  provider: z.literal("github"),
  token: z.string().trim().max(500).optional(),
  config: z
    .object({
      org: z.string().trim().max(100).optional(),
      repos: z.array(z.string().trim()).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireSystemOwner();
    if (!user) {
      throw new Error("UNAUTHENTICATED");
    }

    const data = schema.parse(await req.json());
    let token = data.token?.trim() || "";
    if (!token) {
      const existing = await db.integration.findFirst({
        where: { provider: "github" },
        select: { secret: true },
      });
      token = open(existing?.secret) ?? "";
    }
    if (!token) {
      return NextResponse.json(
        { error: "No token to test — enter a GitHub access token first." },
        { status: 400 },
      );
    }

    const me = await verifyToken(token);
    const config: GitHubConfig = {
      org: data.config?.org ?? null,
      repos: data.config?.repos ?? [],
    };
    const { prs, repos, skipped } = await listOpenPRs(token, config);

    return NextResponse.json({
      ok: true,
      login: me.login,
      repoCount: repos.length,
      prCount: prs.length,
      skipped,
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof GitHubError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[system.integration.test]", e);
    return NextResponse.json({ error: "Test failed" }, { status: 500 });
  }
}
