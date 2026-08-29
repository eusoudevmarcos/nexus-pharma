import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { PurchasingCenter, type PurchasingDashboard } from "./purchasing-center";

export const metadata: Metadata = { title: "Compras e fornecedores" };

export default async function PurchasingPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "FINANCE", "OPERATOR", "VIEWER"]);
  const dashboard = await portalFetch<PurchasingDashboard>("/api/v1/compras/painel");
  return <section className="report-page purchasing-page">
    <div className="report-heading"><div><span>REPOSIÇÃO INTELIGENTE</span><h1>Compras e fornecedores</h1><p>Priorize o que está em falta, vende bem e entrega margem — sem ignorar reservas, pedidos em trânsito ou o prazo do fornecedor.</p></div><div className="report-period">Recebimento somente pela NF-e conferida</div></div>
    <PurchasingCenter initial={dashboard} role={session.membership.role}/>
  </section>;
}
