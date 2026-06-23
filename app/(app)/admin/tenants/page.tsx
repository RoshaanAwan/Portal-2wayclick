import { redirect } from "next/navigation";

// Tenant management moved to the dedicated System Owner area at /system/tenants.
// This legacy route just forwards there (the target gates on isSystemOwner).
export default function AdminTenantsRedirect() {
  redirect("/system/tenants");
}
