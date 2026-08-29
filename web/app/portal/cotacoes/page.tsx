import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { QuotationCenter, type QuotationDashboard } from "./quotation-center";

export const metadata: Metadata = { title: "Cotações de fornecedores" };

export default async function QuotationsPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "FINANCE", "OPERATOR", "VIEWER"]);
  const dashboard = await portalFetch<QuotationDashboard>("/api/v1/cotacoes/painel");
  return <section className="report-page quotations-page"><div className="report-heading"><div><span>COMPRA COMPARADA</span><h1>Cotações e custo líquido</h1><p>Compare preço, frete, descontos, bonificações, prazo e margem antes de escolher o fornecedor.</p></div><div className="report-period">Memória comercial preservada no pedido</div></div><QuotationCenter initial={dashboard} role={session.membership.role}/></section>;
}
