import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { MedicineControlCenter, type ControlledRecord, type ControlProduct, type PharmacistCredential, type SaleContext } from "./medicine-control-center";

export const metadata: Metadata = { title: "Controle de medicamentos" };

export default async function MedicineControlPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "VIEWER"]);
  const [products, pharmacists, context, records] = await Promise.all([
    portalFetch<ControlProduct[]>("/api/v1/controle-venda/produtos"),
    portalFetch<PharmacistCredential[]>("/api/v1/controle-venda/farmaceuticos"),
    portalFetch<SaleContext>("/api/v1/controle-venda/contexto"),
    portalFetch<ControlledRecord[]>("/api/v1/controle-venda/registros"),
  ]);
  return <section className="report-page medicine-control-page">
    <div className="report-heading"><div><span>POLÍTICA CONFIGURÁVEL E AUDITÁVEL</span><h1>Controle de medicamentos</h1><p>Responsáveis profissionais, requisitos por produto e registros da venda ficam separados da classificação tributária.</p></div><div className="report-period">Sem enquadramento legal automático</div></div>
    <MedicineControlCenter context={context ?? { sellers: [], pharmacists: [] }} credentials={pharmacists ?? []} products={products ?? []} records={records ?? []} role={session.membership.role}/>
  </section>;
}
