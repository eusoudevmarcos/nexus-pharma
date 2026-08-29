import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { ManagementCenter, type ManagementOptions, type ManagerialReport } from "./management-center";

export const metadata: Metadata = { title: "Gestão gerencial" };

function currentMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(now) };
}

export default async function ManagementPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "FINANCE", "VIEWER"]);
  const period = currentMonth();
  const [options, report] = await Promise.all([portalFetch<ManagementOptions>("/api/v1/relatorios/gerencial/opcoes"), portalFetch<ManagerialReport>(`/api/v1/relatorios/gerencial?inicio=${period.start}&fim=${period.end}`)]);
  return <section className="report-page management-page">
    <div className="report-heading"><div><span>GESTÃO COM RASTREABILIDADE</span><h1>Resultado do negócio</h1><p>DRE gerencial, margem, descontos, perdas, vendedores e curva ABC com acesso às vendas de origem.</p></div><div className="report-period">Dados operacionais, não SPED</div></div>
    <ManagementCenter initial={report} options={options ?? { stores: [], categories: [], products: [], sellers: [] }} role={session.membership.role} initialPeriod={period}/>
  </section>;
}
