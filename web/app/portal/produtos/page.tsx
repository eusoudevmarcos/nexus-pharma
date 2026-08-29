import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { ProductCenter } from "./product-center";
import type { FiscalCategory, ProductRecord, RegistrationCatalogs } from "../cadastro-types";

export const metadata: Metadata = { title: "Cadastro de produtos" };

export default async function ProductsPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "OPERATOR", "VIEWER"]);
  const [products, categories, catalogs] = await Promise.all([
    portalFetch<ProductRecord[]>("/api/v1/cadastros/produtos"),
    portalFetch<FiscalCategory[]>("/api/v1/cadastros/categorias"),
    portalFetch<RegistrationCatalogs>("/api/v1/cadastros/catalogos"),
  ]);
  return <section className="report-page registration-page"><div className="report-heading"><div><span>CADASTRO OPERACIONAL E COMERCIAL</span><h1>Produtos</h1><p>Preço, controle, categoria fiscal, lotes e estratégia do que deve ganhar prioridade de venda.</p></div><div className="report-period">Estoque alterado somente por movimentos</div></div><ProductCenter catalogs={catalogs} categories={categories} initial={products} role={session.membership.role}/></section>;
}
