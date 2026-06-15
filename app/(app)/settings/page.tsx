import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <SettingsClient
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        title: user.title,
        department: user.department,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        phone: user.phone,
        location: user.location,
      }}
    />
  );
}
