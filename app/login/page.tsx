import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { LoginHero } from "./LoginHero";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="relative min-h-screen lg:grid lg:grid-cols-2">
      {/* Left — branded hero (hidden on small screens). */}
      <LoginHero />

      {/* Right — the sign-in form, vertically centered. */}
      <div className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:min-h-0">
        <LoginForm />
      </div>
    </main>
  );
}
