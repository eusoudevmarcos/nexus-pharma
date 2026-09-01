import type { Metadata } from "next";
import { portalFetch, requireCompany } from "@/lib/portal";
import { CategoryCenter } from "./category-center";
import { FiscalPropagationCenter, type FiscalPropagation } from "./fiscal-propagation-center";
import type { FiscalCategory, RegistrationCatalogs } from "../cadastro-types";

export const metadata: Metadata = { title: "Categorias fiscais" };

export default async function CategoriesPage() {
  const session = await requireCompany(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "VIEWER"]);
  const [categories, catalogs, propagations] = await Promise.all([
    portalFetch<FiscalCategory[]>("/api/v1/cadastros/categorias"),
    portalFetch<RegistrationCatalogs>("/api/v1/cadastros/catalogos"),
    portalFetch<FiscalPropagation[]>("/api/v1/cadastros/propagacoes-fiscais"),
  ]);
  return <section className="report-page registration-page"><div className="report-heading"><div><span>BASE FISCAL HERDADA</span><h1>Categorias fiscais</h1><p>Centralize NCM e regras por regime para alimentar produtos, motor fiscal e assistente auditável.</p></div><div className="report-period">Alteração controlada e auditada</div></div><FiscalPropagationCenter categories={categories ?? []} initial={propagations ?? []} role={session.membership.role} userId={session.profile.id}/><CategoryCenter catalogs={catalogs} initial={categories} role={session.membership.role}/></section>;
}
