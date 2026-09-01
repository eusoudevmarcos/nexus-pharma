import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { ProductCenter } from "./product-center";
import { BulkProductImport, type ProductImportBatch } from "./bulk-product-import";
import type { FiscalCategory, ProductRecord, RegistrationCatalogs } from "../cadastro-types";

export const metadata: Metadata = { title: "Cadastro de produtos" };

export default async function ProductsPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "BUYER", "PHARMACIST", "ATTENDANT", "OPERATOR", "VIEWER"]);
  const [products, categories, catalogs, imports] = await Promise.all([
    portalFetch<ProductRecord[]>("/api/v1/cadastros/produtos"),
    portalFetch<FiscalCategory[]>("/api/v1/cadastros/categorias"),
    portalFetch<RegistrationCatalogs>("/api/v1/cadastros/catalogos"),
    portalFetch<ProductImportBatch[]>("/api/v1/cadastros/importacoes"),
  ]);
  return <section className="report-page registration-page"><div className="report-heading"><div><span>CADASTRO OPERACIONAL E COMERCIAL</span><h1>Produtos</h1><p>Preço, controle, categoria fiscal, lotes e estratégia do que deve ganhar prioridade de venda.</p></div><div className="report-period">Estoque alterado somente por movimentos</div></div>{["OWNER", "ADMIN", "MANAGER", "PHARMACIST"].includes(session.membership.role) && <BulkProductImport initial={imports ?? []} role={session.membership.role} userId={session.profile.id}/>}<ProductCenter catalogs={catalogs} categories={categories} initial={products} role={session.membership.role}/></section>;
}
