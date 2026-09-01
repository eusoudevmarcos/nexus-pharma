import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { defaultArea, defaultInternalArea, getPortalSession, internalRoles } from "@/lib/portal";
import { CompanySelector } from "./company-selector";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = { title: "Portal", robots: { index: false, follow: false } };

export default async function PortalPage() {
  const { token, profile, membership } = await getPortalSession();
  if (!token) redirect("/entrar");
  if (profile && internalRoles.includes(profile.systemRole)) redirect(defaultInternalArea(profile.systemRole));
  if (membership) redirect(defaultArea(membership.role));
  if (profile?.primeMemberships?.length) redirect("/prime");

  return <section className="portal-section shell">
    <div className="portal-heading"><div><span className="eyebrow">PORTAL NEXUS</span><h1>{profile ? `Olá, ${profile.name.split(" ")[0]}.` : "Ambiente reservado."}</h1><p>{profile ? "Escolha a empresa que deseja administrar." : "Seu acesso foi reconhecido, mas a conexão com a API ainda não está disponível neste ambiente."}</p></div><LogoutButton /></div>
    {profile ? <>
      <div className="portal-context"><span>Conta</span><strong>{profile.email}</strong><span>Perfil</span><strong>{profile.systemRole}</strong></div>
      {profile.memberships.length ? <CompanySelector memberships={profile.memberships} /> : <div className="connection-panel"><strong>Nenhuma empresa vinculada</strong><p>Solicite ao administrador um convite para acessar uma operação.</p></div>}
    </> : <div className="connection-panel"><strong>Falta conectar a API do Render</strong><p>Defina <code>NEXUS_API_URL</code> no ambiente da Vercel. Assim o portal poderá validar a sessão e carregar as permissões da conta.</p></div>}
  </section>;
}
