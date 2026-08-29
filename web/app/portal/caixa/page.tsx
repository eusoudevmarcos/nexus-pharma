import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { CashRegister, type CashSessionDetail, type CashSessionSummary, type CashStore, type PosProduct, type SaleContext } from "./cash-register";

export const metadata: Metadata = { title: "Frente de caixa" };

export default async function CashRegisterPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR", "VIEWER"]);
  const [stores, products, history, discountPolicy, saleContext] = await Promise.all([
    portalFetch<CashStore[]>("/api/v1/caixa/estrutura"),
    portalFetch<PosProduct[]>("/api/v1/cadastros/produtos"),
    portalFetch<CashSessionSummary[]>("/api/v1/caixa/sessoes?status=CLOSED&limite=30"),
    portalFetch<{ maxPercent: number }>("/api/v1/caixa/politica-desconto"),
    portalFetch<SaleContext>("/api/v1/controle-venda/contexto"),
  ]);
  const firstOpen = stores?.flatMap((store) => store.pointsOfSale.flatMap((pdv) => pdv.cashSessions))[0];
  const initialSession = firstOpen ? await portalFetch<CashSessionDetail>(`/api/v1/caixa/sessoes/${firstOpen.id}`) : null;
  return <section className="report-page cash-page">
    <div className="report-heading"><div><span>OPERAÇÃO COM CONCILIAÇÃO</span><h1>Frente de caixa</h1><p>Venda, recebimentos registrados, suprimentos, sangrias e fechamento por meio de pagamento.</p></div><div className="report-period">Integrações financeiras locais</div></div>
    <CashRegister currentUserId={session.profile.id} discountLimit={discountPolicy?.maxPercent ?? 0} history={history ?? []} initialSession={initialSession} products={(products ?? []).filter((product) => product.active)} role={session.membership.role} saleContext={saleContext ?? { sellers: [], pharmacists: [] }} stores={stores ?? []}/>
  </section>;
}
