import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { CounterService, type CounterDashboard } from "./counter-service";

export const metadata: Metadata = { title: "Balcão e pré-venda" };

export default async function CounterPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "ATTENDANT"]);
  const dashboard = await portalFetch<CounterDashboard>("/api/v1/balcao/painel");
  return <section className="report-page counter-page">
    <div className="report-heading"><div><span>ATENDIMENTO ANTES DO CAIXA</span><h1>Balcão e pré-venda</h1><p>Consulte produtos e valores, identifique o consumidor, confirme o pedido e encaminhe tudo pronto ao caixa.</p></div><div className="report-period">Balcão → fila → recebimento</div></div>
    <CounterService initial={dashboard ?? { stores: [], products: [], pharmacists: [], orders: [], discountLimit: 0 }} role={session.membership.role}/>
  </section>;
}
