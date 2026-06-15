import { getCurrentUser } from "@/lib/auth";
import { isAdminTier } from "@/lib/permissions";
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
      // The public profile lives under the admin-tier-only directory.
      canViewProfile={isAdminTier(user.role)}
    />
  );
}
