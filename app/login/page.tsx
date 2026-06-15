import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 sm:px-8">
      {/* Clean canvas base — flat, minimal. */}
      <div className="pointer-events-none absolute inset-0 -z-20 bg-paper" />

      {/* The sign-in form, centered. */}
      <LoginForm />
    </main>
  );
}
