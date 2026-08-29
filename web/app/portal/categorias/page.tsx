import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { CategoryCenter } from "./category-center";
import type { FiscalCategory, RegistrationCatalogs } from "../cadastro-types";

export const metadata: Metadata = { title: "Categorias fiscais" };

export default async function CategoriesPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "VIEWER"]);
  const [categories, catalogs] = await Promise.all([
    portalFetch<FiscalCategory[]>("/api/v1/cadastros/categorias"),
    portalFetch<RegistrationCatalogs>("/api/v1/cadastros/catalogos"),
  ]);
  return <section className="report-page registration-page"><div className="report-heading"><div><span>BASE FISCAL HERDADA</span><h1>Categorias fiscais</h1><p>Centralize NCM e regras por regime para alimentar produtos, motor fiscal e assistente auditável.</p></div><div className="report-period">Alteração controlada e auditada</div></div><CategoryCenter catalogs={catalogs} initial={categories} role={session.membership.role}/></section>;
}
