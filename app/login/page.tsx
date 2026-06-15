import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { LoginHero } from "./LoginHero";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Left: branded gradient hero ──────────────────────────────────
         Hidden on small screens; the form takes the full width there. */}
      <LoginHero />

      {/* ── Right: the sign-in form on the clean canvas. ─────────────────── */}
      <div className="relative flex items-center justify-center bg-paper px-5 py-12 sm:px-8">
        {/* A faint warm glow bleeds in from the hero side on large screens so
            the seam between the two panels feels intentional. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-64 lg:block"
          style={{
            background:
              "linear-gradient(90deg, rgb(var(--c-accent) / 0.06), transparent)",
          }}
        />
        <div className="relative z-10 flex w-full justify-center">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
