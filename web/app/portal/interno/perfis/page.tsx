import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { AccessGovernance, AccessPrinciples, type AccessCatalog } from "../../access-governance";
import { EmptyReport } from "../../report-ui";
import { TeamManagement, type PendingStaffInvite, type StaffMember } from "./team-management";

export const metadata: Metadata = { title: "Perfis e permissões" };
type TeamReport = { staff: StaffMember[]; pendingInvites: PendingStaffInvite[] };

export default async function InternalAccessProfilesPage() {
  const session = await requireInternal();
  const catalog = await internalFetch<AccessCatalog>("/api/v1/acessos/matriz");
  const team = session.profile.systemRole === "INTERNAL_ADMIN" ? await internalFetch<TeamReport>("/api/v1/interno/equipe") : null;
  if (!catalog) return <section className="report-page"><EmptyReport text="Conecte a API para carregar a matriz de acesso." /></section>;

  return <section className="report-page access-governance-page">
    <div className="report-heading"><div><span>IDENTIDADE E RESPONSABILIDADE</span><h1>Perfis e permissões</h1><p>Mapa corporativo de menor privilégio para a equipe Nexus e para cada farmácia.</p></div><div className="report-period ready">RBAC ativo</div></div>
    {team && <TeamManagement staff={team.staff} pendingInvites={team.pendingInvites} />}
    <AccessPrinciples catalog={catalog} />
    <AccessGovernance catalog={catalog} scope="internal" />
    <AccessGovernance catalog={catalog} scope="tenant" />
    <article className="access-future-boundary"><div><span>B2B · FUTURO</span><h2>Portal de fornecedores isolado</h2></div><p>Representantes e laboratórios terão identidade própria, convite da farmácia, escopo por relacionamento e consentimento revogável. Não receberão perfil de comprador, gerente ou usuário interno.</p><strong>Planejado para uma fase posterior</strong></article>
  </section>;
}
