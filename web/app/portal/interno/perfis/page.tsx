import type { Metadata } from "next";
import { internalFetch, requireInternal } from "@/lib/portal";
import { AccessGovernance, AccessPrinciples, type AccessCatalog } from "../../access-governance";
import { EmptyReport } from "../../report-ui";

export const metadata: Metadata = { title: "Perfis e permissões" };

export default async function InternalAccessProfilesPage() {
  await requireInternal();
  const catalog = await internalFetch<AccessCatalog>("/api/v1/acessos/matriz");
  if (!catalog) return <section className="report-page"><EmptyReport text="Conecte a API para carregar a matriz de acesso." /></section>;

  return <section className="report-page access-governance-page">
    <div className="report-heading"><div><span>IDENTIDADE E RESPONSABILIDADE</span><h1>Perfis e permissões</h1><p>Mapa corporativo de menor privilégio para a equipe Nexus e para cada farmácia.</p></div><div className="report-period ready">RBAC ativo</div></div>
    <AccessPrinciples catalog={catalog} />
    <AccessGovernance catalog={catalog} scope="internal" />
    <AccessGovernance catalog={catalog} scope="tenant" />
    <article className="access-future-boundary"><div><span>B2B · FUTURO</span><h2>Portal de fornecedores isolado</h2></div><p>Representantes e laboratórios terão identidade própria, convite da farmácia, escopo por relacionamento e consentimento revogável. Não receberão perfil de comprador, gerente ou usuário interno.</p><strong>Planejado para uma fase posterior</strong></article>
  </section>;
}
