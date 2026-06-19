import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Disabled accounts cannot sign in. Distinct message so the person knows
    // it's an access issue, not a wrong password.
    if (user.disabledAt) {
      return NextResponse.json(
        { error: "This account has been disabled. Contact your administrator." },
        { status: 403 },
      );
    }

    await createSession(user.id);

    await audit({
      actor: { id: user.id, name: user.name, role: user.role },
      action: "auth.login",
      entity: "Session",
      targetUserId: user.id,
      summary: `${user.name} signed in`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
