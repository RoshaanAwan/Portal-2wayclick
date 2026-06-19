/**
 * Create (or update) a single SUPER_ADMIN user — safe to run on production.
 * Unlike prisma/seed.ts, this does NOT wipe any data; it upserts one account.
 *
 * Usage:
 *   ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="strong-pass" ADMIN_NAME="Your Name" \
 *     npx tsx prisma/create-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "";
  const name = process.env.ADMIN_NAME || "Super Admin";

  if (!email || !password) {
    console.error("❌ ADMIN_EMAIL and ADMIN_PASSWORD are required.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("❌ ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.user.upsert({
    where: { email },
    // If the account already exists, promote it and reset its password.
    update: { role: "SUPER_ADMIN", passwordHash, disabledAt: null },
    create: {
      email,
      passwordHash,
      name,
      title: "Platform Owner",
      department: "Executive",
      role: "SUPER_ADMIN",
    },
  });

  console.log(`✅ SUPER_ADMIN ready: ${user.name} <${user.email}> (id: ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
