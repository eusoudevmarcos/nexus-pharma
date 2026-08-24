import { getPortalSession } from "@/lib/portal";
import { PortalShell } from "./portal-shell";
import { InternalShell } from "./internal-shell";
import { internalRoles } from "@/lib/portal";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, membership } = await getPortalSession();
  if (profile && internalRoles.includes(profile.systemRole)) return <InternalShell profile={profile}>{children}</InternalShell>;
  if (!profile || !membership) return <div className="portal-app portal-select">{children}</div>;
  return <PortalShell profile={profile} membership={membership}>{children}</PortalShell>;
}
