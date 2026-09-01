import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { DfeCenter, type DfeDocumentSummary, type ProductOption } from "./dfe-center";

export const metadata: Metadata = { title: "Recebimento NF-e" };

export default async function ReceivingPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST", "VIEWER"]);
  const [documents, products] = await Promise.all([
    portalFetch<DfeDocumentSummary[]>("/api/v1/fiscal/dfe/documentos?limite=100"),
    portalFetch<ProductOption[]>("/api/v1/cadastros/produtos"),
  ]);
  return <section className="report-page dfe-page">
    <div className="report-heading"><div><span>ENTRADA COM RASTREABILIDADE</span><h1>Recebimento NF-e</h1><p>XML oficial, conferência física, alertas fiscais e manifestação da operação em uma única trilha.</p></div><div className="report-period">Fonte original preservada</div></div>
    <DfeCenter initialDocuments={documents ?? []} products={products ?? []} role={session.membership.role}/>
  </section>;
}
