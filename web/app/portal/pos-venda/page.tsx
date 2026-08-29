import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { PostSaleCenter, type FiscalPending, type OpenCashSession, type PendingRefund, type PostSaleSummary } from "./post-sale-center";

export const metadata: Metadata = { title: "Pós-venda" };

type CashStore = { name: string; pointsOfSale: Array<{ name: string; cashSessions: Array<OpenCashSession> }> };

export default async function PostSalePage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "FINANCE", "PHARMACIST", "OPERATOR", "VIEWER"]);
  const [sales, stores, fiscalPending, pendingRefunds] = await Promise.all([
    portalFetch<PostSaleSummary[]>("/api/v1/pos-venda/vendas?limite=100"),
    portalFetch<CashStore[]>("/api/v1/caixa/estrutura"),
    portalFetch<FiscalPending[]>("/api/v1/pos-venda/pendencias-fiscais"),
    ["OWNER", "ADMIN", "MANAGER", "FINANCE"].includes(session.membership.role)
      ? portalFetch<PendingRefund[]>("/api/v1/pos-venda/reembolsos-pendentes")
      : Promise.resolve(null),
  ]);
  const openSessions = (stores ?? []).flatMap((store) => store.pointsOfSale.flatMap((point) => point.cashSessions.map((cashSession) => ({ ...cashSession, storeName: store.name, pointOfSaleName: point.name }))));
  return <section className="report-page post-sale-page">
    <div className="report-heading"><div><span>CONTROLE TRANSACIONAL</span><h1>Pós-venda seguro</h1><p>Cancelamentos e devoluções preservam a venda original, recompõem a origem fiscal e deixam integrações externas como pendência explícita.</p></div><div className="report-period">Sem exclusão da trilha original</div></div>
    <PostSaleCenter fiscalPending={fiscalPending ?? []} openSessions={openSessions} pendingRefunds={pendingRefunds ?? []} role={session.membership.role} sales={sales ?? []}/>
  </section>;
}
