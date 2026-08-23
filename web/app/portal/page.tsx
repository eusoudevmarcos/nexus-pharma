import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = { title: "Portal", robots: { index: false, follow: false } };

type Profile = {
  name: string;
  email: string;
  systemRole: string;
  memberships: Array<{ role: string; company: { tradeName: string; status: string } }>;
};

async function getProfile(token: string): Promise<Profile | null> {
  if (!apiUrl()) return null;
  const response = await fetch(`${apiUrl()}/api/v1/auth/me`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  return response?.ok ? response.json() : null;
}

export default async function PortalPage() {
  const token = (await cookies()).get("nexus_access")?.value;
  if (!token) redirect("/entrar");
  const profile = await getProfile(token);

  return <section className="portal-section shell">
    <div className="portal-heading"><div><span className="eyebrow">PORTAL NEXUS</span><h1>{profile ? `Olá, ${profile.name.split(" ")[0]}.` : "Ambiente reservado."}</h1><p>{profile ? "Escolha a área que deseja acompanhar." : "Seu acesso foi reconhecido, mas a conexão com a API ainda não está disponível neste ambiente."}</p></div><LogoutButton /></div>
    {profile ? <>
      <div className="portal-context"><span>Conta</span><strong>{profile.email}</strong><span>Perfil do sistema</span><strong>{profile.systemRole}</strong></div>
      <div className="portal-grid">
        {profile.memberships.map((membership) => <article key={`${membership.company.tradeName}-${membership.role}`}><span>{membership.company.status}</span><h2>{membership.company.tradeName}</h2><p>Perfil: {membership.role}</p><button className="button button-outline" disabled>Área em liberação</button></article>)}
        {!profile.memberships.length && <article><span>EQUIPE NEXUS</span><h2>Painel interno</h2><p>Seu perfil será direcionado à área correspondente na próxima etapa.</p><button className="button button-outline" disabled>Área em liberação</button></article>}
      </div>
    </> : <div className="connection-panel"><strong>Falta conectar a API do Render</strong><p>Defina <code>NEXUS_API_URL</code> no ambiente da Vercel. Assim o portal poderá validar a sessão e carregar as permissões da conta.</p></div>}
  </section>;
}
