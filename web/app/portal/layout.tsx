import { getPortalSession } from "@/lib/portal";
import { PortalShell } from "./portal-shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, membership } = await getPortalSession();
  if (!profile || !membership) return <div className="portal-app portal-select">{children}</div>;
  return <PortalShell profile={profile} membership={membership}>{children}</PortalShell>;
}
