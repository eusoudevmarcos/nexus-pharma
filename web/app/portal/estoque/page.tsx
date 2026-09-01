import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { InventoryCenter, type InventoryDashboard } from "./inventory-center";

export const metadata: Metadata = { title: "Estoque por loja" };

export default async function InventoryPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST", "VIEWER"]);
  const dashboard = await portalFetch<InventoryDashboard>("/api/v1/estoque/painel");
  return <section className="report-page inventory-page">
    <div className="report-heading"><div><span>ESTOQUE RASTREÁVEL</span><h1>Estoque por loja</h1><p>Saldo disponível, reservas, transferências, inventários e perdas sem perder o vínculo com lote e validade.</p></div><div className="report-period">Dupla conferência nos ajustes</div></div>
    <InventoryCenter initial={dashboard} role={session.membership.role}/>
  </section>;
}
