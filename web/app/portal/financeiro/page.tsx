import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { AccountsPayableCenter, type AccountsPayableDashboard } from "./accounts-payable-center";

export const metadata: Metadata = { title: "Contas a pagar" };

export default async function AccountsPayablePage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "FINANCE", "VIEWER"]);
  const dashboard = await portalFetch<AccountsPayableDashboard>("/api/v1/contas-pagar/painel");
  return <section className="report-page payables-page">
    <div className="report-heading"><div><span>FINANCEIRO DA FARMÁCIA</span><h1>Contas a pagar</h1><p>Da NF-e conferida às parcelas e baixas, com vencimentos, responsáveis e estornos rastreáveis.</p></div><div className="report-period">Baixa bancária ainda manual e identificada</div></div>
    <AccountsPayableCenter initial={dashboard} role={session.membership.role}/>
  </section>;
}
