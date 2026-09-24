import { getPortalSession } from "@/lib/portal";
import { PortalShell } from "./portal-shell";
import { InternalShell } from "./internal-shell";
import { internalRoles } from "@/lib/portal";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile, membership } = await getPortalSession();
  if (profile && internalRoles.includes(profile.systemRole)) return <InternalShell profile={profile}>{children}</InternalShell>;
  const primeOnly = !membership && !!profile?.primeMemberships?.length && process.env.NEXT_PUBLIC_PRIME_ENABLED === "true";
  if (!profile || !membership) return <div className="portal-app portal-select">{primeOnly && <a className="prime-back-link" href="/prime">← Voltar ao painel da indústria</a>}{children}</div>;
  return <PortalShell profile={profile} membership={membership}>{children}</PortalShell>;
}
