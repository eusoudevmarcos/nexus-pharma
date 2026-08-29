import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { NfceCenter, type NfceCatalogGroup, type NfceDocumentSummary, type NfceReadiness, type NfceSale } from "./nfce-center";

export const metadata: Metadata = { title: "Emissão NFC-e" };

export default async function NfcePage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR", "VIEWER"]);
  const [readiness, sales, documents, catalogs] = await Promise.all([
    portalFetch<NfceReadiness>("/api/v1/fiscal/nfce/prontidao"),
    portalFetch<NfceSale[]>("/api/v1/fiscal/nfce/vendas-disponiveis?limite=100"),
    portalFetch<NfceDocumentSummary[]>("/api/v1/fiscal/nfce/documentos?limite=100"),
    portalFetch<NfceCatalogGroup[]>("/api/v1/fiscal/nfce/catalogos-oficiais"),
  ]);
  return <section className="report-page nfce-page">
    <div className="report-heading"><div><span>SAÍDA FISCAL CONTROLADA</span><h1>Emissão NFC-e</h1><p>Prepare a nota a partir da venda e do snapshot tributário já aprovado, sem recalcular impostos.</p></div><div className="report-period">Transmissão real protegida</div></div>
    <NfceCenter catalogs={catalogs ?? []} initialDocuments={documents ?? []} readiness={readiness} role={session.membership.role} sales={sales ?? []}/>
  </section>;
}
