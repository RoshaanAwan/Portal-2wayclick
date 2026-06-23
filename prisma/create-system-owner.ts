/**
 * Create (or update) a SYSTEM OWNER — the platform operator who can ONLY manage
 * tenants (create/suspend/impersonate) and has NO access to any tenant's business
 * data. Safe to run on production; upserts one account, wipes nothing.
 *
 * A System Owner lives in the reserved "system" tenant with isSystemOwner=true
 * and an inert EMPLOYEE role (never consulted). Mutually exclusive with any
 * tenant business role.
 *
 * Usage:
 *   SYSOWNER_EMAIL="ops@you.com" SYSOWNER_PASSWORD="strong-pass" SYSOWNER_NAME="Ops" \
 *     npx tsx prisma/create-system-owner.ts
 *
 * Uses a raw PrismaClient (not lib/db) so it runs under plain tsx without the
 * server-only import chain.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const SYSTEM_TENANT_ID = "system";

async function main() {
  const email = (process.env.SYSOWNER_EMAIL || "").toLowerCase().trim();
  const password = process.env.SYSOWNER_PASSWORD || "";
  const name = process.env.SYSOWNER_NAME || "System Owner";

  if (!email || !password) {
    console.error("❌ SYSOWNER_EMAIL and SYSOWNER_PASSWORD are required.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("❌ SYSOWNER_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  // Ensure the reserved system tenant exists.
  await db.tenant.upsert({
    where: { id: SYSTEM_TENANT_ID },
    update: {},
    create: { id: SYSTEM_TENANT_ID, subdomain: SYSTEM_TENANT_ID, name: "Platform" },
  });

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.user.upsert({
    where: { tenantId_email: { tenantId: SYSTEM_TENANT_ID, email } },
    update: {
      isSystemOwner: true,
      isPlatformAdmin: true, // transitional column; kept in sync until dropped
      passwordHash,
      disabledAt: null,
    },
    create: {
      tenantId: SYSTEM_TENANT_ID,
      email,
      passwordHash,
      name,
      title: "System Owner",
      department: "Executive",
      role: "EMPLOYEE", // inert — every tenant check short-circuits on the flag
      isSystemOwner: true,
      isPlatformAdmin: true,
    },
  });

  console.log(`✅ System Owner ready: ${user.name} <${user.email}> (id: ${user.id})`);
  console.log(`   Lives in the "${SYSTEM_TENANT_ID}" tenant. Manages tenants only.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
